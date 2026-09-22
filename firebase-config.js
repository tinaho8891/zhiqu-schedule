// ================================================================
//  Firebase 設定檔
//  1. 到 Firebase 主控台 → 專案設定 → 一般 → 你的應用程式 (網頁 </>)
//     複製 firebaseConfig 那一段，貼到下面取代 null。
//  2. OWNER_EMAIL 是「最高管理者」，永遠有編輯權限（要跟 firestore.rules 裡的一樣）。
//  還沒貼設定之前，網站會以「本機試用模式」執行，資料只存在這台電腦的瀏覽器。
// ================================================================

export const firebaseConfig = {
  apiKey: "AIzaSyDCKwJEzEzrQ_KT-yncR1IpwBYIfRTqlV4",
  authDomain: "spx-locker-store.firebaseapp.com",
  projectId: "spx-locker-store",
  storageBucket: "spx-locker-store.firebasestorage.app",
  messagingSenderId: "891923505373",
  appId: "1:891923505373:web:5331ce9c108ea270a87b34"
};
/* 範例（貼上後長這樣）：
export const firebaseConfig = {
  apiKey: "AIza....",
  authDomain: "zhiqu-schedule.firebaseapp.com",
  projectId: "zhiqu-schedule",
  storageBucket: "zhiqu-schedule.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef123456"
};
*/

export const OWNER_EMAIL = "tinaho8891@gmail.com";
