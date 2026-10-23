const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../../apps-script/Parser.gs');

const fx = (n) => fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf8');

test('iOS 繁中 24h：檔頭、BOM、多行、系統訊息、貼圖、通話、連結', () => {
  const r = P.parseLineExport(fx('ios_zh_24h.txt'));
  assert.equal(r.chatName, '王小明');
  assert.equal(r.savedAt, '2024/05/01 10:23');
  assert.equal(r.format.separator, '\t');
  assert.equal(r.messages.length, 8);
  const m = r.messages;
  assert.deepEqual([m[0].date, m[0].time, m[0].sender, m[0].type], ['2024-04-28', '10:15', '王小明', 'text']);
  assert.equal(m[1].content, '哈囉！可以的\n請問方便哪個分院？');
  assert.equal(m[2].type, 'sticker');
  assert.equal(m[4].isSystem, true);
  assert.equal(m[4].type, 'system');
  assert.equal(m[4].content, '王小明收回訊息');
  assert.equal(m[5].type, 'call');
  assert.equal(m[6].date, '2024-04-29');
  assert.equal(m[6].type, 'link');
  assert.equal(m[7].content, '=SUM(A1) 這是測試開頭等號');
  assert.equal(r.warnings.length, 0);
});

test('去重鍵：同分鐘同內容兩則貼圖拿到不同 key，且 key 穩定', () => {
  const r = P.parseLineExport(fx('ios_zh_24h.txt'));
  P.assignKeys(r.chatName, r.messages);
  const keys = r.messages.map((m) => m.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.match(keys[0], /^[0-9a-f]{16}$/);
  const r2 = P.parseLineExport(fx('ios_zh_24h.txt'));
  P.assignKeys(r2.chatName, r2.messages);
  assert.deepEqual(r2.messages.map((m) => m.key), keys);
});

test('iOS 繁中 12 小時制：上午/下午換算', () => {
  const r = P.parseLineExport(fx('ios_zh_12h.txt'));
  assert.equal(r.chatName, '生生優動合作群');
  assert.equal(r.format.hour12, true);
  assert.deepEqual(r.messages.map((m) => m.time), ['10:15', '15:15', '12:30', '00:05']);
  assert.equal(r.messages[3].type, 'photo');
});

test('Android 雙引號多行訊息', () => {
  const r = P.parseLineExport(fx('android_zh_quoted.txt'));
  assert.equal(r.messages.length, 3);
  assert.equal(r.messages[0].content, '今天值班重點：\n1. 中午前回覆所有留單\n2. 下午盤點');
  assert.equal(r.messages[1].content, '收到');
  assert.equal(r.messages[2].content, '單行帶引號');
});

test('舊版 Android 空白分隔', () => {
  const r = P.parseLineExport(fx('android_zh_space.txt'));
  assert.equal(r.format.separator, ' ');
  assert.deepEqual([r.messages[0].sender, r.messages[0].content], ['阿強', '你好']);
  assert.deepEqual([r.messages[1].sender, r.messages[1].content], ['Duncan', '哈囉 你好']);
  assert.equal(r.messages[2].isSystem, true);
});

test('英文桌面版：Sun, 4/28/2024 與 AM/PM', () => {
  const r = P.parseLineExport(fx('desktop_en.txt'));
  assert.equal(r.chatName, 'John');
  assert.deepEqual(r.messages.map((m) => m.date + ' ' + m.time), [
    '2024-04-28 10:15', '2024-04-28 15:15', '2024-04-28 15:20', '2024-04-29 00:00', '2024-04-29 12:00'
  ]);
  assert.equal(r.messages[2].type, 'sticker');
});

test('日期列各種寫法', () => {
  assert.equal(P.parseDateLine('2024/04/28（日）'), '2024-04-28');
  assert.equal(P.parseDateLine('2024/4/8(週一)'), '2024-04-08');
  assert.equal(P.parseDateLine('2024.04.28 星期日'), '2024-04-28');
  assert.equal(P.parseDateLine('2024年4月28日（日）'), '2024-04-28');
  assert.equal(P.parseDateLine('Sunday, April 28, 2024'), '2024-04-28');
  assert.equal(P.parseDateLine('28/04/2024 (Sun)'), '2024-04-28');
  assert.equal(P.parseDateLine('10:15\t王小明\t2024/04/28'), null);
  assert.equal(P.parseDateLine('今天 2024/04/28 開會'), null);
});

test('沒有檔頭時用檔名推斷聊天室', () => {
  const r = P.parseLineExport('2024/04/28（日）\n10:15\tA\thi\n', { fileName: '[LINE] 與測試群的聊天記錄.txt' });
  assert.equal(r.chatName, '測試群');
  assert.equal(r.warnings.length, 1);
});
