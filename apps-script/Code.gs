/* ===================================================================
   錄音繳交系統 —— Google Apps Script 後端

   安裝方式（完整步驟請看專案的 README.md）：
     1. 建一個新的 Google 試算表
     2. 擴充功能 → Apps Script
     3. 把這整個檔案的內容貼進去，覆蓋原本的 myFunction
     4. 部署 → 新增部署作業 → 類型選「網頁應用程式」
        - 執行身分：我
        - 誰可以存取：所有人
     5. 複製產生的網址，填進 assets/config.js 的 appsScript.url

   資料會寫在同一個試算表的「submissions」工作表裡，
   老師也可以直接打開試算表看。
   =================================================================== */

var SHEET_NAME = 'submissions';
var HEADER = ['seat', 'name', 'vocarooId', 'url', 'updatedAt'];


/* ---------- 工具 ---------- */

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);

  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.getRange(1, 1, 1, HEADER.length).setValues([HEADER]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }

  // 空白的工作表補上標題列
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, HEADER.length).setValues([HEADER]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }

  return sh;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
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
      vocarooId: String(row[2] || ''),
      url: String(row[3] || ''),
      updatedAt: row[4] instanceof Date ? row[4].toISOString() : String(row[4] || ''),
    };
  });

  return entries;
}

// 回傳某個座號所在的列號，找不到回 -1
function findRow_(sh, seat) {
  var last = sh.getLastRow();
  if (last < 2) return -1;

  var seats = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < seats.length; i++) {
    if (parseInt(seats[i][0], 10) === seat) return i + 2;
  }
  return -1;
}

// 只接受 Vocaroo 的錄音 ID，避免有人塞奇怪的東西進試算表
function cleanId_(id) {
  var s = String(id || '').trim();
  return /^[A-Za-z0-9_-]{4,40}$/.test(s) ? s : '';
}


/* ---------- 讀取 ---------- */

function doGet(e) {
  try {
    return json_({ ok: true, entries: readAll_() });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}


/* ---------- 寫入 ----------
   前端刻意用 text/plain 送出 JSON，
   這樣瀏覽器就不會發 preflight（Apps Script 無法回應 OPTIONS）。 */

function doPost(e) {
  var lock = LockService.getScriptLock();

  try {
    // 同時有多位學生送出時排隊處理，避免互相覆蓋
    lock.waitLock(25000);

    var body = {};
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }

    if (body.action === 'upsert') return upsert_(body.entry);
    if (body.action === 'remove') return remove_(body.seat);

    return json_({ ok: false, error: '未知的 action：' + body.action });

  } catch (err) {
    return json_({ ok: false, error: String(err) });

  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

function upsert_(entry) {
  entry = entry || {};

  var seat = parseInt(entry.seat, 10);
  if (!seat || seat < 1 || seat > 500) {
    return json_({ ok: false, error: '座號不正確。' });
  }

  var id = cleanId_(entry.vocarooId);
  if (!id) {
    return json_({ ok: false, error: '錄音連結不正確。' });
  }

  var row = [
    seat,
    String(entry.name || '').slice(0, 40),
    id,
    'https://vocaroo.com/' + id,
    new Date(),
  ];

  var sh = getSheet_();
  var at = findRow_(sh, seat);

  if (at > 0) {
    sh.getRange(at, 1, 1, HEADER.length).setValues([row]);
  } else {
    sh.appendRow(row);
  }

  return json_({ ok: true, entries: readAll_() });
}

function remove_(seat) {
  seat = parseInt(seat, 10);
  if (!seat) return json_({ ok: false, error: '座號不正確。' });

  var sh = getSheet_();
  var at = findRow_(sh, seat);
  if (at > 0) sh.deleteRow(at);

  return json_({ ok: true, entries: readAll_() });
}
