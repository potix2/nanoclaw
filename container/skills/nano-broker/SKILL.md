---
name: nano-broker
description: Request API tokens (GitHub, Cloudflare) through nano-broker. Use whenever you need API credentials for external services.
allowed-tools: Bash(nbctl:*)
---

# Token Acquisition with nbctl

## Quick start

```bash
nbctl token request --service github --resource org/repo --permission read --reason "task description"
nbctl token poll <ticket-id>         # Check approval status (if pending)
nbctl policy trust --service github --duration 2h  # Temporarily auto-approve
```

## Core workflow

1. Request: `nbctl token request --service <service> ...`
   - Exit 0 → token issued (stdout contains token)
   - Exit 2 → pending approval (use `nbctl token poll`)
   - Exit 3 → denied by policy
2. Poll (if pending): `nbctl token poll <ticket-id> --timeout 60`
3. Use token for API calls

## JSON mode

Add `--json` to any command for structured output:

```bash
nbctl --json token request --service github --resource org/repo --permission read --reason "fetch code"
# {"status": "approved", "token": "ghs_...", "expires_at": "2026-03-23T15:30:00Z"}
# Or: {"status": "pending", "ticket_id": "550e8400-...", "expires_at": "..."}
```

## Commands

### Token operations
- `nbctl token request --service <github|cloudflare> --resource <r> --permission <p> --reason <text>` — request token
- `nbctl token request ... --no-wait` — return ticket_id immediately without waiting
- `nbctl token poll <ticket-id> [--timeout <seconds>]` — poll pending request

### Policy management
- `nbctl policy list` — show all policies
- `nbctl policy trust --service <s> [--resource <r>] [--permission <p>] --duration <dur>` — temporary auto-approve
- `nbctl policy clear` — remove all dynamic policies

### Exit codes
- 0: success (token ready, command succeeded)
- 1: error (connection failure, broker error)
- 2: pending (approval not yet given)
- 3: denied (by policy or approver)

## Example: GitHub API access

```bash
# Request a GitHub token
RESULT=$(nbctl --json token request \
  --service github \
  --resource your-org/repo \
  --permission read \
  --reason "fetch repository data")

# Parse the result
STATUS=$(echo "$RESULT" | jq -r '.status')
if [ "$STATUS" = "approved" ]; then
  TOKEN=$(echo "$RESULT" | jq -r '.token')
  curl -H "Authorization: Bearer $TOKEN" https://api.github.com/repos/your-org/repo
elif [ "$STATUS" = "pending" ]; then
  TICKET=$(echo "$RESULT" | jq -r '.ticket_id')
  # Wait for user approval
  RESULT=$(nbctl --json token poll "$TICKET" --timeout 120)
  TOKEN=$(echo "$RESULT" | jq -r '.token')
fi
```

## Notes
- Tokens are short-lived and managed by the host's nano-broker daemon
- User approval may be required (via Discord or CLI) — poll if pending
- Use `nbctl policy trust` to temporarily skip approval for repeated operations
- The socket is at /tmp/nano-broker/broker.sock inside the container
