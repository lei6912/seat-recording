/* ===================================================================
   儲存層 —— 把「錄音檔和繳交紀錄存哪裡」包起來

   上層（學生頁 / 後台）只會用到：
     Store.list()                     讀取全部繳交紀錄
     Store.submitRecording({...})     上傳一段錄音
     Store.submitLink({...})          登錄一個外部連結（老師手動補登用）
     Store.loadAudio(seat)            取回某座號的錄音（回傳 Blob）
     Store.remove(seat)               刪除某座號
   =================================================================== */

(function () {
  'use strict';

  var C = window.CONFIG;

  /* ---------- 共用工具 ---------- */

  function nowISO() { return new Date().toISOString(); }

  function fail(msg) {
    var err = new Error(msg);
    err.friendly = true;
    return err;
  }

  function normalize(raw) {
    var out = {};
    if (!raw) return out;

    var list = Array.isArray(raw) ? raw : Object.keys(raw).map(function (k) { return raw[k]; });

    list.forEach(function (e) {
      if (!e) return;
      var seat = parseInt(e.seat, 10);
      if (!seat || seat < 1) return;

      out[String(seat)] = {
        seat: seat,
        name: e.name || '',
        kind: e.kind === 'link' ? 'link' : 'recording',
        fileId: e.fileId || '',
        url: e.url || '',
        mime: e.mime || '',
        durationMs: parseInt(e.durationMs, 10) || 0,
        updatedAt: e.updatedAt || '',
      };
    });

    return out;
  }

  // Blob → base64（分段處理，檔案大也不會爆堆疊）
  function blobToBase64(blob) {
    return blob.arrayBuffer().then(function (buf) {
      var bytes = new Uint8Array(buf);
      var CHUNK = 0x8000;
      var parts = [];
      for (var i = 0; i < bytes.length; i += CHUNK) {
        parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK)));
      }
      return btoa(parts.join(''));
    });
  }

  // base64 → Blob
  function base64ToBlob(b64, mime) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime || 'application/octet-stream' });
  }

  /* =================================================================
     後端 1：Google Apps Script
       - 錄音檔存到老師自己的 Google 雲端硬碟
       - 繳交紀錄寫在 Google 試算表
     ================================================================= */

  var appsScript = {
    name: 'Google 雲端硬碟 + 試算表',

    isConfigured: function () { return !!(C.appsScript && C.appsScript.url); },

    hint: '請先依 README 部署 Apps Script，再把網址填進 assets/config.js 的 appsScript.url。',

    _get: function (params) {
      var url = C.appsScript.url;
      url += (url.indexOf('?') >= 0 ? '&' : '?') + params;

      return fetch(url, { method: 'GET', redirect: 'follow' })
        .catch(function () {
          throw fail('連不到伺服器。請確認 config.js 的網址正確，而且 Apps Script 部署時「誰可以存取」選了「所有人」。');
        })
        .then(appsScript._parse);
    },

    _post: function (payload) {
      // 刻意使用 text/plain：這是 CORS 的「安全名單」內容類型，
      // 不會觸發 preflight（Apps Script 無法回應 OPTIONS 請求）。
      return fetch(C.appsScript.url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        redirect: 'follow',
      })
        .catch(function () {
          throw fail('連不到伺服器。請確認網路連線，以及 Apps Script 的部署設定。');
        })
        .then(appsScript._parse);
    },

    _parse: function (res) {
      if (!res.ok) throw fail('伺服器回應錯誤（HTTP ' + res.status + '）。');

      return res.text().then(function (text) {
        var data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          throw fail('伺服器回傳的不是資料，通常表示 Apps Script 沒有部署成「網頁應用程式／所有人可存取」。');
        }
        if (data && data.ok === false) throw fail(data.error || '伺服器回報錯誤。');
        return data;
      });
    },

    list: function () {
      return appsScript._get('action=list').then(function (d) { return normalize(d.entries); });
    },

    submitRecording: function (sub) {
      return blobToBase64(sub.blob).then(function (b64) {
        return appsScript._post({
          action: 'upload',
          seat: sub.seat,
          name: sub.name,
          mime: sub.mime,
          ext: sub.ext,
          durationMs: sub.durationMs,
          b64: b64,
        });
      }).then(function (d) { return normalize(d.entries)[String(sub.seat)]; });
    },

    submitLink: function (sub) {
      return appsScript._post({
        action: 'link',
        seat: sub.seat,
        name: sub.name,
        url: sub.url,
      }).then(function (d) { return normalize(d.entries)[String(sub.seat)]; });
    },

    loadAudio: function (seat) {
      return appsScript._get('action=audio&seat=' + encodeURIComponent(seat)).then(function (d) {
        if (!d.b64) throw fail('找不到這個座號的錄音檔。');
        return base64ToBlob(d.b64, d.mime);
      });
    },

    remove: function (seat) {
      return appsScript._post({ action: 'remove', seat: seat });
    },
  };

  /* =================================================================
     後端 2：本機測試模式
       錄音檔放 IndexedDB、紀錄放 localStorage，只存在這台裝置。
     ================================================================= */

  var META_KEY = 'seat-recording:entries';
  var DB_NAME = 'seat-recording';
  var DB_STORE = 'audio';

  var local = {
    name: '本機測試模式',

    isConfigured: function () { return true; },

    hint: '',

    _db: function () {
      return new Promise(function (resolve, reject) {
        if (!window.indexedDB) { reject(fail('這個瀏覽器不支援 IndexedDB，無法在測試模式下存錄音。')); return; }

        var req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = function () {
          var db = req.result;
          if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(fail('無法開啟本機資料庫（可能是無痕模式）。')); };
      });
    },

    _tx: function (mode, fn) {
      return local._db().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(DB_STORE, mode);
          var store = tx.objectStore(DB_STORE);
          var req = fn(store);
          tx.oncomplete = function () { resolve(req ? req.result : undefined); };
          tx.onerror = function () { reject(fail('本機資料庫寫入失敗。')); };
        });
      });
    },

    _readMeta: function () {
      try {
        return normalize(JSON.parse(localStorage.getItem(META_KEY) || '{}'));
      } catch (e) {
        return {};
      }
    },

    _writeMeta: function (entries) {
      try {
        localStorage.setItem(META_KEY, JSON.stringify(entries));
      } catch (e) {
        throw fail('這台裝置的瀏覽器不允許儲存資料（可能是無痕模式）。');
      }
    },

    list: function () { return Promise.resolve(local._readMeta()); },

    submitRecording: function (sub) {
      var entry = {
        seat: sub.seat,
        name: sub.name,
        kind: 'recording',
        fileId: 'local-' + sub.seat,
        url: '',
        mime: sub.mime,
        durationMs: sub.durationMs,
        updatedAt: nowISO(),
      };

      return local._tx('readwrite', function (store) {
        return store.put({ blob: sub.blob, mime: sub.mime }, String(sub.seat));
      }).then(function () {
        var entries = local._readMeta();
        entries[String(sub.seat)] = entry;
        local._writeMeta(entries);
        return entry;
      });
    },

    submitLink: function (sub) {
      var entry = {
        seat: sub.seat,
        name: sub.name,
        kind: 'link',
        fileId: '',
        url: sub.url,
        mime: '',
        durationMs: 0,
        updatedAt: nowISO(),
      };

      var entries = local._readMeta();
      entries[String(sub.seat)] = entry;
      local._writeMeta(entries);
      return Promise.resolve(entry);
    },

    loadAudio: function (seat) {
      return local._tx('readonly', function (store) {
        return store.get(String(seat));
      }).then(function (rec) {
        if (!rec || !rec.blob) throw fail('找不到這個座號的錄音檔。');
        return rec.blob;
      });
    },

    remove: function (seat) {
      return local._tx('readwrite', function (store) {
        return store.delete(String(seat));
      }).then(function () {
        var entries = local._readMeta();
        delete entries[String(seat)];
        local._writeMeta(entries);
        return true;
      });
    },
  };

  /* =================================================================
     對外介面
     ================================================================= */

  var backends = { appsscript: appsScript, local: local };
  var active = backends[C.backend] || local;

  function cleanSeat(seat) {
    var n = parseInt(seat, 10);
    if (!n || n < 1) throw fail('座號不正確。');
    return n;
  }

  function guard() {
    if (!active.isConfigured()) return Promise.reject(fail(active.hint));
    return null;
  }

  window.Store = {
    backendKey: C.backend,
    backendName: active.name,
    isDemo: active === local,

    isConfigured: function () { return active.isConfigured(); },
    configHint: function () { return active.hint; },

    list: function () {
      return guard() || active.list();
    },

    submitRecording: function (sub) {
      var blocked = guard();
      if (blocked) return blocked;

      if (!sub || !sub.blob || !sub.blob.size) {
        return Promise.reject(fail('沒有錄音內容可以送出。'));
      }

      return active.submitRecording({
        seat: cleanSeat(sub.seat),
        name: (sub.name || '').trim().slice(0, 40),
        blob: sub.blob,
        mime: sub.mime || sub.blob.type || 'audio/webm',
        ext: sub.ext || 'webm',
        durationMs: parseInt(sub.durationMs, 10) || 0,
      });
    },

    submitLink: function (sub) {
      var blocked = guard();
      if (blocked) return blocked;

      return active.submitLink({
        seat: cleanSeat(sub.seat),
        name: (sub.name || '').trim().slice(0, 40),
        url: sub.url || '',
      });
    },

    loadAudio: function (seat) {
      return guard() || active.loadAudio(cleanSeat(seat));
    },

    remove: function (seat) {
      return guard() || active.remove(cleanSeat(seat));
    },
  };
})();
