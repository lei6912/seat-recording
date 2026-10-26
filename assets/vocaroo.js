/* ===================================================================
   Vocaroo 連結處理
   Vocaroo 沒有公開 API，所以流程是：
     學生到 vocaroo.com 錄音 → 取得分享連結 → 貼回本系統
   這支程式負責把各種形式的連結解析成錄音 ID，並產生播放器。
   =================================================================== */

(function () {
  'use strict';

  // 可接受的連結形式：
  //   https://vocaroo.com/1a2b3c4d5e
  //   https://voca.ro/1a2b3c4d5e
  //   https://vocaroo.com/embed/1a2b3c4d5e
  //   https://media.vocaroo.com/mp3/1a2b3c4d5e
  //   http://vocaroo.com/i/s0ABCDEFG   （舊版網址）
  //   1a2b3c4d5e                        （只貼 ID）
  var PATTERNS = [
    /vocaroo\.com\/+embed\/+([A-Za-z0-9_-]{4,40})/i,
    /media\.vocaroo\.com\/+(?:mp3|wav|ogg)\/+([A-Za-z0-9_-]{4,40})/i,
    /vocaroo\.com\/+i\/+([A-Za-z0-9_-]{4,40})/i,
    /(?:^|\/\/|\.)voca\.ro\/+([A-Za-z0-9_-]{4,40})/i,
    /vocaroo\.com\/+([A-Za-z0-9_-]{4,40})/i,
  ];

  function parseId(input) {
    if (!input) return null;
    var s = String(input).trim();

    // 學生有時會連 <iframe ...> 整段貼過來，這裡一併處理
    for (var i = 0; i < PATTERNS.length; i++) {
      var m = s.match(PATTERNS[i]);
      if (m) return m[1];
    }

    // 沒有網域，就看看是不是單純的 ID
    if (/^[A-Za-z0-9_-]{6,40}$/.test(s)) return s;

    return null;
  }

  function shareUrl(id) {
    return 'https://vocaroo.com/' + id;
  }

  function embedUrl(id) {
    return 'https://vocaroo.com/embed/' + id + '?autoplay=0';
  }

  /* Vocaroo 的錄音檔分散在兩台主機上（取自 vocaroo.com 自己的執行期設定：
     MEDIA_MP3_FILE_URL  = https://media.vocaroo.com/mp3/
     MEDIA_MP3_FILE_URL1 = https://media1.vocaroo.com/mp3/ ）
     光看 ID 無法判斷在哪一台，所以播放時依序嘗試。 */
  var MEDIA_HOSTS = [
    'https://media.vocaroo.com/mp3/',
    'https://media1.vocaroo.com/mp3/',
  ];

  function mediaUrl(id) {
    return MEDIA_HOSTS[0] + id;
  }

  function mediaUrls(id) {
    return MEDIA_HOSTS.map(function (h) { return h + id; });
  }

  /* 產生播放器。
     優先用原生 <audio>（版面乾淨，老師可以一個一個連著播）。
     先試 media，失敗再試 media1；兩台都讀不到才換成官方 iframe 播放器。 */
  function createPlayer(id) {
    var box = document.createElement('div');
    box.className = 'player';

    var sources = mediaUrls(id);
    var next = 0;
    var finished = false;   // 已經成功讀到音訊
    var swapped = false;    // 已經換成 iframe
    var timer = null;

    var audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'metadata';
    audio.className = 'player-audio';

    function clearTimer() {
      if (timer) { clearTimeout(timer); timer = null; }
    }

    function swapToEmbed() {
      if (swapped || finished) return;
      swapped = true;
      clearTimer();

      var frame = document.createElement('iframe');
      frame.src = embedUrl(id);
      frame.className = 'player-embed';
      frame.width = '300';
      frame.height = '60';
      frame.frameBorder = '0';
      frame.setAttribute('allow', 'autoplay');
      frame.title = '錄音播放器';

      if (audio.parentNode === box) box.replaceChild(frame, audio);
      else box.appendChild(frame);
    }

    function tryNext() {
      if (finished || swapped) return;
      clearTimer();

      if (next >= sources.length) { swapToEmbed(); return; }

      audio.src = sources[next++];
      audio.load();

      // 有些情況不會觸發 error，而是一直讀不到，所以加一道保險
      timer = setTimeout(function () {
        if (!finished && audio.readyState === 0) tryNext();
      }, 5000);
    }

    audio.addEventListener('loadedmetadata', function () {
      finished = true;
      clearTimer();
    });
    audio.addEventListener('error', tryNext);

    box.appendChild(audio);
    tryNext();

    return box;
  }

  window.Vocaroo = {
    parseId: parseId,
    shareUrl: shareUrl,
    embedUrl: embedUrl,
    mediaUrl: mediaUrl,
    mediaUrls: mediaUrls,
    createPlayer: createPlayer,
  };
})();
