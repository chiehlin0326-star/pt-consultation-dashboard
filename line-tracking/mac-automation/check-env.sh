#!/bin/bash
# 檢查 Mac 是否具備自動匯出 LINE 聊天記錄的條件。只讀取、不改任何東西。
# 用法：bash check-env.sh
ACCOUNT="${1:-chiehlin0326@gmail.com}"
ok(){ printf '  ✅ %s\n' "$1"; }
bad(){ printf '  ❌ %s\n' "$1"; FAIL=1; }
warn(){ printf '  ⚠️  %s\n' "$1"; }
FAIL=0

echo "1) Google Drive 桌面版"
if [ -d "/Applications/Google Drive.app" ]; then ok "已安裝 /Applications/Google Drive.app"; else bad "未安裝。下載：https://www.google.com/drive/download/"; fi
pgrep -xq "Google Drive" && ok "正在執行" || warn "目前沒有在執行"

echo "2) 帳號 $ACCOUNT 的同步資料夾"
BASE="$HOME/Library/CloudStorage/GoogleDrive-$ACCOUNT"
if [ -d "$BASE" ]; then
  ok "$BASE"
  INBOX=""
  for root in "$BASE/My Drive" "$BASE/我的雲端硬碟"; do
    for cand in "$root/LINE對話追蹤/01_收件匣（匯出檔放這裡）"; do
      [ -d "$cand" ] && INBOX="$cand"
    done
  done
  if [ -n "$INBOX" ]; then ok "收件匣已同步到本機：$INBOX"; echo "$INBOX" > "$HOME/.line-export-inbox"; else bad "找不到 LINE對話追蹤/01_收件匣。請在 Google Drive 偏好設定確認「我的雲端硬碟」有串流或鏡像到本機"; fi
else
  bad "沒有 $BASE。請確認 Google Drive 桌面版登入的是 $ACCOUNT"
  ls -d "$HOME/Library/CloudStorage"/GoogleDrive-* 2>/dev/null | sed 's/^/     目前找到：/'
fi

echo "3) LINE 電腦版"
[ -d "/Applications/LINE.app" ] && ok "已安裝" || bad "未安裝 /Applications/LINE.app"
pgrep -xq "LINE" && ok "正在執行（已登入才能匯出）" || warn "目前沒有在執行"
V=$(defaults read /Applications/LINE.app/Contents/Info.plist CFBundleShortVersionString 2>/dev/null); [ -n "$V" ] && echo "     版本 $V"

echo "4) 輔助使用權限（AppleScript 操作 UI 需要）"
if osascript -e 'tell application "System Events" to get name of first process' >/dev/null 2>&1; then
  ok "終端機已有輔助使用權限"
else
  bad "尚未授權。系統設定 → 隱私權與安全性 → 輔助使用 → 加入「終端機」（之後排程用 osascript 也會沿用）"
fi

echo "5) 電源"
pmset -g custom 2>/dev/null | grep -qE "^\s*sleep\s+0" && ok "系統不會自動睡眠" || warn "系統會自動睡眠；排程時段需保持喚醒（可用 pmset repeat wakeorpoweron 或排程前喚醒）"

echo
[ "$FAIL" = 0 ] && echo "全部通過，可以執行 inspect-line-ui.applescript 探測 LINE 介面。" || echo "有 ❌ 項目，請先處理。"
