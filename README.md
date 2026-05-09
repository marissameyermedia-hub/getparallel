# Welcome to your Lovable project

TODO: Document your project here

## Updating the questionnaire

The canonical questionnaire snapshot used by the matching algorithm is stored in
`public.matching_config` in Supabase. After editing
`src/data/parallelQuestionnaire_updated.ts`, regenerate and sync it:

1. **Rebuild the snapshot:**
   ```bash
   bash scripts/sync_canonical.sh
   ```
   This runs `scripts/build_canonical.py`, which parses the TypeScript file and
   writes `src/data/canonical-options.json`, then prints an upsert SQL statement
   to stdout.

2. **Paste the SQL into the Supabase SQL editor** and run it. The `RETURNING`
   clause will print the new `content_hash` so you can confirm the update landed.

3. **No redeploy needed.** The `run-matching` edge function reads the canonical
   snapshot from `matching_config` on each request — the new questions and
   options are picked up immediately.
