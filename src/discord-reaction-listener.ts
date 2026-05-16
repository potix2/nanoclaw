/**
 * Standalone Discord reaction listener.
 *
 * v1 feature (commit 3716179) re-homed for the v2 architecture. v2's Discord
 * channel is a Chat SDK bridge that exposes no reaction events, so we open a
 * second, minimal discord.js gateway connection scoped to
 * GuildMessageReactions. On a 🎧 reaction we look up the referenced
 * nano-research article and schedule an ISOLATED one-shot `notebooklm-audio`
 * task — isolated so the channel's normal chat session context is untouched
 * (v2 has no per-task isolation flag; isolation is per-session, achieved here
 * via a synthetic thread id distinct from the channel's chat session).
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
import { getMessagingGroupAgents, getMessagingGroupByPlatform } from './db/messaging-groups.js';
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

/**
 * Where the nano-research workflow writes its index, per agent-group folder.
 * Override with RESEARCH_INDEX_PATH (absolute) if the workflow writes
 * elsewhere. Default mirrors v1's `<workspace>/outputs/...` under the v2
 * group working dir.
 */
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

  client.on(Events.MessageReactionAdd, (reaction, user) => {
    handleReaction(reaction as MessageReaction | PartialMessageReaction, user as User | PartialUser).catch((err) =>
      log.error('Discord reaction listener: handler error', { err }),
    );
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
  const token = m[1]!;
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
