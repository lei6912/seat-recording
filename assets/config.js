/* ===================================================================
   設定檔 —— 老師只需要改這個檔案
   =================================================================== */

window.CONFIG = {

  /* ---------- 基本設定 ---------- */

  // 顯示在頁面上的標題
  title: '安慶國小一年甲班錄音作業',

  // 給學生看的作業說明。留空字串＝學生頁不顯示「作業說明」這一塊。
  assignmentNote: '',

  // 班上共幾位學生（座號 1 ~ seatCount）
  seatCount: 21,

  // 是否要求學生一併填姓名（false = 只填座號）
  requireName: false,

  // 繳交截止說明文字（純文字提示，不會真的鎖住；留空字串則不顯示）
  deadlineNote: '',

  // 單次錄音的長度上限（秒）。時間到會自動停止。
  maxRecordSeconds: 180,


  /* ---------- 錄音品質 ----------
     bitsPerSecond 越高聲音越清楚、檔案越大。
       48000  音質普通，檔案最小
       96000  預設，朗讀作業很夠用
       128000 接近無損，檔案約為預設的 1.3 倍

     下面三項是瀏覽器為了「通話」設計的處理。
     關閉（false）聲音比較自然飽滿；開啟（true）比較能壓住教室的背景雜音，
     但聲音會變薄、變悶，忽大忽小。預設全部關閉，以音質優先。
     如果錄音環境很吵，再把 noiseSuppression 改成 true 試試。      */

  audio: {
    bitsPerSecond: 96000,
    sampleRate: 48000,
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  },


  /* ---------- 後台帳密 ----------
     注意：這是純靜態網站，帳密寫在前端程式裡，
     只能「擋住不小心點進來的人」，不是真正的安全機制。
     任何人只要看網頁原始碼就能知道帳密。
     詳見 README 的「安全性說明」。                              */

  admin: {
    username: 'imp5477',
    password: 'imp5477',
  },


  /* ---------- 資料存放方式 ----------
     'appsscript' = Google Apps Script：錄音檔存到你自己的 Google 雲端硬碟，
                    繳交紀錄寫在 Google 試算表。正式使用請用這個。
     'local'      = 只存在這台裝置的瀏覽器（僅供測試，老師看不到學生的錄音）
                                                                 */

  backend: 'appsscript',


  // backend: 'appsscript' 時要填這裡。
  // 部署 Apps Script 後取得的網址，長得像：
  //   https://script.google.com/macros/s/AKfycb..../exec
  appsScript: {
    url: 'https://script.google.com/macros/s/AKfycbzjGOsw3rDVqUDEmE-0jQIRjTQ0vReKUfJ_wPffhQsn95kubeesoCiBPmBPB3PCA052/exec',
  },

};
