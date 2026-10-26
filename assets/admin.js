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

  var state = { entries: {}, todo: [] };

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

  function flash(node, cls, text) {
    show(node, cls, text);
    setTimeout(function () { hide(node); }, 4000);
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
        '目前是「本機測試模式」：只會看到你自己在這台裝置上輸入的資料，' +
        '看不到學生從自己手機交的錄音。請依 README 設定 assets/config.js 的 backend。');
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

    window.Store.list().then(function (entries) {
      state.entries = entries;
      hide(el.loadMsg);
      render();
    }).catch(function (err) {
      show(el.loadMsg, 'err', '讀取失敗：' + (err && err.message ? err.message : '不知名的錯誤'));
    }).then(function () {
      el.refreshBtn.disabled = false;
    });
  }

  function render() {
    var done = [];
    var todo = [];

    for (var i = 1; i <= C.seatCount; i++) {
      var e = state.entries[String(i)];
      if (e && e.url) done.push(e); else todo.push(i);
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
      var ok = !!(e && e.url);

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

  function renderSubList(done) {
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
      tm.textContent = '繳交於 ' + formatTime(e.updatedAt);
      meta.appendChild(tm);

      li.appendChild(meta);

      if (e.vocarooId) {
        li.appendChild(window.Vocaroo.createPlayer(e.vocarooId));
      }

      var actions = document.createElement('div');
      actions.className = 'sub-actions';

      var open = document.createElement('a');
      open.className = 'btn btn--ghost btn--small';
      open.href = e.url;
      open.target = '_blank';
      open.rel = 'noopener noreferrer';
      open.textContent = '開啟 ↗';
      actions.appendChild(open);

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
    if (!window.confirm('要刪除 ' + seat + ' 號的繳交紀錄嗎？刪除後該座號會變回「未交」。')) return;

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
    var rows = [['座號', '姓名', '狀態', '繳交時間', 'Vocaroo 連結']];

    for (var i = 1; i <= C.seatCount; i++) {
      var e = state.entries[String(i)];
      var ok = !!(e && e.url);
      rows.push([
        i,
        ok ? (e.name || '') : '',
        ok ? '已交' : '未交',
        ok ? formatTime(e.updatedAt) : '',
        ok ? e.url : '',
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
      show(el.manualMsg, 'err', '請貼上 Vocaroo 連結。');
      return;
    }

    var id = window.Vocaroo.parseId(raw);
    if (!id) {
      show(el.manualMsg, 'err', '這看起來不是 Vocaroo 的連結。');
      return;
    }

    window.Store.upsert({
      seat: seat,
      name: el.manualName.value.trim(),
      url: window.Vocaroo.shareUrl(id),
      vocarooId: id,
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
