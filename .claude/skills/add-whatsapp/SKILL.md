---
name: add-whatsapp
description: Add WhatsApp as a channel. Can replace other channels entirely or run alongside them. Uses QR code or pairing code for authentication.
---

# Add WhatsApp Channel

Installs WhatsApp support in NanoClaw via a git merge, guides through authentication, and registers the chat.

## Quick Reference

| Phase | Key Step |
|-------|----------|
| 1. Pre-flight | Check `store/auth/creds.json`; detect headless; ask auth method |
| 2. Code | `git remote add whatsapp ...` then `git merge whatsapp/main` |
| 3. Auth | `npx tsx setup/index.ts --step whatsapp-auth -- --method qr-browser\|qr-terminal\|pairing-code` |
| 4. Register | `npx tsx setup/index.ts --step register --jid ... --name ... --trigger ...` |
| 5. Verify | `npm run build`, restart service, send test message |

Restart: macOS `launchctl kickstart -k gui/$(id -u)/com.nanoclaw` / Linux `systemctl --user restart nanoclaw`

## Setup / Troubleshooting

→ Read `reference.md` in this skill directory before proceeding.
