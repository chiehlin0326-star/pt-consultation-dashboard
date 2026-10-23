#!/bin/bash
# 每日批次：依序匯出 CHATS 內的聊天室到 Google Drive 收件匣。由 launchd 呼叫。
# 要匯出的聊天室清單（一行一個）
CHATS=(
  "⚠️優動居家AT大群x客服提醒（交班）"
)
HERE="$(cd "$(dirname "$0")" && pwd)"
INBOX="$(cat "$HOME/.line-export-inbox" 2>/dev/null)"
LOG="$HOME/Library/Logs/line-export.log"
if [ -z "$INBOX" ] || [ ! -d "$INBOX" ]; then
  echo "$(date '+%F %T') 找不到收件匣路徑，請先執行 check-env.sh" >> "$LOG"; exit 1
fi
caffeinate -dimsu -w $$ &   # 執行期間不讓 Mac 睡著
for c in "${CHATS[@]}"; do
  osascript "$HERE/export-line-chat.applescript" "$c" "$INBOX" >> "$LOG" 2>&1 || echo "$(date '+%F %T') 失敗：$c" >> "$LOG"
  sleep 5
done
