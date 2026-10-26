/* ===================================================================
   網頁內錄音 —— 包住瀏覽器的 MediaRecorder

   用法：
     var rec = Recorder.create({
       maxMs: 180000,
       onTick: function (ms) { ... },      // 錄音中每 100ms 呼叫
       onStop: function (result) { ... },  // {blob, mime, durationMs}
       onError: function (err) { ... },
     });
     rec.start();  rec.stop();  rec.cancel();
   =================================================================== */

(function () {
  'use strict';

  /* 不同瀏覽器支援的格式不一樣：
       Chrome / Edge / Firefox → audio/webm（Opus 編碼）
       Safari（含 iPhone）     → audio/mp4（AAC 編碼）
     兩種都能存、也都能播，所以挑第一個支援的就好。 */
  var CANDIDATES = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];

  function pickMime() {
    if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
    for (var i = 0; i < CANDIDATES.length; i++) {
      if (MediaRecorder.isTypeSupported(CANDIDATES[i])) return CANDIDATES[i];
    }
    return '';
  }

  // 把 MIME 轉成存檔用的副檔名
  function extFor(mime) {
    var m = String(mime || '');
    if (m.indexOf('webm') >= 0) return 'webm';
    if (m.indexOf('mp4') >= 0 || m.indexOf('m4a') >= 0) return 'm4a';
    if (m.indexOf('ogg') >= 0) return 'ogg';
    if (m.indexOf('wav') >= 0) return 'wav';
    if (m.indexOf('mpeg') >= 0) return 'mp3';
    return 'bin';
  }

  // 錄音品質設定，取自 config.js；沒設定就用預設值
  function quality() {
    var a = (window.CONFIG && window.CONFIG.audio) || {};
    return {
      bitsPerSecond: parseInt(a.bitsPerSecond, 10) || 96000,
      sampleRate: parseInt(a.sampleRate, 10) || 48000,
      echoCancellation: a.echoCancellation === true,
      noiseSuppression: a.noiseSuppression === true,
      autoGainControl: a.autoGainControl === true,
    };
  }

  // 實際拿到的錄音參數（不同裝置給的結果可能不同），方便排查音質問題
  var achieved = null;

  // 這個瀏覽器／這個網址能不能錄音
  function support() {
    if (!window.isSecureContext && location.hostname !== 'localhost') {
      return { ok: false, reason: '錄音功能需要 https 的網址才能使用。' };
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return { ok: false, reason: '這個瀏覽器不支援網頁錄音，請換用 Chrome、Edge、Safari 或 Firefox 的新版本。' };
    }
    if (typeof MediaRecorder === 'undefined') {
      return { ok: false, reason: '這個瀏覽器不支援網頁錄音（iPhone 請更新到 iOS 14.3 以上）。' };
    }
    if (!pickMime()) {
      return { ok: false, reason: '這個瀏覽器沒有可用的錄音格式，請換一個瀏覽器。' };
    }
    return { ok: true, reason: '' };
  }

  // 把 getUserMedia 的錯誤翻成學生看得懂的話
  function explain(err) {
    var name = err && err.name ? err.name : '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return '沒有拿到麥克風權限。請在瀏覽器網址列左邊的圖示裡把麥克風改成「允許」，然後重新整理頁面。';
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return '找不到麥克風。請確認裝置有麥克風（或耳機麥克風已插好）。';
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return '麥克風被其他程式佔用了。請關掉其他正在錄音或通話的程式再試。';
    }
    if (name === 'SecurityError') {
      return '這個網址不允許使用麥克風（需要 https）。';
    }
    return '無法開啟麥克風：' + (err && err.message ? err.message : name || '不知名的錯誤');
  }

  function create(opts) {
    opts = opts || {};

    var maxMs   = opts.maxMs || 180000;
    var onTick  = opts.onTick || function () {};
    var onStop  = opts.onStop || function () {};
    var onError = opts.onError || function () {};

    var mime = pickMime();
    var recorder = null;
    var stream = null;
    var chunks = [];
    var startedAt = 0;
    var ticker = null;
    var autoStop = null;
    var cancelled = false;

    function cleanup() {
      if (ticker) { clearInterval(ticker); ticker = null; }
      if (autoStop) { clearTimeout(autoStop); autoStop = null; }
      // 一定要關掉音軌，否則分頁上的錄音指示燈會一直亮著
      if (stream) {
        stream.getTracks().forEach(function (t) { t.stop(); });
        stream = null;
      }
      recorder = null;
    }

    function start() {
      var s = support();
      if (!s.ok) { onError(new Error(s.reason)); return; }

      cancelled = false;
      chunks = [];

      var q = quality();

      navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: q.echoCancellation,
          noiseSuppression: q.noiseSuppression,
          autoGainControl: q.autoGainControl,
          sampleRate: q.sampleRate,
          channelCount: 1,        // 單聲道：朗讀用不到立體聲，檔案少一半
        },
      }).then(function (ms) {
        stream = ms;

        // 記下實際生效的參數（裝置不一定會照單全收）
        try {
          achieved = stream.getAudioTracks()[0].getSettings();
          achieved.bitsPerSecond = q.bitsPerSecond;
          achieved.mimeType = mime;
        } catch (e) {
          achieved = null;
        }

        var options = { mimeType: mime };
        try { options.audioBitsPerSecond = q.bitsPerSecond; } catch (e) { /* 忽略 */ }

        try {
          recorder = new MediaRecorder(stream, options);
        } catch (e) {
          // 有些瀏覽器不接受這些參數，退回預設值
          recorder = new MediaRecorder(stream);
        }

        recorder.addEventListener('dataavailable', function (ev) {
          if (ev.data && ev.data.size > 0) chunks.push(ev.data);
        });

        recorder.addEventListener('error', function (ev) {
          cleanup();
          onError((ev && ev.error) || new Error('錄音過程發生錯誤。'));
        });

        recorder.addEventListener('stop', function () {
          var durationMs = Date.now() - startedAt;
          var type = (recorder && recorder.mimeType) || mime;
          cleanup();

          if (cancelled) return;

          var blob = new Blob(chunks, { type: type });
          if (!blob.size) { onError(new Error('沒有錄到聲音，請再試一次。')); return; }

          onStop({ blob: blob, mime: type, durationMs: durationMs, ext: extFor(type) });
        });

        startedAt = Date.now();
        recorder.start();

        ticker = setInterval(function () { onTick(Date.now() - startedAt); }, 100);
        autoStop = setTimeout(function () { stop(); }, maxMs);
        onTick(0);

      }).catch(function (err) {
        cleanup();
        onError(new Error(explain(err)));
      });
    }

    function stop() {
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      else cleanup();
    }

    function cancel() {
      cancelled = true;
      stop();
    }

    function isRecording() {
      return !!(recorder && recorder.state === 'recording');
    }

    return { start: start, stop: stop, cancel: cancel, isRecording: isRecording };
  }

  // 毫秒 → 0:07
  function formatDuration(ms) {
    var total = Math.floor((ms || 0) / 1000);
    var m = Math.floor(total / 60);
    var s = total % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  window.Recorder = {
    create: create,
    support: support,
    pickMime: pickMime,
    extFor: extFor,
    formatDuration: formatDuration,
    quality: quality,
    achieved: function () { return achieved; },
  };
})();
