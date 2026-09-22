// 資料層：Firebase（正式）或 localStorage（本機試用）兩種實作，介面相同。
import { firebaseConfig, OWNER_EMAIL } from "./firebase-config.js";

const FB = "https://www.gstatic.com/firebasejs/10.12.2/";
const EMPTY_ACCESS = { admins: [], viewers: [], publicRead: false };

export async function createStore() {
  if (firebaseConfig && firebaseConfig.projectId) return firebaseStore();
  return localStore();
}

/* ---------------- Firebase ---------------- */
async function firebaseStore() {
  const [{ initializeApp }, auth, fs] = await Promise.all([
    import(FB + "firebase-app.js"),
    import(FB + "firebase-auth.js"),
    import(FB + "firebase-firestore.js"),
  ]);
  const app = initializeApp(firebaseConfig);
  const au = auth.getAuth(app);
  const db = fs.getFirestore(app);
  const d = (...p) => fs.doc(db, ...p);

  // 權限不足時 onSnapshot 會丟錯；統一回報給 onError
  let onError = () => {};
  const watch = (ref, cb) => fs.onSnapshot(ref, s => cb(s.exists() ? s.data() : null), e => onError(e));

  return {
    mode: "firebase",
    owner: OWNER_EMAIL.toLowerCase(),
    setErrorHandler(fn) { onError = fn; },
    onAuth(cb) {
      auth.onAuthStateChanged(au, u => cb(u ? { email: (u.email || "").toLowerCase(), name: u.displayName || u.email } : null));
    },
    async signIn() {
      const p = new auth.GoogleAuthProvider();
      p.setCustomParameters({ prompt: "select_account" });
      try { await auth.signInWithPopup(au, p); }
      catch (e) {
        if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") await auth.signInWithRedirect(au, p);
        else throw e;
      }
    },
    signOut() { return auth.signOut(au); },
    // config/public：任何人可讀（只有 publicRead 開關）；config/access：登入者可讀（主管/檢視者名單）
    watchPublic(cb) { return fs.onSnapshot(d("config", "public"), s => cb(!!(s.exists() && s.data().publicRead)), () => cb(false)); },
    watchAccess(cb) { return fs.onSnapshot(d("config", "access"), s => cb(s.exists() ? s.data() : EMPTY_ACCESS), () => cb(EMPTY_ACCESS)); },
    watchMaster(cb) { return watch(d("config", "master"), cb); },
    watchEmployees(cb) { return watch(d("config", "employees"), v => cb(v ? v.list || [] : null)); },
    watchMonth(ym, cb) { return watch(d("months", ym), v => cb(v ? v.cells || {} : {})); },
    async setCells(ym, map) {
      const cells = {};
      for (const [k, v] of Object.entries(map)) cells[k] = v ? v : fs.deleteField();
      await fs.setDoc(d("months", ym), { cells }, { merge: true });
    },
    saveMaster(m) { return fs.setDoc(d("config", "master"), m); },
    saveEmployees(list) { return fs.setDoc(d("config", "employees"), { list }); },
    async saveAccess(a) {
      await fs.setDoc(d("config", "access"), { admins: a.admins, viewers: a.viewers });
      await fs.setDoc(d("config", "public"), { publicRead: !!a.publicRead });
    },
    async importAll(data) {
      await fs.setDoc(d("config", "master"), { hubs: data.hubs, blocks: data.blocks, stores: data.stores, aliases: data.aliases || {} });
      await fs.setDoc(d("config", "employees"), { list: data.employees });
      for (const [ym, cells] of Object.entries(data.months || {})) {
        await fs.setDoc(d("months", ym), { cells });
      }
    },
    // 通用文件存取（畫休功能用）
    watchDoc(path, cb) { return fs.onSnapshot(fs.doc(db, path), s => cb(s.exists() ? s.data() : null), e => onError(e)); },
    setDocAt(path, data, merge) { return fs.setDoc(fs.doc(db, path), data, merge ? { merge: true } : {}); },
    watchLeaves(ym, cb) { return fs.onSnapshot(fs.query(fs.collection(db, "leave"), fs.where("ym", "==", ym)), q => cb(q.docs.map(x => ({ id: x.id, ...x.data() }))), e => onError(e)); },
    async readMonth(ym) {
      const s = await fs.getDoc(d("months", ym));
      return s.exists() ? s.data().cells || {} : {};
    },
  };
}

/* ---------------- 本機試用 ---------------- */
function localStore() {
  const KEY = "zhiqu-demo-v1";
  let data;
  try { data = JSON.parse(localStorage.getItem(KEY) || "null"); } catch { data = null; }
  if (!data) data = { master: null, employees: null, access: EMPTY_ACCESS, months: {} };
  const subs = new Set();
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
    subs.forEach(fn => fn());
  };
  const sub = fn => { subs.add(fn); fn(); return () => subs.delete(fn); };

  return {
    mode: "local",
    owner: OWNER_EMAIL.toLowerCase(),
    setErrorHandler() {},
    onAuth(cb) { cb({ email: "demo@local", name: "本機試用" }); },
    async signIn() {}, async signOut() {},
    watchPublic(cb) { return sub(() => cb(!!data.access.publicRead)); },
    watchAccess(cb) { return sub(() => cb(data.access)); },
    watchMaster(cb) { return sub(() => cb(data.master)); },
    watchEmployees(cb) { return sub(() => cb(data.employees)); },
    watchMonth(ym, cb) { return sub(() => cb({ ...(data.months[ym] || {}) })); },
    async setCells(ym, map) {
      const m = data.months[ym] || (data.months[ym] = {});
      for (const [k, v] of Object.entries(map)) { if (v) m[k] = v; else delete m[k]; }
      save();
    },
    async saveMaster(m) { data.master = m; save(); },
    async saveEmployees(list) { data.employees = list; save(); },
    async saveAccess(a) { data.access = a; save(); },
    async importAll(x) {
      data.master = { hubs: x.hubs, blocks: x.blocks, stores: x.stores, aliases: x.aliases || {} };
      data.employees = x.employees;
      data.months = JSON.parse(JSON.stringify(x.months || {}));
      save();
    },
    watchDoc(path, cb) { return sub(() => cb((data.docs || {})[path] || null)); },
    async setDocAt(path, v, merge) { data.docs = data.docs || {}; data.docs[path] = merge ? { ...(data.docs[path] || {}), ...v } : v; save(); },
    watchLeaves(ym, cb) { return sub(() => cb(Object.entries(data.docs || {}).filter(([k, v]) => k.startsWith("leave/") && v.ym === ym).map(([k, v]) => ({ id: k.slice(6), ...v })))); },
    async readMonth(ym) { return { ...(data.months[ym] || {}) }; },
  };
}
