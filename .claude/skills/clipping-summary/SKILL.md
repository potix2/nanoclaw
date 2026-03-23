---
name: clipping-summary
description: 前日にiOSからクリップされた記事を取得・分析してDiscordで報告する。毎朝8時のデイリータスクで使用。0件の日はスキップ。
---

# クリッピングサマリー

## 手順

### 1. シークレット読み込み
```bash
NANO_HOOK_SECRET=$(grep NANO_HOOK_SECRET /workspace/project/groups/global/.secrets | cut -d= -f2)
```

### 2. 前日のクリッピング取得
```bash
# 前日の日付を取得
YESTERDAY=$(date -d "yesterday" +%Y-%m-%d 2>/dev/null || date -v-1d +%Y-%m-%d)

curl -s "https://nano.potix2.dev/api/clippings?date=$YESTERDAY" \
  -H "X-Hook-Secret: $NANO_HOOK_SECRET"
```

### 3. 0件の場合はスキップ（Discord送信不要）

### 4. 1件以上あれば以下のフォーマットでDiscordに報告

## 報告フォーマット

```
📚 クリッピングサマリー [日付]

【全体サマリー】
前日クリップされた記事群の全体的なテーマ・傾向を2〜3文で要約。

【掘り下げポイント】
最も注目すべきトピック・論点を2〜3点ピックアップして深掘り考察。

【関連記事】
掘り下げポイントに関連する記事タイトルとURLを簡潔に紹介。
```

## 注意
- 1件ずつの紹介はしない（まとめて考察する）
- 記事の羅列ではなく、テーマ・傾向・考察を重視する
