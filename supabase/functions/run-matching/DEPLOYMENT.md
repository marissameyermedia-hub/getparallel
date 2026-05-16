# run-matching deployment

## Source of truth
`supabase/functions/run-matching/index.ts` in this repo. The live Supabase
edge function must match this file byte-for-byte after every deploy.

## Primary deploy path
From the Supabase MCP (in any Claude session with MCP active):

1. Edit `supabase/functions/run-matching/index.ts`.
2. Call the `deploy_edge_function` MCP tool with:
   - project_id: `qnnjtmhwcpsmpzlxdxex`
   - slug: `run-matching`
   - body: contents of `index.ts`
3. Verify by re-pulling the live source via `get_edge_function` and diffing
   against `index.ts`. They must match.

## Fallback (if MCP deploy fails due to size limits)
The function is ~72KB. If `deploy_edge_function` rejects it:

1. Use the Supabase Management API with the PAT stored as
   `claude_access_management_2`:
```
PATCH https://api.supabase.com/v1/projects/qnnjtmhwcpsmpzlxdxex/functions/run-matching
```
   with body `{ "body": "<full source as string>" }`.
2. This can be done via `pg_net.http_patch` from inside Supabase if outbound
   HTTP to api.supabase.com is allowlisted, OR via a one-shot helper function
   that wraps the call.

## Rollback
The previous version (v71) lives in git history. To roll back:

1. `git log -- supabase/functions/run-matching/index.ts` — find the commit
   where v100 was committed.
2. `git show <commit>^:supabase/functions/run-matching/index.ts` — extract
   the previous source.
3. Deploy that source using the same path above.

## Anti-patterns
- ❌ Deploying from CLI in a fork without first pulling live and diffing.
- ❌ Editing the live function in the Supabase dashboard. Always edit the
  repo file first.
- ❌ Storing "in-progress" versions in Postgres tables. Use a git branch.
