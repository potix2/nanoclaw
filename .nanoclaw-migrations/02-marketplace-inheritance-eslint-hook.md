# 02 — extraKnownMarketplaces inheritance + PostToolUse ESLint hook

Origin: v1 commit `0b2f089` (`.claude/hooks/post-ts-lint.sh`,
`.claude/settings.json`, `src/container-runner.ts`).

Two independent changes.

## 2a. extraKnownMarketplaces value (already present in v2)

**Status: no action needed.** v2's root `.claude/settings.json` already
contains the identical block:

```json
"extraKnownMarketplaces": {
  "nano-skills": { "source": { "source": "github", "repo": "potix2/nano-skills" } }
}
```

(v2 also has a `sandbox` key — preserve it.)

## 2b. Per-group marketplace inheritance (re-implement for v2)

**Intent:** every agent group's Claude settings should inherit
`extraKnownMarketplaces` from the project-root `.claude/settings.json`, so all
agents can resolve the `nano-skills` marketplace.

**v1 mechanism (gone):** `src/container-runner.ts` `buildVolumeMounts` read
root settings and merged `extraKnownMarketplaces` into a per-group
`settings.json` it wrote when absent.

**v2 mechanism:** per-group settings are written by `src/group-init.ts` to
`data/v2-sessions/<group.id>/.claude-shared/settings.json` from
`DEFAULT_SETTINGS_JSON`, with `ensurePreCompactHook()` patching pre-existing
files. Mirror that pattern for marketplaces.

**How to apply** — in `src/group-init.ts`:

1. Add a helper that reads root `.claude/settings.json` and returns
   `extraKnownMarketplaces` if it's an object (best-effort, swallow parse
   errors). Resolve the project root relative to the module
   (`group-init.ts` is in `src/`, root is its parent's parent — match how
   other modules locate the repo root, e.g. via `process.cwd()` or a `config`
   export; confirm the existing convention before choosing).
2. When writing a fresh per-group `settings.json`: parse `DEFAULT_SETTINGS_JSON`,
   add `extraKnownMarketplaces` if found, write the merged object.
3. Add an `ensureExtraKnownMarketplaces(settingsFile, initialized)` patcher
   alongside `ensurePreCompactHook` that injects the key into an existing
   per-group `settings.json` if missing. Call it from the same `else` branch
   that calls `ensurePreCompactHook`.

Keep it best-effort and idempotent — never break group init if root settings
are missing or malformed (match `ensurePreCompactHook`'s `try/catch` style).

## 2c. PostToolUse ESLint hook (port verbatim — apply LAST)

**Intent:** auto-run `eslint --fix` on edited `src/*.ts` files after
Edit/Write, as a host dev-tooling convenience. Architecture-independent;
fork-local config (not for upstream PRs, but fine on the user's own `main`).

> **Apply this only after all other migration code edits + build are done** —
> otherwise the hook rewrites files mid-migration.

1. Create `.claude/hooks/post-ts-lint.sh`, mode `0755`, verbatim:

```bash
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
```

2. Merge into root `.claude/settings.json` (which currently has
   `extraKnownMarketplaces` + `sandbox`; do not clobber them):

```json
"hooks": {
  "PostToolUse": [
    {
      "matcher": "Edit|Write",
      "hooks": [
        { "type": "command", "command": "bash .claude/hooks/post-ts-lint.sh" }
      ]
    }
  ]
}
```

Runtime deps (all present in v2): `bash`, `python3`, `git`, `npx`, `eslint`
(v2 has `eslint ^9.35.0` + `lint` scripts). Best-effort (`|| true`).
