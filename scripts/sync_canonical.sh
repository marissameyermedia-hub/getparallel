#!/usr/bin/env bash
# sync_canonical.sh
#
# Rebuilds src/data/canonical-options.json from the TypeScript questionnaire
# and prints the upsert SQL to copy-paste into the Supabase SQL editor.
#
# Usage:
#   bash scripts/sync_canonical.sh
#
# Then paste the printed SQL into the Supabase SQL editor and run it.
# The matching algorithm picks up the new snapshot on its next request —
# no edge-function redeploy needed.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JSON_FILE="$SCRIPT_DIR/../src/data/canonical-options.json"

echo "Building canonical questionnaire JSON..." >&2
python3 "$SCRIPT_DIR/build_canonical.py"

# Emit the upsert SQL via Python so single-quote escaping is handled safely
# (the JSON may contain apostrophes in option text, e.g. "I'll be honest…")
python3 - "$JSON_FILE" <<'PYEOF'
import sys

json_path = sys.argv[1]
content = open(json_path, encoding="utf-8").read().rstrip("\n")

# SQL single-quote escape: ' → ''
sql_json = content.replace("'", "''")

print()
print("-- ─────────────────────────────────────────────────────────────────────")
print("-- Copy everything below and run it in the Supabase SQL editor.")
print("-- ─────────────────────────────────────────────────────────────────────")
print()
print("INSERT INTO public.matching_config (key, value)")
print(f"VALUES ('canonical_questionnaire', '{sql_json}'::jsonb)")
print("ON CONFLICT (key) DO UPDATE")
print("  SET value = EXCLUDED.value,")
print("      updated_at = now()")
print("RETURNING key, value->>'content_hash' AS hash;")
PYEOF
