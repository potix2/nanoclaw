import fs from 'fs';
import path from 'path';

import { DATA_DIR, GROUPS_DIR } from './config.js';
import { ensureContainerConfig } from './db/container-configs.js';
import { log } from './log.js';
import type { AgentGroup } from './types.js';

const DEFAULT_SETTINGS = {
  env: {
    CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1',
    CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: '1',
    CLAUDE_CODE_DISABLE_AUTO_MEMORY: '0',
  },
  hooks: {
    PreCompact: [
      {
        hooks: [
          {
            type: 'command',
            command: 'bun /app/src/compact-instructions.ts',
          },
        ],
      },
    ],
  },
};

/**
 * Read `extraKnownMarketplaces` from the project-root `.claude/settings.json`
 * so every agent group inherits the same skill marketplaces (e.g.
 * `nano-skills`). Best-effort: returns undefined if root settings are missing,
 * unparseable, or have no marketplaces. (v1 parity: commit 0b2f089 did this
 * inside container-runner's per-group settings write; v2 does it here.)
 */
function readRootMarketplaces(): Record<string, unknown> | undefined {
  try {
    const rootSettings = path.join(path.dirname(GROUPS_DIR), '.claude', 'settings.json');
    if (!fs.existsSync(rootSettings)) return undefined;
    const parsed = JSON.parse(fs.readFileSync(rootSettings, 'utf-8')) as Record<string, unknown>;
    const mk = parsed.extraKnownMarketplaces;
    if (mk && typeof mk === 'object') return mk as Record<string, unknown>;
  } catch {
    // ignore — proceed without marketplace inheritance
  }
  return undefined;
}

/** Compose the per-group settings.json, inheriting root marketplaces. */
function composeDefaultSettingsJson(): string {
  const marketplaces = readRootMarketplaces();
  const settings = marketplaces ? { extraKnownMarketplaces: marketplaces, ...DEFAULT_SETTINGS } : DEFAULT_SETTINGS;
  return JSON.stringify(settings, null, 2) + '\n';
}

/**
 * Initialize the on-disk filesystem state for an agent group. Idempotent —
 * every step is gated on the target not already existing, so re-running on
 * an already-initialized group is a no-op.
 *
 * Called once per group lifetime at creation, or defensively from
 * `buildMounts()` for groups that pre-date this code path.
 *
 * Source code and skills are shared RO mounts — not copied per-group.
 * Skill symlinks are synced at spawn time by container-runner.ts.
 *
 * The composed `CLAUDE.md` is NOT written here — it's regenerated on every
 * spawn by `composeGroupClaudeMd()` (see `claude-md-compose.ts`). Initial
 * per-group instructions (if provided) seed `CLAUDE.local.md`.
 */
export function initGroupFilesystem(group: AgentGroup, opts?: { instructions?: string }): void {
  const initialized: string[] = [];

  // 1. groups/<folder>/ — group memory + working dir
  const groupDir = path.resolve(GROUPS_DIR, group.folder);
  if (!fs.existsSync(groupDir)) {
    fs.mkdirSync(groupDir, { recursive: true });
    initialized.push('groupDir');
  }

  // groups/<folder>/CLAUDE.local.md — per-group agent memory, auto-loaded by
  // Claude Code. Seeded with caller-provided instructions on first creation.
  const claudeLocalFile = path.join(groupDir, 'CLAUDE.local.md');
  if (!fs.existsSync(claudeLocalFile)) {
    const body = opts?.instructions ? opts.instructions + '\n' : '';
    fs.writeFileSync(claudeLocalFile, body);
    initialized.push('CLAUDE.local.md');
  }

  // Ensure container_configs row exists in the DB. Idempotent — no-op if
  // the row already exists (e.g. created by backfill or group creation).
  ensureContainerConfig(group.id);
  initialized.push('container_configs');

  // 2. data/v2-sessions/<id>/.claude-shared/ — Claude state + per-group skills
  const claudeDir = path.join(DATA_DIR, 'v2-sessions', group.id, '.claude-shared');
  if (!fs.existsSync(claudeDir)) {
    fs.mkdirSync(claudeDir, { recursive: true });
    initialized.push('.claude-shared');
  }

  const settingsFile = path.join(claudeDir, 'settings.json');
  if (!fs.existsSync(settingsFile)) {
    fs.writeFileSync(settingsFile, composeDefaultSettingsJson());
    initialized.push('settings.json');
  } else {
    ensurePreCompactHook(settingsFile, initialized);
    ensureExtraKnownMarketplaces(settingsFile, initialized);
  }

  // Skills directory — created empty here; symlinks are synced at spawn
  // time by container-runner.ts based on container.json skills selection.
  const skillsDst = path.join(claudeDir, 'skills');
  if (!fs.existsSync(skillsDst)) {
    fs.mkdirSync(skillsDst, { recursive: true });
    initialized.push('skills/');
  }

  if (initialized.length > 0) {
    log.info('Initialized group filesystem', {
      group: group.name,
      folder: group.folder,
      id: group.id,
      steps: initialized,
    });
  }
}

const PRE_COMPACT_COMMAND = 'bun /app/src/compact-instructions.ts';

/**
 * Patch an existing settings.json to add the PreCompact hook if missing.
 * Runs on every group init so pre-existing groups pick up the hook.
 */
function ensurePreCompactHook(settingsFile: string, initialized: string[]): void {
  try {
    const raw = fs.readFileSync(settingsFile, 'utf-8');
    const settings = JSON.parse(raw);

    // Check if there's already a PreCompact hook with our command.
    const existing = settings.hooks?.PreCompact as unknown[] | undefined;
    if (existing && JSON.stringify(existing).includes(PRE_COMPACT_COMMAND)) return;

    // Add the hook, preserving existing hooks.
    if (!settings.hooks) settings.hooks = {};
    if (!settings.hooks.PreCompact) settings.hooks.PreCompact = [];
    settings.hooks.PreCompact.push({
      hooks: [{ type: 'command', command: PRE_COMPACT_COMMAND }],
    });

    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + '\n');
    initialized.push('settings.json (added PreCompact hook)');
  } catch {
    // Don't break init if settings.json is malformed — it'll use whatever's there.
  }
}

/**
 * Patch an existing per-group settings.json to inherit
 * `extraKnownMarketplaces` from the project-root settings if it's missing.
 * Runs on every group init so pre-existing groups pick up the marketplace.
 */
function ensureExtraKnownMarketplaces(settingsFile: string, initialized: string[]): void {
  try {
    const marketplaces = readRootMarketplaces();
    if (!marketplaces) return;

    const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
    if (settings.extraKnownMarketplaces && typeof settings.extraKnownMarketplaces === 'object') {
      return; // already has it — leave the group's own value untouched
    }

    settings.extraKnownMarketplaces = marketplaces;
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + '\n');
    initialized.push('settings.json (added extraKnownMarketplaces)');
  } catch {
    // Don't break init if settings.json is malformed.
  }
}
