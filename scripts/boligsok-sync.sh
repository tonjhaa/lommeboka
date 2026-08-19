#!/bin/bash
# Daglig lokal synk av boligsok_annonser. Kjøres av launchd (se boligsok-sync.plist).
set -euo pipefail

# launchd kjører uten brukerens vanlige PATH (source'r ikke .zshrc) — pek eksplisitt på claude-binæren.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$HOME/Library/Logs/boligsok-sync"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/$(date +%Y-%m-%d_%H-%M-%S).log"

PROMPT="$(cat "$DIR/boligsok-sync-prompt.md")"

claude -p "$PROMPT" \
  --model claude-haiku-4-5-20251001 \
  --allowedTools "Bash($DIR/fetch-lommeboka-api.sh:*)" "mcp__Supabase__execute_sql" "mcp__claude_ai_Supabase__execute_sql" \
  > "$LOG_FILE" 2>&1

echo "Boligsøk-synk ferdig, logg: $LOG_FILE"
