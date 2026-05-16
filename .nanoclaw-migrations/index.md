# NanoClaw v1 → v2 Migration Guide

Generated: 2026-05-16
Source (v1 customizations): `origin/main` @ `d6d0ce4` (NanoClaw v1.2.41)
Target (clean v2 base): `add-dashboard` @ `51d2728` (NanoClaw v2.0.62)
Merge-base: `f5679f9`
Upstream: `upstream/main` (qwibitai/nanoclaw, v2)

## Situation

`origin/main` on the user's fork (`potix2/nanoclaw`) is **NanoClaw v1** (1.2.41).
The `add-dashboard` branch is **NanoClaw v2** (2.0.62) — a ground-up rewrite —
already aligned with upstream v2 plus the user's v2-era work (Discord via Chat
SDK skill, Gmail, local dashboard). v1 cannot be `git merge`d into v2.

This is an **inverted migration**: the customizations to preserve live on the
old v1 branch, and the clean target base is the already-current v2 branch
(`add-dashboard`) — not a fresh upstream checkout. We therefore do **not** use
a worktree / re-merge-upstream flow. We port the v1 customizations directly
onto the v2 line, then move `main` to point at the result.

## Migration Plan

1. **Port marketplace inheritance + ESLint hook** (section 02) — lower risk,
   no runtime behavior change to the message path. Do first.
2. **Re-implement Discord 🎧 → notebooklm-audio** (section 01) — the complex
   architectural port. Standalone discord.js reaction listener + v2
   session/scheduling. Do second.
3. **Build + test** the ported v2 branch (`pnpm run build`, `pnpm test`).
4. **Backup + move `main`**: tag/branch the v1 `origin/main` tip, then
   force-update `main` (local + `origin`) to the ported v2 commit. Destructive
   and outward-facing — requires explicit user confirmation. v1 history is
   preserved in the backup branch/tag and existing `backup/*` branches.

### Risk areas

- The Discord reaction listener opens a **second discord.js gateway
  connection** alongside the Chat SDK bridge (same bot token). Acceptable for
  low volume; documented in section 01.
- The research-index file path was a v1 container path
  (`/workspace/group/outputs/research-message-index.json`). On the v2 host it
  must be a host path under the agent group's working dir. Made configurable
  via `RESEARCH_INDEX_PATH`; default derived from the group folder. Confirm
  with the nano-research workflow's actual output location.
- The ESLint `PostToolUse` hook runs `eslint --fix` on every `src/*.ts`
  Edit/Write. Apply it **after** all migration code edits + build so it does
  not rewrite files mid-migration.

## Applied / relevant skills

The v2 base (`add-dashboard`) already has these installed (do NOT re-merge —
they are baked into the branch):

- `/add-discord` — Chat SDK Discord adapter (`src/channels/discord.ts`)
- `/add-gmail-tool` — Gmail MCP tool
- `/add-dashboard` — local monitoring dashboard

Custom skills: the `notebooklm-audio` skill is **not in this repo** — it lives
in the external `github:potix2/nano-skills` marketplace, fetched by agents at
runtime. The migration only needs the marketplace wiring (section 02), not the
skill source.

## Dropped v1 commits (intentionally not ported)

- `9dd4253` — SKILL.md slim-trigger/reference split. v2 skill docs already use
  this structure upstream; the v1 split targeted v1-only skill files. Obsolete.
- `74d3c91` — prettier formatting of v1 `discord.ts`/`index.ts`. v1 files don't
  exist in v2. Irrelevant.

## Customization sections

- [01 — Discord 🎧 reaction → notebooklm-audio auto-trigger](01-discord-reaction-notebooklm.md)
- [02 — extraKnownMarketplaces inheritance + PostToolUse ESLint hook](02-marketplace-inheritance-eslint-hook.md)
