/* ===================================================================
   儲存層 —— 把「資料存哪裡」這件事包起來
   上層（學生頁 / 後台）只會用到：
     Store.list()          讀取全部紀錄
     Store.upsert(entry)   新增或覆蓋某個座號
     Store.remove(seat)    刪除某個座號
   =================================================================== */

(function () {
  'use strict';

  var C = window.CONFIG;

  /* ---------- 共用工具 ---------- */

  function nowISO() {
    return new Date().toISOString();
  }

  // 把 entries 正規化成 { "1": {...}, "2": {...} } 的形式
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
        url: e.url || '',
        vocarooId: e.vocarooId || '',
        updatedAt: e.updatedAt || '',
      };
    });
    return out;
  }

  function fail(msg) {
    var err = new Error(msg);
    err.friendly = true;
    return err;
  }

  /* =================================================================
     後端 1：Google Apps Script + Google 試算表
     ================================================================= */

  var appsScript = {
    name: 'Google 試算表（Apps Script）',

    isConfigured: function () {
      return !!(C.appsScript && C.appsScript.url);
    },

    hint: '請先依 README 部署 Apps Script，再把網址填進 assets/config.js 的 appsScript.url。',

    _call: function (payload) {
      var url = C.appsScript.url;
      var opts;

      if (payload) {
        // 刻意使用 text/plain：這是 CORS 的「安全名單」內容類型，
        // 不會觸發 preflight（Apps Script 無法回應 OPTIONS 請求）。
        opts = {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload),
          redirect: 'follow',
        };
      } else {
        url += (url.indexOf('?') >= 0 ? '&' : '?') + 'action=list';
        opts = { method: 'GET', redirect: 'follow' };
      }

      return fetch(url, opts)
        .catch(function () {
          throw fail('連不到 Google 試算表。請確認 config.js 的網址正確，而且 Apps Script 部署時「誰可以存取」選了「所有人」。');
        })
        .then(function (res) {
          if (!res.ok) throw fail('Google 試算表回應錯誤（HTTP ' + res.status + '）。');
          return res.text();
        })
        .then(function (text) {
          var data;
          try {
            data = JSON.parse(text);
          } catch (e) {
            throw fail('Google 試算表回傳的不是資料，通常表示 Apps Script 沒有部署成「網頁應用程式／所有人可存取」。');
          }
          if (data && data.ok === false) throw fail(data.error || '後端回報錯誤。');
          return data;
        });
    },

    list: function () {
      return appsScript._call(null).then(function (data) {
        return normalize(data.entries);
      });
    },

    upsert: function (entry) {
      return appsScript._call({ action: 'upsert', entry: entry }).then(function () {
        return entry;
      });
    },

    remove: function (seat) {
      return appsScript._call({ action: 'remove', seat: seat });
    },
  };

  /* =================================================================
     後端 2：jsonstorage.net（整份文件讀出 → 改 → 寫回）
     ================================================================= */

  var jsonStorage = {
    name: 'jsonstorage.net',

    isConfigured: function () {
      return !!(C.jsonStorage && C.jsonStorage.itemId && C.jsonStorage.apiKey);
    },

    hint: '請在 assets/config.js 填入 jsonStorage.itemId 與 jsonStorage.apiKey。',

    _url: function () {
      return 'https://api.jsonstorage.net/v1/json/' + C.jsonStorage.itemId +
             '?apiKey=' + encodeURIComponent(C.jsonStorage.apiKey);
    },

    _read: function () {
      return fetch(jsonStorage._url(), { method: 'GET', cache: 'no-store' })
        .catch(function () { throw fail('連不到 jsonstorage.net。'); })
        .then(function (res) {
          if (!res.ok) throw fail('jsonstorage.net 回應錯誤（HTTP ' + res.status + '）。請確認 itemId 與 apiKey。');
          return res.json();
        })
        .then(function (doc) { return doc || {}; });
    },

    _write: function (doc) {
      return fetch(jsonStorage._url(), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(doc),
      }).then(function (res) {
        if (!res.ok) throw fail('寫入 jsonstorage.net 失敗（HTTP ' + res.status + '）。');
        return true;
      });
    },

    list: function () {
      return jsonStorage._read().then(function (doc) {
        return normalize(doc.entries);
      });
    },

    // 整份覆寫會有「同時提交互相覆蓋」的風險，
    // 所以寫完再讀回來確認，沒寫進去就重試。
    upsert: function (entry) {
      var attempt = 0;

      function tryOnce() {
        attempt++;
        return jsonStorage._read().then(function (doc) {
          var entries = normalize(doc.entries);
          entries[String(entry.seat)] = entry;
          return jsonStorage._write({ entries: entries }).then(function () {
            return jsonStorage._read();
          }).then(function (after) {
            var saved = normalize(after.entries)[String(entry.seat)];
            if (saved && saved.url === entry.url) return entry;
            if (attempt >= 4) throw fail('儲存時和其他同學的提交撞在一起了，請重新送出一次。');
            return new Promise(function (r) { setTimeout(r, 300 + Math.random() * 700); }).then(tryOnce);
          });
        });
      }

      return tryOnce();
    },

    remove: function (seat) {
      return jsonStorage._read().then(function (doc) {
        var entries = normalize(doc.entries);
        delete entries[String(seat)];
        return jsonStorage._write({ entries: entries });
      });
    },
  };

  /* =================================================================
     後端 3：本機瀏覽器（只供測試，資料不會跨裝置）
     ================================================================= */

  var LOCAL_KEY = 'seat-recording:entries';

  var local = {
    name: '本機測試模式',

    isConfigured: function () { return true; },

    hint: '',

    _read: function () {
      try {
        return normalize(JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}'));
      } catch (e) {
        return {};
      }
    },

    _write: function (entries) {
      try {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(entries));
      } catch (e) {
        throw fail('這台裝置的瀏覽器不允許儲存資料（可能是無痕模式）。');
      }
    },

    list: function () {
      return Promise.resolve(local._read());
    },

    upsert: function (entry) {
      var entries = local._read();
      entries[String(entry.seat)] = entry;
      local._write(entries);
      return Promise.resolve(entry);
    },

    remove: function (seat) {
      var entries = local._read();
      delete entries[String(seat)];
      local._write(entries);
      return Promise.resolve(true);
    },
  };

  /* =================================================================
     對外介面
     ================================================================= */

  var backends = {
    appsscript: appsScript,
    jsonstorage: jsonStorage,
    local: local,
  };

  var active = backends[C.backend] || local;

  window.Store = {
    backendKey: C.backend,
    backendName: active.name,
    isDemo: active === local,

    isConfigured: function () { return active.isConfigured(); },
    configHint: function () { return active.hint; },

    list: function () {
      if (!active.isConfigured()) return Promise.reject(fail(active.hint));
      return active.list();
    },

    upsert: function (entry) {
      if (!active.isConfigured()) return Promise.reject(fail(active.hint));
      var clean = {
        seat: parseInt(entry.seat, 10),
        name: (entry.name || '').trim().slice(0, 40),
        url: entry.url || '',
        vocarooId: entry.vocarooId || '',
        updatedAt: nowISO(),
      };
      return active.upsert(clean);
    },

    remove: function (seat) {
      if (!active.isConfigured()) return Promise.reject(fail(active.hint));
      return active.remove(parseInt(seat, 10));
    },
  };
})();
