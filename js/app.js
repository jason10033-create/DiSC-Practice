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
  m.innerHTML = `<div class="card"><h2>🔒 ${esc(f.name)}</h2><p class="muted">此功能尚未開放，請輸入講師提供的密碼解鎖。</p>
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
  <section class="hero"><h1>看懂自己，也看懂別人</h1>
    <p>DiSC 人際風格工作坊的學習夥伴：課前完成自我測評，課後隨時查閱教材、識別他人，並用更聰明的方式溝通。</p></section>
  <div class="grid c2" style="margin-top:20px">${FEATURES.map(f => {
    const locked = !isUnlocked(f.id);
    return `<button class="feature t-${f.t} ${locked ? "locked" : ""}" data-f="${f.id}">
      <span class="lock">${locked ? "🔒" : ""}</span><div class="no">STEP ${f.no}</div>
      <h3>${f.icon} ${f.name}</h3><p class="muted" style="margin:0">${f.desc}</p></button>`;
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
function selfIntro() {
  app.innerHTML = `<div class="narrow" style="margin:auto">${back()}<div class="card">
    <h1>🪞 看懂自己</h1><p class="muted">15 題精簡版 DiSC 行為風格自我測評，發現「原來我在別人眼中是這樣！」</p>
    <div class="notice"><b>施測前請留意</b><ul>
      <li>請依照你<b>平時最自然一致</b>的行為反應作答。</li>
      <li>請<b>不要考慮</b>社會期待、工作及家庭壓力，或是理想狀態下的要求。</li>
      <li>請盡量在 <b>5 分鐘內</b>完成。</li></ul></div>
    <h3 style="margin-top:16px">作答方式</h3>
    <p>每題有四個描述，請選出<span class="pill" style="background:var(--ok)">最像我</span> 與 <span class="pill" style="background:var(--danger)">最不像我</span> 各一個。</p>
    <label class="f" for="nm">你的姓名</label>
    <input type="text" id="nm" maxlength="30" placeholder="例如：王小明" value="${esc(store.get("disc_name", ""))}">
    <div class="row between" style="margin-top:16px"><span></span><button id="go" disabled>開始測評</button></div></div></div>`;
  const nm = $("#nm"), go = $("#go");
  nm.oninput = () => go.disabled = !nm.value.trim();
  nm.onkeydown = e => { if (e.key === "Enter" && !go.disabled) go.click(); };
  go.disabled = !nm.value.trim();
  go.onclick = async () => {
    go.disabled = true; go.textContent = "載入題目…";
    store.set("disc_name", nm.value.trim());
    try {
      selfQs = await select("questions", "kind=eq.self&order=sort.asc,updated_at.asc");
      if (selfQs.length < 3) { toast("題目數量不足，請聯絡講師"); go.disabled = false; go.textContent = "開始測評"; return; }
      const qs = (cfg.randomize ? shuffle(selfQs) : selfQs).map(q => ({ ...q, options: shuffle(q.options) }));
      selfRun = { name: nm.value.trim(), qs, cur: 0, ans: {} };
      selfQuestion();
    } catch (e) { toast("載入失敗：" + e.message); go.disabled = false; go.textContent = "開始測評"; }
  };
}
function selfQuestion() {
  const r = selfRun, q = r.qs[r.cur], a = r.ans[q.id] || (r.ans[q.id] = { most: null, least: null });
  app.innerHTML = `<div class="narrow" style="margin:auto"><div class="card">
    <div class="row between small muted"><span>第 ${r.cur + 1} / ${r.qs.length} 題</span><span>⏱ 建議 5 分鐘內完成</span></div>
    <div class="progress" style="margin:8px 0 16px"><i style="width:${r.cur / r.qs.length * 100}%"></i></div>
    <h2>${esc(q.prompt)}</h2><p class="muted small">請選出一個「最像我」與一個「最不像我」。</p>
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
  app.innerHTML = `<div class="narrow" style="margin:auto">${back()}<div class="card">
    <h1>🔍 識別他人</h1><p class="muted">想著一位你想了解的人（同事、主管、客戶或家人），依據平常觀察到的行為線索作答。</p>
    <div class="notice"><ul><li>請憑「實際觀察到的行為」作答，不要憑猜測或刻板印象。</li><li>每題選最符合的一項；沒觀察過可以略過。</li><li>結果只是「可能的傾向」，請搭配更多觀察驗證。</li></ul></div>
    <div class="row between" style="margin-top:16px"><span></span><button id="go">開始</button></div></div></div>`;
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
let adaptTab = "tool", adaptSel = null;
async function adaptPage() {
  app.innerHTML = `<p class="muted">載入中…</p>`;
  adaptMap = await loadAdaptMap();
  if (!adaptSel) {
    const my = store.sget("my_style"), ot = store.sget("other_style");
    adaptSel = { me: my ? styleParts(my) : { p: "D", s: null }, other: ot ? { p: ot, s: null } : { p: "I", s: null } };
  }
  renderAdapt();
}
function renderAdapt() {
  app.innerHTML = `${back()}<h1>🧭 彈性調適</h1><p class="muted">依據不同的風格調整溝通方式，讓對方更容易買單你的想法。</p>
    <div class="row" style="margin:12px 0"><button class="${adaptTab === "tool" ? "" : "ghost"}" data-tab="tool">風格應對神器</button>
    <button class="${adaptTab === "types" ? "" : "ghost"}" data-tab="types">四種風格的應對之道</button></div><div id="adaptBody"></div>`;
  $$("[data-tab]").forEach(b => b.onclick = () => { adaptTab = b.dataset.tab; renderAdapt(); });
  adaptTab === "types" ? renderTypes() : renderTool();
}
function renderTypes() {
  $("#adaptBody").innerHTML = `<div class="grid c2">${TYPES.map(t => {
    const d = getType(adaptMap, t);
    return `<div class="card t-${t}" style="border-top:6px solid var(--c)"><h2 style="color:var(--c)">${TLABEL[t]} ${TNAME[t]}</h2><p>${esc(d.summary)}</p>
      <p><b>在乎：</b>${esc(d.want)}<br><b>壓力來源：</b>${esc(d.stress)}</p>
      <h3>✅ 這樣溝通</h3><ul>${d.dos.map(x => `<li>${esc(x)}</li>`).join("")}</ul>
      <h3>⚠️ 避免</h3><ul>${d.donts.map(x => `<li>${esc(x)}</li>`).join("")}</ul>
      <div class="box"><b>💡 ${esc(d.tip)}</b></div></div>`;
  }).join("")}</div>`;
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
  const my = pickStyle(adaptSel.me), ot = pickStyle(adaptSel.other), c = getCombo(adaptMap, my, ot);
  const list = a => `<ul>${(a || []).map(x => `<li>${esc(x)}</li>`).join("")}</ul>`;
  const hasMy = !!store.sget("my_style"), hasOt = !!store.sget("other_style");
  $("#adaptBody").innerHTML = `<div class="grid c2">
    <div class="card"><h2>我的風格：<span style="color:var(--D)">${styleLabel(my)}</span></h2>${chips("me")}
      ${hasMy ? `<p><button class="soft sm" id="useMy">帶入我的自測結果</button></p>` : `<p class="muted small">完成「看懂自己」後，可一鍵帶入結果。</p>`}</div>
    <div class="card"><h2>對方的風格：<span style="color:var(--C)">${styleLabel(ot)}</span></h2>${chips("other")}
      ${hasOt ? `<p><button class="soft sm" id="useOt">帶入識別他人的結果</button></p>` : `<p class="muted small">完成「識別他人」後，可一鍵帶入結果。</p>`}</div></div>
    <div class="card" style="margin-top:16px"><div class="row" style="gap:10px"><span class="pill t-${styleParts(my).p}">你 ${styleLabel(my)}</span><span>→</span><span class="pill t-${styleParts(ot).p}">對方 ${styleLabel(ot)}</span></div>
      <h2 style="margin-top:12px">💬 一句話重點</h2><p style="font-size:17px">${esc(c.summary)}</p>
      <div class="grid c2"><div><div class="box t-${styleParts(ot).p}"><h3>🎯 配合對方：這樣說、這樣做</h3>${list(c.adapt)}</div>
        <div class="box"><h3>⚠️ 避免踩雷</h3>${list(c.avoid)}</div></div>
      <div><div class="box t-${styleParts(my).p}"><h3>💪 善用你的優勢</h3>${list(c.leverage)}</div>
        <div class="box"><h3>🤝 找到雙方都能接受的共識</h3>${list(c.ground)}</div></div></div>
      <div class="box" style="margin-top:12px;--cs:var(--I-soft);--c:var(--I)"><h3>🚀 需要對方買單時（如對方較有話語權）</h3>${list(c.ask)}</div></div>`;
  $$(".chip").forEach(b => b.onclick = () => {
    const sel = adaptSel[b.dataset.w];
    if (b.dataset.p) { sel.p = b.dataset.p; if (sel.s && !ADJ[sel.p].includes(sel.s)) sel.s = null; }
    else sel.s = b.dataset.s || null;
    renderTool();
  });
  const um = $("#useMy"), uo = $("#useOt");
  if (um) um.onclick = () => { adaptSel.me = styleParts(store.sget("my_style")); renderTool(); };
  if (uo) uo.onclick = () => { adaptSel.other = { p: store.sget("other_style"), s: null }; renderTool(); };
}

/* ---------- 啟動 ---------- */
(async () => {
  try { cfg = await rpc("get_config"); } catch (e) { console.error(e); }
  route();
})();
