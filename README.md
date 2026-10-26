# 座號錄音繳交系統

學生**不需要帳號密碼**，選自己的座號 → 到 [Vocaroo](https://vocaroo.com) 錄音 → 把連結貼回來就完成繳交。
老師在後台一眼看出**哪些座號還沒交**，並且可以**直接按播放鍵聽**每個人的錄音。

純靜態網頁，可以直接放在 GitHub Pages 上。

| 頁面 | 網址 | 給誰用 |
|---|---|---|
| 學生繳交 | `https://<你的帳號>.github.io/<repo 名稱>/` | 學生（網址發給全班） |
| 教師後台 | `https://<你的帳號>.github.io/<repo 名稱>/admin.html` | 老師（帳號 `imp5477` / 密碼 `imp5477`） |

---

## 一、為什麼需要設定「資料存在哪裡」

GitHub Pages 只能放靜態網頁，**沒有伺服器、也不能存資料**。
學生在自己手機上交的錄音連結，必須存到一個大家都連得到的地方，老師的後台才看得到。

所以 `assets/config.js` 裡的 `backend` 一定要設定好。有三種選擇：

| 選項 | 說明 | 建議 |
|---|---|---|
| `appsscript` | Google Apps Script + 你自己的 Google 試算表 | **推薦**。免費、永久、資料在你自己的 Google 帳號裡，也能直接開試算表看 |
| `jsonstorage` | jsonstorage.net 的免費 JSON 儲存 | 次選。要去申請一組 API key，而且 key 會寫在網頁裡（別人可以改你的資料） |
| `local` | 只存在這台裝置的瀏覽器 | **僅供測試**。老師看不到學生交的東西 |

預設是 `local`，所以**還沒設定前，後台只會看到你自己輸入的測試資料**。

---

## 二、設定 Google 試算表後端（推薦，約 3 分鐘）

### 步驟 1：建立試算表與程式

1. 到 [sheets.new](https://sheets.new) 開一個新的 Google 試算表（檔名隨意，例如「錄音繳交」）。
2. 上方選單 **擴充功能 → Apps Script**。
3. 把編輯器裡原本的 `function myFunction() {}` 全部刪掉。
4. 打開本專案的 [`apps-script/Code.gs`](apps-script/Code.gs)，把**整個檔案的內容**複製貼進去。
5. 按存檔（💾）。

### 步驟 2：部署成網頁應用程式

1. 右上角 **部署 → 新增部署作業**。
2. 左邊齒輪 ⚙ **選取類型 → 網頁應用程式**。
3. 設定：
   - **執行身分**：`我`
   - **誰可以存取**：`所有人` ← **這項一定要選對**，不然學生交不出來
4. 按 **部署**。第一次會要求授權：選你的 Google 帳號 →
   出現「Google 尚未驗證這個應用程式」時，點 **進階 → 前往「專案名稱」(不安全)** → **允許**。
   （這是你自己寫給自己用的程式，所以 Google 不認識它，屬正常現象。）
5. 複製畫面上的 **網頁應用程式網址**，長得像：
   ```
   https://script.google.com/macros/s/AKfycbxxxxxxxxxxxxxxxxxxxx/exec
   ```

### 步驟 3：填進設定檔

編輯 `assets/config.js`：

```js
backend: 'appsscript',

appsScript: {
  url: 'https://script.google.com/macros/s/AKfycbxxxxxxxxxxxxxxxxxxxx/exec',
},
```

存檔、推上 GitHub，就完成了。
之後學生交的資料會自動寫進試算表的 `submissions` 工作表，你也可以直接開試算表看。

> **改過 `Code.gs` 之後**：要回到 **部署 → 管理部署作業 → 編輯（鉛筆）→ 版本選「新版本」→ 部署**，
> 新的程式才會生效。網址不會變。

---

## 三、改成 jsonstorage.net（替代方案）

1. 到 [jsonstorage.net](https://jsonstorage.net) 申請免費 API key。
2. 建立一筆內容為 `{"entries":{}}` 的資料，記下它的 item id（UUID 格式）。
3. 填進 `assets/config.js`：

```js
backend: 'jsonstorage',

jsonStorage: {
  itemId: '你的-item-id',
  apiKey: '你的-api-key',
},
```

> 注意：API key 會出現在網頁原始碼裡，任何人都能用它修改或刪除你的資料。
> 只建議短期、一次性的作業使用。

---

## 四、常用設定

全部都在 `assets/config.js`：

```js
title: '英語朗讀錄音作業',                    // 頁面標題
assignmentNote: '請朗讀課本第 12 頁的對話…',   // 給學生看的作業說明
seatCount: 21,                               // 班上人數（座號 1 ~ 21）
requireName: false,                          // true = 學生要一併填姓名
deadlineNote: '',                            // 截止提示文字（純提示）

admin: {
  username: 'imp5477',
  password: 'imp5477',
},
```

---

## 五、後台功能

- **統計**：已完成 / 尚未完成 / 全班人數
- **尚未完成的座號**：一行列出，可一鍵複製（方便貼到群組催交）
- **全班進度一覽**：21 格一眼看完，綠色已交、紅色未交
- **已繳交的錄音**：每筆都有播放器，按下去直接聽；也可以開啟原始 Vocaroo 頁面
- **匯出 CSV**：含未交的人，用 Excel 開不會亂碼
- **手動補登 / 修改**：學生用別的方式給你連結時，可以代為登錄
- **刪除**：把某個座號改回「未交」，請他重錄

---

## ⚠️ 六、安全性說明（請務必了解）

這是**純靜態網站**，所以：

1. **後台帳密寫在前端程式碼裡。**
   `imp5477 / imp5477` 只能擋住隨手點進 `admin.html` 的人。
   任何人按「檢視網頁原始碼」就能看到帳密。
2. **資料本身沒有加密保護。**
   知道後端網址的人就能讀取全部繳交紀錄（也可能寫入）。
3. **Vocaroo 的錄音連結本身就是公開網址**，拿到連結的人都能聽。

對於「交朗讀作業」這種用途通常沒問題，但**請不要在這裡放任何需要保密的內容**。
如果需要真正的權限控管，就必須改用有伺服器端驗證的架構（例如 Firebase Authentication）。

---

## 七、關於 Vocaroo 的限制

- **Vocaroo 沒有公開 API**，所以沒辦法自動把錄音抓進系統。
  流程只能是「學生自己複製分享連結貼回來」，這也是本系統的設計。
- **錄音不會永久保存**。Vocaroo 會清理放太久的檔案。
  重要的作業建議在後台用「開啟 ↗」把 mp3 下載保存，或儘早評分完畢。
- 學生貼什麼格式都可以，系統會自動辨識：
  `https://voca.ro/xxxx`、`https://vocaroo.com/xxxx`、`https://vocaroo.com/embed/xxxx`、
  整段 `<iframe>` 貼過來、甚至只貼 ID。

---

## 八、檔案結構

```
.
├── index.html              學生繳交頁
├── admin.html              教師後台
├── assets/
│   ├── config.js           ★ 設定檔（老師只需要改這個）
│   ├── store.js            儲存層（三種後端的切換與實作）
│   ├── vocaroo.js          Vocaroo 連結解析與播放器
│   ├── student.js          學生頁邏輯
│   ├── admin.js            後台邏輯
│   └── ui.css              樣式（手機優先、支援深色模式）
├── apps-script/
│   └── Code.gs             要貼到 Google Apps Script 的後端程式
└── .nojekyll               讓 GitHub Pages 原樣提供檔案
```

---

## 九、常見問題

**學生按送出後出現「連不到 Google 試算表」**
→ 多半是 Apps Script 部署時「誰可以存取」沒選「所有人」。回到 **管理部署作業** 改好即可。

**後台顯示「本機測試模式」的警告**
→ `assets/config.js` 的 `backend` 還是 `local`，請照第二節設定。

**改了 `Code.gs` 卻沒反應**
→ Apps Script 要重新「部署新版本」才會生效，見第二節最後的提醒。

**兩個學生同時送出會不會互相覆蓋？**
→ 不會。Apps Script 後端用 `LockService` 排隊處理。
（`jsonstorage` 後端是整份覆寫，所以額外做了「寫完讀回確認、沒成功就重試」。）

**可以不用 Vocaroo，直接在網頁裡錄音嗎？**
→ 技術上可以（瀏覽器的 MediaRecorder），但錄音檔需要地方存放，
就不能只靠 GitHub Pages 了，要搭配 Firebase Storage 之類的服務。
