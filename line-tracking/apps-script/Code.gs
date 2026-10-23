/**
 * LINE 對話追蹤：Google Apps Script 匯入管線（容器綁定於「LINE 對話追蹤」試算表）
 *
 * 流程：01_收件匣 內的 .txt → Parser.gs 解析 → 去重 → 寫入「訊息」「聊天室」→ 檔案移到 02_已匯入 → 寫「匯入紀錄」
 * 資料夾由 setup() 自動建立在試算表所在的 Drive，連結寫在「設定」工作表。
 *
 * 安裝步驟見 line-tracking/README.md。首次使用：執行 setup()（會同時安裝每 15 分鐘的排程）。
 */

var CONFIG = {
  // 資料夾由 setup() 在試算表所在的 Drive 自動建立（ID 存在 Script Properties）。
  // 若要改用既有資料夾，填入 ID 即可覆蓋。
  INBOX_FOLDER_ID: '',
  ARCHIVE_FOLDER_ID: '',
  ROOT_FOLDER_NAME: 'LINE對話追蹤',
  INBOX_FOLDER_NAME: '01_收件匣（匯出檔放這裡）',
  ARCHIVE_FOLDER_NAME: '02_已匯入',
  TRIGGER_MINUTES: 15,
  SHEETS: {
    CHATS: '聊天室',
    MESSAGES: '訊息',
    TASKS: '追蹤事項',
    LOG: '匯入紀錄',
    SETTINGS: '設定'
  },
  CHAT_TYPES: ['未分類', '業務合作', '客戶諮詢', '內部團隊', '其他'],
  TASK_STATUS: ['待辦', '進行中', '完成', '取消']
};

var HEADERS = {
  CHATS: ['聊天室', '類型', '對口／備註', '分院', '首則訊息日期', '最後訊息日期', '訊息數', '最後匯入時間'],
  MESSAGES: ['訊息ID', '日期', '時間', '聊天室', '發話者', '類型', '內容', '來源檔案', '匯入時間'],
  TASKS: ['建立日期', '聊天室', '事項', '負責人', '期限', '狀態', '來源訊息ID', '備註'],
  LOG: ['匯入時間', '檔名', '聊天室', '解析訊息數', '新增', '重複略過', '狀態', '訊息'],
  SETTINGS: ['項目', '值']
};

// ---------------------------------------------------------------- 選單
function onOpen() {
  SpreadsheetApp.getUi().createMenu('LINE 追蹤')
    .addItem('立即匯入收件匣', 'processInbox')
    .addSeparator()
    .addItem('初始化工作表', 'setup')
    .addItem('安裝自動排程（每 ' + CONFIG.TRIGGER_MINUTES + ' 分鐘）', 'installTrigger')
    .addItem('移除自動排程', 'removeTriggers')
    .addToUi();
}

// ---------------------------------------------------------------- 初始化
/** 建立四張工作表與標題列；可重複執行，不會動到既有資料。 */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var chats = ensureSheet_(ss, CONFIG.SHEETS.CHATS, HEADERS.CHATS);
  var msgs = ensureSheet_(ss, CONFIG.SHEETS.MESSAGES, HEADERS.MESSAGES);
  var tasks = ensureSheet_(ss, CONFIG.SHEETS.TASKS, HEADERS.TASKS);
  ensureSheet_(ss, CONFIG.SHEETS.LOG, HEADERS.LOG);
  ensureSheet_(ss, CONFIG.SHEETS.SETTINGS, HEADERS.SETTINGS);

  // 下拉選單
  chats.getRange(2, 2, chats.getMaxRows() - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(CONFIG.CHAT_TYPES, true).setAllowInvalid(false).build());
  tasks.getRange(2, 6, tasks.getMaxRows() - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(CONFIG.TASK_STATUS, true).setAllowInvalid(false).build());

  // 日期/時間欄固定為純文字，避免被自動轉型
  msgs.getRange(2, 2, msgs.getMaxRows() - 1, 2).setNumberFormat('@');
  msgs.setColumnWidth(7, 420);
  msgs.getRange(2, 7, msgs.getMaxRows() - 1, 1).setWrap(true);

  // 預設工作表「工作表1」若還是空的就刪掉
  var def = ss.getSheetByName('工作表1') || ss.getSheetByName('Sheet1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 5) ss.deleteSheet(def);

  var folders = getFolders_();
  installTrigger();
  writeSettings_(ss, folders);

  ss.setActiveSheet(chats);
  Logger.log('setup 完成：工作表、資料夾與排程皆已就緒');
}

/** 取得（必要時建立）收件匣與歸檔資料夾。優先順序：CONFIG 指定 ID → Script Properties → 自動建立。 */
function getFolders_() {
  var props = PropertiesService.getScriptProperties();
  var inbox = tryFolder_(CONFIG.INBOX_FOLDER_ID || props.getProperty('INBOX_FOLDER_ID'));
  var archive = tryFolder_(CONFIG.ARCHIVE_FOLDER_ID || props.getProperty('ARCHIVE_FOLDER_ID'));
  if (inbox && archive) return { inbox: inbox, archive: archive };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ssFile = DriveApp.getFileById(ss.getId());
  var parents = ssFile.getParents();
  var parent = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  var root;
  if (parent.getName() === CONFIG.ROOT_FOLDER_NAME) {
    root = parent;
  } else {
    root = findOrCreateFolder_(parent, CONFIG.ROOT_FOLDER_NAME);
    ssFile.moveTo(root); // 把試算表一起收進專案資料夾
  }
  inbox = inbox || findOrCreateFolder_(root, CONFIG.INBOX_FOLDER_NAME);
  archive = archive || findOrCreateFolder_(root, CONFIG.ARCHIVE_FOLDER_NAME);
  props.setProperties({ INBOX_FOLDER_ID: inbox.getId(), ARCHIVE_FOLDER_ID: archive.getId() });
  return { inbox: inbox, archive: archive };
}

function tryFolder_(id) {
  if (!id) return null;
  try { return DriveApp.getFolderById(id); } catch (e) { return null; }
}

function findOrCreateFolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

/** 把實際使用的資源連結寫進「設定」工作表，方便人與 Claude 查看。 */
function writeSettings_(ss, folders) {
  var sh = ss.getSheetByName(CONFIG.SHEETS.SETTINGS);
  if (!sh) return;
  var rows = [
    ['試算表帳號', Session.getEffectiveUser().getEmail()],
    ['試算表', ss.getUrl()],
    ['收件匣（匯出檔放這裡）', folders.inbox.getUrl()],
    ['已匯入（自動歸檔）', folders.archive.getUrl()],
    ['自動排程', '每 ' + CONFIG.TRIGGER_MINUTES + ' 分鐘掃描收件匣'],
    ['解析器版本', LINE_PARSER_VERSION],
    ['最後 setup 時間', new Date()]
  ];
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 2).clearContent();
  sh.getRange(2, 1, rows.length, 2).setValues(rows);
  sh.setColumnWidth(2, 520);
}

function ensureSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#dbeafe');
    sh.setFrozenRows(1);
  }
  return sh;
}

// ---------------------------------------------------------------- 排程
function installTrigger() {
  removeTriggers();
  ScriptApp.newTrigger('processInbox').timeBased().everyMinutes(CONFIG.TRIGGER_MINUTES).create();
  Logger.log('已安裝每 ' + CONFIG.TRIGGER_MINUTES + ' 分鐘觸發的 processInbox');
}

function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'processInbox') ScriptApp.deleteTrigger(t);
  });
}

// ---------------------------------------------------------------- 主流程
/** 掃描收件匣，逐檔匯入。由排程或選單呼叫。 */
function processInbox() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) { Logger.log('另一個匯入正在執行，略過'); return; }
  try {
    var folders = getFolders_();
    var inbox = folders.inbox;
    var archive = folders.archive;
    var files = inbox.getFiles();
    var count = 0;
    while (files.hasNext()) {
      var file = files.next();
      var name = file.getName();
      if (!/\.txt$/i.test(name) && file.getMimeType() !== MimeType.PLAIN_TEXT) continue;
      count++;
      try {
        var text = file.getBlob().getDataAsString('UTF-8');
        var result = importText(text, name);
        logImport_(name, result.chatName, result.parsed, result.added, result.skipped, '成功', result.warnings.join('；'));
      } catch (e) {
        logImport_(name, '', 0, 0, 0, '失敗', String(e && e.message || e));
      }
      file.moveTo(archive);
    }
    Logger.log('processInbox 處理 ' + count + ' 個檔案');
  } finally {
    lock.releaseLock();
  }
}

/**
 * 匯入一份匯出檔文字。可獨立測試：importText(文字, '檔名.txt')
 * @returns {{chatName:string, parsed:number, added:number, skipped:number, warnings:string[]}}
 */
function importText(text, fileName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var msgSheet = ss.getSheetByName(CONFIG.SHEETS.MESSAGES);
  if (!msgSheet) throw new Error('找不到「' + CONFIG.SHEETS.MESSAGES + '」工作表，請先執行 setup()');

  var r = parseLineExport(text, { fileName: fileName });
  assignKeys(r.chatName, r.messages);
  if (!r.messages.length) throw new Error('解析不到任何訊息，請確認檔案格式（' + r.warnings.join('；') + '）');

  var existing = loadExistingKeys_(msgSheet);
  var now = new Date();
  var rows = [];
  var skipped = 0;
  for (var i = 0; i < r.messages.length; i++) {
    var m = r.messages[i];
    if (existing[m.key]) { skipped++; continue; }
    existing[m.key] = true;
    rows.push([m.key, m.date, m.time, r.chatName, m.sender, m.type, safeCell_(m.content), fileName, now]);
  }
  if (rows.length) {
    msgSheet.getRange(msgSheet.getLastRow() + 1, 1, rows.length, HEADERS.MESSAGES.length).setValues(rows);
  }
  upsertChat_(ss, r.chatName, r.messages, rows.length, now);
  return { chatName: r.chatName, parsed: r.messages.length, added: rows.length, skipped: skipped, warnings: r.warnings };
}

function loadExistingKeys_(sheet) {
  var map = {};
  var last = sheet.getLastRow();
  if (last < 2) return map;
  var keys = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < keys.length; i++) if (keys[i][0]) map[keys[i][0]] = true;
  return map;
}

/** 以聊天室名稱更新或新增「聊天室」列；使用者手填的類型/對口/分院不會被覆蓋。 */
function upsertChat_(ss, chatName, messages, added, now) {
  var sh = ss.getSheetByName(CONFIG.SHEETS.CHATS);
  var first = messages[0].date, lastDate = messages[0].date;
  for (var i = 1; i < messages.length; i++) {
    if (messages[i].date < first) first = messages[i].date;
    if (messages[i].date > lastDate) lastDate = messages[i].date;
  }
  var last = sh.getLastRow();
  var names = last >= 2 ? sh.getRange(2, 1, last - 1, 1).getValues() : [];
  for (var r = 0; r < names.length; r++) {
    if (names[r][0] === chatName) {
      var row = r + 2;
      var cur = sh.getRange(row, 5, 1, 3).getValues()[0];
      var newFirst = cur[0] && cur[0] < first ? cur[0] : first;
      var newLast = cur[1] && cur[1] > lastDate ? cur[1] : lastDate;
      sh.getRange(row, 5, 1, 4).setValues([[newFirst, newLast, (Number(cur[2]) || 0) + added, now]]);
      return;
    }
  }
  sh.appendRow([chatName, CONFIG.CHAT_TYPES[0], '', '', first, lastDate, added, now]);
}

function logImport_(fileName, chatName, parsed, added, skipped, status, note) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEETS.LOG);
  if (sh) sh.appendRow([new Date(), fileName, chatName, parsed, added, skipped, status, note || '']);
}

/** 以 = + - @ 開頭的字串在試算表會被當成公式或數字，前綴單引號強制為文字。 */
function safeCell_(s) {
  s = String(s == null ? '' : s);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

// ---------------------------------------------------------------- 手動測試
/** 在 Apps Script 編輯器直接執行，驗證整條管線（不需要真的放檔案）。 */
function testImportSample() {
  var sample = '[LINE] 與測試對象的聊天記錄\n儲存日期：2024/05/01 10:23\n\n2024/04/28（日）\n10:15\t測試對象\t你好\n10:16\t我\t哈囉\n';
  var r = importText(sample, 'sample.txt');
  Logger.log(JSON.stringify(r));
}
