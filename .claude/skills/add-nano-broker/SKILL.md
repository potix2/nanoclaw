---
name: add-nano-broker
description: Add nano-broker integration for secure API token acquisition (GitHub, Cloudflare) from container agents via nbctl CLI.
---

# Add nano-broker Integration

This skill adds nano-broker support so container agents can securely request API tokens (GitHub, Cloudflare) through the nano-broker daemon running on the host.

Components added:
- UDS socket mount (nano-broker daemon communication)
- `nbctl` CLI binary mount (token request client)
- Agent skill file (`container/skills/nano-broker/SKILL.md`)

## Phase 1: Pre-flight

### Check if already applied

Check if `container/skills/nano-broker/SKILL.md` exists. If it does, skip to Phase 3 (Configure).

### Check prerequisites

Verify nano-broker is installed and the daemon is running:

```bash
# Check nbctl is available
which nbctl || echo "nbctl not found"

# Check the UDS socket exists
ls -la ${TMPDIR:-/tmp}/nano-broker/broker.sock 2>/dev/null || echo "Socket not found"

# Test communication with the daemon
nbctl policy list
```

If `nbctl` is not found, install it:

**Quick install (CLI only — both macOS and Linux):**
```bash
curl -fsSL https://raw.githubusercontent.com/potix2/nano-broker/main/deploy/install-nbctl.sh | bash
```

**Full install (daemon + CLI + service):**
Clone the nano-broker repository and run `bash deploy/install.sh`.

If the socket doesn't exist, the nano-broker daemon may not be running:

- **macOS**: `launchctl load ~/Library/LaunchAgents/dev.potix2.nano-broker.plist`
- **Linux**: `sudo systemctl start nano-broker`

If the plist/service is not installed, run `bash deploy/install.sh` in the nano-broker repository.

### Check container binary (macOS only)

On macOS, the host nbctl is a darwin binary and cannot run inside Linux containers.
A cross-compiled Linux binary must be installed separately:

```bash
file ~/.local/share/nano-broker/container-bin/nbctl
# Expected: ELF 64-bit LSB executable, ARM aarch64 ... statically linked
```

If not found, run Step 3b from nano-broker's setup:
```bash
cd /path/to/nano-broker
# Follow Step 3b in .claude/skills/setup/SKILL.md
```

Or download directly from GitHub Releases (see nano-broker setup skill Step 3b).

## Phase 2: Apply Code Changes

### Ensure upstream remote

```bash
git remote -v
```

If `upstream` is missing, add it:

```bash
git remote add upstream https://github.com/qwibitai/nanoclaw.git
```

### Merge the skill branch

```bash
git fetch upstream skill/nano-broker
git merge upstream/skill/nano-broker
```

This merges in:
- UDS socket mount in `src/container-runner.ts` (with platform-aware path detection)
- `NBCTL_PATH` config in `src/config.ts`
- `nbctl` binary mount in `src/container-runner.ts`
- Agent skill file `container/skills/nano-broker/SKILL.md`
- `.env.example` update for `NBCTL_PATH`

If the merge reports conflicts, resolve them by reading the conflicted files and understanding the intent of both sides.

### Validate code changes

```bash
npm run build
```

Build must be clean before proceeding.

## Phase 3: Configure

### Set nbctl path (optional)

By default, NanoClaw looks for `nbctl` at `~/.local/bin/nbctl`. If your installation is elsewhere, add to `.env`:

```bash
NBCTL_PATH=/path/to/nbctl
```

### Restart the service

```bash
launchctl kickstart -k gui/$(id -u)/com.nanoclaw  # macOS
# Linux: systemctl --user restart nanoclaw
```

## Phase 4: Verify

### Test from container

Send a message to the agent asking it to list policies:

> Run `nbctl policy list` and show me the output.

### Test token request

> Use nbctl to request a GitHub token for read access to `your-org/your-repo` with reason "testing nano-broker integration".

Expected behavior:
- If auto-approve policy exists: token returned immediately
- If no policy: pending status, approval request sent to Discord/CLI

### Check logs if needed

```bash
tail -f logs/nanoclaw.log | grep -i "nano-broker\|nbctl"
```

Look for mount entries in container debug logs showing `/tmp/nano-broker` and `/usr/local/bin/nbctl`.

## Troubleshooting

### Agent says "nbctl: command not found"

1. Check `NBCTL_PATH` in `.env` points to the correct binary
2. Verify the binary exists: `ls -la $(grep NBCTL_PATH .env | cut -d= -f2)` or `ls -la ~/.local/bin/nbctl`
3. Restart the service after changing `.env`

### Agent says "connection refused" or "socket not found"

1. Verify nano-broker daemon is running: `nbctl policy list` (from host)
2. Check the socket exists: `ls -la ${TMPDIR:-/tmp}/nano-broker/broker.sock`
3. If using macOS, ensure `$TMPDIR` resolves correctly (it varies per user session)

### Token request returns "denied"

Policy or user rejected the request. Check policies with `nbctl policy list` or add a temporary auto-approve:

```bash
nbctl policy trust --service github --duration 2h
```
