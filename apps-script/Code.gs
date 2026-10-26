/* ===================================================================
   錄音繳交系統 —— Google Apps Script 後端

   錄音檔存到你的 Google 雲端硬碟，繳交紀錄寫在這份試算表。

   安裝方式（完整步驟請看專案的 README.md）：
     1. 建一個新的 Google 試算表
     2. 擴充功能 → Apps Script
     3. 把這整個檔案的內容貼進去，覆蓋原本的 myFunction
     4. 部署 → 新增部署作業 → 類型選「網頁應用程式」
        - 執行身分：我
        - 誰可以存取：所有人
     5. 複製產生的網址，填進 assets/config.js 的 appsScript.url
   =================================================================== */

var SHEET_NAME = 'submissions';
var HEADER = ['seat', 'name', 'kind', 'fileId', 'url', 'mime', 'durationMs', 'updatedAt'];

// 錄音檔上限（位元組）。學生端已限制錄音長度，這裡只是最後一道防線。
var MAX_BYTES = 25 * 1024 * 1024;


/* =================================================================
   試算表
   ================================================================= */

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);

  if (!sh) sh = ss.insertSheet(SHEET_NAME);

  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, HEADER.length).setValues([HEADER]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }

  return sh;
}

function readAll_() {
  var sh = getSheet_();
  var last = sh.getLastRow();
  if (last < 2) return {};

  var values = sh.getRange(2, 1, last - 1, HEADER.length).getValues();
  var entries = {};

  values.forEach(function (row) {
    var seat = parseInt(row[0], 10);
    if (!seat) return;

    entries[String(seat)] = {
      seat: seat,
      name: String(row[1] || ''),
      kind: String(row[2] || 'recording'),
      fileId: String(row[3] || ''),
      url: String(row[4] || ''),
      mime: String(row[5] || ''),
      durationMs: parseInt(row[6], 10) || 0,
      updatedAt: row[7] instanceof Date ? row[7].toISOString() : String(row[7] || ''),
    };
  });

  return entries;
}

// 回傳某座號所在的列號，找不到回 -1
function findRow_(sh, seat) {
  var last = sh.getLastRow();
  if (last < 2) return -1;

  var seats = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < seats.length; i++) {
    if (parseInt(seats[i][0], 10) === seat) return i + 2;
  }
  return -1;
}

function writeRow_(seat, row) {
  var sh = getSheet_();
  var at = findRow_(sh, seat);

  if (at > 0) sh.getRange(at, 1, 1, HEADER.length).setValues([row]);
  else sh.appendRow(row);
}


/* =================================================================
   雲端硬碟資料夾
   ================================================================= */

function getFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('FOLDER_ID');

  if (id) {
    try {
      var existing = DriveApp.getFolderById(id);
      if (!existing.isTrashed()) return existing;
    } catch (e) {
      // 資料夾被刪掉了，下面重新建一個
    }
  }

  var name = '錄音繳交－' + SpreadsheetApp.getActiveSpreadsheet().getName();
  var folder = DriveApp.createFolder(name);
  props.setProperty('FOLDER_ID', folder.getId());
  return folder;
}

function pad2_(n) {
  return (n < 10 ? '0' : '') + n;
}

function buildFileName_(seat, name, ext) {
  var now = new Date();
  var stamp = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyyMMdd-HHmm');
  var who = name ? '-' + name : '';
  return '座號' + pad2_(seat) + who + '_' + stamp + '.' + ext;
}

function trashFile_(fileId) {
  if (!fileId) return;
  try {
    DriveApp.getFileById(fileId).setTrashed(true);
  } catch (e) {
    // 檔案已經不在了，忽略
  }
}


/* =================================================================
   共用
   ================================================================= */

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function cleanSeat_(seat) {
  var n = parseInt(seat, 10);
  return (n >= 1 && n <= 500) ? n : 0;
}

function cleanExt_(ext) {
  var s = String(ext || '').toLowerCase();
  return /^(webm|m4a|mp4|ogg|wav|mp3)$/.test(s) ? s : 'webm';
}


/* =================================================================
   讀取（GET）
   ================================================================= */

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || 'list';

    if (action === 'list') {
      return json_({ ok: true, entries: readAll_() });
    }

    if (action === 'audio') {
      var seat = cleanSeat_(e.parameter.seat);
      if (!seat) return json_({ ok: false, error: '座號不正確。' });

      var entry = readAll_()[String(seat)];
      if (!entry || !entry.fileId) return json_({ ok: false, error: '找不到這個座號的錄音檔。' });

      var blob = DriveApp.getFileById(entry.fileId).getBlob();
      return json_({
        ok: true,
        seat: seat,
        mime: entry.mime || blob.getContentType(),
        b64: Utilities.base64Encode(blob.getBytes()),
      });
    }

    return json_({ ok: false, error: '未知的 action：' + action });

  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}


/* =================================================================
   寫入（POST）
   前端刻意用 text/plain 送出 JSON，
   這樣瀏覽器就不會發 preflight（Apps Script 無法回應 OPTIONS）。
   ================================================================= */

function doPost(e) {
  var lock = LockService.getScriptLock();

  try {
    // 多位學生同時送出時排隊處理，避免互相覆蓋
    lock.waitLock(45000);

    var body = {};
    if (e && e.postData && e.postData.contents) body = JSON.parse(e.postData.contents);

    if (body.action === 'upload') return upload_(body);
    if (body.action === 'link')   return link_(body);
    if (body.action === 'remove') return remove_(body.seat);

    return json_({ ok: false, error: '未知的 action：' + body.action });

  } catch (err) {
    return json_({ ok: false, error: String(err) });

  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

function upload_(body) {
  var seat = cleanSeat_(body.seat);
  if (!seat) return json_({ ok: false, error: '座號不正確。' });

  if (!body.b64) return json_({ ok: false, error: '沒有收到錄音內容。' });

  var bytes;
  try {
    bytes = Utilities.base64Decode(body.b64);
  } catch (err) {
    return json_({ ok: false, error: '錄音內容無法解讀，請重新錄一次。' });
  }

  if (!bytes.length) return json_({ ok: false, error: '錄音內容是空的，請重新錄一次。' });
  if (bytes.length > MAX_BYTES) return json_({ ok: false, error: '錄音檔太大了，請錄短一點。' });

  var name = String(body.name || '').slice(0, 40);
  var mime = String(body.mime || 'audio/webm').slice(0, 60);
  var ext  = cleanExt_(body.ext);

  // 先把舊的錄音丟到垃圾桶，避免硬碟越積越多
  var prev = readAll_()[String(seat)];
  if (prev && prev.fileId) trashFile_(prev.fileId);

  var blob = Utilities.newBlob(bytes, mime, buildFileName_(seat, name, ext));
  var file = getFolder_().createFile(blob);

  writeRow_(seat, [
    seat,
    name,
    'recording',
    file.getId(),
    file.getUrl(),
    mime,
    parseInt(body.durationMs, 10) || 0,
    new Date(),
  ]);

  return json_({ ok: true, entries: readAll_() });
}

// 老師手動補登一個外部連結（例如學生的裝置無法錄音）
function link_(body) {
  var seat = cleanSeat_(body.seat);
  if (!seat) return json_({ ok: false, error: '座號不正確。' });

  var url = String(body.url || '').trim();
  if (!/^https?:\/\//i.test(url)) return json_({ ok: false, error: '連結必須是 http(s) 開頭。' });

  var prev = readAll_()[String(seat)];
  if (prev && prev.fileId) trashFile_(prev.fileId);

  writeRow_(seat, [
    seat,
    String(body.name || '').slice(0, 40),
    'link',
    '',
    url.slice(0, 500),
    '',
    0,
    new Date(),
  ]);

  return json_({ ok: true, entries: readAll_() });
}

function remove_(seat) {
  seat = cleanSeat_(seat);
  if (!seat) return json_({ ok: false, error: '座號不正確。' });

  var prev = readAll_()[String(seat)];
  if (prev && prev.fileId) trashFile_(prev.fileId);

  var sh = getSheet_();
  var at = findRow_(sh, seat);
  if (at > 0) sh.deleteRow(at);

  return json_({ ok: true, entries: readAll_() });
}
