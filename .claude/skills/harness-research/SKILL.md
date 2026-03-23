---
name: harness-research
description: ハーネスエンジニアリングの最新情報を調査し、過去ログとの差分があればnano-workspaceに保存してDiscordで報告する。毎朝9時のデイリータスクで使用。
---

# ハーネスエンジニアリング調査

## 手順

### 1. シークレット読み込み
```bash
NANO_HOOK_SECRET=$(grep NANO_HOOK_SECRET /workspace/project/groups/global/.secrets | cut -d= -f2)
```

### 2. 過去の調査ログ取得（直近3件）
```bash
curl -s "https://nano.potix2.dev/api/research?topic=harness-engineering&limit=3" \
  -H "X-Hook-Secret: $NANO_HOOK_SECRET"
```

### 3. WebSearchで最新情報を調査
キーワード例:
- "harness engineering AI agents 2026"
- "Claude Code agentic coding"
- "AI agent autonomy engineering"
- "agentic coding practices"

### 4. 前回ログとの差分を分析
新しい動向・ツール・考え方があるか確認。特に目新しい情報がなければ終了（Discord送信不要）。

### 5. 差分があれば調査結果を保存
```bash
curl -s -X POST "https://nano.potix2.dev/api/research" \
  -H "Content-Type: application/json" \
  -H "X-Hook-Secret: $NANO_HOOK_SECRET" \
  -d '{
    "topic": "harness-engineering",
    "summary": "今回の要約",
    "insights": "Nanoの考察・potix2プロジェクトへの示唆",
    "sources": ["URL1", "URL2"]
  }'
```

### 6. Discordで報告
報告フォーマット:
```
📡 ハーネスエンジニアリング調査レポート [日付]

前回からの差分を中心に報告。
新しい動き・論点・potix2プロジェクトへの示唆を含める。

Sources: [リンク]
```
