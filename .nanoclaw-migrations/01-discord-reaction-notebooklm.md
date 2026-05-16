# 01 — Discord 🎧 reaction → notebooklm-audio auto-trigger

Origin: v1 commit `3716179` (`src/channels/discord.ts`, `src/channels/registry.ts`, `src/index.ts`).

## Intent

The owner reacts with the **🎧** (`U+1F3A7`) emoji on a nano-research article
message in Discord. The bot extracts a `[research:YYYY-MM-DD:N]` token from the
message text, looks the article up in a JSON index, and runs the
`notebooklm-audio` skill on it in an **isolated one-shot** agent run (so the
main chat session's context is untouched). The agent converts the article to
audio via NotebookLM and replies in the originating Discord channel.

Portable verbatim (architecture-independent):
- Emoji filter: exactly `🎧`. Ignore bot reactions.
- Token regex: `/\[research:([^\]]+)\]/` — capture group 1 is the token.
- Research index lookup: JSON map `token → { title, url, summary }`.
- The Japanese task prompt (see below).

## v1-specific architecture (does NOT exist in v2 — do not copy v1 code)

- v1's hand-written `discord.js` `Client` in `src/channels/discord.ts` →
  v2 Discord is a thin Chat SDK bridge (`@chat-adapter/discord`,
  `src/channels/discord.ts`, 38 lines) with no reaction events.
- `src/channels/registry.ts` / `ChannelOpts.onReactionAdd` → gone. v2 contract
  is `src/channels/adapter.ts` `ChannelSetup` (`onInbound`/`onInboundEvent`/
  `onMetadata`/`onAction`); no reaction hook.
- `registeredGroups` map + `src/db.ts` `createTask` + `scheduled_tasks` table →
  gone. v2 uses the entity model + per-session `inbound.db`; tasks are
  `messages_in` rows with `kind='task'`.
- `channelJid = \`dc:${channelId}\`` JID scheme → gone. v2 routes by
  `messaging_groups (channel_type, platform_id)`.
- v1 `context_mode: 'isolated'` → no per-task isolation flag in v2. Isolation
  is a property of the **session**; you get an isolated run by resolving a
  session keyed by a synthetic thread id distinct from the channel's chat
  session.

## How to apply (v2 re-implementation)

`discord.js` is already a direct host dependency in v2 (`package.json`,
`^14.25.1`). No new package.

### 1. New module: `src/discord-reaction-listener.ts`

A standalone discord.js gateway connection (separate from the Chat SDK bridge —
acceptable second connection for the same bot token at low volume). On a 🎧
reaction it resolves the Discord channel to a v2 agent group, creates an
**isolated** session, writes a one-shot `kind='task'` message, and wakes the
container.

```ts
/**
 * Standalone Discord reaction listener (v1 feature 3716179, re-homed for v2).
 *
 * v2's Discord channel is a Chat SDK bridge that exposes no reaction events,
 * so we open a second, minimal discord.js gateway connection scoped to
 * GuildMessageReactions. On 🎧, schedule an isolated one-shot notebooklm-audio
 * task for the referenced research article.
 */
import fs from 'fs';
import path from 'path';

import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  type MessageReaction,
  type PartialMessageReaction,
  type PartialUser,
  type User,
} from 'discord.js';

import { GROUPS_DIR } from './config.js';
import { wakeContainer } from './container-runner.js';
import { getAgentGroup } from './db/agent-groups.js';
import {
  getMessagingGroupByPlatform,
  getMessagingGroupAgents,
} from './db/messaging-groups.js';
import { getSession } from './db/sessions.js';
import { readEnvFile } from './env.js';
import { log } from './log.js';
import { resolveSession, writeSessionMessage } from './session-manager.js';

const RESEARCH_EMOJI = '🎧';
const TOKEN_RE = /\[research:([^\]]+)\]/;

interface ResearchArticle {
  title: string;
  url: string;
  summary: string;
}

let client: Client | null = null;

/** Where the nano-research workflow writes its index, per agent-group folder.
 * Override with RESEARCH_INDEX_PATH (absolute) if the workflow writes
 * elsewhere. Default mirrors v1's `<workspace>/outputs/...` under the v2
 * group working dir. */
function researchIndexPath(groupFolder: string): string {
  const override = process.env.RESEARCH_INDEX_PATH;
  if (override) return override;
  return path.join(GROUPS_DIR, groupFolder, 'outputs', 'research-message-index.json');
}

export function startDiscordReactionListener(): void {
  const env = readEnvFile(['DISCORD_BOT_TOKEN']);
  if (!env.DISCORD_BOT_TOKEN) {
    log.info('Discord reaction listener: no DISCORD_BOT_TOKEN, skipping');
    return;
  }

  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [Partials.Message, Partials.Reaction, Partials.Channel],
  });

  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    try {
      await handleReaction(
        reaction as MessageReaction | PartialMessageReaction,
        user as User | PartialUser,
      );
    } catch (err) {
      log.error('Discord reaction listener: handler error', { err });
    }
  });

  client.once(Events.ClientReady, (c) => {
    log.info('Discord reaction listener ready', { tag: c.user.tag });
  });

  client.login(env.DISCORD_BOT_TOKEN).catch((err) => {
    log.error('Discord reaction listener: login failed', { err });
  });
}

export async function stopDiscordReactionListener(): Promise<void> {
  if (client) {
    await client.destroy();
    client = null;
  }
}

async function handleReaction(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
): Promise<void> {
  if (user.bot) return;
  if ((reaction.emoji.name ?? '') !== RESEARCH_EMOJI) return;

  if (reaction.partial) await reaction.fetch();
  if (reaction.message.partial) await reaction.message.fetch();

  const content = reaction.message.content ?? '';
  const m = content.match(TOKEN_RE);
  if (!m) return;
  const token = m[1];
  const channelId = reaction.message.channelId;

  // Discord channel → v2 messaging group → agent group
  const mg = getMessagingGroupByPlatform('discord', channelId);
  if (!mg) {
    log.warn('Discord reaction: no messaging group for channel', { channelId });
    return;
  }
  const agents = getMessagingGroupAgents(mg.id);
  if (agents.length === 0) {
    log.warn('Discord reaction: no agent wired to messaging group', { mgId: mg.id });
    return;
  }
  // Highest-priority wiring (matches router preference).
  const wiring = [...agents].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0]!;
  const agentGroupId = wiring.agent_group_id;

  const group = getAgentGroup(agentGroupId);
  if (!group) {
    log.warn('Discord reaction: agent group missing', { agentGroupId });
    return;
  }

  // Look up the article in the research index.
  let article: ResearchArticle | null = null;
  try {
    const raw = fs.readFileSync(researchIndexPath(group.folder), 'utf-8');
    const idx = JSON.parse(raw) as Record<string, ResearchArticle>;
    article = idx[token] ?? null;
  } catch (err) {
    log.warn('Discord reaction: cannot read research index', { token, err });
    return;
  }
  if (!article) {
    log.warn('Discord reaction: token not in research index', { token });
    return;
  }

  // Isolated session: synthetic thread id so it never collides with the
  // channel's normal chat session (v2 has no per-task isolation flag).
  const isoThread = `oneshot-notebooklm-${reaction.message.id}`;
  const { session } = resolveSession(agentGroupId, mg.id, isoThread, 'per-thread');

  const prompt = [
    'notebooklm-audio スキルを実行してください。',
    '',
    '対象記事:',
    `タイトル: ${article.title}`,
    `URL: ${article.url}`,
    `要約: ${article.summary}`,
    '',
    '記事を音声化して NotebookLM で解説を生成してください。',
  ].join('\n');

  writeSessionMessage(agentGroupId, session.id, {
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: 'task',
    timestamp: new Date().toISOString(),
    platformId: channelId,
    channelType: 'discord',
    threadId: null,
    content: JSON.stringify({ prompt, script: null }),
    trigger: 1,
  });

  const fresh = getSession(session.id);
  if (fresh) await wakeContainer(fresh);

  log.info('Discord reaction: notebooklm-audio task scheduled', {
    token,
    title: article.title,
    sessionId: session.id,
  });
}
```

> Verify against the actual v2 API before finalizing: `resolveSession`
> signature (`session-manager.ts`), `writeSessionMessage` message field names
> (`kind`/`platformId`/`channelType`/`threadId`/`trigger`), `MessagingGroup`
> field names (`getMessagingGroupByPlatform`, `getMessagingGroupAgents`,
> `priority`/`agent_group_id`), and `AgentGroup.folder`. Adjust to match.

### 2. Wire startup in `src/index.ts`

After `initChannelAdapters(...)` completes, call `startDiscordReactionListener()`.
Add `await stopDiscordReactionListener()` to the shutdown path next to
`teardownChannelAdapters()`.

### 3. External dependencies (unchanged from v1, confirm still in use)

- The nano-research workflow must write `research-message-index.json`
  (`token → {title,url,summary}`) — confirm v2 host path; override with
  `RESEARCH_INDEX_PATH` if needed.
- The `notebooklm-audio` skill from `github:potix2/nano-skills` must be
  available to the agent group at runtime (see section 02 for marketplace
  wiring).
- Discord bot needs the `GuildMessageReactions` gateway intent enabled.
