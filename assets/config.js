/* ===================================================================
   設定檔 —— 老師只需要改這個檔案
   =================================================================== */

window.CONFIG = {

  /* ---------- 基本設定 ---------- */

  // 顯示在頁面上的標題
  title: '英語朗讀錄音作業',

  // 給學生看的作業說明（可留空字串）
  assignmentNote: '請朗讀課本第 12 頁的對話，錄完把 Vocaroo 連結貼回來。',

  // 班上共幾位學生（座號 1 ~ seatCount）
  seatCount: 21,

  // 是否要求學生一併填姓名（false = 只填座號）
  requireName: false,

  // 繳交截止說明文字（純文字提示，不會真的鎖住；留空字串則不顯示）
  deadlineNote: '',


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
     'appsscript'  = Google Apps Script + Google 試算表（推薦，免費且永久）
     'jsonstorage' = jsonstorage.net 免費 JSON 儲存（要一組 API key）
     'local'       = 只存在這台裝置的瀏覽器（僅供測試，老師看不到學生的資料）
                                                                 */

  backend: 'local',


  // backend: 'appsscript' 時要填這裡
  // 部署 Apps Script 後取得的網址，長得像：
  //   https://script.google.com/macros/s/AKfycb..../exec
  appsScript: {
    url: '',
  },


  // backend: 'jsonstorage' 時要填這裡
  jsonStorage: {
    itemId: '',   // 建立資料後取得的 item id（UUID 格式）
    apiKey:  '',  // 在 jsonstorage.net 取得的 API key
  },

};
