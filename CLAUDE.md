# PT 專業諮詢｜值班績效儀表板

單檔靜態網頁（`index.html`），從 Google 試算表「留單數_YYYY/M」工作表讀取 CSV，用 Chart.js 繪圖。

## 開發流程（agent-skills）

本專案啟用 `agent-skills@addy-agent-skills` plugin（設定見 `.claude/settings.json`），只使用以下 4 個指令：

| 時機 | 指令 | 用途 |
|---|---|---|
| 新增功能前 | `/spec` | 先寫清楚要算什麼、資料從哪來、畫面長怎樣 |
| 合併前 | `/agent-skills:review` | 品質審查（`/review` 與內建指令同名，須用完整名稱） |
| 改動圖表或資料量變大時 | `/webperf` | 網頁效能檢查 |
| 上線前 | `/ship` | 上線前檢查清單 |

其餘 skills（TDD、CI/CD、API 設計等）目前規模用不到，不主動啟用。

## 注意事項

- 試算表內容一律經 `escapeHTML()` 再寫入 innerHTML。
- 日期字串用 `fmt()` 以本地時間產生，不要用 `toISOString()`（會轉 UTC，在台灣差一天）。
- 新月份工作表依命名規則自動抓取；工作表命名若變更，需同步修改 `sheetList()`。
- 頁面含同仁具名績效資料，對外公開前須確認權限。
