#!/usr/bin/env bash
# PostToolUse hook: run ESLint + typecheck on edited TypeScript files
# Invoked after Edit/Write tool use. Input JSON is passed via stdin.

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    tool_input = data.get('tool_input', {})
    print(tool_input.get('file_path', ''))
except Exception:
    print('')
" 2>/dev/null || echo "")

# Only process TypeScript source files in src/
if [[ -z "$FILE_PATH" ]] || [[ ! "$FILE_PATH" =~ \.ts$ ]] || [[ ! "$FILE_PATH" =~ /src/ ]]; then
    exit 0
fi

# Run ESLint on the modified file (auto-fix)
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
npx eslint --fix "$FILE_PATH" 2>&1 || true
