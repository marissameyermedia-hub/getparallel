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

<!-- Template for future entries:

## v101 — YYYY-MM-DD

**What changed:**
- [Plain English description of what was added, changed, or fixed]

**Why:**
[Why this change was needed — what problem it solves or what was wrong before]

**Deployed by:** Claude (Anthropic) for Marissa Meyer / PARALLEL VIP LLC

-->
