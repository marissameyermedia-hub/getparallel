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

The `run-matching` edge function is managed **directly via MCP from the Claude chat interface**. The local copy at `supabase/functions/run-matching/index.ts` may be out of date. Pushing it would overwrite the live production version and cause a regression.

- To read the current production source: use the Supabase MCP `get_edge_function` tool
- To deploy changes: use the Supabase MCP `deploy_edge_function` tool from within Claude chat
- Do NOT use `supabase functions deploy`, `supabase push`, or any CLI/git push targeting this function
