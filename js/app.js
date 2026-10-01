/* 學員前台 */
const app = $("#app");
const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  sget(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return null; } },
  sset(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
let cfg = { show_results: true, randomize: false, secondary_gap: 10, locks: {} };
let adaptMap = {};
let clientId = store.get("disc_client");
if (!clientId) { clientId = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()); store.set("disc_client", clientId); }

const FEATURES = [
  { id: "tools", no: "01", name: "解密工具", desc: "掌握 DiSC 的原理與應用：教材、圖文、影音一次看。", t: "D", icon: "📖" },
  { id: "self", no: "02", name: "看懂自己", desc: "15 題自我測評，發現「原來我在別人眼中是這樣！」", t: "I", icon: "🪞" },
  { id: "others", no: "03", name: "識別他人", desc: "從生活中的行為線索，觀察他人的風格與溝通偏好。", t: "S", icon: "🔍" },
  { id: "adapt", no: "04", name: "彈性調適", desc: "依對方風格調整溝通，讓你的想法更容易被接受。", t: "C", icon: "🧭" }
];
const isUnlocked = f => !cfg.locks[f] || store.sget("unlocked_" + f) === true;

/* 首頁文字（可由後台「首頁內容」編輯）*/
let SITE = {};           // site_content 全部資料（home / intro_self / intro_others）
let HOME = getHome({});
function applyHome() {
  FEATURES.forEach(f => Object.assign(f, HOME.features[f.id]));
  $("#brandName").textContent = HOME.siteName; document.title = HOME.siteName;
  const c = HOME.copyright;
  $("#siteFooter").innerHTML =
    (c.enabled && (c.title || c.text) ? `<div class="copyright-plain">${c.title ? `<b>${esc(c.title)}</b> ` : ""}${md(c.text || "")}</div>` : "") +
    `<p class="muted small" style="text-align:center"><a href="admin.html">${esc(HOME.adminLinkText)}</a></p>`;
}

/* ---------- 路由 ---------- */
async function route() {
  const [, page, arg] = (location.hash || "#/").split("/");
  window.scrollTo(0, 0);
  try {
    if (!page) return home();
    const f = FEATURES.find(x => x.id === page);
    if (!f) return home();
    if (!isUnlocked(f.id)) { home(); return askUnlock(f); }
    if (page === "tools") return arg ? toolsArticle(arg) : toolsList();
    if (page === "self") return selfPage();
    if (page === "others") return othersPage();
    if (page === "adapt") return adaptPage();
  } catch (e) { console.error(e); app.innerHTML = `<div class="card"><h2>載入失敗</h2><p class="muted">${esc(e.message)}</p><button onclick="route()">重試</button></div>`; }
}
window.addEventListener("hashchange", route);

function askUnlock(f) {
  const m = document.createElement("div"); m.className = "modal";
  m.innerHTML = `<div class="card"><h2>🔒 ${esc(f.name)}</h2><p class="muted">${esc(HOME.lockTitleHint)}</p>
    <input type="password" id="pw" placeholder="密碼" autofocus><p class="small" id="err" style="color:var(--danger);min-height:1.4em"></p>
    <div class="row between"><button class="ghost" id="cancel">取消</button><button id="ok">解鎖</button></div></div>`;
  document.body.appendChild(m);
  const go = async () => {
    $("#ok", m).disabled = true;
    try {
      if (await rpc("check_unlock", { feature: f.id, pw: $("#pw", m).value })) { store.sset("unlocked_" + f.id, true); m.remove(); location.hash = "#/" + f.id; route(); }
      else { $("#err", m).textContent = "密碼不正確"; }
    } catch (e) { $("#err", m).textContent = "驗證失敗：" + e.message; }
    $("#ok", m).disabled = false;
  };
  $("#ok", m).onclick = go; $("#cancel", m).onclick = () => m.remove();
  $("#pw", m).onkeydown = e => { if (e.key === "Enter") go(); };
  setTimeout(() => $("#pw", m).focus(), 50);
}

/* ---------- 首頁 ---------- */
function home() {
  app.innerHTML = `
  <section class="hero"><h1>${esc(HOME.heroTitle)}</h1>
    <p>${esc(HOME.heroText)}</p></section>
  <div class="grid c2" style="margin-top:20px">${FEATURES.map(f => {
    const locked = !isUnlocked(f.id);
    return `<button class="feature t-${f.t} ${locked ? "locked" : ""}" data-f="${f.id}">
      <span class="lock">${locked ? "🔒" : ""}</span><div class="no">${esc(HOME.stepLabel)} ${f.no}</div>
      <h3>${f.icon} ${esc(f.name)}</h3><p class="muted" style="margin:0">${esc(f.desc)}</p></button>`;
  }).join("")}</div>`;
  $$(".feature").forEach(b => b.onclick = () => {
    const f = FEATURES.find(x => x.id === b.dataset.f);
    if (!isUnlocked(f.id)) askUnlock(f); else location.hash = "#/" + f.id;
  });
}
const back = (t = "← 回首頁", h = "#/") => `<p><a href="${h}">${t}</a></p>`;

/* ---------- 01 解密工具 ---------- */
let articles = [];
async function toolsList() {
  app.innerHTML = back() + `<h1>📖 解密工具</h1><p class="muted">掌握 DiSC 的原理與應用。</p><p class="muted">載入中…</p>`;
  articles = await select("articles", "order=sort.asc,created_at.asc");
  app.innerHTML = back() + `<h1>📖 解密工具</h1><p class="muted">掌握全球最廣泛使用的人際風格工具 DiSC 的原理與應用。</p>
    <div class="grid" style="margin-top:16px">${articles.length ? articles.map((a, i) => `
      <button class="article-item" data-id="${a.id}"><span class="pill t-D">${i + 1}</span> <strong style="display:inline">${esc(a.title)}</strong>
      <div class="muted small">${esc(a.summary)}</div></button>`).join("") : `<p class="muted">目前尚無教材。</p>`}</div>`;
  $$(".article-item").forEach(b => b.onclick = () => location.hash = "#/tools/" + b.dataset.id);
}
async function toolsArticle(id) {
  if (!articles.length) articles = await select("articles", "order=sort.asc,created_at.asc");
  const i = articles.findIndex(a => a.id === id), a = articles[i];
  if (!a) return toolsList();
  const prev = articles[i - 1], next = articles[i + 1];
  app.innerHTML = `<div class="narrow" style="margin:auto">${back("← 所有教材", "#/tools")}
    <div class="card"><h1>${esc(a.title)}</h1><p class="muted">${esc(a.summary)}</p>${(a.blocks || []).map(renderBlock).join("")}</div>
    <div class="row between" style="margin-top:16px">
      ${prev ? `<a class="btn ghost" href="#/tools/${prev.id}">← ${esc(prev.title)}</a>` : "<span></span>"}
      ${next ? `<a class="btn" href="#/tools/${next.id}">${esc(next.title)} →</a>` : ""}</div></div>`;
}

/* ---------- 02 看懂自己 ---------- */
let selfQs = [], selfRun = null;
async function selfPage() {
  app.innerHTML = `<p class="muted">載入中…</p>`;
  const prev = await rpc("get_my_result", { p_client: clientId });
  if (prev) return selfShowSaved(prev);
  selfIntro();
}
function selfShowSaved(r) {
  if (r.hidden) {
    app.innerHTML = `<div class="narrow" style="margin:auto">${back()}<div class="card" style="text-align:center">
      <div style="font-size:48px">✅</div><h2>${esc(r.user_name)}，你已完成測評</h2>
      <p class="muted">講師目前尚未公開測評結果，請於課堂中一起揭曉！</p>
      <button class="ghost" id="redo">重新測驗</button></div></div>`;
  } else return selfResult(r, true);
  $("#redo").onclick = () => { if (confirm("重新測驗會覆蓋原本的紀錄，確定嗎？")) selfIntro(); };
}
/* 測評開頭區塊（看懂自己／識別他人共用，文字由後台「開頭文字」編輯）*/
const introHtml = I => `<h1>${esc(I.title)}</h1><p class="muted">${esc(I.subtitle)}</p>
  ${I.notices.length ? `<div class="notice">${I.noticeTitle ? `<b>${esc(I.noticeTitle)}</b>` : ""}<ul>${I.notices.map(n => `<li>${md(n).replace(/^<p>|<\/p>$/g, "")}</li>`).join("")}</ul></div>` : ""}
  ${I.howTitle ? `<h3 style="margin-top:16px">${esc(I.howTitle)}</h3>` : ""}${I.howText ? md(I.howText) : ""}`;
function selfIntro() {
  const I = getIntro(SITE, "self");
  app.innerHTML = `<div class="narrow" style="margin:auto">${back()}<div class="card">${introHtml(I)}
    <label class="f" for="nm">${esc(I.nameLabel)}</label>
    <input type="text" id="nm" maxlength="30" placeholder="${esc(I.namePlaceholder)}" value="${esc(store.get("disc_name", ""))}">
    <div class="row between" style="margin-top:16px"><span></span><button id="go" disabled>${esc(I.startBtn)}</button></div></div></div>`;
  const nm = $("#nm"), go = $("#go");
  nm.oninput = () => go.disabled = !nm.value.trim();
  nm.onkeydown = e => { if (e.key === "Enter" && !go.disabled) go.click(); };
  go.disabled = !nm.value.trim();
  go.onclick = async () => {
    go.disabled = true; go.textContent = "載入題目…";
    store.set("disc_name", nm.value.trim());
    try {
      selfQs = await select("questions", "kind=eq.self&order=sort.asc,updated_at.asc");
      if (selfQs.length < 3) { toast("題目數量不足，請聯絡講師"); go.disabled = false; go.textContent = I.startBtn; return; }
      const qs = (cfg.randomize ? shuffle(selfQs) : selfQs).map(q => ({ ...q, options: shuffle(q.options) }));
      selfRun = { name: nm.value.trim(), qs, cur: 0, ans: {} };
      selfQuestion();
    } catch (e) { toast("載入失敗：" + e.message); go.disabled = false; go.textContent = I.startBtn; }
  };
}
function selfQuestion() {
  const r = selfRun, q = r.qs[r.cur], a = r.ans[q.id] || (r.ans[q.id] = { most: null, least: null });
  app.innerHTML = `<div class="narrow" style="margin:auto"><div class="card">
    <div class="row between small muted"><span>第 ${r.cur + 1} / ${r.qs.length} 題</span><span>⏱ 建議 5 分鐘內完成</span></div>
    <div class="progress" style="margin:8px 0 16px"><i style="width:${r.cur / r.qs.length * 100}%"></i></div>
    <h2>${esc(q.prompt)}</h2>
    ${q.options.map((o, i) => `<div class="opt"><span class="lbl">${esc(o.text)}</span>
      <button class="mark most ${a.most === i ? "on" : ""}" data-k="most" data-i="${i}" ${a.least === i ? "disabled" : ""}>最像我</button>
      <button class="mark least ${a.least === i ? "on" : ""}" data-k="least" data-i="${i}" ${a.most === i ? "disabled" : ""}>最不像我</button></div>`).join("")}
    <div class="row between" style="margin-top:18px"><button class="ghost" id="prev" ${r.cur === 0 ? "disabled" : ""}>上一題</button>
      <button id="next" ${a.most === null || a.least === null ? "disabled" : ""}>${r.cur === r.qs.length - 1 ? "完成，查看結果" : "下一題"}</button></div></div></div>`;
  $$(".mark").forEach(b => b.onclick = () => { const k = b.dataset.k, i = +b.dataset.i; a[k] = a[k] === i ? null : i; selfQuestion(); });
  $("#prev").onclick = () => { r.cur--; selfQuestion(); };
  $("#next").onclick = () => { if (r.cur < r.qs.length - 1) { r.cur++; selfQuestion(); } else selfSubmit(); };
}
async function selfSubmit() {
  const r = selfRun;
  const { scores } = scoreAnswers(r.qs, r.ans);
  const j = judgeStyle(scores, cfg.secondary_gap);
  const answers = {}; r.qs.forEach(q => { const a = r.ans[q.id]; answers[q.id] = [q.options[a.most].type, q.options[a.least].type]; });
  app.innerHTML = `<div class="card" style="text-align:center"><p>計算並儲存結果中…</p></div>`;
  try {
    await rpc("submit_result", { p_client: clientId, p_name: r.name, p_answers: answers, p_scores: scores, p_style: j.style, p_primary: j.secondary ? [j.primary, j.secondary] : [j.primary] });
  } catch (e) {
    app.innerHTML = `<div class="card"><h2>⚠️ 結果儲存失敗</h2><p class="muted">${esc(e.message)}</p><button id="retry">重試</button></div>`;
    $("#retry").onclick = selfSubmit; return;
  }
  const res = await rpc("get_my_result", { p_client: clientId });
  selfShowSaved(res);
}
async function selfResult(r, saved) {
  adaptMap = await loadAdaptMap();
  const { p, s } = styleParts(r.style);
  store.sset("my_style", r.style);
  const tp = getType(adaptMap, p), ts = s ? getType(adaptMap, s) : null;
  const sec = s ? `<div class="box t-${s}"><h3>輔型：${TLABEL[s]} ${TNAME[s]}</h3><p>${esc(ts.summary)}</p></div>` : "";
  app.innerHTML = `<div class="narrow" style="margin:auto">${back()}<div class="card">
    <p class="muted">${esc(r.user_name)} 的 DiSC 風格</p>
    <div class="row" style="gap:20px"><div class="styleBadge t-${p}" style="color:var(--c)">${styleLabel(r.style)}</div>
      <div><h2 style="margin:0">${TNAME[p]}${s ? `・帶有${TNAME[s]}傾向` : ""}</h2><p class="muted" style="margin:0">${esc(PROFILE[p].short)}</p></div></div>
    <div class="grid c2" style="margin-top:20px;align-items:center"><div class="circleWrap">${circleSvg(r.scores)}</div><div>${barsHtml(r.scores)}<p class="muted small">分數 0–100，越高代表該傾向越明顯。</p></div></div>
    <div class="tips" style="margin-top:16px">
      <div class="box t-${p}"><h3>主型：${TLABEL[p]} ${TNAME[p]}</h3><p>${esc(tp.summary)}</p>
        <p><b>在乎：</b>${esc(tp.want)}<br><b>壓力來源：</b>${esc(tp.stress)}</p></div>${sec ? "" : ""}${sec}
      <div class="box"><h3>別人怎麼跟你溝通最有效？</h3><ul>${tp.dos.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div></div>
    <p class="muted small" style="margin-top:14px">最後測評時間：${new Date(r.updated_at).toLocaleString("zh-TW")}。DiSC 描述的是行為傾向，會隨情境變化，結果僅供參考。</p>
    <div class="row between" style="margin-top:12px"><button class="ghost" id="redo">重新測驗</button>
      <a class="btn" href="#/adapt">前往彈性調適 →</a></div></div></div>`;
  $("#redo").onclick = () => { if (confirm("重新測驗會覆蓋原本的紀錄，確定嗎？")) selfIntro(); };
}

/* ---------- 03 識別他人 ---------- */
let othersRun = null;
async function othersPage() {
  const I = getIntro(SITE, "others");
  app.innerHTML = `<div class="narrow" style="margin:auto">${back()}<div class="card">${introHtml(I)}
    <div class="row between" style="margin-top:16px"><span></span><button id="go">${esc(I.startBtn)}</button></div></div></div>`;
  $("#go").onclick = async () => {
    const qs = await select("questions", "kind=eq.others&order=sort.asc,updated_at.asc");
    if (qs.length < 1) return toast("目前沒有題目");
    othersRun = { qs: qs.map(q => ({ ...q, options: shuffle(q.options) })), cur: 0, ans: {} };
    othersQ();
  };
}
function othersQ() {
  const r = othersRun, q = r.qs[r.cur], a = r.ans[q.id];
  app.innerHTML = `<div class="narrow" style="margin:auto"><div class="card">
    <div class="row between small muted"><span>第 ${r.cur + 1} / ${r.qs.length} 題</span><span>這個人…</span></div>
    <div class="progress" style="margin:8px 0 16px"><i style="width:${r.cur / r.qs.length * 100}%"></i></div>
    <h2>${esc(q.prompt)}</h2>
    ${q.options.map((o, i) => `<button class="opt pick ${a === i ? "on" : ""}" data-i="${i}" style="display:block;width:100%;font-weight:inherit;color:var(--text)">${esc(o.text)}</button>`).join("")}
    <div class="row between" style="margin-top:18px"><button class="ghost" id="prev" ${r.cur === 0 ? "disabled" : ""}>上一題</button>
      <span><button class="ghost" id="skip">略過</button> <button id="next" ${a === undefined || a === null ? "disabled" : ""}>${r.cur === r.qs.length - 1 ? "查看結果" : "下一題"}</button></span></div></div></div>`;
  $$(".pick").forEach(b => b.onclick = () => { r.ans[q.id] = +b.dataset.i; othersQ(); });
  const nextStep = () => { if (r.cur < r.qs.length - 1) { r.cur++; othersQ(); } else othersResult(); };
  $("#prev").onclick = () => { r.cur--; othersQ(); };
  $("#skip").onclick = () => { delete r.ans[q.id]; nextStep(); };
  $("#next").onclick = nextStep;
}
function othersResult() {
  const r = othersRun, cnt = { D: 0, I: 0, S: 0, C: 0 }; let n = 0;
  r.qs.forEach(q => { const a = r.ans[q.id]; if (a !== undefined && a !== null) { cnt[q.options[a].type]++; n++; } });
  if (!n) { toast("至少要回答一題喔"); return othersQ(); }
  const pct = {}; TYPES.forEach(t => pct[t] = Math.round(cnt[t] / n * 100));
  const max = Math.max(...TYPES.map(t => cnt[t])), tops = TYPES.filter(t => cnt[t] === max), top = tops[0];
  store.sset("other_style", top);
  app.innerHTML = `<div class="narrow" style="margin:auto">${back()}<div class="card">
    <p class="muted">依據你的 ${n} 題觀察，這個人最可能的主型是</p>
    <div class="row" style="gap:20px"><div class="styleBadge t-${top}" style="color:var(--c)">${TLABEL[top]}</div>
      <div><h2 style="margin:0">${TNAME[top]}${tops.length > 1 ? `（另有並列：${tops.slice(1).map(t => TLABEL[t] + " " + TNAME[t]).join("、")}）` : ""}</h2>
      <p class="muted" style="margin:0">${esc(PROFILE[top].short)}</p></div></div>
    <h3 style="margin-top:18px">四種風格的可能比重</h3>${barsHtml(pct, "%")}
    ${tops.length > 1 || n < 6 ? `<p class="notice small">${tops.length > 1 ? "有多個類型比重相同，建議再多觀察一些行為後再判斷。" : "作答題數較少，結果僅供參考。"}</p>` : ""}
    <div class="box t-${top}" style="margin-top:12px"><h3>跟${TLABEL[top]}型的人溝通</h3><ul>${PROFILE[top].comm.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>
    <div class="row between" style="margin-top:16px"><button class="ghost" id="redo">重新識別另一個人</button><a class="btn" href="#/adapt">用「風格應對神器」找出相處之道 →</a></div></div></div>`;
  $("#redo").onclick = othersPage;
}

/* ---------- 04 彈性調適 ---------- */
async function loadAdaptMap() {
  const rows = await select("adapt_content", "select=key,data");
  return Object.fromEntries(rows.map(r => [r.key, r.data]));
}
let adaptTab = "types", adaptSel = null, typesSel = null, toolQuery = null, toolDirection = "peer";
async function adaptPage() {
  app.innerHTML = `<p class="muted">載入中…</p>`;
  adaptMap = await loadAdaptMap();
  if (!adaptSel) adaptSel = { me: { p: "D", s: null }, other: { p: "I", s: null } };
  if (!typesSel) { const my = store.sget("my_style"); if (my) typesSel = styleParts(my).p; }
  renderAdapt();
}
function renderAdapt() {
  app.innerHTML = `${back()}<h1>🧭 彈性調適</h1><p class="muted">依據不同的風格調整溝通方式，讓對方更容易買單你的想法。</p>
    <div class="row" style="margin:12px 0"><button class="${adaptTab === "types" ? "" : "ghost"}" data-tab="types">基本應對原則</button>
    <button class="${adaptTab === "tool" ? "" : "ghost"}" data-tab="tool">風格應對神器</button></div><div id="adaptBody"></div>`;
  $$("[data-tab]").forEach(b => b.onclick = () => { adaptTab = b.dataset.tab; renderAdapt(); });
  adaptTab === "types" ? renderTypes() : renderTool();
}
function renderTypes() {
  const typeCard = t => { const d = getType(adaptMap, t); return `<div class="card t-${t}" style="border-top:6px solid var(--c);margin-top:16px"><h2 style="color:var(--c)">${TLABEL[t]} ${TNAME[t]}</h2><p>${esc(d.summary)}</p>
      <p><b>在乎：</b>${esc(d.want)}<br><b>壓力來源：</b>${esc(d.stress)}</p>
      <h3>✅ 這樣溝通</h3><ul>${d.dos.map(x => `<li>${esc(x)}</li>`).join("")}</ul>
      <h3>⚠️ 避免</h3><ul>${d.donts.map(x => `<li>${esc(x)}</li>`).join("")}</ul>
      <div class="box"><b>💡 ${esc(d.tip)}</b></div></div>`; };
  $("#adaptBody").innerHTML = `<div class="card"><p class="muted" style="margin:0 0 10px">請選擇一種 DiSC 風格，查看基本應對原則：</p>
    <div class="row" style="gap:8px">${TYPES.map(t => `<button class="chip t-${t} ${typesSel === t ? "on" : ""}" data-tsel="${t}">${TLABEL[t]} ${TNAME[t]}</button>`).join("")}</div></div>
    ${typesSel ? typeCard(typesSel) : `<div class="card" style="margin-top:16px;text-align:center"><p class="muted">請先在上方選擇一種風格。</p></div>`}`;
  $$("[data-tsel]").forEach(b => b.onclick = () => { typesSel = b.dataset.tsel; renderTypes(); });
}
const pickStyle = sel => STYLES.find(x => x.toLowerCase() === (sel.p + (sel.s || "")).toLowerCase()) || sel.p;
function chips(who) {
  const sel = adaptSel[who];
  return `<div class="row" style="gap:8px">${TYPES.map(t => `<button class="chip t-${t} ${sel.p === t ? "on" : ""}" data-w="${who}" data-p="${t}">${TLABEL[t]}</button>`).join("")}</div>
    <div class="small muted" style="margin:10px 0 6px">輔型（可選）</div>
    <div class="row" style="gap:8px"><button class="chip none ${!sel.s ? "on" : ""}" data-w="${who}" data-s="">無</button>
      ${ADJ[sel.p].map(t => `<button class="chip t-${t} ${sel.s === t ? "on" : ""}" data-w="${who}" data-s="${t}">${TLABEL[t]}</button>`).join("")}</div>`;
}
function renderTool() {
  const myLive = pickStyle(adaptSel.me), otLive = pickStyle(adaptSel.other);
  const list = a => `<ul>${(a || []).map(x => `<li>${esc(x)}</li>`).join("")}</ul>`;
  let resultHtml;
  if (!toolQuery) {
    resultHtml = `<div class="card" style="margin-top:16px;text-align:center"><p class="muted">選好雙方的風格與關係方向後，按下「查詢應對之道」查看建議。</p></div>`;
  } else {
    const my = toolQuery.my, ot = toolQuery.ot, dir = toolQuery.direction, c = getCombo(adaptMap, my, ot, dir);
    const dirInfo = DIRECTIONS.find(d => d.id === dir);
    resultHtml = `<div class="card" style="margin-top:16px">
      <div class="row" style="gap:10px"><span class="pill t-${styleParts(my).p}">你 ${styleLabel(my)}</span><span>→</span><span class="pill t-${styleParts(ot).p}">對方 ${styleLabel(ot)}</span>${dir !== "peer" ? `<span class="pill" style="background:var(--brand)">${esc(dirInfo.label)}</span>` : ""}</div>
      <h2 style="margin-top:12px">💬 一句話重點</h2><p style="font-size:17px">${esc(c.summary)}</p>
      <div class="grid c2"><div><div class="box t-${styleParts(ot).p}"><h3>🎯 配合對方：這樣說、這樣做</h3>${list(c.adapt)}</div>
        <div class="box"><h3>⚠️ 避免踩雷</h3>${list(c.avoid)}</div></div>
      <div><div class="box t-${styleParts(my).p}"><h3>💪 善用你的優勢</h3>${list(c.leverage)}</div>
        <div class="box"><h3>🤝 找到雙方都能接受的共識</h3>${list(c.ground)}</div></div></div>
      <div class="box" style="margin-top:12px;--cs:var(--I-soft);--c:var(--I)"><h3>🚀 需要對方買單時（如對方較有話語權）</h3>${list(c.ask)}</div></div>`;
  }
  $("#adaptBody").innerHTML = `<div class="card"><p class="muted" style="margin:0 0 10px">你和對方的關係：</p>
    <div class="row" style="gap:8px">${DIRECTIONS.map(d => `<button class="chip ${toolDirection === d.id ? "on" : ""}" data-dir="${d.id}">${d.label}</button>`).join("")}</div>
    <p class="muted small" style="margin:8px 0 0">${esc(DIRECTIONS.find(d => d.id === toolDirection).hint)}</p></div>
    <div class="grid c2" style="margin-top:16px">
    <div class="card"><h2>我的風格：<span style="color:var(--D)">${styleLabel(myLive)}</span></h2>${chips("me")}</div>
    <div class="card"><h2>對方的風格：<span style="color:var(--C)">${styleLabel(otLive)}</span></h2>${chips("other")}</div></div>
    <div class="row" style="justify-content:center;margin-top:16px"><button id="queryBtn">🔍 查詢應對之道</button></div>
    ${resultHtml}`;
  $$("[data-dir]").forEach(b => b.onclick = () => { toolDirection = b.dataset.dir; toolQuery = null; renderTool(); });
  $$(".chip[data-w]").forEach(b => b.onclick = () => {
    const sel = adaptSel[b.dataset.w];
    if (b.dataset.p) { sel.p = b.dataset.p; if (sel.s && !ADJ[sel.p].includes(sel.s)) sel.s = null; }
    else sel.s = b.dataset.s || null;
    toolQuery = null; renderTool();
  });
  $("#queryBtn").onclick = () => {
    toolQuery = { my: pickStyle(adaptSel.me), ot: pickStyle(adaptSel.other), direction: toolDirection };
    renderTool();
    $("#adaptBody").lastElementChild.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };
}

/* ---------- 啟動 ---------- */
(async () => {
  const t0 = performance.now();
  applyHome();
  try {
    const [c, rows] = await Promise.all([rpc("get_config"), select("site_content", "select=key,data")]);
    cfg = c; SITE = Object.fromEntries(rows.map(r => [r.key, r.data])); HOME = getHome(SITE); applyHome();
  } catch (e) { console.error(e); }
  await route();
  // 載入動畫至少播完一輪（拆開→重組），再淡出
  const wait = Math.max(0, 1900 - (performance.now() - t0));
  setTimeout(() => { const s = $("#splash"); s.classList.add("done"); setTimeout(() => s.remove(), 600); }, wait);
})();
