/* ===================================================================
   學生頁邏輯
   =================================================================== */

(function () {
  'use strict';

  var C = window.CONFIG;
  var SEAT_MEMORY = 'seat-recording:my-seat';

  var el = {
    pageTitle:   document.getElementById('pageTitle'),
    backendWarn: document.getElementById('backendWarn'),
    noteCard:    document.getElementById('noteCard'),
    note:        document.getElementById('assignmentNote'),
    deadline:    document.getElementById('deadlineNote'),
    seatGrid:    document.getElementById('seatGrid'),
    seatNotice:  document.getElementById('seatNotice'),
    nameField:   document.getElementById('nameField'),
    nameInput:   document.getElementById('nameInput'),
    form:        document.getElementById('submitForm'),
    linkInput:   document.getElementById('linkInput'),
    submitBtn:   document.getElementById('submitBtn'),
    formMsg:     document.getElementById('formMsg'),
    doneBox:     document.getElementById('doneBox'),
    donePlayer:  document.getElementById('donePlayer'),
    doneLink:    document.getElementById('doneLink'),
  };

  var state = {
    seat: null,
    entries: {},   // 既有紀錄，用來提示「你已經交過了」
  };

  /* ---------- 小工具 ---------- */

  function show(node, cls, text) {
    node.className = 'msg msg--' + cls;
    node.textContent = text;
    node.hidden = false;
  }

  function hide(node) { node.hidden = true; }

  function formatTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return iso;
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* ---------- 初始化畫面 ---------- */

  function applyConfig() {
    if (C.title) {
      document.title = C.title + '｜錄音繳交';
      el.pageTitle.textContent = C.title;
    }

    if (C.assignmentNote) {
      el.note.textContent = C.assignmentNote;
      el.noteCard.hidden = false;
    }
    if (C.deadlineNote) {
      el.deadline.textContent = C.deadlineNote;
      el.deadline.hidden = false;
      el.noteCard.hidden = false;
    }

    if (C.requireName) el.nameField.hidden = false;

    if (window.Store.isDemo) {
      show(el.backendWarn, 'warn',
        '目前是「本機測試模式」：資料只存在這台裝置，老師的後台看不到。' +
        '正式使用前請依 README 設定 assets/config.js 的 backend。');
    } else if (!window.Store.isConfigured()) {
      show(el.backendWarn, 'err', '系統還沒設定完成：' + window.Store.configHint());
    }
  }

  function buildSeatGrid() {
    var frag = document.createDocumentFragment();

    for (var i = 1; i <= C.seatCount; i++) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'seat-btn';
      b.textContent = i;
      b.dataset.seat = i;
      b.setAttribute('aria-pressed', 'false');
      b.setAttribute('aria-label', i + ' 號');
      frag.appendChild(b);
    }

    el.seatGrid.appendChild(frag);

    el.seatGrid.addEventListener('click', function (ev) {
      var btn = ev.target.closest('.seat-btn');
      if (btn) selectSeat(parseInt(btn.dataset.seat, 10));
    });
  }

  function selectSeat(seat) {
    state.seat = seat;

    Array.prototype.forEach.call(el.seatGrid.children, function (b) {
      b.setAttribute('aria-pressed', String(parseInt(b.dataset.seat, 10) === seat));
    });

    try { localStorage.setItem(SEAT_MEMORY, String(seat)); } catch (e) { /* 無痕模式 */ }

    hide(el.formMsg);
    el.doneBox.hidden = true;

    var prev = state.entries[String(seat)];
    if (prev && prev.url) {
      show(el.seatNotice, 'warn',
        seat + ' 號在 ' + formatTime(prev.updatedAt) + ' 已經交過了。再送一次會用新的錄音覆蓋舊的。');
      if (prev.name && !el.nameInput.value) el.nameInput.value = prev.name;
    } else {
      hide(el.seatNotice);
    }
  }

  /* ---------- 讀取既有紀錄（讀不到不影響繳交） ---------- */

  function loadExisting() {
    if (!window.Store.isConfigured()) return;

    window.Store.list().then(function (entries) {
      state.entries = entries;

      var remembered = null;
      try { remembered = localStorage.getItem(SEAT_MEMORY); } catch (e) { /* 忽略 */ }
      if (remembered) {
        var n = parseInt(remembered, 10);
        if (n >= 1 && n <= C.seatCount) selectSeat(n);
      }
    }).catch(function () {
      /* 讀不到舊資料就算了，不要擋住學生繳交 */
    });
  }

  /* ---------- 送出 ---------- */

  function handleSubmit(ev) {
    ev.preventDefault();
    hide(el.formMsg);
    el.doneBox.hidden = true;

    if (!state.seat) {
      show(el.formMsg, 'err', '請先在步驟 1 點選你的座號。');
      el.seatGrid.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    var name = el.nameInput.value.trim();
    if (C.requireName && !name) {
      show(el.formMsg, 'err', '請填寫姓名。');
      el.nameInput.focus();
      return;
    }

    var raw = el.linkInput.value.trim();
    if (!raw) {
      show(el.formMsg, 'err', '請貼上 Vocaroo 的錄音連結。');
      el.linkInput.focus();
      return;
    }

    var id = window.Vocaroo.parseId(raw);
    if (!id) {
      show(el.formMsg, 'err',
        '這看起來不是 Vocaroo 的連結。正確的樣子是 https://voca.ro/xxxxxxxx 或 ' +
        'https://vocaroo.com/xxxxxxxx，請重新複製一次。');
      el.linkInput.focus();
      el.linkInput.select();
      return;
    }

    el.submitBtn.disabled = true;
    el.submitBtn.textContent = '送出中…';

    window.Store.upsert({
      seat: state.seat,
      name: name,
      url: window.Vocaroo.shareUrl(id),
      vocarooId: id,
    }).then(function (saved) {
      state.entries[String(saved.seat)] = saved;

      show(el.formMsg, 'ok', '繳交成功！' + saved.seat + ' 號的錄音已經送到老師那邊了。');
      hide(el.seatNotice);

      el.donePlayer.innerHTML = '';
      el.donePlayer.appendChild(window.Vocaroo.createPlayer(id));
      el.doneLink.href = window.Vocaroo.shareUrl(id);
      el.doneBox.hidden = false;
      el.doneBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    }).catch(function (err) {
      show(el.formMsg, 'err',
        '送出失敗：' + (err && err.message ? err.message : '不知名的錯誤') +
        '　請檢查網路後再按一次送出。');

    }).then(function () {
      el.submitBtn.disabled = false;
      el.submitBtn.textContent = '送出繳交';
    });
  }

  /* ---------- 啟動 ---------- */

  applyConfig();
  buildSeatGrid();
  loadExisting();
  el.form.addEventListener('submit', handleSubmit);
})();
