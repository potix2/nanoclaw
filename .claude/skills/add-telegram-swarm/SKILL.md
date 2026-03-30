---
name: add-telegram-swarm
description: Add Agent Swarm (Teams) support to Telegram. Each subagent gets its own bot identity in the group. Requires Telegram channel to be set up first (use /add-telegram). Triggers on "agent swarm", "agent teams telegram", "telegram swarm", "bot pool".
---

# Add Agent Swarm to Telegram

Adds Agent Teams (Swarm) support to an existing Telegram channel so each subagent appears from its own bot identity.

## Quick Reference

- **Prerequisite**: `/add-telegram` must be completed first (`src/telegram.ts` and `TELEGRAM_BOT_TOKEN` must exist)
- **Pool bots**: Create 3-5 bots via `@BotFather`, disable Group Privacy for each, add to group
- **Config**: Add `TELEGRAM_BOT_POOL=TOKEN1,TOKEN2,...` to `.env`, sync with `cp .env data/env/env`
- **Rebuild**: `npm run build && ./container/build.sh`
- **Restart**: `launchctl unload/load ~/Library/LaunchAgents/com.nanoclaw.plist` (macOS) or `systemctl --user restart nanoclaw` (Linux)
- **Test**: `tail -f logs/nanoclaw.log | grep -i pool`

## Files Changed

- `src/config.ts` — add `TELEGRAM_BOT_POOL`
- `src/telegram.ts` — add `initBotPool`, `sendPoolMessage`
- `container/agent-runner/src/ipc-mcp-stdio.ts` — add `sender` param to `send_message`
- `src/ipc.ts` — route swarm messages through pool
- `src/index.ts` — call `initBotPool` on startup
- `groups/{folder}/CLAUDE.md` — add Agent Teams instructions

## Setup / Troubleshooting

→ Read `reference.md` in this skill directory before proceeding.
