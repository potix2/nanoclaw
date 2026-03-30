---
name: x-integration
description: X (Twitter) integration for NanoClaw. Post tweets, like, reply, retweet, and quote. Use for setup, testing, or troubleshooting X functionality. Triggers on "setup x", "x integration", "twitter", "post tweet", "tweet".
---

# X (Twitter) Integration

Browser automation for X interactions via WhatsApp.

## Quick Reference

| Action | Tool | Command |
|--------|------|---------|
| Post | `x_post` | `@Assistant post a tweet: Hello world!` |
| Like | `x_like` | `@Assistant like this tweet https://x.com/...` |
| Reply | `x_reply` | `@Assistant reply to https://x.com/... with: Great post!` |
| Retweet | `x_retweet` | `@Assistant retweet https://x.com/...` |
| Quote | `x_quote` | `@Assistant quote https://x.com/... with comment: Interesting` |

## Setup (Quick)

1. Run auth: `npx dotenv -e .env -- npx tsx .claude/skills/x-integration/scripts/setup.ts`
2. Rebuild container: `./container/build.sh`
3. Rebuild host and restart: `npm run build && launchctl kickstart -k gui/$(id -u)/com.nanoclaw`

## Setup / Troubleshooting

→ Read `reference.md` in this skill directory before proceeding.
