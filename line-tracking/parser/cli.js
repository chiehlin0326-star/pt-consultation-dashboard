#!/usr/bin/env node
/**
 * 本機 / Claude 端使用：把 LINE 匯出 .txt 轉成 CSV 或 JSON。
 *   node line-tracking/parser/cli.js <檔案.txt> [--json] [--out 輸出檔]
 * 預設輸出 CSV（欄位與 Google Sheets「訊息」工作表一致）。
 */
const fs = require('node:fs');
const path = require('node:path');
const P = require('../apps-script/Parser.gs');

const args = process.argv.slice(2);
if (!args.length || args.includes('-h') || args.includes('--help')) {
  console.error('用法: node cli.js <檔案.txt> [--json] [--out 輸出檔]');
  process.exit(1);
}
const file = args[0];
const asJson = args.includes('--json');
const outIdx = args.indexOf('--out');
const outFile = outIdx >= 0 ? args[outIdx + 1] : null;

const text = fs.readFileSync(file, 'utf8');
const r = P.parseLineExport(text, { fileName: path.basename(file) });
P.assignKeys(r.chatName, r.messages);

let output;
if (asJson) {
  output = JSON.stringify(r, null, 2);
} else {
  const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const rows = [['訊息ID', '日期', '時間', '聊天室', '發話者', '類型', '內容', '來源檔案']];
  for (const m of r.messages) rows.push([m.key, m.date, m.time, r.chatName, m.sender, m.type, m.content, path.basename(file)]);
  output = '﻿' + rows.map((row) => row.map(esc).join(',')).join('\n') + '\n';
}
if (outFile) fs.writeFileSync(outFile, output);
else process.stdout.write(output);
for (const w of r.warnings) console.error('警告: ' + w);
console.error(`聊天室「${r.chatName}」：${r.messages.length} 則訊息`);
