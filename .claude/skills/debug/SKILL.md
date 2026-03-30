---
name: debug
description: Debug container agent issues. Use when things aren't working, container fails, authentication problems, or to understand how the container system works. Covers logs, environment variables, mounts, and common issues.
---

# NanoClaw Container Debugging

Covers debugging the containerized agent execution system: logs, env vars, mounts, sessions, and IPC.

## Quick Reference

| Log | Location |
|-----|----------|
| Main app | `logs/nanoclaw.log` |
| Per-run container | `groups/{folder}/logs/container-*.log` |

| Issue | Fix |
|-------|-----|
| Exit code 1 / missing auth | Check `.env` for `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY` |
| Root user restriction | Ensure `USER node` in Dockerfile |
| Session not resuming | Mount to `/home/node/.claude/`, not `/root/.claude/` |
| Container image missing | Run `./container/build.sh` |

Enable debug logging: `LOG_LEVEL=debug npm run dev`

## Setup / Troubleshooting

→ Read `reference.md` in this skill directory before proceeding.
