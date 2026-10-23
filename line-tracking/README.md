# LINE 對話追蹤資料管線

把個人 LINE 的聊天記錄匯出檔（.txt）自動解析進 Google Sheets，讓 Claude 透過 Google Drive 連接器讀取、追蹤與管理。

> LINE 個人帳號沒有官方 API，這條管線是目前唯一合規且可自動化的路：**你只做「匯出 → 存到雲端硬碟」這一步，其餘全自動。**

## 已建立的 Google 資源

| 資源 | 用途 | 連結 |
|---|---|---|
| 資料夾 `LINE對話追蹤` | 根目錄 | https://drive.google.com/drive/folders/1mjFCKbItc-jSKa6R8c1OIZFaWgXTCeZJ |
| `01_收件匣（匯出檔放這裡）` | 匯出檔丟這裡，15 分鐘內自動匯入 | https://drive.google.com/drive/folders/1t7G20OJY9ZWo8t9haZj14BkujBhyRRbO |
| `02_已匯入` | 處理完的檔案自動搬到這裡歸檔 | https://drive.google.com/drive/folders/1S01XcZMwRC6xQEjFveJ6Ba_1wlsIJC4y |
| 試算表 `LINE 對話追蹤` | 所有結構化資料 | https://docs.google.com/spreadsheets/d/1QWN4VFX6Fq1rqhI00Xwj7oGtJuCP835JP0sQCSNy3Bs/edit |

## 一次性安裝（約 5 分鐘）

1. 開啟試算表 → 上方選單 **擴充功能 → Apps Script**。
2. 把預設的 `程式碼.gs` 內容整個換成 `apps-script/Code.gs`。
3. 點左側「＋」新增指令碼，命名 `Parser`，貼上 `apps-script/Parser.gs`。
4. 儲存（Ctrl/Cmd + S）。
5. 上方函式下拉選 `setup` → 執行 → 第一次會要求授權（Drive + 試算表），全部允許。`setup` 會同時安裝每 15 分鐘的自動排程。
6. 回到試算表重新整理，會多出「LINE 追蹤」選單，可手動「立即匯入收件匣」。

驗證：在 Apps Script 執行 `testImportSample`，「訊息」工作表應出現 2 列測試資料（聊天室「測試對象」，可直接刪除）。

## 日常操作（iPhone）

1. 打開要追蹤的聊天室 → 右上角 **≡** → **設定**（或「其他」）→ **匯出聊天記錄**。
2. 分享面板選 **儲存到雲端硬碟**（Google Drive App）。
3. 位置選 `LINE對話追蹤 / 01_收件匣（匯出檔放這裡）` → 上傳。
4. 15 分鐘內自動匯入；或打開試算表 → 「LINE 追蹤」→「立即匯入收件匣」。

同一個聊天室重複匯出沒關係：訊息以內容指紋去重，只會新增新訊息。

Mac 桌面版 LINE：聊天室右上 **≡ → 匯出聊天記錄**，直接存到 Google Drive 同步資料夾裡的 `01_收件匣`。

## 試算表結構

| 工作表 | 誰填 | 內容 |
|---|---|---|
| `聊天室` | 自動建列，**類型／對口／分院由你填** | 每個聊天室一列。類型下拉：未分類／業務合作／客戶諮詢／內部團隊／其他 |
| `訊息` | 全自動 | 訊息ID、日期、時間、聊天室、發話者、類型（text/sticker/photo/call/system…）、內容、來源檔案、匯入時間 |
| `追蹤事項` | 你或 Claude | 建立日期、聊天室、事項、負責人、期限、狀態（待辦／進行中／完成／取消）、來源訊息ID、備註 |
| `匯入紀錄` | 全自動 | 每個檔案的解析數、新增數、重複略過數、成功/失敗與原因 |

## 讓 Claude 追蹤管理

試算表在你的 Drive，Claude 透過 Google Drive 連接器可直接讀取。常用指令範例：

- 「讀 LINE 對話追蹤試算表，列出近 7 天有新訊息但我超過 2 天沒回的聊天室」
- 「把『陳經理』聊天室最近的對話整理成合作進度摘要，並把待辦寫進追蹤事項」
- 「依類型統計這個月各聊天室的訊息量與我的平均回覆時間」

Claude 寫入「追蹤事項」時使用同一張試算表，不需要額外設定。

## 本機／Claude 端工具

```bash
cd line-tracking
npm test                                   # 解析器單元測試（Node 22+）
node parser/cli.js 匯出檔.txt               # 轉成 CSV（欄位同「訊息」工作表）
node parser/cli.js 匯出檔.txt --json        # 轉成 JSON（含警告）
```

`Parser.gs` 是純 JavaScript，Apps Script 與 Node 共用同一份，避免兩邊漂移。

## 已知限制與待確認事項

- **[需要確認] iPhone 實際匯出格式**：解析器依已知格式撰寫並通過測試樣本，仍需用 Duncan 的真實匯出檔驗證（特別是 12 小時制「上午/下午」與多行訊息的呈現）。
- **[需要確認] Android 多行訊息雙引號包覆**：依社群回報實作，未實測。
- 舊版 Android 以空白分隔時，發話者名稱含空白會被切錯；iPhone 與桌面版用 TAB 分隔不受影響。
- 同一分鐘內、同一發話者、完全相同內容的重複訊息以出現序號區分；若匯出檔只含部分歷史，序號可能與先前匯入不一致而造成少量重複（僅影響貼圖連發這類情境）。
- 匯出檔不含圖片、檔案本體，只有 `[照片]` `[檔案]` 標記。
- 資料夾與試算表 ID 寫死在 `Code.gs` 的 `CONFIG`，若移動或重建資源需同步修改。

## 下一階段（尚未做）

- 在 `index.html` 儀表板新增「LINE 對話追蹤」分頁（讀同一張試算表的 gviz CSV）。
- LINE 官方帳號 webhook（轉傳訊息即時入庫）與 InsightArk 同步。
