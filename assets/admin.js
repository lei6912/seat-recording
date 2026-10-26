/* ===================================================================
   教師後台邏輯
   =================================================================== */

(function () {
  'use strict';

  var C = window.CONFIG;
  var SESSION_KEY = 'seat-recording:admin';

  var el = {
    subLine:     document.getElementById('subLine'),
    headerActs:  document.getElementById('headerActions'),
    refreshBtn:  document.getElementById('refreshBtn'),
    logoutBtn:   document.getElementById('logoutBtn'),

    loginCard:   document.getElementById('loginCard'),
    loginForm:   document.getElementById('loginForm'),
    userInput:   document.getElementById('userInput'),
    passInput:   document.getElementById('passInput'),
    loginMsg:    document.getElementById('loginMsg'),

    dashboard:   document.getElementById('dashboard'),
    backendWarn: document.getElementById('backendWarn'),
    loadMsg:     document.getElementById('loadMsg'),

    statDone:    document.getElementById('statDone'),
    statTodo:    document.getElementById('statTodo'),
    statTotal:   document.getElementById('statTotal'),

    todoList:    document.getElementById('todoList'),
    copyTodoBtn: document.getElementById('copyTodoBtn'),
    statusGrid:  document.getElementById('statusGrid'),

    subList:     document.getElementById('subList'),
    emptyHint:   document.getElementById('emptyHint'),
    exportBtn:   document.getElementById('exportBtn'),

    manualForm:  document.getElementById('manualForm'),
    manualSeat:  document.getElementById('manualSeat'),
    manualName:  document.getElementById('manualName'),
    manualLink:  document.getElementById('manualLink'),
    manualMsg:   document.getElementById('manualMsg'),

    backendName: document.getElementById('backendName'),
  };

  var state = {
    entries: {},
    todo: [],
    objectUrls: [],   // 已經載入的錄音，重新整理清單時要釋放
  };

  /* ---------- 小工具 ---------- */

  function show(node, cls, text) {
    node.className = 'msg msg--' + cls;
    node.textContent = text;
    node.hidden = false;
  }
  function hide(node) { node.hidden = true; }

  function formatTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d)) return iso;
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function formatDuration(ms) {
    if (!ms) return '';
    var total = Math.round(ms / 1000);
    var m = Math.floor(total / 60);
    var s = total % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function flash(node, cls, text) {
    show(node, cls, text);
    setTimeout(function () { hide(node); }, 4000);
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function extFromMime(mime) {
    var m = String(mime || '');
    if (m.indexOf('webm') >= 0) return 'webm';
    if (m.indexOf('mp4') >= 0 || m.indexOf('m4a') >= 0) return 'm4a';
    if (m.indexOf('ogg') >= 0) return 'ogg';
    if (m.indexOf('wav') >= 0) return 'wav';
    if (m.indexOf('mpeg') >= 0) return 'mp3';
    return 'webm';
  }

  function releaseObjectUrls() {
    state.objectUrls.forEach(function (u) { URL.revokeObjectURL(u); });
    state.objectUrls = [];
  }

  /* ---------- 登入 ----------
     純前端比對，只是個門簾，不是真正的驗證。 */

  function isLoggedIn() {
    try { return sessionStorage.getItem(SESSION_KEY) === 'ok'; } catch (e) { return false; }
  }

  function handleLogin(ev) {
    ev.preventDefault();

    var u = el.userInput.value.trim();
    var p = el.passInput.value;

    if (u === C.admin.username && p === C.admin.password) {
      try { sessionStorage.setItem(SESSION_KEY, 'ok'); } catch (e) { /* 無痕模式 */ }
      enterDashboard();
    } else {
      show(el.loginMsg, 'err', '帳號或密碼不正確。');
      el.passInput.value = '';
      el.passInput.focus();
    }
  }

  function handleLogout() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* 忽略 */ }
    location.reload();
  }

  /* ---------- 進入後台 ---------- */

  function enterDashboard() {
    el.loginCard.hidden = true;
    el.dashboard.hidden = false;
    el.headerActs.hidden = false;
    el.backendName.textContent = window.Store.backendName;
    if (C.title) el.subLine.textContent = C.title;

    if (window.Store.isDemo) {
      show(el.backendWarn, 'warn',
        '目前是「本機測試模式」：只會看到你自己在這台裝置上錄的東西，' +
        '看不到學生從自己手機交的錄音。請依 README 設定 assets/config.js。');
    } else if (!window.Store.isConfigured()) {
      show(el.backendWarn, 'err', '系統還沒設定完成：' + window.Store.configHint());
    }

    buildManualSeatOptions();
    refresh();
  }

  /* ---------- 讀取與繪製 ---------- */

  function refresh() {
    show(el.loadMsg, 'info', '讀取中…');
    el.refreshBtn.disabled = true;

    return window.Store.list().then(function (entries) {
      state.entries = entries;
      hide(el.loadMsg);
      render();
    }).catch(function (err) {
      show(el.loadMsg, 'err', '讀取失敗：' + (err && err.message ? err.message : '不知名的錯誤'));
    }).then(function () {
      el.refreshBtn.disabled = false;
    });
  }

  function hasSubmission(e) {
    return !!(e && (e.fileId || e.url));
  }

  function render() {
    var done = [];
    var todo = [];

    for (var i = 1; i <= C.seatCount; i++) {
      var e = state.entries[String(i)];
      if (hasSubmission(e)) done.push(e); else todo.push(i);
    }
    state.todo = todo;

    el.statDone.textContent = done.length;
    el.statTodo.textContent = todo.length;
    el.statTotal.textContent = C.seatCount;

    el.todoList.textContent = todo.length
      ? todo.map(function (n) { return n + ' 號'; }).join('、')
      : '全班都交齊了 🎉';
    el.copyTodoBtn.disabled = todo.length === 0;

    renderStatusGrid();
    renderSubList(done);
  }

  function renderStatusGrid() {
    el.statusGrid.innerHTML = '';
    var frag = document.createDocumentFragment();

    for (var i = 1; i <= C.seatCount; i++) {
      var e = state.entries[String(i)];
      var ok = hasSubmission(e);

      var cell = document.createElement('div');
      cell.className = 'status-cell ' + (ok ? 'is-done' : 'is-todo');
      cell.title = i + ' 號' + (ok ? '：已於 ' + formatTime(e.updatedAt) + ' 繳交' : '：尚未繳交');

      var num = document.createElement('span');
      num.textContent = i;
      cell.appendChild(num);

      var mark = document.createElement('span');
      mark.className = 'mark';
      mark.textContent = ok ? '已交' : '未交';
      cell.appendChild(mark);

      frag.appendChild(cell);
    }

    el.statusGrid.appendChild(frag);
  }

  /* 錄音播放器：點了才去抓檔案，不會一進後台就下載 21 個錄音 */
  function buildRecordingPlayer(entry) {
    var box = document.createElement('div');
    box.className = 'player';

    var audio = document.createElement('audio');
    audio.controls = true;
    audio.className = 'player-audio';
    audio.hidden = true;

    var loadBtn = document.createElement('button');
    loadBtn.type = 'button';
    loadBtn.className = 'btn btn--small';
    loadBtn.textContent = '載入並播放';

    var err = document.createElement('div');
    err.className = 'small';
    err.style.color = 'var(--todo)';
    err.hidden = true;

    loadBtn.addEventListener('click', function () {
      loadBtn.disabled = true;
      loadBtn.textContent = '載入中…';
      err.hidden = true;

      window.Store.loadAudio(entry.seat).then(function (blob) {
        var url = URL.createObjectURL(blob);
        state.objectUrls.push(url);

        audio.src = url;
        audio.hidden = false;
        loadBtn.hidden = true;

        var dl = document.createElement('a');
        dl.className = 'btn btn--ghost btn--small';
        dl.href = url;
        dl.download = '座號' + pad2(entry.seat) +
                      (entry.name ? '-' + entry.name : '') + '.' + extFromMime(entry.mime);
        dl.textContent = '下載';
        dl.style.marginTop = '6px';
        dl.style.display = 'inline-flex';
        box.appendChild(dl);

        var p = audio.play();
        if (p && p.catch) p.catch(function () { /* 瀏覽器阻擋自動播放，使用者再按一下就好 */ });

      }).catch(function (e) {
        loadBtn.disabled = false;
        loadBtn.textContent = '重試載入';
        err.textContent = '載入失敗：' + (e && e.message ? e.message : '不知名的錯誤');
        err.hidden = false;
      });
    });

    box.appendChild(loadBtn);
    box.appendChild(audio);
    box.appendChild(err);
    return box;
  }

  /* 手動補登的外部連結：Vocaroo 用內嵌播放器，其他的就給連結 */
  function buildLinkPlayer(entry) {
    var id = window.Vocaroo ? window.Vocaroo.parseId(entry.url) : null;
    if (id) return window.Vocaroo.createPlayer(id);

    var box = document.createElement('div');
    box.className = 'player';

    var a = document.createElement('a');
    a.className = 'btn btn--ghost btn--small';
    a.href = entry.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = '開啟連結 ↗';
    box.appendChild(a);

    return box;
  }

  function renderSubList(done) {
    releaseObjectUrls();
    el.subList.innerHTML = '';
    el.emptyHint.hidden = done.length > 0;

    done.sort(function (a, b) { return a.seat - b.seat; });

    done.forEach(function (e) {
      var li = document.createElement('li');
      li.className = 'sub-item';

      var seat = document.createElement('div');
      seat.className = 'sub-seat';
      seat.textContent = e.seat;
      li.appendChild(seat);

      var meta = document.createElement('div');
      meta.className = 'sub-meta';

      var nm = document.createElement('div');
      nm.className = 'nm';
      nm.textContent = e.name || (e.seat + ' 號');
      meta.appendChild(nm);

      var tm = document.createElement('div');
      tm.className = 'tm';
      var bits = ['繳交於 ' + formatTime(e.updatedAt)];
      if (e.durationMs) bits.push('長度 ' + formatDuration(e.durationMs));
      if (e.kind === 'link') bits.push('手動補登');
      tm.textContent = bits.join('・');
      meta.appendChild(tm);

      li.appendChild(meta);

      li.appendChild(e.kind === 'link' ? buildLinkPlayer(e) : buildRecordingPlayer(e));

      var actions = document.createElement('div');
      actions.className = 'sub-actions';

      // 錄音檔在雲端硬碟上的頁面（手動補登的連結已經在播放器那邊了）
      if (e.kind !== 'link' && e.url) {
        var open = document.createElement('a');
        open.className = 'btn btn--ghost btn--small';
        open.href = e.url;
        open.target = '_blank';
        open.rel = 'noopener noreferrer';
        open.textContent = 'Drive ↗';
        open.title = '在 Google 雲端硬碟開啟這個錄音檔';
        actions.appendChild(open);
      }

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn btn--ghost btn--small';
      del.textContent = '刪除';
      del.addEventListener('click', function () { removeEntry(e.seat); });
      actions.appendChild(del);

      li.appendChild(actions);
      el.subList.appendChild(li);
    });
  }

  function removeEntry(seat) {
    if (!window.confirm('要刪除 ' + seat + ' 號的繳交紀錄嗎？\n錄音檔會移到雲端硬碟的垃圾桶，該座號會變回「未交」。')) return;

    window.Store.remove(seat).then(function () {
      delete state.entries[String(seat)];
      render();
      flash(el.loadMsg, 'ok', seat + ' 號的紀錄已刪除。');
    }).catch(function (err) {
      show(el.loadMsg, 'err', '刪除失敗：' + (err && err.message ? err.message : '不知名的錯誤'));
    });
  }

  /* ---------- 未完成名單：複製 ---------- */

  function copyTodo() {
    if (!state.todo.length) return;
    var text = state.todo.map(function (n) { return n + ' 號'; }).join('、');

    var fallback = function () {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) { /* 忽略 */ }
      document.body.removeChild(ta);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(fallback);
    } else {
      fallback();
    }

    flash(el.loadMsg, 'ok', '未完成名單已複製。');
  }

  /* ---------- 匯出 CSV ---------- */

  function exportCsv() {
    var rows = [['座號', '姓名', '狀態', '長度', '繳交時間', '錄音檔位置']];

    for (var i = 1; i <= C.seatCount; i++) {
      var e = state.entries[String(i)];
      var ok = hasSubmission(e);
      rows.push([
        i,
        ok ? (e.name || '') : '',
        ok ? '已交' : '未交',
        ok ? formatDuration(e.durationMs) : '',
        ok ? formatTime(e.updatedAt) : '',
        ok ? (e.url || '') : '',
      ]);
    }

    var csv = rows.map(function (r) {
      return r.map(function (cell) {
        return '"' + String(cell).replace(/"/g, '""') + '"';
      }).join(',');
    }).join('\r\n');

    // 加 BOM，Excel 開啟才不會變亂碼
    var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);

    var a = document.createElement('a');
    a.href = url;
    a.download = '錄音繳交狀況.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ---------- 手動補登 ---------- */

  function buildManualSeatOptions() {
    el.manualSeat.innerHTML = '';
    for (var i = 1; i <= C.seatCount; i++) {
      var o = document.createElement('option');
      o.value = i;
      o.textContent = i + ' 號';
      el.manualSeat.appendChild(o);
    }
  }

  function handleManual(ev) {
    ev.preventDefault();
    hide(el.manualMsg);

    var seat = parseInt(el.manualSeat.value, 10);
    var raw = el.manualLink.value.trim();

    if (!raw) {
      show(el.manualMsg, 'err', '請貼上錄音連結。');
      return;
    }

    // Vocaroo 連結統一整理成標準網址，其他連結原樣存下
    var url = raw;
    var id = window.Vocaroo ? window.Vocaroo.parseId(raw) : null;
    if (id) url = window.Vocaroo.shareUrl(id);

    if (!/^https?:\/\//i.test(url)) {
      show(el.manualMsg, 'err', '連結要以 http:// 或 https:// 開頭。');
      return;
    }

    window.Store.submitLink({
      seat: seat,
      name: el.manualName.value.trim(),
      url: url,
    }).then(function (saved) {
      state.entries[String(saved.seat)] = saved;
      el.manualLink.value = '';
      el.manualName.value = '';
      render();
      flash(el.manualMsg, 'ok', seat + ' 號已登錄。');
    }).catch(function (err) {
      show(el.manualMsg, 'err', '儲存失敗：' + (err && err.message ? err.message : '不知名的錯誤'));
    });
  }

  /* ---------- 啟動 ---------- */

  el.loginForm.addEventListener('submit', handleLogin);
  el.logoutBtn.addEventListener('click', handleLogout);
  el.refreshBtn.addEventListener('click', refresh);
  el.copyTodoBtn.addEventListener('click', copyTodo);
  el.exportBtn.addEventListener('click', exportCsv);
  el.manualForm.addEventListener('submit', handleManual);

  if (isLoggedIn()) enterDashboard();
})();
