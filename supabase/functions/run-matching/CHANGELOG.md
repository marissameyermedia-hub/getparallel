# run-matching Changelog

Each entry describes what changed and why, in plain English.
For technical diff details, see `CHANGES_v64_to_v100.md`.

---

## v100 — 2026-05-19

**What changed:**
- Complete rewrite from v64 baseline (v71 was an intermediate step in git history)
- Fixed a bug where the religion-preference dealbreaker (Q12.2) was silently not firing — users who marked "must share my beliefs" as a dealbreaker were still being matched with people of different religions
- Switched from hardcoded option strings inside the algorithm to loading the questionnaire live from the `public.matching_config` table — this eliminates the possibility of the frontend and backend disagreeing on what options mean
- Questionnaire changes no longer require a code deploy; updating the database is enough

**Why:**
The v64 algorithm had hardcoded option arrays that could drift from what the frontend showed users. When a questionnaire option was renamed or reworded, the algorithm would silently miss it, producing wrong scores. The religion dealbreaker was an example of a bug that went unnoticed for weeks. This rewrite makes the questionnaire the single source of truth.

**Deployed by:** Claude (Anthropic) for Marissa Meyer / PARALLEL VIP LLC

---

## v101 — 2026-05-20

**What changed:**
- Fixed `scoreReligion`: when both users have "Open to different beliefs" as their Q12.2 preference, the actual-beliefs score (Q6.2) now returns 80 instead of 45. Previously, having different belief labels (e.g. "agnostic" vs "culturally religious") penalised the pair by 55 points even when both people explicitly said the difference doesn't matter to them.
- Synced the local source file with the live deployed version, which had added release_status-based candidate filtering and shadow_matches routing (for pending users) without updating the local file.

**Why:**
The old logic scored Q6.2 (actual beliefs) and Q12.2 (preference for partner's beliefs) independently. Q12.2 correctly returns 90 when someone says "I'm open to different beliefs." But Q6.2 still penalised the pair heavily for having different label strings, contradicting the stated preference. When openness is mutual, the belief-label difference is low-signal and should not drag down the score. The fix moves the both-open result from 45 → 80, which puts it in line with what both users actually said. Non-mutual openness and cases where at least one person has a preference are unchanged.

**Deployed by:** Claude (Anthropic) for Marissa Meyer / PARALLEL VIP LLC

---

## v102 — 2026-05-26

**What changed:**
- Fixed a dangerous delete pattern that could cause asymmetric match disappearances at scale. Previously, the algorithm deleted ALL rows where `matched_user_id = userId` before re-inserting — this wipe included rows created by OTHER users' own matching runs. For example: Steve's run creates a row `user_id=Steve, matched_user_id=Danielle`. When Danielle's run fires later, it would delete that row, leaving Steve visible to Danielle but Danielle invisible to Steve. The fix: only delete a user's own outbound rows (`user_id = userId`), then INSERT fresh outbound rows and UPSERT the reciprocal rows — so we update if they already exist, insert if they don't, and never blow away work that the other person's run already did.

**Why:**
This was discovered when two beta testers (Danielle and Steve, both in NYC, both released) couldn't see each other. One match row existed but the reciprocal was missing. Root cause was exactly this delete pattern. With multiple users running matching concurrently at scale, this would cause systematic one-sided match disappearances. The upsert approach is safe because the `matches` table has a `UNIQUE(user_id, matched_user_id)` constraint, and `shadow_matches` was updated with the same constraint in the same release.

**Deployed by:** Claude (Anthropic) for Marissa Meyer / PARALLEL VIP LLC

---

<!-- Template for future entries:

## v101 — YYYY-MM-DD

**What changed:**
- [Plain English description of what was added, changed, or fixed]

**Why:**
[Why this change was needed — what problem it solves or what was wrong before]

**Deployed by:** Claude (Anthropic) for Marissa Meyer / PARALLEL VIP LLC

-->
