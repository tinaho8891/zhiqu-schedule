# 智取店排班系統（GitHub Pages + Firebase）

35 家智取店、榮華／中港二／公園 早晚班 6 個區塊的排班網站。
網站放在 **GitHub Pages**（免費），資料放在 **Firebase Firestore**（免費額度足夠），用 Google 帳號登入。

## 功能
- **漏排總覽**：35 家店 × 整個月的色塊表，每格上半是早班、下半是晚班，**紅色就是漏排**。點格子可以直接指派人。
- **排班表**：跟原本試算表一樣是「人 × 日期」，點格子用按鈕選店（不用打字）；紅框的店代表這班還沒人負責。第二列會顯示每天漏排幾家。
- **單日調度**：一次看某一天早晚班誰上班、負責哪幾家店、漏了哪幾家，點紅色門市就能指派。
- **複製週班表**：把上一週的班照星期複製到下一週。
- **匯出 Excel／列印**、下載備份、從備份還原。
- **權限**：最高管理者＋其他主管可以編輯；檢視者只能看；也可以開「不用登入也能看」。
- 可以「加入主畫面」，在手機上像 App 一樣開。

> 還沒設定 Firebase 前，直接打開網站會是「本機試用模式」，可以先玩看看（資料只存在自己的瀏覽器）。

---

## 設定步驟（約 20 分鐘，只要做一次）

### 一、建立 Firebase 專案
1. 打開 <https://console.firebase.google.com> ，用 tinaho8891@gmail.com 登入 → **新增專案**，名稱例如 `zhiqu-schedule`（Google Analytics 可以關掉）。
2. 左邊選單 **建構 → Firestore Database → 建立資料庫**
   - 位置選 `asia-east1 (台灣)`
   - 選「**以正式版模式啟動**」
3. 進到 Firestore 的 **規則** 分頁，把 `firestore.rules` 檔案的內容整個貼上，按 **發布**。
4. 左邊選單 **建構 → Authentication → 開始使用 → 登入方式 → Google → 啟用**，支援電子郵件選自己的信箱，儲存。
5. 左上齒輪 **專案設定 → 一般 → 你的應用程式**，按 `</>`（網頁）圖示，暱稱隨便填，**不用勾** Firebase Hosting，按註冊。
6. 畫面會出現一段 `const firebaseConfig = { apiKey: ..., ... }`，**複製大括號這段**。

### 二、填設定檔
打開 `firebase-config.js`，把
```js
export const firebaseConfig = null;
```
改成（貼上你複製的內容）：
```js
export const firebaseConfig = {
  apiKey: "……",
  authDomain: "……",
  projectId: "……",
  storageBucket: "……",
  messagingSenderId: "……",
  appId: "……"
};
```
（firebaseConfig 不是密碼，放在公開網站是正常的；真正擋人的是第 3 步的「規則」。）

### 三、上傳到 GitHub Pages
1. 到 <https://github.com/new> 建立新的 repository，名稱例如 `zhiqu-schedule`，選 **Public**，建立。
2. 在新 repo 頁面按 **uploading an existing file**，把這個資料夾裡**所有檔案**拖進去（index.html、app.js、store.js、style.css、firebase-config.js、seed.json、manifest.json、圖示檔），按 **Commit changes**。
3. repo 的 **Settings → Pages**：Source 選 `Deploy from a branch`，Branch 選 `main`／`/(root)`，Save。
4. 等 1～2 分鐘，網址會是：`https://tinaho8891.github.io/zhiqu-schedule/`

### 四、讓 Firebase 允許這個網址登入
Firebase 主控台 → **Authentication → 設定 → 已授權的網域 → 新增網域**，填 `tinaho8891.github.io`。

### 五、第一次使用
1. 打開網站 → 用 tinaho8891@gmail.com 登入。
2. 畫面會出現「第一次先匯入資料」→ 按 **匯入初始資料**（會匯入 9_21排班.xlsx 的 35 家店、86 位人員、7～10 月班表）。
3. 到 **設定 → 權限**，加入其他主管與檢視者的 Gmail，儲存。

---

## 日常使用小提醒
- 格子裡寫 `X` 或按「休假」＝休。括號裡的字會當備註（例如 `(支援福壽)`），不會算成負責門市。
- 排班表上出現**橘色字**＝系統認不出是哪家店（打錯字或寫了「早班」之類的字）。可以到「設定 → 錯字／舊名對照」加一行，例如 `昌隆=中隆`。
- 門市改名時，系統會自動記住舊名，舊班表不用改。
- 人員離職：把「啟用」取消就好，歷史班表會保留。
- 建議每月按一次「設定 → 下載備份」。

## 之後要修改網站
直接在 GitHub repo 裡點檔案 → 鉛筆圖示編輯 → Commit，1～2 分鐘後網站就會更新。

## 檔案說明
| 檔案 | 用途 |
|---|---|
| index.html / style.css | 頁面與樣式 |
| app.js | 畫面與排班邏輯 |
| store.js | 資料存取（Firebase／本機試用） |
| firebase-config.js | **你要填的 Firebase 設定** |
| firestore.rules | 貼到 Firebase 的安全規則 |
| seed.json | 從 9_21排班.xlsx 轉出來的初始資料 |
| manifest.json、icon-* | 手機加入主畫面用 |
