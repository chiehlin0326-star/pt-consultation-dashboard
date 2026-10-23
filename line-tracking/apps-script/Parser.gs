/**
 * LINE 聊天記錄匯出檔（.txt）解析器
 *
 * 純 JavaScript、不依賴任何 Apps Script API，因此同一份程式碼：
 *   - 貼進 Google Apps Script 作為正式匯入管線
 *   - 在 Node.js 下跑單元測試與 CLI（parser/cli.js）
 *
 * 支援格式（依實測逐步補強，未實測者標記 [需要確認]）：
 *   - iOS 繁中：日期列「2024/04/28（日）」、訊息列「10:15<TAB>發話者<TAB>內容」
 *   - iOS 繁中 12 小時制：「下午3:15<TAB>發話者<TAB>內容」
 *   - Android 繁中：同上，多行訊息以雙引號包起 [需要確認]
 *   - 桌面版 / 英文：「Sun, 4/28/2024」「10:15 AM<TAB>Name<TAB>text」 [需要確認]
 */

var LINE_PARSER_VERSION = '1.0.0';

/** 日期列的各種寫法 → { y, m, d } */
var DATE_PATTERNS = [
  // 2024/04/28（日）、2024.4.28 (Sun)、2024-04-28、2024年4月28日（日）
  { re: /^(\d{4})[\/.\-年]\s*(\d{1,2})[\/.\-月]\s*(\d{1,2})日?\s*(?:[（(][^)）]*[)）])?\s*(?:星期[一二三四五六日天]|週[一二三四五六日天]|[A-Za-z]+)?\s*$/, order: 'ymd' },
  // Sun, 4/28/2024  /  Sunday, 4/28/2024  (美式 月/日/年)
  { re: /^[A-Za-z]{3,9},?\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/, order: 'mdy' },
  // 4/28/2024 Sunday  /  4/28/2024
  { re: /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+[A-Za-z]+)?\s*$/, order: 'mdy' },
  // Sunday, April 28, 2024  /  Sun, Apr 28, 2024
  { re: /^[A-Za-z]{3,9},?\s+([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})\s*$/, order: 'Mdy' },
  // 28/04/2024 (Sun)  (英式 日/月/年) [需要確認：與美式衝突時以 day>12 判斷]
  { re: /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s*[（(][^)）]*[)）]\s*$/, order: 'dmy' }
];

var MONTHS_EN = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

/** 訊息列開頭的時間：10:15 / 上午10:15 / 下午3:15 / 10:15 AM / 3:15 PM */
var TIME_RE = /^(上午|下午|午前|午後|AM|PM|am|pm)?\s*(\d{1,2}):(\d{2})\s*(上午|下午|午前|午後|AM|PM|am|pm|a\.m\.|p\.m\.)?(?=[\t ]|$)/;

/** 檔頭 */
var HEADER_PATTERNS = [
  /^\[LINE\]\s*與\s*(.+?)\s*的聊天記錄\s*$/,
  /^\[LINE\]\s*(.+?)\s*的聊天記錄\s*$/,
  /^\[LINE\]\s*Chat history with\s+(.+?)\s*$/i,
  /^\[LINE\]\s*Chat history in\s+(.+?)\s*$/i,
  /^\[LINE\]\s*Chat in\s+(.+?)\s*$/i,
  /^\[LINE\]\s*(.+?)\s*とのトーク履歴\s*$/
];
var SAVED_AT_RE = /^(?:儲存日期|保存日期|保存日時|Saved on|Saved)\s*[:：]\s*(.+?)\s*$/i;

/** 內容型態判斷（完全相符） */
var CONTENT_TYPES = [
  { type: 'sticker', re: /^\[(貼圖|Sticker|スタンプ)\]$/i },
  { type: 'photo', re: /^\[(照片|圖片|Photo|Photos|写真|画像)\]$/i },
  { type: 'video', re: /^\[(影片|Video|動画)\]$/i },
  { type: 'file', re: /^\[(檔案|File|ファイル)\]$/i },
  { type: 'voice', re: /^\[(語音訊息|Voice message|ボイスメッセージ)\]$/i },
  { type: 'album', re: /^\[(相簿|Album|アルバム)\]$/i },
  { type: 'note', re: /^\[(記事本|Note|ノート)\]$/i },
  { type: 'location', re: /^\[(位置資訊|Location|位置情報)\]$/i },
  { type: 'contact', re: /^\[(聯絡資訊|Contact|連絡先)\]$/i },
  { type: 'gift', re: /^\[(禮物|Gift)\]$/i },
  { type: 'call', re: /^(☎|📞|通話時間|未接來電|Call time|Missed call|Canceled call|No answer|取消通話|不在著信)/i }
];

/**
 * 主要進入點。
 * @param {string} text  匯出檔全文（UTF-8）
 * @param {{fileName?: string}} [opts]
 * @returns {{chatName:string, savedAt:string, format:{separator:string, hour12:boolean},
 *            messages:Array<{seq:number,date:string,time:string,sender:string,content:string,type:string,isSystem:boolean}>,
 *            warnings:string[]}}
 */
function parseLineExport(text, opts) {
  opts = opts || {};
  var warnings = [];
  text = String(text || '');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // 去 BOM
  var lines = text.split(/\r\n|\r|\n/);

  var chatName = '';
  var savedAt = '';
  var i = 0;

  // ---- 檔頭（最多看前 5 行）----
  for (; i < Math.min(lines.length, 5); i++) {
    var l = lines[i].trim();
    if (!l) continue;
    var matchedHeader = false;
    for (var h = 0; h < HEADER_PATTERNS.length && !chatName; h++) {
      var hm = l.match(HEADER_PATTERNS[h]);
      if (hm) { chatName = hm[1].trim(); matchedHeader = true; }
    }
    if (matchedHeader) continue;
    var sm = l.match(SAVED_AT_RE);
    if (sm) { savedAt = sm[1]; continue; }
    if (parseDateLine(l) || TIME_RE.test(l)) break; // 已進入內文
  }
  if (!chatName) {
    chatName = chatNameFromFileName(opts.fileName || '');
    if (chatName) warnings.push('檔頭沒有聊天室名稱，改用檔名推斷：' + chatName);
    else { chatName = '未知聊天室'; warnings.push('無法判斷聊天室名稱（檔頭與檔名皆無）'); }
  }

  // ---- 判斷分隔符：只要有任一訊息列含 TAB 就用 TAB 模式 ----
  var separator = ' ';
  for (var k = i; k < lines.length; k++) {
    if (TIME_RE.test(lines[k]) && lines[k].indexOf('\t') >= 0) { separator = '\t'; break; }
  }
  var hour12 = false;

  // ---- 內文 ----
  var messages = [];
  var currentDate = '';
  var cur = null;          // 目前正在累積的訊息
  var inQuote = false;     // Android 多行訊息雙引號模式
  var seq = 0;

  for (; i < lines.length; i++) {
    var raw = lines[i];
    var line = raw.replace(/\s+$/, '');

    if (inQuote && cur) {
      if (/"$/.test(line)) { cur.content += '\n' + line.slice(0, -1); inQuote = false; }
      else cur.content += '\n' + line;
      continue;
    }

    if (!line.trim()) continue;

    var d = parseDateLine(line.trim());
    if (d) { currentDate = d; cur = null; continue; }

    var tm = line.match(TIME_RE);
    if (tm) {
      if (!currentDate) warnings.push('第 ' + (i + 1) + ' 行：出現訊息但尚無日期列，已略過');
      if (!currentDate) { cur = null; continue; }
      var ampm = tm[1] || tm[4] || '';
      if (ampm) hour12 = true;
      var time = normalizeTime(parseInt(tm[2], 10), tm[3], ampm);
      var rest = line.slice(tm[0].length).replace(/^[\t ]+/, '');
      var sender = '';
      var content = '';
      var isSystem = false;

      if (separator === '\t') {
        var parts = rest.split('\t');
        if (parts.length >= 2) { sender = parts[0].trim(); content = parts.slice(1).join('\t'); }
        else { content = rest; isSystem = true; }
      } else {
        var sp = rest.match(/^(\S+)[ ]+([\s\S]*)$/);
        if (sp) { sender = sp[1]; content = sp[2]; }
        else { content = rest; isSystem = true; }
      }

      if (!isSystem && content.charAt(0) === '"' && !(content.length > 1 && /"$/.test(content))) {
        content = content.slice(1);
        inQuote = true;
      } else if (!isSystem && content.length > 1 && content.charAt(0) === '"' && /"$/.test(content)) {
        content = content.slice(1, -1);
      }

      cur = { seq: ++seq, date: currentDate, time: time, sender: sender, content: content, type: '', isSystem: isSystem };
      messages.push(cur);
      continue;
    }

    // 既非日期也非時間開頭 → 前一則訊息的續行
    if (cur) cur.content += '\n' + line;
    else warnings.push('第 ' + (i + 1) + ' 行：無法歸類，已略過：' + line.slice(0, 40));
  }
  if (inQuote) warnings.push('檔尾雙引號未閉合，最後一則多行訊息可能不完整');

  for (var m = 0; m < messages.length; m++) {
    messages[m].content = messages[m].content.replace(/\s+$/, '');
    messages[m].type = classifyContent(messages[m].content, messages[m].isSystem);
  }

  return { chatName: chatName, savedAt: savedAt, format: { separator: separator, hour12: hour12 }, messages: messages, warnings: warnings, parserVersion: LINE_PARSER_VERSION };
}

/** 日期列 → 'YYYY-MM-DD'，不是日期列回傳 null */
function parseDateLine(line) {
  for (var p = 0; p < DATE_PATTERNS.length; p++) {
    var m = line.match(DATE_PATTERNS[p].re);
    if (!m) continue;
    var y, mo, d;
    switch (DATE_PATTERNS[p].order) {
      case 'ymd': y = +m[1]; mo = +m[2]; d = +m[3]; break;
      case 'mdy': mo = +m[1]; d = +m[2]; y = +m[3]; if (mo > 12 && d <= 12) { var t = mo; mo = d; d = t; } break;
      case 'dmy': d = +m[1]; mo = +m[2]; y = +m[3]; if (mo > 12 && d <= 12) { var t2 = mo; mo = d; d = t2; } break;
      case 'Mdy': mo = MONTHS_EN[m[1].slice(0, 3).toLowerCase()]; d = +m[2]; y = +m[3]; break;
    }
    if (!y || !mo || !d || mo > 12 || d > 31) continue;
    return y + '-' + pad2(mo) + '-' + pad2(d);
  }
  return null;
}

/** 12/24 小時制統一為 'HH:MM' */
function normalizeTime(h, mm, ampm) {
  ampm = (ampm || '').toLowerCase().replace(/\./g, '');
  var pm = ampm === '下午' || ampm === '午後' || ampm === 'pm';
  var am = ampm === '上午' || ampm === '午前' || ampm === 'am';
  if (pm && h < 12) h += 12;
  if (am && h === 12) h = 0;
  return pad2(h) + ':' + mm;
}

function classifyContent(content, isSystem) {
  if (isSystem) return 'system';
  var c = content.trim();
  for (var t = 0; t < CONTENT_TYPES.length; t++) if (CONTENT_TYPES[t].re.test(c)) return CONTENT_TYPES[t].type;
  if (/^(https?:\/\/\S+)$/i.test(c)) return 'link';
  return 'text';
}

function chatNameFromFileName(name) {
  if (!name) return '';
  name = name.replace(/\.txt$/i, '').replace(/^\[LINE\]\s*/, '');
  var m = name.match(/^與\s*(.+?)\s*的聊天記錄/) || name.match(/^(.+?)\s*的聊天記錄/) || name.match(/^Chat history with\s+(.+)$/i);
  return m ? m[1].trim() : name.trim();
}

function pad2(n) { return (n < 10 ? '0' : '') + n; }

/**
 * 訊息去重用的穩定鍵：聊天室 + 日期 + 時間 + 發話者 + 內容 + 同分鐘同內容的第幾次出現。
 * 以 FNV-1a 兩段 hash 產生 16 位十六進位字串，Node 與 Apps Script 結果一致。
 */
function messageKey(chatName, msg, occurrence) {
  var s = [chatName, msg.date, msg.time, msg.sender, msg.content, occurrence || 0].join('\u0001');
  return fnv1a(s, 0x811c9dc5) + fnv1a(s, 0x01000193 ^ 0x9747b28c);
}

function fnv1a(str, seed) {
  var h = seed >>> 0;
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  var hex = h.toString(16);
  while (hex.length < 8) hex = '0' + hex;
  return hex;
}

/** 幫每則訊息補上 key（處理同分鐘重複訊息的序號） */
function assignKeys(chatName, messages) {
  var seen = {};
  for (var i = 0; i < messages.length; i++) {
    var m = messages[i];
    var base = [m.date, m.time, m.sender, m.content].join('\u0001');
    var n = seen[base] || 0;
    seen[base] = n + 1;
    m.key = messageKey(chatName, m, n);
  }
  return messages;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseLineExport: parseLineExport, parseDateLine: parseDateLine, normalizeTime: normalizeTime, classifyContent: classifyContent, messageKey: messageKey, assignKeys: assignKeys, chatNameFromFileName: chatNameFromFileName, LINE_PARSER_VERSION: LINE_PARSER_VERSION };
}
