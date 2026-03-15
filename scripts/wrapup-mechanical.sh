#!/usr/bin/env bash
# Mechanical wrapup tasks — zero-token plumbing after Claude writes the PFC entry.
# Called once by /wrapup or /continue save after Claude's judgment work is done.

set -euo pipefail

BRAIN_DIR="$HOME/.claude/brain"
PFC_CORTEX="$BRAIN_DIR/prefrontal-cortex.md"
PFC_SIZE_FILE="$BRAIN_DIR/.pfc-loaded-size"
THEBRAIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# 0a. Re-scan hippocampus DIR files (idempotent, ~5 sec)
if [ -f "$THEBRAIN_DIR/hippocampus/scripts/scan.js" ]; then
    echo "Scanning hippocampus..."
    node "$THEBRAIN_DIR/hippocampus/scripts/scan.js"
fi

# 0b. Incremental term index scan
if [ -f "$THEBRAIN_DIR/hippocampus/scripts/term-scan-cli.js" ]; then
    echo "Updating term index..."
    node "$THEBRAIN_DIR/hippocampus/scripts/term-scan-cli.js"
fi

# 0c. CC2 window scan + metadata extraction (decisions, summaries)
if [ -f "$THEBRAIN_DIR/cerebral-cortex-v2/scripts/scan.js" ]; then
    echo "Scanning CC2 windows..."
    node "$THEBRAIN_DIR/cerebral-cortex-v2/scripts/scan.js"
fi
if [ -f "$THEBRAIN_DIR/cerebral-cortex-v2/scripts/extract.js" ]; then
    echo "Extracting CC2 metadata..."
    node "$THEBRAIN_DIR/cerebral-cortex-v2/scripts/extract.js"
fi

# 1. Trim PFC entries and migrate overflow to CC2 recall.db
echo "Trimming PFC..."
node "$THEBRAIN_DIR/cerebral-cortex-v2/scripts/pfc-trim.js"

# 2. Regenerate prefrontal decision gates from signals.db
echo "Regenerating prefrontal..."
node "$THEBRAIN_DIR/scripts/generate-prefrontal.js"

# 3. Update PFC size marker so /hello and /continue can skip redundant reads
if [ -f "$PFC_CORTEX" ]; then
    wc -c < "$PFC_CORTEX" | tr -d ' ' > "$PFC_SIZE_FILE"
else
    echo "0" > "$PFC_SIZE_FILE"
fi

echo "Done. Size marker: $(cat "$PFC_SIZE_FILE") bytes"
