---
name: episode-review
description: 過去30日のエピソード記憶からパターン・ルールを抽出し、前回との差分があればpotix2にDiscordで報告してCLAUDE.mdへの反映承認を求める。毎朝8時のデイリータスクで使用。
---

# エピソード振り返り・パターン抽出

## 手順

### 1. シークレット読み込み
```bash
NANO_HOOK_SECRET=$(grep NANO_HOOK_SECRET /workspace/project/groups/global/.secrets | cut -d= -f2)
```

### 2. エピソードデータ取得
```bash
curl -s "https://nano.potix2.dev/api/episodes?days=30" \
  -H "X-Hook-Secret: $NANO_HOOK_SECRET"
```

### 3. 最新パターン取得
```bash
curl -s "https://nano.potix2.dev/api/patterns/latest" \
  -H "X-Hook-Secret: $NANO_HOOK_SECRET"
```

### 4. パターン抽出・差分確認
- 前回の `episode_count` と現在のエピソード数を比較
- 新しいエピソードからルール・学びを抽出
- 差分がなければ終了（Discord送信不要）

### 5. 差分があればDiscordで報告
- 新ルールをカテゴリ・根拠とともに整理して報告
- CLAUDE.mdへの反映承認を求める

### 6. パターン保存
```bash
curl -s -X POST "https://nano.potix2.dev/api/patterns" \
  -H "Content-Type: application/json" \
  -H "X-Hook-Secret: $NANO_HOOK_SECRET" \
  -d '{"patterns": "<JSON文字列>", "episode_count": N}'
```

### 7. 承認後: CLAUDE.mdの「学習パターン・運用ルール」セクションに反映
