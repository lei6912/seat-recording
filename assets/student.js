/* ===================================================================
   學生頁邏輯：選座號 → 在網頁裡錄音 → 送出
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

    supportWarn: document.getElementById('supportWarn'),
    recorderUI:  document.getElementById('recorderUI'),
    recHint:     document.getElementById('recHint'),
    recBtn:      document.getElementById('recBtn'),
    recTimer:    document.getElementById('recTimer'),
    recLimit:    document.getElementById('recLimit'),
    iconMic:     document.querySelector('.rec-icon--mic'),
    iconStop:    document.querySelector('.rec-icon--stop'),

    reviewBox:   document.getElementById('reviewBox'),
    reviewAudio: document.getElementById('reviewAudio'),
    sendBtn:     document.getElementById('sendBtn'),
    redoBtn:     document.getElementById('redoBtn'),

    formMsg:     document.getElementById('formMsg'),
    doneBox:     document.getElementById('doneBox'),
    doneAudio:   document.getElementById('doneAudio'),
  };

  var maxMs = (parseInt(C.maxRecordSeconds, 10) || 180) * 1000;

  var state = {
    seat: null,
    entries: {},
    rec: null,        // 正在進行的 Recorder 實例
    recording: false,
    take: null,       // 錄好的 {blob, mime, durationMs, ext}
    objectUrl: null,  // 給 <audio> 用的暫時網址
    sending: false,
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

  function freeObjectUrl() {
    if (state.objectUrl) {
      URL.revokeObjectURL(state.objectUrl);
      state.objectUrl = null;
    }
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

    el.recLimit.textContent = '最長 ' + window.Recorder.formatDuration(maxMs);

    if (window.Store.isDemo) {
      show(el.backendWarn, 'warn',
        '目前是「本機測試模式」：錄音只存在這台裝置，老師的後台看不到。' +
        '正式使用前請依 README 設定 assets/config.js。');
    } else if (!window.Store.isConfigured()) {
      show(el.backendWarn, 'err', '系統還沒設定完成：' + window.Store.configHint());
    }
  }

  function checkSupport() {
    var s = window.Recorder.support();
    if (s.ok) return true;

    el.recorderUI.hidden = true;
    show(el.supportWarn, 'err', s.reason + ' 請告訴老師，由老師代為登錄。');
    return false;
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
    if (state.recording) return;   // 錄音中不讓換座號

    state.seat = seat;

    Array.prototype.forEach.call(el.seatGrid.children, function (b) {
      b.setAttribute('aria-pressed', String(parseInt(b.dataset.seat, 10) === seat));
    });

    try { localStorage.setItem(SEAT_MEMORY, String(seat)); } catch (e) { /* 無痕模式 */ }

    hide(el.formMsg);
    el.doneBox.hidden = true;

    var prev = state.entries[String(seat)];
    if (prev && (prev.fileId || prev.url)) {
      show(el.seatNotice, 'warn',
        seat + ' 號在 ' + formatTime(prev.updatedAt) + ' 已經交過了。再錄一次送出會覆蓋舊的錄音。');
      if (prev.name && !el.nameInput.value) el.nameInput.value = prev.name;
    } else {
      hide(el.seatNotice);
    }
  }

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

  /* ---------- 錄音 ---------- */

  function setRecordingUI(on) {
    state.recording = on;
    el.recBtn.classList.toggle('is-recording', on);
    el.recBtn.setAttribute('aria-label', on ? '停止錄音' : '開始錄音');
    el.iconMic.hidden = on;
    el.iconStop.hidden = !on;
    el.recHint.textContent = on
      ? '正在錄音…講完按一下方塊停止。'
      : '按一下麥克風開始錄音，講完再按一下停止。';
  }

  function discardTake() {
    freeObjectUrl();
    state.take = null;
    el.reviewAudio.removeAttribute('src');
    el.reviewBox.hidden = true;
  }

  function toggleRecord() {
    if (state.sending) return;

    if (state.recording) {
      state.rec.stop();
      return;
    }

    hide(el.formMsg);
    el.doneBox.hidden = true;
    discardTake();
    el.recTimer.textContent = '0:00';

    state.rec = window.Recorder.create({
      maxMs: maxMs,

      onTick: function (ms) {
        el.recTimer.textContent = window.Recorder.formatDuration(ms);
      },

      onStop: function (take) {
        setRecordingUI(false);

        state.take = take;
        state.objectUrl = URL.createObjectURL(take.blob);
        el.reviewAudio.src = state.objectUrl;
        el.reviewBox.hidden = false;
        el.recTimer.textContent = window.Recorder.formatDuration(take.durationMs);
      },

      onError: function (err) {
        setRecordingUI(false);
        el.recTimer.textContent = '0:00';
        show(el.formMsg, 'err', err.message);
      },
    });

    setRecordingUI(true);
    state.rec.start();
  }

  /* ---------- 送出 ---------- */

  function send() {
    if (state.sending) return;
    hide(el.formMsg);

    if (!state.take) {
      show(el.formMsg, 'err', '還沒有錄音，請先按麥克風錄一段。');
      return;
    }

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

    state.sending = true;
    el.sendBtn.disabled = true;
    el.redoBtn.disabled = true;
    el.sendBtn.textContent = '上傳中…';

    window.Store.submitRecording({
      seat: state.seat,
      name: name,
      blob: state.take.blob,
      mime: state.take.mime,
      ext: state.take.ext,
      durationMs: state.take.durationMs,
    }).then(function (saved) {
      state.entries[String(saved.seat)] = saved;

      show(el.formMsg, 'ok', '繳交成功！' + saved.seat + ' 號的錄音已經送到老師那邊了。');
      hide(el.seatNotice);

      // 把剛才的錄音留在頁面上讓學生確認，不必再下載一次
      el.doneAudio.src = state.objectUrl;
      el.doneBox.hidden = false;

      state.take = null;
      el.reviewBox.hidden = true;
      el.reviewAudio.removeAttribute('src');
      el.doneBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    }).catch(function (err) {
      show(el.formMsg, 'err',
        '送出失敗：' + (err && err.message ? err.message : '不知名的錯誤') +
        '　錄音還在，請檢查網路後再按一次送出。');

    }).then(function () {
      state.sending = false;
      el.sendBtn.disabled = false;
      el.redoBtn.disabled = false;
      el.sendBtn.textContent = '送出繳交';
    });
  }

  function redo() {
    if (state.sending) return;
    hide(el.formMsg);
    el.doneBox.hidden = true;
    discardTake();
    el.recTimer.textContent = '0:00';
  }

  /* ---------- 啟動 ---------- */

  applyConfig();
  buildSeatGrid();
  loadExisting();

  if (checkSupport()) {
    el.recBtn.addEventListener('click', toggleRecord);
    el.sendBtn.addEventListener('click', send);
    el.redoBtn.addEventListener('click', redo);
  }

  // 錄音中不小心關掉分頁時提醒一下
  window.addEventListener('beforeunload', function (ev) {
    if (state.recording || state.take) {
      ev.preventDefault();
      ev.returnValue = '';
    }
  });
})();
