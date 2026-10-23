# Mac 自動匯出 LINE 聊天記錄

透過 macOS 的 UI 自動化（AppleScript + System Events）每天自動對指定聊天室執行「匯出聊天記錄」，存進 Google Drive 桌面版同步的 `01_收件匣`，後段由現有 Apps Script 自動入庫。

> 風險提醒：LINE 服務條款禁止自動化存取。這裡匯出的是你自己的資料、一天一次，風險低但非零。請勿調高頻率。
> 限制：LINE 電腦版只有該裝置同步到的訊息 [需要確認]；完整歷史請用手機匯出一次，之後由電腦版補新訊息（管線會去重）。

## 步驟

1. **環境檢查**（在 Mac 終端機執行，只讀不改）
   ```bash
   bash line-tracking/mac-automation/check-env.sh chiehlin0326@gmail.com
   ```
   全部 ✅ 才往下。這一步會把收件匣本機路徑記在 `~/.line-export-inbox`。

2. **探測 LINE 介面**（一次性）
   在 LINE 打開目標聊天室，執行：
   ```bash
   osascript line-tracking/mac-automation/inspect-line-ui.applescript
   ```
   把桌面上產生的 `line-ui-dump.txt` 交給 Claude，校正 `export-line-chat.applescript` 裡的按鈕與選單名稱。

3. **手動試跑一次**
   ```bash
   osascript line-tracking/mac-automation/export-line-chat.applescript "⚠️優動居家AT大群x客服提醒（交班）" "$(cat ~/.line-export-inbox)"
   ```
   成功的話收件匣會出現 `[LINE] ….txt`，15 分鐘內試算表「匯入紀錄」多一列。

4. **安裝每日排程**（預設每天 08:05）
   ```bash
   sed "s#__REPO_PATH__#$(pwd)#" line-tracking/mac-automation/com.duncan.line-export.plist > ~/Library/LaunchAgents/com.duncan.line-export.plist
   launchctl load ~/Library/LaunchAgents/com.duncan.line-export.plist
   ```
   要加聊天室，編輯 `run-daily-export.sh` 的 `CHATS` 陣列。紀錄在 `~/Library/Logs/line-export.log`。

   移除：`launchctl unload ~/Library/LaunchAgents/com.duncan.line-export.plist`

## 需要的權限

- 系統設定 → 隱私權與安全性 → **輔助使用**：加入「終端機」（launchd 以 osascript 執行時沿用）。
- 排程時段 Mac 需保持喚醒並已登入 LINE；腳本執行期間會用 `caffeinate` 防止睡眠。

## 若 AppleScript 讀不到 LINE 的介面元件

LINE Mac 版若未開放輔助使用樹，步驟 2 的輸出會近乎空白。此時改用 Cowork 排程任務 + 電腦操作（由 Claude 看畫面點按），流程相同。
