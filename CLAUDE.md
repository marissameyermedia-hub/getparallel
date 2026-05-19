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
4. **Bump the version** constant at the top of `index.ts` (e.g. `v100` → `v101`)
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
