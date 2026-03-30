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

## Pending-ticket deduplication (重複リクエスト防止)

承認待ちチケットの重複を防ぐため、トークンリクエスト前に必ず `/workspace/group/pending-tickets.json` を確認する。

### pending-ticket-helper.sh の使い方

```bash
source /workspace/group/pending-ticket-helper.sh

# タスクを waiting_approval に更新するローカル関数
_wait_approval() {
  local NANO_HOOK_SECRET
  NANO_HOOK_SECRET=$(grep NANO_HOOK_SECRET /workspace/project/groups/global/.secrets | cut -d= -f2)
  curl -s -X PATCH "https://nano.potix2.dev/api/tasks/$TASK_ID" \
    -H "X-Hook-Secret: $NANO_HOOK_SECRET" \
    -H "Content-Type: application/json" \
    -d '{"status":"waiting_approval"}'
}

# 1. 既存チケットを確認
check_pending_ticket "github" "org/repo"
# → $PENDING_TICKET_ID, $PENDING_POLL_STATUS, $PENDING_TOKEN が設定される

if [ "$PENDING_POLL_STATUS" = "approved" ]; then
  # 既存チケットが承認済み → $PENDING_TOKEN を使用
  TOKEN="$PENDING_TOKEN"

elif [ "$PENDING_POLL_STATUS" = "pending" ]; then
  # まだ承認待ち → タスクを waiting_approval に更新して終了
  _wait_approval && exit 0

else
  # チケットなし or エラー → 新規リクエスト
  RESULT=$(nbctl --json token request \
    --service github \
    --resource org/repo \
    --permission write \
    --reason "task description" \
    --no-wait)
  STATUS=$(echo "$RESULT" | jq -r '.status')

  if [ "$STATUS" = "approved" ]; then
    TOKEN=$(echo "$RESULT" | jq -r '.token')
  elif [ "$STATUS" = "pending" ]; then
    TICKET_ID=$(echo "$RESULT" | jq -r '.ticket_id')
    # チケットを保存してからタスクを waiting_approval に更新
    save_pending_ticket "$TICKET_ID" "$TASK_ID" "github" "org/repo" "write" "task description"
    _wait_approval && exit 0
  else
    echo "Token request denied or failed (status=$STATUS)" >&2
    exit 1
  fi
fi

# 2. TOKEN を使って作業を続行
curl -H "Authorization: Bearer $TOKEN" https://api.github.com/repos/org/repo
```

### pending-tickets.json のフォーマット

`/workspace/group/pending-tickets.json` はヘルパースクリプトが自動管理する:

```json
{
  "tickets": [
    {
      "ticket_id": "550e8400-e29b-41d4-a716-446655440000",
      "task_id": 42,
      "created_at": "2026-03-30T10:00:00Z",
      "service": "github",
      "resource": "org/repo",
      "permission": "write",
      "reason": "task description"
    }
  ]
}
```

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
- **重複リクエスト防止**: 常に `/workspace/group/pending-tickets.json` を確認してから新規リクエストを送ること
