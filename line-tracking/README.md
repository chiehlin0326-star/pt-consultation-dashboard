# LINE 對話追蹤資料管線

把個人 LINE 的聊天記錄匯出檔（.txt）自動解析進 Google Sheets，讓 Claude 透過 Google Drive 連接器讀取、追蹤與管理。

> LINE 個人帳號沒有官方 API，這條管線是目前唯一合規且可自動化的路：**你只做「匯出 → 存到雲端硬碟」這一步，其餘全自動。**

## 已部署的 Google 資源

Apps Script 專案已透過 clasp 部署到 **chiehlin0326@gmail.com** 帳號下的試算表，程式碼與 `apps-script/` 完全一致。

| 資源 | 連結 |
|---|---|
| 試算表「LINE 對話追蹤」 | https://docs.google.com/spreadsheets/d/1dq1mwX54GvQ7U_oW-mMDfT92GNpoNcq_kAbEAzQS5Q4/edit |
| Apps Script 編輯器 | https://script.google.com/d/1aCOPVDXS8B0t3TisrsXUBmTRjRBb5AmVNaLRNiHIQ3G8oLKLM35FP8Q4/edit |
| 收件匣 `01_收件匣（匯出檔放這裡）` | 由 `setup()` 自動建立，連結寫在試算表「設定」工作表 |
| 歸檔 `02_已匯入` | 同上 |

> 另一個帳號 mecotechduncan@gmail.com 的 Drive 裡有一組先前建立、現已不使用的「LINE對話追蹤」資料夾與「LINE 對話追蹤（舊版空白，可刪除）」試算表，可自行刪除。

## 啟用（只剩一步，約 1 分鐘）

1. 用 chiehlin0326@gmail.com 開啟 [Apps Script 編輯器](https://script.google.com/d/1aCOPVDXS8B0t3TisrsXUBmTRjRBb5AmVNaLRNiHIQ3G8oLKLM35FP8Q4/edit)。
2. 上方函式下拉選 **`setup`** → 按 **執行** → Google 會跳出授權視窗（Drive + 試算表），選帳號並允許。
3. 執行完成後 `setup` 已自動：建立五張工作表、在試算表旁建立 `LINE對話追蹤/01_收件匣` 與 `02_已匯入`、安裝每 15 分鐘的排程，並把所有連結寫進「設定」工作表。
4. 回到試算表重新整理，會多出「LINE 追蹤」選單，可手動「立即匯入收件匣」。

驗證：在編輯器執行 `testImportSample`，「訊息」工作表應出現 2 列測試資料（聊天室「測試對象」，可直接刪除）。

### 讓 Claude 讀得到

Claude 的 Google Drive 連接器目前登入的是 **mecotechduncan@gmail.com**。要讓 Claude 直接讀寫這份資料，二擇一：

- 在試算表與「LINE對話追蹤」資料夾按「共用」，把 mecotechduncan@gmail.com 加為編輯者；或
- 在 claude.ai 連接器設定改用 chiehlin0326@gmail.com 連接 Google Drive。

### 手動安裝（備援）

若需要重新部署或換帳號：開啟試算表 → 擴充功能 → Apps Script，把 `apps-script/Code.gs` 貼到預設檔案、新增檔案 `Parser` 貼上 `apps-script/Parser.gs`，儲存後執行 `setup`。或用 clasp：`clasp login` → `clasp create --type sheets --title "LINE 對話追蹤"` → 把兩個檔案複製為 `.js` → `clasp push`。

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
| `設定` | 全自動 | 試算表帳號、收件匣與歸檔資料夾連結、排程狀態、解析器版本 |
| `聊天室` | 自動建列，**類型／對口／分院由你填** | 每個聊天室一列。類型下拉：未分類／業務合作／客戶諮詢／內部團隊／其他 |
| `訊息` | 全自動 | 訊息ID、日期、時間、聊天室、發話者、類型（text/sticker/photo/call/system…）、內容、來源檔案、匯入時間 |
| `追蹤事項` | 你或 Claude | 建立日期、聊天室、事項、負責人、期限、狀態（待辦／進行中／完成／取消）、來源訊息ID、備註 |
| `匯入紀錄` | 全自動 | 每個檔案的解析數、新增數、重複略過數、成功/失敗與原因 |

## 讓 Claude 追蹤管理

分享給 Drive 連接器帳號後（見上方），Claude 可直接讀取與寫入。常用指令範例：

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
- 資料夾 ID 存在 Apps Script 的 Script Properties；若手動刪除資料夾，再執行一次 `setup` 會重建。

## 下一階段（尚未做）

- 在 `index.html` 儀表板新增「LINE 對話追蹤」分頁（讀同一張試算表的 gviz CSV）。
- LINE 官方帳號 webhook（轉傳訊息即時入庫）與 InsightArk 同步。
