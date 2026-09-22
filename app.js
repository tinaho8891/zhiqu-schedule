import { createStore } from "./store.js?v=3";

/* ================= 狀態 ================= */
const SHIFT = { am: "早班", pm: "晚班" };
const WD = ["日", "一", "二", "三", "四", "五", "六"];
const S = {
  store: null, user: undefined, access: { admins: [], viewers: [] }, publicRead: false,
  master: undefined, employees: undefined, cells: {}, monthLoaded: false,
  ym: "", tab: "overview", block: null, day: "", ovShift: "am", onlyMissing: false, search: "",
  unsubs: [], monthUnsub: null, dataOn: false,
};
const $ = s => document.querySelector(s);
const main = $("#main");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ================= 日期工具 ================= */
const pad = n => String(n).padStart(2, "0");
const toDs = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const fromDs = ds => new Date(+ds.slice(0, 4), +ds.slice(4, 6) - 1, +ds.slice(6, 8));
const ymOf = ds => `${ds.slice(0, 4)}-${ds.slice(4, 6)}`;
const addDays = (ds, n) => { const d = fromDs(ds); d.setDate(d.getDate() + n); return toDs(d); };
const todayDs = () => toDs(new Date());
const dLabel = ds => { const d = fromDs(ds); return `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]})`; };
const isoOf = ds => `${ds.slice(0, 4)}-${ds.slice(4, 6)}-${ds.slice(6, 8)}`;
const shiftYm = (ym, n) => { const [y, m] = ym.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
function monthDays(ym) {
  const [y, m] = ym.split("-").map(Number);
  const n = new Date(y, m, 0).getDate(), t = todayDs(), out = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(y, m - 1, i), ds = toDs(d);
    out.push({ ds, d: i, wd: WD[d.getDay()], we: d.getDay() === 0 || d.getDay() === 6, today: ds === t });
  }
  return out;
}

/* ================= 衍生資料 ================= */
const isAdmin = () => S.store?.mode === "local" || (!!S.user && (S.user.email === S.store.owner || (S.access.admins || []).includes(S.user.email)));
const canRead = () => isAdmin() || S.publicRead || (!!S.user && (S.access.viewers || []).includes(S.user.email));
const hubs = () => S.master?.hubs || [];
const blocks = () => S.master?.blocks || [];
const blockBy = k => blocks().find(b => b.key === k);
const hubName = id => hubs().find(h => h.id === id)?.name || id;
function storeNames() { // 依組別順序排列
  const order = hubs().map(h => h.id);
  return [...(S.master?.stores || [])].sort((a, b) => order.indexOf(a.hub) - order.indexOf(b.hub)).map(s => s.name);
}
const storeHub = name => S.master?.stores.find(s => s.name === name)?.hub;
const empBy = id => (S.employees || []).find(e => e.id === id);

// 把格子文字拆成：門市 / 休假 / 備註 / 無法辨識
function parse(v) {
  const out = { stores: [], off: false, notes: [], unknown: [] };
  if (!v) return out;
  let t = String(v);
  t = t.replace(/[（(]([^)）]*)[)）]/g, (_, n) => { if (n.trim()) out.notes.push(n.trim()); return " "; });
  for (const [a, b] of Object.entries(S.master?.aliases || {})) if (a) t = t.split(a).join(b);
  const names = [...(S.master?.stores || []).map(s => s.name)].sort((a, b) => b.length - a.length);
  for (const tok of t.split(/[\s、,，/]+/).filter(Boolean)) {
    if (/^[xX休]$/.test(tok)) { out.off = true; continue; }
    let i = 0, rest = "";
    while (i < tok.length) {
      const hit = names.find(n => tok.startsWith(n, i));
      if (hit) { if (!out.stores.includes(hit)) out.stores.push(hit); i += hit.length; }
      else { rest += tok[i]; i++; }
    }
    if (rest) out.unknown.push(rest);
  }
  return out;
}
function compose(stores, off, note) {
  const parts = [];
  if (off) parts.push("X");
  parts.push(...stores);
  if (note && note.trim()) parts.push(`(${note.trim()})`);
  return parts.join(" ");
}

// 每天每個班別：哪些門市被誰負責
function analyze(cells = S.cells) {
  const A = {};
  for (const [k, v] of Object.entries(cells)) {
    const i = k.indexOf("_"), ds = k.slice(0, i), e = empBy(k.slice(i + 1));
    if (!e) continue;
    const b = blockBy(e.block); if (!b) continue;
    const day = A[ds] || (A[ds] = { am: { cov: {}, started: false }, pm: { cov: {}, started: false } });
    const sh = day[b.shift], st = parse(v).stores;
    if (st.length) sh.started = true; // 只填 X（例如畫休匯入）不算開始排
    for (const s of st) (sh.cov[s] || (sh.cov[s] = [])).push(e);
  }
  return A;
}
function missingOf(A, ds, shift) {
  const sh = A[ds]?.[shift];
  if (!sh || !sh.started) return null; // 這天這班還沒開始排
  return storeNames().filter(s => !sh.cov[s]);
}

/* ================= 啟動 ================= */
init();
async function init() {
  const now = new Date();
  S.ym = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  S.day = todayDs();
  try { S.tab = localStorage.getItem("zq-tab") || "overview"; } catch {}
  try { S.store = await createStore(); }
  catch (e) { main.innerHTML = `<div class="card">無法連線到 Firebase：${esc(e.message)}</div>`; return; }

  if (S.store.mode === "local") {
    const b = $("#banner"); b.hidden = false;
    b.innerHTML = "目前是<b>本機試用模式</b>：資料只存在這台電腦的瀏覽器。照 README 設定好 Firebase 後，就會變成大家共用的雲端版本。";
  }
  S.store.setErrorHandler(e => { if (e.code === "permission-denied") { stopData(); render(); } else toast("連線錯誤：" + e.message); });

  let accUnsub = null;
  S.store.watchPublic(p => { S.publicRead = p; gate(); });
  S.store.onAuth(u => {
    S.user = u;
    if (accUnsub) { accUnsub(); accUnsub = null; }
    S.access = { admins: [], viewers: [] };
    if (u) accUnsub = S.store.watchAccess(a => { S.access = a || { admins: [], viewers: [] }; gate(); });
    gate();
  });

  $("#prevMonth").onclick = () => setMonth(shiftYm(S.ym, -1));
  $("#nextMonth").onclick = () => setMonth(shiftYm(S.ym, 1));
  $("#tabs").onclick = e => { const b = e.target.closest("button[data-tab]"); if (b) setTab(b.dataset.tab); };
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });
}

function gate() {
  if (S.user === undefined) return;
  if (canRead()) startData(); else stopData();
  render();
}
function startData() {
  if (S.dataOn) return;
  S.dataOn = true;
  S.unsubs.push(S.store.watchMaster(m => { S.master = m; if (m && !blockBy(S.block)) S.block = m.blocks[0]?.key; render(); }));
  S.unsubs.push(S.store.watchEmployees(l => { S.employees = l; render(); }));
  watchMonth();
}
function stopData() {
  S.unsubs.forEach(f => f && f()); S.unsubs = [];
  Object.values(S.monthSubs || {}).forEach(f => f && f()); S.monthSubs = {}; S.monthCells = {};
  Object.values(S.availSubs || {}).forEach(f => f && f()); S.availSubs = {}; S.availDocs = {};
  Object.values(S.lvSubs || {}).forEach(f => f && f()); S.lvSubs = {}; S.lvCells = {}; S.avail = {};
  if (S.leaveCfgSub) S.leaveCfgSub(); if (S.leavesSub) S.leavesSub(); S.leaveCfgSub = S.leavesSub = null; S.leavesYm = null;
  S.dataOn = false; S.master = undefined; S.employees = undefined; S.cells = {}; S.monthLoaded = false;
}
// 依目前畫面需要的月份訂閱資料（總覽的 14 天可能跨月）
function neededMonths() {
  const need = new Set([S.ym]);
  if (S.tab === "overview") { need.add(ymOf(ovStart())); need.add(ymOf(addDays(ovStart(), 13))); }
  return need;
}
function watchMonth() {
  S.monthSubs = S.monthSubs || {}; S.monthCells = S.monthCells || {};
  const need = neededMonths();
  for (const ym of Object.keys(S.monthSubs)) if (!need.has(ym)) {
    S.monthSubs[ym](); delete S.monthSubs[ym]; delete S.monthCells[ym];
    if (S.availSubs?.[ym]) { S.availSubs[ym](); delete S.availSubs[ym]; delete S.availDocs[ym]; }
    if (S.lvSubs?.[ym]) { S.lvSubs[ym](); delete S.lvSubs[ym]; delete S.lvCells[ym]; }
  }
  S.availSubs = S.availSubs || {}; S.availDocs = S.availDocs || {}; S.lvSubs = S.lvSubs || {}; S.lvCells = S.lvCells || {};
  // 畫休：直接讀員工送出的資料（不用等匯入），已匯入的當備底
  const mergeAv = () => { S.avail = Object.assign({}, ...Object.values(S.availDocs), ...Object.values(S.lvCells)); };
  for (const ym of need) if (!S.availSubs[ym] && S.store.watchDoc) {
    S.availSubs[ym] = () => {};
    const ua = S.store.watchDoc(`avail/${ym}`, d => { S.availDocs[ym] = d?.cells || {}; mergeAv(); render(); });
    if (S.availSubs[ym]) S.availSubs[ym] = ua; else ua();
  }
  for (const ym of need) if (!S.lvSubs[ym] && isAdmin() && S.store.watchLeaves) {
    S.lvSubs[ym] = () => {};
    const ul = S.store.watchLeaves(ym, list => {
      const m = {};
      for (const x of list) for (const [ds, code] of Object.entries(x.days || {})) m[ds + "_" + x.eid] = code;
      S.lvCells[ym] = m; mergeAv(); render();
    });
    if (S.lvSubs[ym]) S.lvSubs[ym] = ul; else ul();
  }
  const merge = () => {
    S.cells = Object.assign({}, ...Object.values(S.monthCells));
    S.monthLoaded = [...need].every(ym => S.monthCells[ym]);
  };
  for (const ym of need) if (!S.monthSubs[ym]) {
    S.monthSubs[ym] = () => {};
    const u = S.store.watchMonth(ym, c => { if (!S.monthSubs[ym]) return; S.monthCells[ym] = c; merge(); render(); });
    if (S.monthSubs[ym]) S.monthSubs[ym] = u; else u();
  }
  merge();
}
function mondayOf(ds) { const d = fromDs(ds); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return toDs(d); }
function ovStart() { return S.ovStart || (S.ovStart = mondayOf(todayDs())); }
function setOvStart(ds) { S.ovStart = ds; if (S.dataOn) watchMonth(); render(); }
function setMonth(ym) {
  S.ym = ym;
  if (ymOf(S.day) !== ym) S.day = ym.replace("-", "") + "01";
  if (ymOf(todayDs()) === ym) S.day = todayDs();
  S.scrolled = false;
  if (S.dataOn) watchMonth();
  render();
}
function setTab(t) {
  S.tab = t; S.scrolled = false;
  try { localStorage.setItem("zq-tab", t); } catch {}
  if (S.dataOn) watchMonth();
  render();
}

/* ================= 畫面 ================= */
function render() {
  const [y, m] = S.ym.split("-");
  $("#monthLabel").textContent = `${y}年${+m}月`;
  renderUser();
  $(".month-nav").style.visibility = S.tab === "overview" ? "hidden" : "";
  document.querySelectorAll("#tabs [data-admin]").forEach(b => b.hidden = !isAdmin());
  if ((S.tab === "settings" || S.tab === "leave") && !isAdmin()) S.tab = "overview";
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("active", b.dataset.tab === S.tab));

  if (S.user === undefined) { main.innerHTML = `<div class="loading">載入中…</div>`; return; }
  if (!canRead()) { main.innerHTML = gateHtml(); bindGate(); return; }
  if (S.master === undefined || S.employees === undefined) { main.innerHTML = `<div class="loading">載入資料中…</div>`; return; }
  if (!S.master || !S.employees) { main.innerHTML = setupHtml(); bindSetup(); return; }

  // 保留捲動位置
  const sc = main.querySelector(".scroll");
  const keep = sc ? [sc.scrollLeft, sc.scrollTop, S.lastKey] : null;
  const key = S.tab + S.ym + (S.tab === "grid" ? S.block : "");

  if (S.tab === "overview") main.innerHTML = overviewHtml();
  else if (S.tab === "grid") main.innerHTML = gridHtml();
  else if (S.tab === "day") main.innerHTML = dayHtml();
  else if (S.tab === "settings") main.innerHTML = settingsHtml();
  else if (S.tab === "leave") main.innerHTML = leaveHtml();
  bindMain();

  const sc2 = main.querySelector(".scroll");
  S.lastKey = key;
  if (sc2 && keep && keep[2] === key && S.scrolled) { sc2.scrollLeft = keep[0]; sc2.scrollTop = keep[1]; }
  else if (sc2 && S.monthLoaded) {
    const t = sc2.querySelector("th.today");
    if (t) sc2.scrollLeft = Math.max(0, t.offsetLeft - 160);
    S.scrolled = true;
  }
}

function renderUser() {
  const box = $("#userBox");
  if (S.store?.mode === "local") { box.innerHTML = `<span class="role">本機試用・管理者</span>`; return; }
  if (!S.user) { box.innerHTML = `<button class="btn small" id="loginBtn">Google 登入</button>`; $("#loginBtn").onclick = login; return; }
  box.innerHTML = `<span>${esc(S.user.name)}</span><span class="role">${isAdmin() ? "主管" : canRead() ? "檢視" : "未開通"}</span><button class="btn small" id="logoutBtn">登出</button>`;
  $("#logoutBtn").onclick = () => S.store.signOut();
}
async function login() {
  try { await S.store.signIn(); } catch (e) { toast("登入失敗：" + (e.message || e.code)); }
}
function gateHtml() {
  if (!S.user) return `<div class="card login"><img src="icon.svg" width="56" height="56" alt=""><h2>智取店排班系統</h2>
    <p class="muted">請用公司同意的 Google 帳號登入</p><button class="btn primary" id="gateLogin">使用 Google 登入</button></div>`;
  return `<div class="card login"><h2>帳號尚未開通</h2><p class="muted">你目前登入的是<br><b>${esc(S.user.email)}</b></p>
    <p class="muted small">請把這個 Email 傳給主管，由主管在「設定 → 權限」加入後即可使用。</p>
    <button class="btn" id="gateOut">換一個帳號</button></div>`;
}
function bindGate() {
  $("#gateLogin")?.addEventListener("click", login);
  $("#gateOut")?.addEventListener("click", async () => { await S.store.signOut(); login(); });
}
function setupHtml() {
  if (!isAdmin()) return `<div class="card login"><h2>系統尚未設定</h2><p class="muted">主管還沒有匯入門市與人員資料。</p></div>`;
  return `<div class="card login"><h2>歡迎使用！第一次先匯入資料</h2>
    <p class="muted">會匯入 35 家智取店、榮華／中港二／公園 早晚班 6 個區塊的人員，以及「9_21排班.xlsx」裡 7～10 月已排好的班表。</p>
    <button class="btn primary" id="seedBtn">匯入初始資料</button>
    <p class="muted small" style="margin-top:14px">或匯入先前下載的備份檔：<input type="file" id="restoreFile" accept=".json"></p></div>`;
}
function bindSetup() {
  $("#seedBtn")?.addEventListener("click", importSeed);
  $("#restoreFile")?.addEventListener("change", importBackup);
}

/* ---------- 漏排總覽 ---------- */
function overviewHtml() {
  const A = analyze(), names = storeNames(), t = todayDs(), sh = S.ovShift === "pm" ? "pm" : "am";
  const start = ovStart(), days = [];
  for (let i = 0; i < 14; i++) { const ds = addDays(start, i), d = fromDs(ds); days.push({ ds, lbl: `${d.getMonth() + 1}/${d.getDate()}`, wd: WD[d.getDay()], we: d.getDay() === 0 || d.getDay() === 6, today: ds === t }); }
  const missOf = ds => names.filter(n => !A[ds]?.[sh]?.cov[n]);
  const perDay = Object.fromEntries(days.map(d => [d.ds, missOf(d.ds)]));
  const total = days.reduce((s, d) => s + perDay[d.ds].length, 0);
  const tdMiss = perDay[t] ? perDay[t].length : null;
  const rowsMiss = new Set(days.flatMap(d => perDay[d.ds]));
  const hubIdx = Object.fromEntries(hubs().map((h, i) => [h.id, i]));
  const list = names.filter(n => !S.onlyMissing || rowsMiss.has(n));
  const rows = list.map(n => `<tr><td class="sticky"><span class="sname h${hubIdx[storeHub(n)] % 6}">${esc(n)}</span></td>${days.map(d => {
    const c = A[d.ds]?.[sh]?.cov[n];
    const tip = `${dLabel(d.ds)} ${n} ${SHIFT[sh]}：${c ? c.map(e => e.name).join("、") : "尚未有人負責"}`;
    return `<td class="ck ${c ? "ok" : "no"} ${d.today ? "tcol" : ""}" data-ds="${d.ds}" data-store="${esc(n)}" title="${esc(tip)}">${c ? "✓" : "✕"}</td>`;
  }).join("")}</tr>`).join("");
  const range = `${days[0].lbl} — ${days[13].lbl}`;
  return `
  <div class="ovbar">
    ${["am", "pm"].map(k => `<button class="ovtab ${sh === k ? "on" : ""}" data-ovsh="${k}">總覽・${SHIFT[k]}</button>`).join("")}
  </div>
  <div class="row toolbar" style="margin:12px 0">
    <button class="btn" id="ovPrev">◀ 往前14天</button>
    <button class="btn" id="ovToday">回到今天</button>
    <button class="btn" id="ovNext">往後14天 ▶</button>
    <span class="muted">${range}</span>
    <span class="spacer"></span>
    <span class="ovsum">今天${SHIFT[sh]}漏排 <b class="${tdMiss ? "bad" : "good"}">${tdMiss ?? "—"}</b> 家・這 14 天共 <b class="${total ? "bad" : "good"}">${total}</b> 店次</span>
    <label class="small"><input type="checkbox" id="onlyMiss" ${S.onlyMissing ? "checked" : ""}> 只顯示有漏排的門市</label>
  </div>
  <div class="scroll"><table class="ov">
    <thead><tr><th class="sticky corner"></th>${days.map(d => `<th class="${d.today ? "today" : ""}">${d.lbl}<br>${d.wd}</th>`).join("")}</tr></thead>
    <tbody>${rows || `<tr><td class="sticky" colspan="15" style="padding:20px">這 14 天沒有漏排 🎉</td></tr>`}</tbody>
    <tfoot><tr><td class="sticky">漏排家數</td>${days.map(d => { const m = perDay[d.ds].length; return `<td class="${m ? "bad" : "good"}">${m || "✓"}</td>`; }).join("")}</tr></tfoot>
  </table></div>
  <div class="legend" style="margin-top:8px">${hubs().map((h, i) => `<span><i class="dot h${i % 6}"></i>${esc(h.name)}</span>`).join("")}<span>點 ✕ 可以直接指派人</span></div>`;
}

/* ---------- 排班表 ---------- */
function gridHtml() {
  const days = monthDays(S.ym), A = analyze(), b = blockBy(S.block) || blocks()[0];
  if (!b) return `<div class="card">尚未建立任何區塊</div>`;
  const q = S.search.trim();
  const emps = S.employees.filter(e => e.block === b.key && (e.active !== false || days.some(d => S.cells[d.ds + "_" + e.id])) && (!q || e.name.includes(q)));
  const chips = blocks().map(x => `<button class="chip ${x.key === b.key ? "on" : ""}" data-block="${x.key}">${esc(x.name)}</button>`).join("");
  const missRow = days.map(d => {
    const m = missingOf(A, d.ds, b.shift);
    const cls = m == null ? "idle" : m.length ? "bad" : "good";
    return `<th><button class="missbtn ${cls}" data-miss="${d.ds}" title="${m == null ? "尚未開始排" : m.length ? "漏排：" + m.join("、") : "全部排滿"}">${m == null ? "—" : m.length ? "漏" + m.length : "✓"}</button></th>`;
  }).join("");
  const rows = emps.map(e => {
    let work = 0, cnt = 0;
    const tds = days.map(d => {
      const v = S.cells[d.ds + "_" + e.id]; const p = parse(v);
      if (p.stores.length) { work++; cnt += p.stores.length; }
      const inner = p.off && !p.stores.length ? "休"
        : p.stores.map(s => `<span class="st">${esc(s)}</span>`).join("") + p.unknown.map(u => `<span class="st unk" title="無法辨識的門市名稱">${esc(u)}</span>`).join("") + (p.notes.length ? `<div class="note">${esc(p.notes.join(" "))}</div>` : "");
      const av = avOf(d.ds, e.id), bad = av && p.stores.length && avBad(av, b.shift);
      return `<td class="c ${p.off && !p.stores.length ? "off" : ""} ${av ? "hasav" : ""} ${bad ? "avbad" : ""}" data-e="${e.id}" data-ds="${d.ds}" title="${esc(e.name + " " + dLabel(d.ds) + (v ? "：" + v : "") + (av ? "\n" + AVL[av] : ""))}">${avTag(av)}${inner}</td>`;
    }).join("");
    return `<tr><td class="sticky">${esc(e.name)}${e.active === false ? ' <span class="muted small">(停用)</span>' : ""}</td>${tds}<td class="tot">${work}天<br><span class="small">${cnt}店次</span></td></tr>`;
  }).join("");
  return `
  <div class="row toolbar" style="margin-bottom:10px">${chips}</div>
  <div class="row toolbar" style="margin-bottom:10px">
    <input type="text" id="search" placeholder="搜尋姓名" value="${esc(S.search)}" style="width:140px">
    <span class="muted small">第二列是「${SHIFT[b.shift]}」全區漏排店數（含其他組支援），點一下看是哪幾家。</span>
    <span class="spacer"></span>
    ${isAdmin() ? `<button class="btn" id="copyWeek">複製週班表…</button>` : ""}
    <button class="btn" id="exportX">匯出 Excel</button>
    <button class="btn" onclick="window.print()">列印</button>
  </div>
  <div class="scroll"><table class="sg">
    <thead><tr><th class="sticky">${esc(b.name)}（${emps.length}人）</th>${days.map(d => `<th class="${d.today ? "today" : ""} ${d.we ? "we" : ""}">${d.d}<br>${d.wd}</th>`).join("")}<th>合計</th></tr>
    <tr class="missrow"><th class="sticky">${SHIFT[b.shift]}漏排</th>${missRow}<th></th></tr></thead>
    <tbody>${rows || `<tr><td class="sticky" style="padding:20px" colspan="${days.length + 2}">這個區塊還沒有人員，請到「設定 → 人員」新增。</td></tr>`}</tbody>
  </table></div>`;
}

/* ---------- 單日調度 ---------- */
function dayHtml() {
  const ds = S.day, A = analyze();
  const col = sh => {
    const m = missingOf(A, ds, sh);
    const bl = blocks().filter(b => b.shift === sh);
    let staff = "";
    for (const b of bl) {
      const list = S.employees.filter(e => e.block === b.key);
      const on = [], off = [], none = [];
      for (const e of list) {
        const v = S.cells[ds + "_" + e.id], p = parse(v);
        if (!v) { if (e.active !== false) none.push(e); }
        else if (p.off && !p.stores.length) off.push(e);
        else on.push([e, p]);
      }
      staff += `<div class="hubtitle">${esc(b.name)}</div>`;
      staff += on.map(([e, p]) => `<div class="staff"><span class="nm">${esc(e.name)}${avTag(avOf(ds, e.id))}</span><span>${p.stores.map(s => `<span class="st">${esc(s)}</span>`).join("")}${p.unknown.map(u => `<span class="st unk">${esc(u)}</span>`).join("")}${p.notes.length ? ` <span class="note">${esc(p.notes.join(" "))}</span>` : ""}</span>
        <span class="ct">${p.stores.length} 店 ${isAdmin() ? `<button class="btn small" data-edit="${e.id}">改</button>` : ""}</span></div>`).join("") || `<div class="muted small">今天沒有人上班</div>`;
      if (off.length) staff += `<div class="small muted" style="margin-top:4px">休：${off.map(e => esc(e.name)).join("、")}</div>`;
      if (none.length) staff += `<div class="small muted">未填：${none.map(e => (isAdmin() ? `<a href="#" data-edit="${e.id}">${esc(e.name)}</a>` : esc(e.name)) + avTag(avOf(ds, e.id))).join("、")}</div>`;
    }
    return `<div class="card"><h3>${SHIFT[sh]} ${m == null ? `<span class="muted small">（尚未開始排）</span>` : m.length ? `<span style="color:var(--miss)">漏排 ${m.length} 家</span>` : `<span style="color:var(--ok)">全部排滿 ✓</span>`}</h3>
      ${m?.length ? `<div class="misslist">${m.map(s => `<button class="mchip" data-assign="${esc(s)}" data-sh="${sh}">${esc(s)}</button>`).join("")}</div><div class="muted small">點紅色門市可以直接指派給今天上班的人</div>` : ""}
      ${staff}</div>`;
  };
  return `<div class="row toolbar" style="margin-bottom:12px">
      <button class="icon-btn" id="dPrev">‹</button>
      <input type="date" id="dPick" value="${isoOf(ds)}">
      <button class="icon-btn" id="dNext">›</button>
      <button class="btn" id="dToday">今天</button>
      <b style="margin-left:6px">${dLabel(ds)}</b>
    </div>
    <div class="daygrid">${col("am")}${col("pm")}</div>`;
}

/* ---------- 設定 ---------- */
function settingsHtml() {
  const stores = S.master.stores;
  const hubOpts = sel => hubs().map(h => `<option value="${h.id}" ${h.id === sel ? "selected" : ""}>${esc(h.name)}</option>`).join("");
  const blockOpts = sel => blocks().map(b => `<option value="${b.key}" ${b.key === sel ? "selected" : ""}>${esc(b.name)}</option>`).join("");
  const storeRows = hubs().map(h => stores.filter(s => s.hub === h.id).map(s => `<tr>
      <td><input type="text" value="${esc(s.name)}" data-srename="${esc(s.name)}" style="width:110px"></td>
      <td><select data-shub="${esc(s.name)}">${hubOpts(s.hub)}</select></td>
      <td><button class="btn small danger" data-sdel="${esc(s.name)}">刪除</button></td></tr>`).join("")).join("");
  const empSections = blocks().map(b => {
    const list = S.employees.filter(e => e.block === b.key);
    return `<details ${b.key === S.block ? "open" : ""}><summary style="cursor:pointer;padding:6px 0;font-weight:500">${esc(b.name)}（${list.length}）</summary>
      <table class="list"><tr><th>姓名</th><th>區塊</th><th>啟用</th><th></th></tr>
      ${list.map(e => `<tr><td><input type="text" value="${esc(e.name)}" data-ename="${e.id}" style="width:100px"></td>
        <td><select data-eblock="${e.id}">${blockOpts(e.block)}</select></td>
        <td><input type="checkbox" data-eact="${e.id}" ${e.active !== false ? "checked" : ""}></td>
        <td style="white-space:nowrap"><button class="btn small" data-eup="${e.id}">↑</button> <button class="btn small" data-edown="${e.id}">↓</button> <button class="btn small danger" data-edel="${e.id}">刪</button></td></tr>`).join("")}
      </table></details>`;
  }).join("");
  const aliasText = Object.entries(S.master.aliases || {}).map(([a, b]) => `${a}=${b}`).join("\n");
  const local = S.store.mode === "local";
  return `<div class="grid2">
  <div>
    <div class="card"><h3>門市（${stores.length} 家）</h3>
      <div class="row" style="margin-bottom:8px"><input type="text" id="newStore" placeholder="新門市名稱" style="width:120px"><select id="newStoreHub">${hubOpts()}</select><button class="btn primary" id="addStore">新增門市</button></div>
      <table class="list"><tr><th>名稱（改名會自動記錄舊名對照）</th><th>組別</th><th></th></tr>${storeRows}</table>
    </div>
    <div class="card"><h3>錯字／舊名對照</h3>
      <p class="muted small">一行一組，格式「寫法=正確門市」。排班格子裡出現左邊的字，會自動當成右邊的門市。</p>
      <textarea id="aliases">${esc(aliasText)}</textarea>
      <div class="row" style="margin-top:8px"><button class="btn primary" id="saveAliases">儲存對照表</button></div>
    </div>
  </div>
  <div>
    <div class="card"><h3>人員</h3>
      <div class="row" style="margin-bottom:8px"><input type="text" id="newEmp" placeholder="姓名" style="width:100px"><select id="newEmpBlock">${blockOpts(S.block)}</select><button class="btn primary" id="addEmp">新增人員</button></div>
      <p class="muted small">離職或暫停的人把「啟用」取消即可，歷史班表會保留。</p>
      ${empSections}
    </div>
    <div class="card"><h3>權限</h3>
      ${local ? `<p class="muted small">本機試用模式沒有權限控管。設定好 Firebase 後才會生效。</p>` : ""}
      <p class="small">最高管理者：<b>${esc(S.store.owner)}</b></p>
      <label class="small">其他主管（可編輯）Email，一行一個</label>
      <textarea id="admins">${esc((S.access.admins || []).join("\n"))}</textarea>
      <label class="small">檢視者（只能看）Email，一行一個</label>
      <textarea id="viewers">${esc((S.access.viewers || []).join("\n"))}</textarea>
      <label class="small"><input type="checkbox" id="publicRead" ${S.publicRead ? "checked" : ""}> 不用登入也能看班表（任何拿到網址的人都能看，但不能改）</label>
      <div class="row" style="margin-top:8px"><button class="btn primary" id="saveAccess" ${local ? "disabled" : ""}>儲存權限</button></div>
    </div>
    <div class="card"><h3>資料</h3>
      <div class="row">
        <button class="btn" id="backup">下載備份（JSON）</button>
        <label class="btn">從備份還原<input type="file" id="restoreFile" accept=".json" hidden></label>
        <button class="btn danger" id="seedBtn">重新匯入初始資料</button>
      </div>
      <p class="muted small">「重新匯入初始資料」會把門市、人員和 7～10 月班表覆蓋回 9_21排班.xlsx 的內容。</p>
    </div>
  </div></div>`;
}

/* ================= 事件 ================= */
function bindMain() {
  main.onclick = onMainClick;
  main.onchange = onMainChange;
  const s = $("#search");
  if (s) s.oninput = e => { S.search = e.target.value; const pos = e.target.selectionStart; render(); const n = $("#search"); n.focus(); n.setSelectionRange(pos, pos); };
}
function onMainClick(e) {
  const t = e.target;
  const q = sel => t.closest(sel);
  let el;
  if ((el = q("[data-ovsh]"))) { S.ovShift = el.dataset.ovsh; render(); return; }
  if ((el = q("td.ck"))) { openAssign(el.dataset.store, el.dataset.ds, S.ovShift === "pm" ? "pm" : "am"); return; }
  if ((el = q("#ovPrev"))) { setOvStart(addDays(ovStart(), -14)); return; }
  if ((el = q("#ovNext"))) { setOvStart(addDays(ovStart(), 14)); return; }
  if ((el = q("#ovToday"))) { setOvStart(mondayOf(todayDs())); return; }
  if ((el = q("[data-block]"))) { S.block = el.dataset.block; render(); return; }
  if ((el = q("td.c"))) { if (isAdmin()) openCellEditor(el.dataset.e, el.dataset.ds); return; }
  if ((el = q("[data-miss]"))) { openMissList(el.dataset.miss, blockBy(S.block).shift); return; }
  if ((el = q("#copyWeek"))) { openCopyWeek(); return; }
  if ((el = q("#exportX"))) { exportExcel(); return; }
  if ((el = q("#dPrev"))) { goDay(addDays(S.day, -1)); return; }
  if ((el = q("#dNext"))) { goDay(addDays(S.day, 1)); return; }
  if ((el = q("#dToday"))) { goDay(todayDs()); return; }
  if ((el = q("[data-assign]"))) { openAssign(el.dataset.assign, S.day, el.dataset.sh); return; }
  if ((el = q("[data-edit]"))) { e.preventDefault(); openCellEditor(el.dataset.edit, S.day); return; }
  // 設定
  if ((el = q("#lvOpen"))) return leaveOpen(true);
  if ((el = q("#lvClose"))) return leaveOpen(false);
  if ((el = q("#lvImport"))) return leaveImport();
  if ((el = q("#lvCopy"))) { const i = $("#lvLink"); i.select(); navigator.clipboard?.writeText(i.value).then(() => toast("已複製網址"), () => toast("請手動複製")); return; }
  if ((el = q("#addStore"))) return addStore();
  if ((el = q("[data-sdel]"))) return delStore(el.dataset.sdel);
  if ((el = q("#saveAliases"))) return saveAliases();
  if ((el = q("#addEmp"))) return addEmp();
  if ((el = q("[data-eup]"))) return moveEmp(el.dataset.eup, -1);
  if ((el = q("[data-edown]"))) return moveEmp(el.dataset.edown, 1);
  if ((el = q("[data-edel]"))) return delEmp(el.dataset.edel);
  if ((el = q("#saveAccess"))) return saveAccess();
  if ((el = q("#backup"))) return backup();
  if ((el = q("#seedBtn"))) return importSeed();
}
function onMainChange(e) {
  const t = e.target;
  if (t.id === "onlyMiss") { S.onlyMissing = t.checked; render(); return; }
  if (t.id === "lvYm" && t.value) { S.leaveYmSel = t.value; watchLeaveList(); render(); return; }
  if (t.id === "dPick" && t.value) { goDay(t.value.replace(/-/g, "")); return; }
  if (t.id === "restoreFile") return importBackup(e);
  if (t.dataset.srename !== undefined) return renameStore(t.dataset.srename, t.value.trim());
  if (t.dataset.shub !== undefined) return patchStore(t.dataset.shub, { hub: t.value });
  if (t.dataset.ename) return patchEmp(t.dataset.ename, { name: t.value.trim() });
  if (t.dataset.eblock) return patchEmp(t.dataset.eblock, { block: t.value });
  if (t.dataset.eact) return patchEmp(t.dataset.eact, { active: t.checked });
}
function goDay(ds) {
  S.day = ds;
  if (ymOf(ds) !== S.ym) { S.ym = ymOf(ds); watchMonth(); }
  render();
}

/* ================= 對話框 ================= */
function openModal(html) {
  $("#modalRoot").innerHTML = `<div class="modal-bg"><div class="modal">${html}</div></div>`;
  const bg = $("#modalRoot .modal-bg");
  bg.addEventListener("mousedown", e => { if (e.target === bg) closeModal(); });
  return $("#modalRoot .modal");
}
function closeModal() { $("#modalRoot").innerHTML = ""; }
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2200);
}
async function writeCells(ym, map) {
  try { await S.store.setCells(ym, map); return true; }
  catch (e) { toast("儲存失敗：" + (e.code === "permission-denied" ? "沒有編輯權限" : e.message)); return false; }
}

// 編輯某人某天的格子
function openCellEditor(eid, ds) {
  const e = empBy(eid); if (!e) return;
  const b = blockBy(e.block);
  const key = ds + "_" + eid;
  const orig = S.cells[key] || "";
  const p = parse(orig);
  const st = { stores: [...p.stores], off: p.off, note: [...p.unknown, ...p.notes].join(" ") };
  const m = openModal("");
  const draw = () => {
    const A = analyze();
    const cov = A[ds]?.[b.shift]?.cov || {};
    const order = [e.block && b.hub, ...hubs().map(h => h.id).filter(h => h !== b.hub)];
    const groups = order.map(h => {
      const list = storeNames().filter(s => storeHub(s) === h);
      return `<div class="pgroup">${esc(hubName(h))}</div><div class="picker">${list.map(s => {
        const others = (cov[s] || []).filter(x => x.id !== eid);
        const on = st.stores.includes(s);
        return `<button class="pbtn ${on ? "on" : others.length ? "" : "need"}" data-s="${esc(s)}">${esc(s)}<small>${others.length ? esc(others.map(x => x.name).join("、")) : "未排"}</small></button>`;
      }).join("")}</div>`;
    }).join("");
    m.innerHTML = `<h2>${esc(e.name)}・${dLabel(ds)}</h2>
      <div class="sub">${esc(b.name)}｜紅框＝這班還沒人負責的門市，灰字＝已經由誰負責${avOf(ds, eid) ? `<br><b class="avline av-${avOf(ds, eid)}">${AVL[avOf(ds, eid)]}</b>` : ""}</div>
      <div class="row"><button class="btn ${st.off ? "primary" : ""}" id="cOff">休假 (X)</button><button class="btn" id="cClear">清空</button>
        <span class="muted small">目前：<b>${esc(compose(st.stores, st.off, st.note) || "（空白）")}</b></span></div>
      ${groups}
      <label class="small muted">備註（例如：支援福壽、開學）</label>
      <input type="text" id="cNote" value="${esc(st.note)}" style="width:100%">
      <div class="actions"><button class="btn" id="cPrev">‹ 前一天</button><button class="btn" id="cNext">後一天 ›</button>
        <span class="spacer"></span><button class="btn" id="cCancel">取消</button><button class="btn primary" id="cSave">儲存</button></div>`;
  };
  draw();
  const save = async () => {
    st.note = m.querySelector("#cNote").value;
    const v = compose(st.stores, st.off, st.note);
    if (v !== orig) { if (!(await writeCells(ymOf(ds), { [key]: v }))) return false; toast("已儲存"); }
    return true;
  };
  m.onclick = async ev => {
    const t = ev.target.closest("button"); if (!t) return;
    if (t.dataset.s) {
      st.note = m.querySelector("#cNote").value;
      const s = t.dataset.s;
      st.stores = st.stores.includes(s) ? st.stores.filter(x => x !== s) : [...st.stores, s];
      if (st.stores.length) st.off = false;
      draw(); return;
    }
    if (t.id === "cOff") { st.note = m.querySelector("#cNote").value; st.off = !st.off; if (st.off) st.stores = []; draw(); }
    if (t.id === "cClear") { st.stores = []; st.off = false; st.note = ""; draw(); }
    if (t.id === "cCancel") closeModal();
    if (t.id === "cSave") { if (await save()) closeModal(); }
    if (t.id === "cPrev" || t.id === "cNext") {
      const nd = addDays(ds, t.id === "cPrev" ? -1 : 1);
      if (!(await save())) return;
      if (!S.monthCells[ymOf(nd)]) { closeModal(); return toast("已到月份邊界"); }
      openCellEditor(eid, nd);
    }
  };
  m.onkeydown = async ev => { if (ev.key === "Enter" && ev.target.id === "cNote") { if (await save()) closeModal(); } };
}

// 指派某門市某天某班
function openAssign(store, ds, sh) {
  const m = openModal("");
  const draw = () => {
    const A = analyze();
    const cur = A[ds]?.[sh]?.cov?.[store] || [];
    const hub = storeHub(store);
    const cands = S.employees.filter(e => blockBy(e.block)?.shift === sh && !cur.some(c => c.id === e.id)).map(e => {
      const v = S.cells[ds + "_" + e.id], p = parse(v);
      const av = avOf(ds, e.id);
      let status = !v ? (e.active === false ? -1 : 1) : p.off && !p.stores.length ? 2 : 0;
      if (status >= 0 && avBad(av, sh) && status < 2) status = 3;
      return { e, p, status, av, same: blockBy(e.block).hub === hub };
    }).filter(c => c.status >= 0).sort((a, b) => a.status - b.status || (b.same - a.same) || a.p.stores.length - b.p.stores.length);
    const lbl = ["上班中", "未填", "休假", "畫休不能上"];
    m.innerHTML = `<h2>${esc(store)}・${dLabel(ds)} ${SHIFT[sh]}</h2>
      <div class="sub">${esc(hubName(hub))}｜${cur.length ? "目前負責：" + cur.map(x => esc(x.name)).join("、") : `<b style="color:var(--miss)">尚未有人負責</b>`}</div>
      ${cur.length && isAdmin() ? `<div class="row" style="margin-bottom:10px">${cur.map(x => `<button class="btn small danger" data-rm="${x.id}">把 ${esc(x.name)} 移除</button>`).join("")}</div>` : ""}
      ${isAdmin() ? `<div class="pgroup">指派給（同組、今天上班、負責店數少的排前面）</div>
      <table class="list">${cands.map(c => `<tr><td><b>${esc(c.e.name)}</b>${avTag(c.av)} <span class="muted small">${esc(blockBy(c.e.block).name)}</span></td>
        <td>${c.p.stores.map(s => `<span class="st">${esc(s)}</span>`).join("") || `<span class="muted small">${lbl[c.status]}</span>`}</td>
        <td style="text-align:right"><button class="btn small ${c.status === 0 ? "primary" : ""}" data-add="${c.e.id}">指派</button></td></tr>`).join("")}</table>` : ""}
      <div class="actions"><span class="spacer"></span><button class="btn" id="aClose">關閉</button></div>`;
  };
  draw();
  m.onclick = async ev => {
    const t = ev.target.closest("button"); if (!t) return;
    if (t.id === "aClose") return closeModal();
    const id = t.dataset.add || t.dataset.rm; if (!id) return;
    const key = ds + "_" + id, p = parse(S.cells[key]);
    let stores = p.stores;
    if (t.dataset.add) {
      if (p.off && !p.stores.length && !confirm("這個人這天是休假，確定要改成上班並指派嗎？")) return;
      stores = [...stores, store];
      p.off = false;
    } else stores = stores.filter(s => s !== store);
    const v = compose(stores, p.off, [...p.unknown, ...p.notes].join(" "));
    if (await writeCells(ymOf(ds), { [key]: v })) { toast(t.dataset.add ? `已指派給 ${empBy(id).name}` : "已移除"); closeModal(); }
  };
}

function openMissList(ds, sh) {
  const m = missingOf(analyze(), ds, sh);
  const mm = openModal(`<h2>${dLabel(ds)} ${SHIFT[sh]}漏排</h2>
    <div class="sub">${m == null ? "這天這班還沒有任何人排班。" : m.length ? "點門市可直接指派" : "全部排滿 ✓"}</div>
    <div class="misslist">${(m || []).map(s => `<button class="mchip" data-s="${esc(s)}">${esc(s)}</button>`).join("")}</div>
    <div class="actions"><span class="spacer"></span><button class="btn" id="mClose">關閉</button></div>`);
  mm.onclick = ev => {
    const t = ev.target.closest("button"); if (!t) return;
    if (t.id === "mClose") return closeModal();
    if (t.dataset.s) openAssign(t.dataset.s, ds, sh);
  };
}

// 複製一週班表到另一週
function openCopyWeek() {
  const base = fromDs(S.day); const dow = (base.getDay() + 6) % 7;
  base.setDate(base.getDate() - dow + 7); // 下週一
  const dst = toDs(base), src = addDays(dst, -7);
  const m = openModal(`<h2>複製週班表</h2>
    <div class="sub">把「來源週」7 天的班表，照星期對應複製到「目標週」。</div>
    <div class="row" style="margin-bottom:8px"><label>來源週（從這天起 7 天）<br><input type="date" id="wSrc" value="${isoOf(src)}"></label>
      <label>目標週（從這天起 7 天）<br><input type="date" id="wDst" value="${isoOf(dst)}"></label></div>
    <div class="row" style="margin-bottom:8px"><label><input type="radio" name="wScope" value="block" checked> 只有「${esc(blockBy(S.block).name)}」</label>
      <label><input type="radio" name="wScope" value="all"> 全部 6 個區塊</label></div>
    <label><input type="checkbox" id="wOver"> 目標週已經有填的格子也覆蓋（不勾＝只填空白格）</label>
    <div class="actions"><span class="spacer"></span><button class="btn" id="wCancel">取消</button><button class="btn primary" id="wGo">開始複製</button></div>`);
  m.onclick = async ev => {
    const t = ev.target.closest("button"); if (!t) return;
    if (t.id === "wCancel") return closeModal();
    if (t.id !== "wGo") return;
    const s0 = m.querySelector("#wSrc").value.replace(/-/g, ""), d0 = m.querySelector("#wDst").value.replace(/-/g, "");
    if (!s0 || !d0) return toast("請選日期");
    const all = m.querySelector("input[name=wScope]:checked").value === "all", over = m.querySelector("#wOver").checked;
    const emps = S.employees.filter(e => e.active !== false && (all || e.block === S.block));
    t.disabled = true; t.textContent = "複製中…";
    const cache = {};
    const monthCells = async ym => cache[ym] || (cache[ym] = ym === S.ym ? { ...S.cells } : await S.store.readMonth(ym));
    const writes = {}; let n = 0;
    for (let i = 0; i < 7; i++) {
      const sd = addDays(s0, i), dd = addDays(d0, i);
      const sc = await monthCells(ymOf(sd)), dc = await monthCells(ymOf(dd));
      for (const e of emps) {
        const v = sc[sd + "_" + e.id]; if (!v) continue;
        if (!over && dc[dd + "_" + e.id]) continue;
        (writes[ymOf(dd)] || (writes[ymOf(dd)] = {}))[dd + "_" + e.id] = v; n++;
      }
    }
    for (const [ym, map] of Object.entries(writes)) if (!(await writeCells(ym, map))) return;
    closeModal(); toast(`已複製 ${n} 格`);
  };
}

/* ================= 設定動作 ================= */
const saveMaster = async m => { try { await S.store.saveMaster(m); } catch (e) { toast("儲存失敗：" + e.message); } };
const saveEmps = async l => { try { await S.store.saveEmployees(l); } catch (e) { toast("儲存失敗：" + e.message); } };
function addStore() {
  const name = $("#newStore").value.trim(), hub = $("#newStoreHub").value;
  if (!name) return toast("請輸入門市名稱");
  if (S.master.stores.some(s => s.name === name)) return toast("已有這家門市");
  saveMaster({ ...S.master, stores: [...S.master.stores, { name, hub }] }); toast("已新增 " + name);
}
function delStore(name) {
  if (!confirm(`確定刪除「${name}」？之後排班表上寫這家店的字會變成無法辨識（橘色）。`)) return;
  saveMaster({ ...S.master, stores: S.master.stores.filter(s => s.name !== name) });
}
function patchStore(name, patch) { saveMaster({ ...S.master, stores: S.master.stores.map(s => s.name === name ? { ...s, ...patch } : s) }); }
function renameStore(old, nw) {
  if (!nw || nw === old) return render();
  if (S.master.stores.some(s => s.name === nw)) { toast("已有同名門市"); return render(); }
  const aliases = { ...(S.master.aliases || {}), [old]: nw };
  saveMaster({ ...S.master, aliases, stores: S.master.stores.map(s => s.name === old ? { ...s, name: nw } : s) });
  toast(`已改名，舊班表上的「${old}」會自動算成「${nw}」`);
}
function saveAliases() {
  const aliases = {};
  for (const line of $("#aliases").value.split("\n")) {
    const [a, b] = line.split("=").map(x => (x || "").trim());
    if (a && b) aliases[a] = b;
  }
  saveMaster({ ...S.master, aliases }); toast("已儲存對照表");
}
function addEmp() {
  const name = $("#newEmp").value.trim(), block = $("#newEmpBlock").value;
  if (!name) return toast("請輸入姓名");
  saveEmps([...S.employees, { id: "e" + Date.now().toString(36), name, block, active: true }]); toast("已新增 " + name);
}
function patchEmp(id, patch) {
  if (patch.name === "") return render();
  saveEmps(S.employees.map(e => e.id === id ? { ...e, ...patch } : e));
}
function moveEmp(id, dir) {
  const l = [...S.employees], i = l.findIndex(e => e.id === id), blk = l[i].block;
  let j = i + dir;
  while (j >= 0 && j < l.length && l[j].block !== blk) j += dir;
  if (j < 0 || j >= l.length) return;
  [l[i], l[j]] = [l[j], l[i]]; saveEmps(l);
}
function delEmp(id) {
  const e = empBy(id);
  if (!confirm(`確定刪除「${e.name}」？他的歷史班表也會一起不顯示。只是離職的話，建議取消「啟用」就好。`)) return;
  saveEmps(S.employees.filter(x => x.id !== id));
}
async function saveAccess() {
  const list = id => [...new Set($(id).value.split(/[\s,;]+/).map(x => x.trim().toLowerCase()).filter(x => x.includes("@")))];
  try { await S.store.saveAccess({ admins: list("#admins"), viewers: list("#viewers"), publicRead: $("#publicRead").checked }); toast("已儲存權限"); }
  catch (e) { toast("儲存失敗：" + e.message); }
}
async function importSeed() {
  if (S.master && !confirm("這會用 9_21排班.xlsx 的內容覆蓋目前的門市、人員與 7～10 月班表，確定嗎？")) return;
  try {
    const r = await fetch("seed.json", { cache: "no-store" });
    const data = await r.json();
    await S.store.importAll(data); toast("已匯入初始資料");
    setMonth(S.ym);
  } catch (e) { toast("匯入失敗：" + e.message); }
}
async function backup() {
  toast("整理備份中…");
  const months = {};
  for (let i = -12; i <= 6; i++) { const ym = shiftYm(S.ym, i); const c = await S.store.readMonth(ym); if (Object.keys(c).length) months[ym] = c; }
  const data = { version: 1, exportedAt: new Date().toISOString(), ...S.master, employees: S.employees, months };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
  a.download = `智取排班備份_${todayDs()}.json`; a.click();
}
async function importBackup(e) {
  const f = e.target.files[0]; if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!data.stores || !data.employees) throw new Error("檔案格式不對");
    if (!confirm(`要用備份檔還原嗎？（門市 ${data.stores.length} 家、人員 ${data.employees.length} 位、${Object.keys(data.months || {}).length} 個月班表）`)) return;
    await S.store.importAll(data); toast("已還原"); setMonth(S.ym);
  } catch (err) { toast("還原失敗：" + err.message); }
}

/* ================= 匯出 Excel ================= */
async function exportExcel() {
  if (!window.XLSX) {
    toast("載入 Excel 元件中…");
    await new Promise((ok, bad) => { const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"; s.onload = ok; s.onerror = bad; document.head.appendChild(s); });
  }
  const X = window.XLSX, wb = X.utils.book_new(), days = monthDays(S.ym), A = analyze();
  const head = ["", ...days.map(d => `${d.d}(${d.wd})`)];
  const miss = [head];
  for (const sh of ["am", "pm"]) miss.push([`${SHIFT[sh]}漏排`, ...days.map(d => { const m = missingOf(A, d.ds, sh); return m == null ? "未排" : m.join(" ") || "✓"; })]);
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(miss), "漏排");
  for (const b of blocks()) {
    const rows = [[b.name, ...head.slice(1)]];
    for (const e of S.employees.filter(e => e.block === b.key)) {
      const r = [e.name, ...days.map(d => S.cells[d.ds + "_" + e.id] || "")];
      if (e.active !== false || r.slice(1).some(Boolean)) rows.push(r);
    }
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(rows), b.name.slice(0, 30));
  }
  X.writeFile(wb, `智取排班_${S.ym}.xlsx`);
}

/* ================= 畫休（主管端） ================= */
const AV = { off: "休", am: "早", pm: "晚", any: "皆" };
const AVL = { off: "畫休：休假", am: "畫休：只能早班", pm: "畫休：只能晚班", any: "畫休：早晚都可以" };
const avOf = (ds, eid) => (S.avail || {})[ds + "_" + eid];
// 畫休和這個班別衝突嗎（休假、或只能另一個班）
const avBad = (av, shift) => av === "off" || (av === "am" && shift === "pm") || (av === "pm" && shift === "am");
const avTag = av => av ? `<span class="av av-${av}" title="${AVL[av]}">${AV[av]}</span>` : "";
function nextYm() { const d = new Date(); return `${new Date(d.getFullYear(), d.getMonth() + 1, 1).getFullYear()}-${pad(new Date(d.getFullYear(), d.getMonth() + 1, 1).getMonth() + 1)}`; }
function leaveYm() { return S.leaveYmSel || S.leaveCfg?.ym || nextYm(); }
function watchLeave() {
  if (!isAdmin() || !S.store?.watchDoc) return;
  if (!S.leaveCfgSub) { S.leaveCfgSub = () => {}; const u = S.store.watchDoc("config/leave", c => { S.leaveCfg = c; setTimeout(() => { watchLeaveList(); if (S.tab === "leave") render(); }); }); S.leaveCfgSub = u; }
  watchLeaveList();
}
function watchLeaveList() {
  const ym = leaveYm();
  if (S.leavesYm === ym) return;
  if (S.leavesSub) S.leavesSub();
  S.leavesYm = ym; S.leaves = undefined;
  S.leavesSub = S.store.watchLeaves(ym, l => { if (S.leavesYm !== ym) return; S.leaves = l; if (S.tab === "leave") setTimeout(render); });
}
function leaveLink() { return location.href.split("#")[0].split("?")[0].replace(/[^/]*$/, "") + "leave.html"; }
function leaveHtml() {
  watchLeave();
  const c = S.leaveCfg, ym = leaveYm(), open = !!(c && c.open && c.ym === ym);
  const days = monthDays(ym), subs = S.leaves || [];
  const byE = Object.fromEntries(subs.map(x => [x.eid, x]));
  const act = S.employees.filter(e => e.active !== false);
  const done = act.filter(e => byE[e.id]), todo = act.filter(e => !byE[e.id]);
  const table = blocks().map(b => {
    const list = S.employees.filter(e => e.block === b.key && (e.active !== false || byE[e.id]));
    if (!list.length) return "";
    return `<tr class="hub"><td class="sticky" colspan="2">${esc(b.name)}</td><td colspan="${days.length}"></td></tr>` + list.map(e => {
      const x = byE[e.id], t = x?.submittedAt ? new Date(x.submittedAt) : null;
      return `<tr><td class="sticky">${esc(e.name)}${x?.note ? ` <span class="notei" title="${esc(x.note)}">💬</span>` : ""}</td>
        <td class="sub">${t ? `${t.getMonth() + 1}/${t.getDate()} ${pad(t.getHours())}:${pad(t.getMinutes())}${x.late ? ' <span class="late">逾期</span>' : ""}` : '<span class="todo">未送出</span>'}</td>
        ${days.map(d => { const v = x?.days?.[d.ds]; return `<td class="lvc ${v ? "c-" + v : ""}">${v ? AV[v] : ""}</td>`; }).join("")}</tr>`;
    }).join("");
  }).join("");
  const [yy, mm] = ym.split("-");
  return `<div class="grid2">
    <div class="card"><h3>畫休設定 ${open ? '<span class="okpill">開放中</span>' : '<span class="todo">未開放</span>'}</h3>
      <div class="row"><label>畫休月份<br><input type="month" id="lvYm" value="${ym}"></label>
        <label>截止日<br><input type="date" id="lvDl" value="${c?.ym === ym && c.deadline ? isoOf(c.deadline) : ""}"></label>
        <label>每人最多休幾天<br><input type="text" id="lvMax" inputmode="numeric" style="width:80px" value="${c?.ym === ym && c.maxOff ? c.maxOff : ""}" placeholder="不限"></label></div>
      <label class="small muted" style="display:block;margin-top:8px">給員工的說明（選填）</label>
      <input type="text" id="lvMsg" style="width:100%" value="${esc(c?.ym === ym ? c.note || "" : "")}" placeholder="例如：國定假日請優先排班">
      <div class="row" style="margin-top:12px">
        <button class="btn primary" id="lvOpen">${open ? "更新設定" : "開放畫休"}</button>
        ${open ? '<button class="btn danger" id="lvClose">關閉畫休</button>' : ""}
      </div>
      <p class="muted small">開放時會把目前「啟用」的人員名單給員工選。關閉後員工就不能再改。</p>
    </div>
    <div class="card"><h3>給員工的畫休網址</h3>
      <div class="row"><input type="text" readonly id="lvLink" style="flex:1;min-width:0" value="${esc(leaveLink())}"><button class="btn" id="lvCopy">複製</button></div>
      <p class="muted small">傳到群組就可以，員工不用登入：選自己的名字 → 點日期畫休 → 送出。</p>
      <h3 style="margin-top:16px">${+yy}年${+mm}月 回收狀況</h3>
      <div class="kpis" style="margin-bottom:8px"><div class="kpi"><div class="label">已送出</div><div class="value good">${done.length}<span class="muted" style="font-size:14px"> / ${act.length}</span></div></div>
        <div class="kpi"><div class="label">未送出</div><div class="value ${todo.length ? "bad" : "good"}">${todo.length}</div></div></div>
      ${todo.length ? `<div class="small muted">未送出：${todo.map(e => esc(e.name)).join("、")}</div>` : ""}
      <div class="row" style="margin-top:12px"><button class="btn primary big" id="lvImport" ${subs.length ? "" : "disabled"}>一鍵匯入排班表</button>
        ${c?.importedAt && c.ym === ym ? `<span class="small muted">上次匯入 ${new Date(c.importedAt).toLocaleString("zh-TW", { hour12: false })}</span>` : ""}</div>
      <p class="muted small">員工一送出，排班表格子右上角就會出現畫休標記（休／早／晚／皆），不用等匯入。按這個鍵是把<b>休假日直接填成 X</b>（已經排了店的格子不會蓋掉），可以重複按。</p>
    </div></div>
    <div class="legend">${Object.entries(AVL).map(([k, v]) => `<span><i class="c-${k}"></i>${v.replace("畫休：", "")}</span>`).join("")}</div>
    <div class="scroll"><table class="lvt">
      <thead><tr><th class="sticky">姓名</th><th>送出時間</th>${days.map(d => `<th class="${d.we ? "we" : ""}">${d.d}<br>${d.wd}</th>`).join("")}</tr></thead>
      <tbody>${S.leaves === undefined ? `<tr><td class="sticky" colspan="${days.length + 2}" style="padding:20px">載入中…</td></tr>` : table}</tbody>
    </table></div>`;
}
async function leaveOpen(open) {
  const ym = $("#lvYm").value || leaveYm();
  const dl = $("#lvDl").value.replace(/-/g, ""), max = parseInt($("#lvMax").value, 10) || 0, note = $("#lvMsg").value.trim();
  const roster = S.employees.filter(e => e.active !== false).map(e => ({ id: e.id, name: e.name, block: e.block, blockName: blockBy(e.block)?.name || "" }));
  const prev = S.leaveCfg?.ym === ym ? S.leaveCfg : {};
  try {
    await S.store.setDocAt("config/leave", { ...prev, ym, deadline: dl, maxOff: max, note, roster, open, updatedAt: new Date().toISOString() });
    toast(open ? "已開放畫休，把網址傳給員工吧" : "已關閉畫休");
  } catch (e) { toast("儲存失敗：" + e.message); }
}
async function leaveImport() {
  const ym = leaveYm(), subs = S.leaves || [];
  if (!subs.length) return;
  const offN = subs.reduce((n, x) => n + Object.values(x.days || {}).filter(v => v === "off").length, 0);
  if (!confirm(`把 ${subs.length} 人的畫休匯入 ${ym} 排班表？\n休假日共 ${offN} 格會填上 X（已排店的格子不會被蓋掉）。`)) return;
  try {
    const cells = S.monthCells?.[ym] || await S.store.readMonth(ym);
    const old = await new Promise(ok => { const u = S.store.watchDoc(`avail/${ym}`, d => { setTimeout(() => u && u(), 0); ok(d?.cells || {}); }); });
    const avail = {}, write = {}, clash = [];
    for (const x of subs) for (const [ds, code] of Object.entries(x.days || {})) {
      if (!ds.startsWith(ym.replace("-", ""))) continue;
      const k = ds + "_" + x.eid; avail[k] = code;
      if (code === "off") {
        const p = parse(cells[k]);
        if (!cells[k]) write[k] = "X";
        else if (p.stores.length) clash.push(`${x.name} ${dLabel(ds)}（已排 ${p.stores.join("、")}）`);
      }
    }
    // 之前匯入是休、現在取消了 → 把系統填的 X 拿掉
    for (const [k, code] of Object.entries(old)) if (code === "off" && avail[k] !== "off" && cells[k] === "X") write[k] = "";
    await S.store.setDocAt(`avail/${ym}`, { cells: avail, importedAt: new Date().toISOString() });
    if (Object.keys(write).length) await S.store.setCells(ym, write);
    if (S.leaveCfg?.ym === ym) await S.store.setDocAt("config/leave", { importedAt: new Date().toISOString() }, true);
    const n = Object.values(write).filter(Boolean).length;
    const mm = openModal(`<h2>匯入完成</h2><div class="sub">${ym}：填入 ${n} 格休假，${Object.keys(avail).length} 筆畫休已顯示在排班表上。</div>
      ${clash.length ? `<p style="color:var(--warn)"><b>${clash.length} 格有衝突</b>（員工要休，但那天已經排了店，沒有蓋掉）：</p><div class="small">${clash.map(esc).join("<br>")}</div>` : ""}
      <div class="actions"><span class="spacer"></span><button class="btn" id="imClose">關閉</button><button class="btn primary" id="imGo">前往排班表</button></div>`);
    mm.onclick = ev => { const t = ev.target.closest("button"); if (!t) return; closeModal(); if (t.id === "imGo") { S.ym = ym; setTab("grid"); } };
  } catch (e) { toast("匯入失敗：" + e.message); }
}
