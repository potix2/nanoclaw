---
name: episode-record
description: 作業の区切りでエピソード記憶をnano-workspaceに記録する。タスク完了・失敗・やり直しの際に使う。
---

# エピソード記憶の記録

## 手順

### 1. シークレット読み込み
```bash
NANO_HOOK_SECRET=$(grep NANO_HOOK_SECRET /workspace/project/groups/global/.secrets | cut -d= -f2)
```

### 2. APIに記録
```bash
curl -s -X POST "https://nano.potix2.dev/api/episodes" \
  -H "Content-Type: application/json" \
  -H "X-Hook-Secret: $NANO_HOOK_SECRET" \
  -d '{
    "project": "プロジェクト名",
    "what": "やっていたこと",
    "action": "取ったアクション",
    "result": "結果",
    "evaluation": "success | failure | retry | partial",
    "evidence": ["証跡"]
  }'
```

## フィールド説明
- `project`: `claude-dashboard` / `nano-workspace` / `nano-broker` / `general`
- `what`: 作業の概要（例: nano-workspaceのエピソード記憶API実装）
- `action`: 具体的に取ったアクション
- `result`: 結果（テスト数・デプロイ成否など）
- `evaluation`: 下記の基準で選択
- `evidence`: エラーメッセージ・コミットハッシュなど証跡

## evaluationの基準
- `success`: タスクが意図通り完了した
- `failure`: タスクが失敗、やり直しを命じられた
- `retry`: 途中でアプローチを変更した
- `partial`: 一部完了、継続中
