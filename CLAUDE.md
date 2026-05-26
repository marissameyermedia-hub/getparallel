# Claude Code — Project Rules

## Supabase Ownership

Claude manages all Supabase operations for this project. This includes:

- Schema changes and migrations (via `apply_migration` MCP tool)
- Edge function deploys and reads (via `deploy_edge_function` / `get_edge_function` MCP tools)
- SQL queries and data inspection (via `execute_sql` MCP tool)
- Project health checks and logs (via `get_logs`, `get_advisors` MCP tools)

Do not use the Supabase CLI (`supabase` commands) or the Supabase dashboard for any of the above — use the MCP tools exclusively so all changes are tracked in the conversation and the repo stays in sync.

## run-matching Edge Function

**NEVER** run `supabase functions deploy run-matching` or push `supabase/functions/run-matching/` via the CLI or git.

The `run-matching` edge function is managed **directly via MCP from the Claude chat interface**. The local copy at `supabase/functions/run-matching/index.ts` is the canonical source — it must always match the deployed version byte-for-byte.

- To read the current production source: use the Supabase MCP `get_edge_function` tool
- To deploy changes: use the Supabase MCP `deploy_edge_function` tool from within Claude chat
- Do NOT use `supabase functions deploy`, `supabase push`, or any CLI/git push targeting this function

## Matching Algorithm — Change Protocol

**Before making ANY change to run-matching, follow these steps in order:**

1. **Read the live version** via `get_edge_function` MCP tool
2. **Compare** it to `supabase/functions/run-matching/index.ts` — they must match. If they don't, sync first.
3. **Archive** the current version: copy `index.ts` → `versions/index_vNNN_YYYY-MM-DD.ts` and commit to git
4. **Bump the version** constant at the top of `index.ts` (e.g. `v101` → `v102`)
5. **Update CHANGELOG.md** with what changed and why, in plain English
6. **Run the regression test suite**: `python3 scripts/test_matching.py` — all 20 tests must pass
7. **Deploy** via `deploy_edge_function` MCP tool only
8. **Verify**: call the `/health` endpoint on the live function and confirm the new version number appears
9. **Commit** `index.ts` with message: `matching: deploy vNNN — [one-line description]`

**NEVER deploy if:**
- The regression test suite has any failures
- The live version doesn't match the repo (sync first — don't overwrite the live version)
- The version archive step was skipped

## Rollback Process

If an algorithm deploy causes problems:
1. Open `supabase/functions/run-matching/versions/` — find the most recent snapshot before the bad deploy
2. Deploy it via `deploy_edge_function` MCP tool (same process as a normal deploy)
3. Verify the live `/health` endpoint returns the previous version number
4. Update `index.ts` to match the rolled-back version and commit: `matching: rollback to vNNN — [reason]`

Rollback takes under 2 minutes. Real users see the broken version only for the window between deploy and rollback.

## Matching Execution Model — How Matching Runs

Understanding this is critical before touching any part of the matching system.

### How match rows are structured

Every successful pair produces **two rows** in the `matches` table — one from each user's perspective:
- `{ user_id: A, matched_user_id: B, breakdown: dirA scores, individual_score: A's directional score }`
- `{ user_id: B, matched_user_id: A, breakdown: dirB scores, individual_score: B's directional score }`

The `compatibility_score` (the harmonic mean) is identical on both rows. The `breakdown` and `individual_score` differ because they reflect each person's directional scoring.

The app queries `WHERE user_id = currentUser` — so a user only sees matches where they are the `user_id`. Both rows must exist for both people to see the match.

### The delete pattern — known risk

Every matching run starts by deleting all existing rows for the calling user:
```typescript
await sb.from(targetTable).delete().eq("user_id", userId);         // deletes A's outbound rows
await sb.from(targetTable).delete().eq("matched_user_id", userId); // deletes reciprocal rows created by others
```

**The second line is dangerous at scale.** If User B's matching run fires after User A's run already created both A→B and B→A rows, B's run will delete A→B before recreating it. Any failure between deletion and re-insertion leaves A with no match row for B.

The correct fix (v102, pending implementation): only delete `user_id = userId` rows. Upsert reciprocal rows using INSERT ON CONFLICT DO UPDATE so they're never destructively wiped by another user's run.

### When matching runs (current behavior)

1. **On onboarding completion**: `complete-onboarding` fires run-matching for the newly onboarded user only. This creates matches for the new user against all released candidates, and creates reciprocal rows for all those candidates. Candidates who were already in the system do NOT get a fresh run — their matches with the new user only exist because the new user's run created the reciprocal rows.

2. **Manually triggered** (via the admin panel or direct MCP call).

3. **No scheduled global run exists yet** — this is a known gap.

### Known gap: new user fan-out

When User A completes onboarding, run-matching fires for A. This creates A→B and B→A rows for all currently-released users. BUT: if User B's matching was subsequently re-run for any reason (bug, admin trigger, race condition), it would wipe B→A and re-create it. If that re-run fails after deletion, A loses their B match row and never gets it back until the next explicit run.

**The correct behavior** (to be implemented): when any user is released, trigger run-matching for ALL currently-released users — not just the new person. This ensures every existing user sees the new person immediately, from their own perspective.

### Scheduled global matching (to be implemented)

A `pg_cron` job running every 4 hours that calls run-matching for every user with `release_status IN ('released', 'released_paying')`. This is the safety net that self-heals any asymmetric or missing rows. At beta scale this is trivially cheap. At 10,000+ users, switch to an incremental strategy (only re-run users whose answer pool has changed since the last run).

### What to do if users report not seeing a match

1. Query `matches` for both users — check if one direction exists but not the other.
2. Verify both users pass all hard filters (gender, age, height, distance, politics) against each other.
3. Verify dealbreakers pass in both directions.
4. If the match is legitimate but the row is missing, insert the reciprocal manually BUT use the correct directional score — do NOT copy the existing row's breakdown, as `breakdown` is directional. The correct fix is to trigger run-matching for the user missing the row so the algorithm computes the right `dirB` scores.
5. Document the asymmetry in this file if a new pattern is found.

### Hard filters (run before any scoring)

Both users must pass ALL of these for a match to be created:

| Filter | Questions | Rule |
|---|---|---|
| Gender | `1.1` (my gender) vs `9.1` (their seeking) | Mutual — both must seek the other's gender |
| Age | `date_of_birth` vs `9.2` (age range pref) | Mutual — each must fall within the other's range |
| Height | `1.5` (my height) vs `9.3` (their height range) | Mutual — each must fall within the other's range |
| Distance | lat/lng vs `9.4` (max distance pref) | Mutual — actual distance must be within BOTH max prefs |
| Politics | `6.1` (my politics) vs `12.1` (their pref) | Mutual — always enforced as hard filter regardless of isDealbreaker |

### Dealbreakers (run after hard filters, before scoring)

Checked from both directions. A dealbreaker is any question where `isDealbreaker: true` in the answer object, OR any question ID listed in `user_dealbreakers.question_ids`.

Preference→behavior dealbreaker pairs (qid → behavior question):
- `11.1` → `3.1` (drinking preference vs partner's drinking frequency)
- `11.1b` → `3.2` (wants to drink together vs partner's social drinking)
- `11.2` → `3.3` (smoking preference vs partner's smoking)
- `11.3` → `3.4` (cannabis preference vs partner's use)
- `11.6` → `3.8` (pet preference vs partner's pets)
- `11.7` → `3.10` (drug preference vs partner's drug use)
- `12.2b` → `6.2b` (religious practice preference vs partner's practice)
- `12.7` → `8.7` (boundaries/flexibility preference vs partner's style)

Special dealbreakers:
- `12.2` (religion belief match) — if marked dealbreaker, checks partner's `6.2` against preference
- `3.11` (adventure partner) — if marked dealbreaker, checks for 3+ shared hobbies or 3+ active hobbies each
- `9.4` (distance) — if marked dealbreaker, partner's distance preference must be >= mine

### Score thresholds

- `DIRECTIONAL_FLOOR = 30`: each user's individual directional score must be ≥ 30
- `HARMONIC_FLOOR = 40`: the harmonic mean of both directional scores must be ≥ 40
- Anxious+avoidant attachment pairing applies a 10% penalty to the final score

### Candidate pool rules

- Only users with `release_status IN ('released', 'released_paying')` OR `is_seed_account = true` appear as candidates
- Suspended, paused, or hidden-pending-review users are skipped
- The source user (the one matching is run FOR) is always excluded from their own candidate pool
- Pending users can still run matching — their results go to `shadow_matches`, not `matches`

