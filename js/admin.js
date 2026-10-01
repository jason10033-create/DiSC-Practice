/* 管理後台 */
const root = $("#root");
let PW = null, CFG = null, view = "settings", sub = {};
const A = (name, args = {}) => rpc(name, { pw: PW, ...args });
const store = { get(k) { try { return sessionStorage.getItem(k); } catch { return null; } }, set(k, v) { try { sessionStorage.setItem(k, v); } catch {} }, del(k) { try { sessionStorage.removeItem(k); } catch {} } };
const busy = async (btn, fn) => { const t = btn.textContent; btn.disabled = true; try { await fn(); } catch (e) { toast("失敗：" + (e.message || e)); console.error(e); } btn.disabled = false; btn.textContent = t; };
const lines = s => s.split("\n").map(x => x.trim()).filter(Boolean);

/* ---------- 登入 ---------- */
function loginView(err = "") {
  $("#logout").classList.add("hidden");
  root.innerHTML = `<div class="card narrow" style="margin:40px auto"><h1>🔐 管理員登入</h1>
    <label class="f" for="pw">管理員密碼</label><input type="password" id="pw" autofocus>
    <p class="small" style="color:var(--danger);min-height:1.4em">${esc(err)}</p>
    <button id="login">登入</button></div>`;
  const go = () => busy($("#login"), async () => {
    const pw = $("#pw").value;
    if (await rpc("admin_login", { pw })) { PW = pw; store.set("admin_pw", pw); await boot(); } else loginView("密碼不正確");
  });
  $("#login").onclick = go; $("#pw").onkeydown = e => { if (e.key === "Enter") go(); };
}
$("#logout").onclick = () => { store.del("admin_pw"); PW = null; loginView(); };

/* ---------- 版型 ---------- */
const NAV = [
  ["settings", "基本設定"], ["home", "首頁內容"], ["_", "解密工具"], ["tools", "教材管理"],
  ["_", "看懂自己"], ["introSelf", "測評開頭文字"], ["self", "題目與設定"], ["results", "填答者結果"], ["report", "彙總報表"], ["logicSelf", "計分邏輯"],
  ["_", "識別他人"], ["introOthers", "測評開頭文字"], ["others", "題目管理"], ["logicOthers", "計分邏輯"],
  ["_", "彈性調適"], ["types", "四型基本應對"], ["combos", "應對神器建議"]
];
function shell() {
  $("#logout").classList.remove("hidden");
  root.innerHTML = `<div class="admin-layout"><nav class="sidenav">${NAV.map(([id, t]) => id === "_" ? `<div class="grp">${t}</div>` : `<button data-v="${id}" class="${view === id ? "on" : ""}">${t}</button>`).join("")}</nav><section id="view"></section></div>`;
  $$(".sidenav button").forEach(b => b.onclick = () => { view = b.dataset.v; shell(); render(); });
}
async function boot() { CFG = await A("admin_get_config"); shell(); render(); }
async function render() {
  const v = $("#view"); v.innerHTML = `<p class="muted">載入中…</p>`;
  try { await ({ settings: vSettings, home: vHome, introSelf: () => vIntro("self"), introOthers: () => vIntro("others"), tools: vTools, self: () => vQuestions("self"), others: () => vQuestions("others"), results: vResults, report: vReport, logicSelf: () => vLogic("self"), logicOthers: () => vLogic("others"), types: vTypes, combos: vCombos }[view])(); }
  catch (e) { if (/unauthorized|28000/.test(e.message)) { store.del("admin_pw"); loginView("登入已失效，請重新登入"); } else v.innerHTML = `<div class="card"><h2>載入失敗</h2><p class="muted">${esc(e.message)}</p></div>`; }
}

/* ---------- 基本設定 ---------- */
const FNAME = { tools: "01 解密工具", self: "02 看懂自己", others: "03 識別他人", adapt: "04 彈性調適" };
async function vSettings() {
  CFG = await A("admin_get_config");
  const [arts, qs, res] = await Promise.all([A("admin_list_articles"), select("questions", "select=kind"), A("admin_list_results")]);
  $("#view").innerHTML = `
  <div class="grid c4"><div class="card stat">教材<b>${arts.length}</b></div><div class="card stat">自測題目<b>${qs.filter(q => q.kind === "self").length}</b></div>
    <div class="card stat">識別題目<b>${qs.filter(q => q.kind === "others").length}</b></div><div class="card stat">填答人數<b>${res.length}</b></div></div>
  <div class="card" style="margin-top:16px"><h2>🔒 功能解鎖密碼</h2><p class="muted">勾選「需要密碼」後，學員進入該功能需輸入密碼（可依課程進度逐步開放）。密碼欄留空＝不變更。</p>
    ${Object.keys(FNAME).map(k => { const l = CFG.locks[k] || {}; return `
    <div class="row" style="padding:10px 0;border-top:1px solid var(--line)"><b style="width:130px">${FNAME[k]}</b>
      <label class="switch"><input type="checkbox" data-lock="${k}" ${l.on ? "checked" : ""}> 需要密碼</label>
      <input type="text" data-pw="${k}" placeholder="新密碼（留空不變更）" style="max-width:220px">
      <button class="ghost sm" data-blank="${k}">設為空白密碼</button>
      <span class="small muted">${l.blank ? "目前：空白密碼（直接按解鎖即可）" : "目前：已設定密碼"}</span></div>`; }).join("")}
    <p><button id="saveLocks">儲存解鎖設定</button></p></div>
  <div class="card"><h2>🛡️ 管理員密碼</h2><p class="muted">目前${CFG.admin_pw_blank ? "為<b>空白密碼</b>（任何人知道網址都能登入後台，建議設定密碼）" : "已設定密碼"}。</p>
    <div class="row"><input type="text" id="newAdminPw" placeholder="新的管理員密碼" style="max-width:260px"><button id="saveAdminPw">更新密碼</button><button class="ghost" id="blankAdminPw">設為空白</button></div></div>`;
  $("#saveLocks").onclick = e => busy(e.target, async () => {
    const locks_on = {}, lock_pw = {};
    $$("[data-lock]").forEach(c => locks_on[c.dataset.lock] = c.checked);
    $$("[data-pw]").forEach(i => { if (i.value) lock_pw[i.dataset.pw] = i.value; });
    await A("admin_update_config", { patch: { locks_on, lock_pw } }); toast("已儲存"); vSettings();
  });
  $$("[data-blank]").forEach(b => b.onclick = () => busy(b, async () => { await A("admin_update_config", { patch: { lock_pw: { [b.dataset.blank]: "" } } }); toast("已設為空白密碼"); vSettings(); }));
  const setAdmin = pw => async () => { await A("admin_update_config", { patch: { new_admin_pw: pw() } }); PW = pw(); store.set("admin_pw", PW); toast("管理員密碼已更新"); vSettings(); };
  $("#saveAdminPw").onclick = e => { if (!$("#newAdminPw").value) return toast("請輸入新密碼"); busy(e.target, setAdmin(() => $("#newAdminPw").value)); };
  $("#blankAdminPw").onclick = e => { if (confirm("確定將管理員密碼設為空白？")) busy(e.target, setAdmin(() => "")); };
}

/* ---------- 首頁內容 ---------- */
async function vHome() {
  const rows = await select("site_content", "key=eq.home&select=key,data");
  const custom = rows.length > 0, H = getHome(Object.fromEntries(rows.map(r => [r.key, r.data]))), c = H.copyright;
  const F = { tools: ["01", "t-D"], self: ["02", "t-I"], others: ["03", "t-S"], adapt: ["04", "t-C"] };
  $("#view").innerHTML = `<div class="card"><div class="row between"><h2>🏠 前台首頁內容 ${custom ? `<span class="pill" style="background:var(--brand)">已自訂</span>` : `<span class="small muted">（預設）</span>`}</h2>
    <a class="btn ghost sm" href="index.html" target="_blank" rel="noopener">開啟前台預覽 ↗</a></div>
    <p class="muted">編輯學員首頁看到的所有文字。儲存後重新整理前台即可生效。</p>
    <h3>網站與主視覺</h3>
    <label class="f">網站名稱（左上角與瀏覽器分頁標題）</label><input type="text" data-k="siteName" value="${esc(H.siteName)}">
    <label class="f">主視覺標題</label><input type="text" data-k="heroTitle" value="${esc(H.heroTitle)}">
    <label class="f">主視覺說明文字</label><textarea data-k="heroText">${esc(H.heroText)}</textarea>
    <h3 style="margin-top:20px">四大功能卡片</h3>
    <label class="f">卡片小標前綴（例如 STEP）</label><input type="text" data-k="stepLabel" value="${esc(H.stepLabel)}" style="max-width:200px">
    <div class="grid c2">${Object.keys(F).map(k => `<div class="box ${F[k][1]}"><b>${F[k][0]}</b>
      <label class="f">名稱</label><input type="text" data-fk="${k}" data-f="name" value="${esc(H.features[k].name)}">
      <label class="f">說明</label><textarea data-fk="${k}" data-f="desc" style="min-height:64px">${esc(H.features[k].desc)}</textarea></div>`).join("")}</div>
    <h3 style="margin-top:20px">其他文字</h3>
    <label class="f">解鎖視窗提示文字</label><input type="text" data-k="lockTitleHint" value="${esc(H.lockTitleHint)}">
    <label class="f">頁尾「管理後台」連結文字</label><input type="text" data-k="adminLinkText" value="${esc(H.adminLinkText)}" style="max-width:260px">
    <h3 style="margin-top:20px">©️ 著作權說明區塊</h3>
    <label class="switch"><input type="checkbox" id="cpOn" ${c.enabled ? "checked" : ""}> 在首頁頁尾顯示著作權說明</label>
    <label class="f">標題（可留空）</label><input type="text" id="cpTitle" value="${esc(c.title)}">
    <label class="f">內容（支援 **粗體**、- 清單、[文字](網址)）</label><textarea id="cpText" style="min-height:110px">${esc(c.text)}</textarea>
    <div class="row" style="margin-top:16px"><button id="save">💾 儲存首頁內容</button><button class="ghost" id="reset" ${custom ? "" : "disabled"}>還原預設</button></div></div>`;
  $("#save").onclick = e => busy(e.target, async () => {
    const g = k => $(`[data-k="${k}"]`).value.trim(), features = {};
    Object.keys(F).forEach(k => features[k] = { name: $(`[data-fk="${k}"][data-f="name"]`).value.trim(), desc: $(`[data-fk="${k}"][data-f="desc"]`).value.trim() });
    const data = { siteName: g("siteName"), heroTitle: g("heroTitle"), heroText: g("heroText"), stepLabel: g("stepLabel"), lockTitleHint: g("lockTitleHint"), adminLinkText: g("adminLinkText"), features,
      copyright: { enabled: $("#cpOn").checked, title: $("#cpTitle").value.trim(), text: $("#cpText").value.trim() } };
    if (!data.siteName || !data.heroTitle) return toast("網站名稱與主視覺標題不可空白");
    await A("admin_upsert_site", { p_key: "home", p_data: data }); toast("已儲存"); vHome();
  });
  $("#reset").onclick = e => { if (confirm("還原為預設的首頁內容？")) busy(e.target, async () => { await A("admin_delete_site", { p_key: "home" }); toast("已還原"); vHome(); }); };
}

/* ---------- 測評開頭文字（看懂自己 / 識別他人，各自獨立頁面）---------- */
async function vIntro(kind) {
  const rows = await select("site_content", `key=eq.intro_${kind}&select=key,data`);
  const map = Object.fromEntries(rows.map(r => [r.key, r.data]));
  const KINDS = { self: "🪞 看懂自己（學員按下功能後的第一個畫面）", others: "🔍 識別他人（學員按下功能後的第一個畫面）" };
  const card = kind => {
    const I = getIntro(map, kind), custom = !!map["intro_" + kind];
    return `<div class="card" data-kind="${kind}"><h2>${KINDS[kind]} ${custom ? `<span class="pill" style="background:var(--brand)">已自訂</span>` : `<span class="small muted">（預設）</span>`}</h2>
      <label class="f">頁面標題</label><input type="text" data-f="title" value="${esc(I.title)}">
      <label class="f">說明文字</label><textarea data-f="subtitle" style="min-height:64px">${esc(I.subtitle)}</textarea>
      <label class="f">提醒區塊標題（留空＝不顯示標題）</label><input type="text" data-f="noticeTitle" value="${esc(I.noticeTitle)}">
      <label class="f">提醒事項（每行一條，支援 **粗體**；全部清空＝不顯示提醒區塊）</label><textarea data-f="notices">${esc(I.notices.join("\n"))}</textarea>
      <label class="f">作答方式標題（留空＝不顯示）</label><input type="text" data-f="howTitle" value="${esc(I.howTitle)}">
      <label class="f">作答方式說明（留空＝不顯示）</label><textarea data-f="howText" style="min-height:64px">${esc(I.howText)}</textarea>
      ${kind === "self" ? `<div class="grid c2"><div><label class="f">姓名欄位標籤</label><input type="text" data-f="nameLabel" value="${esc(I.nameLabel)}"></div>
        <div><label class="f">姓名欄位提示文字</label><input type="text" data-f="namePlaceholder" value="${esc(I.namePlaceholder)}"></div></div>` : ""}
      <label class="f">開始按鈕文字</label><input type="text" data-f="startBtn" value="${esc(I.startBtn)}" style="max-width:240px">
      <div class="row" style="margin-top:14px"><button data-save="${kind}">💾 儲存</button><button class="ghost" data-reset="${kind}" ${custom ? "" : "disabled"}>還原預設</button></div></div>`;
  };
  $("#view").innerHTML = `<p class="muted">編輯學員進入「${kind === "self" ? "看懂自己" : "識別他人"}」後，開始作答前看到的所有文字。儲存後重新整理前台即可生效。</p>${card(kind)}`;
  $$("[data-save]").forEach(b => b.onclick = () => busy(b, async () => {
    const c = $(`[data-kind="${kind}"]`), g = f => { const e = $(`[data-f="${f}"]`, c); return e ? e.value.trim() : DEFAULT_INTRO[kind][f]; };
    const data = { title: g("title"), subtitle: g("subtitle"), noticeTitle: g("noticeTitle"), notices: lines(g("notices")), howTitle: g("howTitle"), howText: g("howText"), nameLabel: g("nameLabel"), namePlaceholder: g("namePlaceholder"), startBtn: g("startBtn") };
    if (!data.title || !data.startBtn) return toast("頁面標題與開始按鈕文字不可空白");
    await A("admin_upsert_site", { p_key: "intro_" + kind, p_data: data }); toast("已儲存"); vIntro(kind);
  }));
  $$("[data-reset]").forEach(b => b.onclick = () => { if (confirm("還原為預設文字？")) busy(b, async () => { await A("admin_delete_site", { p_key: "intro_" + kind }); toast("已還原"); vIntro(kind); }); });
}

/* ---------- 解密工具：教材 ---------- */
let editing = null;
async function vTools() {
  const arts = await A("admin_list_articles");
  if (editing) return articleEditor();
  $("#view").innerHTML = `<div class="card"><div class="row between"><h2>📖 教材管理</h2><button id="newArt">＋ 新增教材</button></div>
    <p class="muted">學員在「解密工具」看到的內容。可用文字、圖片、影片、PDF、提示框、連結組成。</p>
    <div class="scroll-x"><table class="tbl"><thead><tr><th>順序</th><th>標題</th><th>狀態</th><th>更新</th><th></th></tr></thead><tbody>
    ${arts.map((a, i) => `<tr><td><button class="ghost sm" data-up="${i}" ${i === 0 ? "disabled" : ""}>↑</button> <button class="ghost sm" data-down="${i}" ${i === arts.length - 1 ? "disabled" : ""}>↓</button></td>
      <td><b>${esc(a.title)}</b><div class="small muted">${esc(a.summary)}</div></td><td>${a.published ? "✅ 公開" : "🚫 隱藏"}</td>
      <td class="small">${new Date(a.updated_at).toLocaleDateString("zh-TW")}</td>
      <td><button class="soft sm" data-edit="${a.id}">編輯</button> <button class="danger sm" data-del="${a.id}">刪除</button></td></tr>`).join("")}
    </tbody></table></div></div>`;
  $("#newArt").onclick = () => { editing = { title: "", summary: "", sort: (arts.at(-1)?.sort ?? 0) + 10, published: true, blocks: [] }; vTools(); };
  $$("[data-edit]").forEach(b => b.onclick = () => { editing = JSON.parse(JSON.stringify(arts.find(a => a.id === b.dataset.edit))); vTools(); });
  $$("[data-del]").forEach(b => b.onclick = () => { if (confirm("確定刪除這篇教材？")) busy(b, async () => { await A("admin_delete_article", { p_id: b.dataset.del }); toast("已刪除"); vTools(); }); });
  const move = (i, d) => async () => {
    const a = arts[i], o = arts[i + d]; if (!o) return;
    // 重新編號避免相同 sort
    const arr = arts.slice(); [arr[i], arr[i + d]] = [arr[i + d], arr[i]];
    for (let k = 0; k < arr.length; k++) if (arr[k].sort !== k * 10) await A("admin_upsert_article", { r: { ...arr[k], sort: k * 10 } });
    vTools();
  };
  $$("[data-up]").forEach(b => b.onclick = () => busy(b, move(+b.dataset.up, -1)));
  $$("[data-down]").forEach(b => b.onclick = () => busy(b, move(+b.dataset.down, 1)));
}
const BTYPES = { heading: "標題", text: "文字", image: "圖片", video: "影片", pdf: "PDF", callout: "提示框", link: "連結" };
function articleEditor() {
  const e = editing;
  $("#view").innerHTML = `<div class="card"><div class="row between"><h2>${e.id ? "編輯教材" : "新增教材"}</h2><button class="ghost" id="cancel">← 返回列表</button></div>
    <label class="f">標題</label><input type="text" id="aTitle" value="${esc(e.title)}">
    <label class="f">簡介（顯示於列表）</label><input type="text" id="aSum" value="${esc(e.summary)}">
    <label class="switch" style="margin-top:12px"><input type="checkbox" id="aPub" ${e.published ? "checked" : ""}> 公開給學員</label>
    <h3 style="margin-top:20px">內容區塊</h3><div id="blocks"></div>
    <div class="row" style="margin-top:12px">${Object.entries(BTYPES).map(([k, t]) => `<button class="soft sm" data-add="${k}">＋ ${t}</button>`).join("")}</div>
    <div class="row between" style="margin-top:20px"><button class="ghost" id="preview">👁 預覽</button><button id="save">💾 儲存教材</button></div>
    <div id="pv" class="hidden" style="margin-top:16px;border-top:2px solid var(--line);padding-top:8px"></div></div>`;
  const drawBlocks = () => {
    $("#blocks").innerHTML = e.blocks.map((b, i) => `<div class="blockedit"><div class="row between"><b>${i + 1}. ${BTYPES[b.type]}</b>
      <span><button class="ghost sm" data-mv="${i}:-1">↑</button> <button class="ghost sm" data-mv="${i}:1">↓</button> <button class="danger sm" data-rm="${i}">✕</button></span></div>${blockFields(b, i)}</div>`).join("") || `<p class="muted">尚無內容，請使用下方按鈕新增區塊。</p>`;
  };
  const blockFields = (b, i) => {
    const inp = (f, ph = "", ta = false) => ta ? `<textarea data-bi="${i}" data-f="${f}" placeholder="${ph}">${esc(b[f] || "")}</textarea>` : `<input type="text" data-bi="${i}" data-f="${f}" placeholder="${ph}" value="${esc(b[f] || "")}">`;
    const up = (accept) => `<div class="row" style="margin-top:6px"><input type="file" accept="${accept}" data-up="${i}" style="max-width:300px"><span class="small muted" data-st="${i}">或貼上網址；檔案上限 50MB</span></div>`;
    switch (b.type) {
      case "heading": return inp("text", "標題文字");
      case "text": return inp("text", "支援 **粗體**、*斜體*、- 清單、[文字](網址)", true);
      case "callout": return `<select data-bi="${i}" data-f="tone" style="max-width:160px;margin-bottom:6px">${[["info", "ℹ️ 資訊"], ["tip", "💡 提示"], ["warn", "⚠️ 注意"]].map(([v, t]) => `<option value="${v}" ${b.tone === v ? "selected" : ""}>${t}</option>`).join("")}</select>${inp("text", "提示內容", true)}`;
      case "image": return inp("url", "圖片網址") + inp("caption", "圖說（選填）") + up("image/*");
      case "video": return inp("url", "影片網址（YouTube / Vimeo / mp4 檔案）") + inp("caption", "說明（選填）") + up("video/*");
      case "pdf": return inp("url", "PDF 網址") + inp("caption", "顯示名稱（選填）") + up("application/pdf");
      case "link": return inp("text", "按鈕文字") + inp("url", "連結網址");
    }
  };
  drawBlocks();
  $("#cancel").onclick = () => { editing = null; vTools(); };
  $$("[data-add]").forEach(b => b.onclick = () => { e.blocks.push({ type: b.dataset.add, ...(b.dataset.add === "callout" ? { tone: "info" } : {}) }); drawBlocks(); });
  const bl = $("#blocks");
  bl.addEventListener("input", ev => { const t = ev.target; if (t.dataset.bi !== undefined) e.blocks[+t.dataset.bi][t.dataset.f] = t.value; });
  bl.addEventListener("click", ev => {
    const t = ev.target.closest("button"); if (!t) return;
    if (t.dataset.rm !== undefined) { e.blocks.splice(+t.dataset.rm, 1); drawBlocks(); }
    if (t.dataset.mv) { const [i, d] = t.dataset.mv.split(":").map(Number), j = i + d; if (e.blocks[j]) { [e.blocks[i], e.blocks[j]] = [e.blocks[j], e.blocks[i]]; drawBlocks(); } }
  });
  bl.addEventListener("change", async ev => {
    const t = ev.target; if (t.dataset.up === undefined || !t.files[0]) return;
    const i = +t.dataset.up, st = $(`[data-st="${i}"]`, bl); st.textContent = "上傳中…"; t.disabled = true;
    try {
      const fd = new FormData(); fd.append("password", PW); fd.append("file", t.files[0]);
      const r = await fetch(MEDIA_FN, { method: "POST", headers: { apikey: SUPABASE_KEY }, body: fd }), j = await r.json();
      if (!r.ok) throw new Error(j.error || "上傳失敗");
      e.blocks[i].url = j.url; if (!e.blocks[i].caption && e.blocks[i].type === "pdf") e.blocks[i].caption = j.name; drawBlocks(); toast("上傳完成");
    } catch (err) { st.textContent = "上傳失敗：" + err.message; t.disabled = false; }
  });
  const sync = () => { e.title = $("#aTitle").value.trim(); e.summary = $("#aSum").value.trim(); e.published = $("#aPub").checked; };
  $("#preview").onclick = () => { sync(); const p = $("#pv"); p.classList.toggle("hidden"); p.innerHTML = `<h1>${esc(e.title)}</h1><p class="muted">${esc(e.summary)}</p>${e.blocks.map(renderBlock).join("")}`; };
  $("#save").onclick = ev => busy(ev.target, async () => {
    sync(); if (!e.title) return toast("請輸入標題");
    e.id = await A("admin_upsert_article", { r: e }); toast("已儲存"); editing = null; vTools();
  });
}

/* ---------- 題目管理（self / others）---------- */
async function vQuestions(kind) {
  const qs = await select("questions", `kind=eq.${kind}&order=sort.asc,updated_at.asc`);
  CFG = await A("admin_get_config");
  const isSelf = kind === "self";
  $("#view").innerHTML = `
  ${isSelf ? `<div class="card"><h2>⚙️ 測評設定</h2>
    <label class="switch"><input type="checkbox" id="cRand" ${CFG.randomize ? "checked" : ""}> 題目順序隨機打亂（每位填答者不同；四個選項一律隨機排列）</label>
    <label class="switch" style="margin-top:8px"><input type="checkbox" id="cShow" ${CFG.show_results ? "checked" : ""}> 公開測評結果給填答者（勾選＝填答完即可看結果，且下次進入仍可看到上次結果；未勾選＝僅告知已完成）</label>
    <label class="f">輔型判定門檻（分數差 ≤ 此值才顯示「主型＋輔型」；0＝只顯示主型）</label><input type="number" id="cGap" min="0" max="50" value="${CFG.secondary_gap}" style="max-width:120px">
    <p><button id="saveCfg">儲存設定</button></p></div>` : ""}
  <div class="card" style="margin-top:16px"><div class="row between"><h2>${isSelf ? "🪞 看懂自己：題目" : "🔍 識別他人：題目"}（共 ${qs.length} 題）</h2><button id="addQ">＋ 新增題目</button></div>
    <p class="muted">${isSelf ? "每題四個行為描述，各自對應一種風格；填答者選出「最像」與「最不像」。" : "每題四個行為線索，各自對應一種風格；填答者選出最符合該人的一項。"}修改後請按該題的「儲存」。</p>
    <div id="qlist">${qs.map((q, i) => qCard(q, i, qs.length)).join("")}</div></div>`;
  if (isSelf) $("#saveCfg").onclick = e => busy(e.target, async () => {
    await A("admin_update_config", { patch: { randomize: $("#cRand").checked, show_results: $("#cShow").checked, secondary_gap: +$("#cGap").value || 0 } }); toast("已儲存設定");
  });
  $("#addQ").onclick = () => { $("#qlist").insertAdjacentHTML("beforeend", qCard({ id: "", prompt: "", options: TYPES.map(t => ({ text: "", type: t })), sort: (qs.at(-1)?.sort ?? 0) + 10 }, qs.length, qs.length + 1)); $("#qlist").lastElementChild.scrollIntoView({ behavior: "smooth" }); };
  const list = $("#qlist");
  list.addEventListener("click", ev => {
    const b = ev.target.closest("button"); if (!b) return; const card = b.closest(".qcard");
    if (b.dataset.act === "save") busy(b, async () => {
      const prompt = $(".qp", card).value.trim(), options = $$(".optedit", card).map(r => ({ type: $("select", r).value, text: $("input", r).value.trim() }));
      if (!prompt || options.some(o => !o.text)) return toast("題目與四個選項都需要填寫");
      const id = await A("admin_upsert_question", { r: { id: card.dataset.id || undefined, kind, sort: +card.dataset.sort, prompt, options } });
      card.dataset.id = id; toast("已儲存"); vQuestions(kind);
    });
    if (b.dataset.act === "del") { if (!card.dataset.id) return card.remove(); if (confirm("確定刪除此題？")) busy(b, async () => { await A("admin_delete_question", { p_id: card.dataset.id }); toast("已刪除"); vQuestions(kind); }); }
    if (b.dataset.act === "up" || b.dataset.act === "down") busy(b, async () => {
      const d = b.dataset.act === "up" ? -1 : 1, i = qs.findIndex(q => q.id === card.dataset.id), j = i + d; if (i < 0 || !qs[j]) return;
      const arr = qs.slice(); [arr[i], arr[j]] = [arr[j], arr[i]];
      for (let k = 0; k < arr.length; k++) if (arr[k].sort !== k * 10) await A("admin_upsert_question", { r: { ...arr[k], sort: k * 10 } });
      vQuestions(kind);
    });
  });
}
function qCard(q, i, n) {
  return `<div class="qcard" data-id="${q.id}" data-sort="${q.sort}"><div class="row between"><b>第 ${i + 1} 題</b>
    <span><button class="ghost sm" data-act="up" ${i === 0 ? "disabled" : ""}>↑</button> <button class="ghost sm" data-act="down" ${i >= n - 1 ? "disabled" : ""}>↓</button> <button class="danger sm" data-act="del">刪除</button></span></div>
    <label class="f">題目描述</label><input type="text" class="qp" value="${esc(q.prompt)}">
    <div class="opts">${q.options.map(o => `<div class="optedit"><select>${TYPES.map(t => `<option value="${t}" ${o.type === t ? "selected" : ""}>${TLABEL[t]} ${TNAME[t]}</option>`).join("")}</select><input type="text" value="${esc(o.text)}" placeholder="選項描述"></div>`).join("")}</div>
    <p style="margin:10px 0 0"><button data-act="save" class="sm">💾 儲存此題</button></p></div>`;
}

/* ---------- 填答者結果 ---------- */
async function vResults() {
  const rows = await A("admin_list_results");
  $("#view").innerHTML = `<div class="card"><div class="row between"><h2>👥 填答者結果（${rows.length}）</h2><button class="soft" id="csv" ${rows.length ? "" : "disabled"}>⬇ 匯出 CSV</button></div>
    <div class="scroll-x"><table class="tbl"><thead><tr><th>姓名</th><th>風格</th><th>D</th><th>i</th><th>S</th><th>C</th><th>填答時間</th><th></th></tr></thead><tbody>
    ${rows.map(r => `<tr><td><b>${esc(r.user_name)}</b></td><td>${r.style ? `<span class="pill t-${r.primary_types[0]}">${esc(styleLabel(r.style))}</span>` : `<span class="muted small">舊版</span>`}</td>
      <td>${r.score_d}</td><td>${r.score_i}</td><td>${r.score_s}</td><td>${r.score_c}</td><td class="small">${new Date(r.created_at).toLocaleString("zh-TW")}</td>
      <td><button class="danger sm" data-del="${r.id}">刪除</button></td></tr>`).join("") || `<tr><td colspan="8" class="muted">尚無資料</td></tr>`}</tbody></table></div></div>`;
  $$("[data-del]").forEach(b => b.onclick = () => { const r = rows.find(x => x.id === b.dataset.del); if (confirm(`確定刪除「${r.user_name}」的測評結果？此動作無法復原。`)) busy(b, async () => { await A("admin_delete_result", { p_id: b.dataset.del }); toast("已刪除"); vResults(); }); });
  $("#csv").onclick = () => {
    const head = ["姓名", "風格", "主型", "輔型", "D", "i", "S", "C", "填答時間"];
    const body = rows.map(r => [r.user_name, r.style ? styleLabel(r.style) : "", r.primary_types[0], r.primary_types[1] || "", r.score_d, r.score_i, r.score_s, r.score_c, new Date(r.created_at).toLocaleString("zh-TW")]);
    const csv = [head, ...body].map(l => l.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" })); a.download = "disc_results.csv"; a.click();
  };
}

/* ---------- 彙總報表 ---------- */
async function vReport() {
  const rows = (await A("admin_list_results"));
  const n = rows.length;
  if (!n) { $("#view").innerHTML = `<div class="card"><h2>彙總報表</h2><p class="muted">尚無填答資料。</p></div>`; return; }
  const avg = { D: 0, I: 0, S: 0, C: 0 }; rows.forEach(r => { avg.D += r.score_d; avg.I += r.score_i; avg.S += r.score_s; avg.C += r.score_c; }); TYPES.forEach(t => avg[t] = Math.round(avg[t] / n));
  const prim = { D: 0, I: 0, S: 0, C: 0 }; rows.forEach(r => prim[r.primary_types[0]]++);
  const sty = Object.fromEntries(STYLES.map(s => [s, 0])); rows.forEach(r => { if (r.style && sty[r.style] !== undefined) sty[r.style]++; });
  const maxS = Math.max(1, ...Object.values(sty));
  $("#view").innerHTML = `<div class="grid c2">
    <div class="card"><h2>主型人數分布（共 ${n} 人）</h2>${TYPES.map(t => `<div class="bar-row t-${t}"><b>${TLABEL[t]} ${TNAME[t]}</b><div class="track"><div class="fill" style="width:${prim[t] / n * 100}%"></div></div><span>${prim[t]}人</span></div>`).join("")}</div>
    <div class="card"><h2>全體平均分數</h2>${barsHtml(avg)}</div></div>
  <div class="card" style="margin-top:16px"><h2>DiSC 分布圖</h2><p class="muted">每個點代表一位填答者，位置依其 D／i／S／C 分數計算；分數雷同的填答者會合併成同一個圓圈並標示人數，滑鼠移到點上可看到所有人的姓名。</p>
    <div class="circleWrap" style="max-width:360px">${discScatterSvg(rows)}</div></div>
  <div class="card" style="margin-top:16px"><h2>12 種風格分布</h2>${STYLES.map(s => `<div class="bar-row t-${styleParts(s).p}" style="grid-template-columns:70px 1fr 44px"><b>${styleLabel(s)}</b><div class="track"><div class="fill" style="width:${sty[s] / maxS * 100}%"></div></div><span>${sty[s]}人</span></div>`).join("")}
    <p class="muted small">僅統計使用新版測評（含風格代碼）的紀錄。</p></div>`;
}

/* ---------- 計分邏輯 ---------- */
async function vLogic(kind) {
  const [qs, cfg] = await Promise.all([select("questions", `kind=eq.${kind}&select=options`), A("admin_get_config")]);
  const n = qs.length;
  if (kind === "self") {
    $("#view").innerHTML = `<div class="card"><h2>🧮 「看懂自己」計分邏輯</h2><div class="logic">
      <p><b>1. 作答</b>：每題四個描述各對應一種風格（D / i / S / C）；填答者選出 1 個「最像我」與 1 個「最不像我」。目前共 <b>${n}</b> 題。</p>
      <p><b>2. 原始分</b>：對每個風格 T，<code>原始分(T) = 「最像」選到 T 的次數 − 「最不像」選到 T 的次數</code>，範圍 <code>−${n} ~ +${n}</code>。四型原始分總和恆為 0。</p>
      <p><b>3. 標準化</b>：<code>分數(T) = round( (原始分(T) + ${n}) ÷ ${2 * n} × 100 )</code>，換算成 0–100（50 為中性）。</p>
      <p><b>4. 主型</b>：分數最高者；同分時依 D → i → S → C 順序。</p>
      <p><b>5. 輔型</b>：在圓形模型中，取主型<b>相鄰兩型</b>（D 相鄰 i、C；i 相鄰 D、S；S 相鄰 i、C；C 相鄰 S、D）中分數較高者；當「主型分數 − 該相鄰型分數 ≤ ${cfg.secondary_gap}」時，視為輔型成立，否則只顯示主型。此門檻可於「題目與設定」調整。</p>
      <p><b>6. 12 種風格</b>：D、Di、DC、i（I）、iS（IS）、iD（ID）、C、CS、CD、S、Si、SC。</p>
      <p><b>7. 顯示</b>：結果頁以長條圖呈現四型分數，並在圓形圖上依「各型分數相對 50 分的偏離」向量加總標出位置。結果公開設定目前為「${cfg.show_results ? "公開給填答者，並保存最近一次結果" : "不公開（僅講師後台可見）"}」。重新測驗會覆蓋原紀錄。</p></div>
      <p class="muted small">⚠️ 本測評為自編精簡版，非官方 Everything DiSC® 量表，僅供工作坊學習使用。</p></div>`;
  } else {
    $("#view").innerHTML = `<div class="card"><h2>🧮 「識別他人」計分邏輯</h2><div class="logic">
      <p><b>1. 作答</b>：每題呈現一個生活化的觀察情境，四個選項各對應一種風格；填答者選出最符合對方的一項（可略過）。目前共 <b>${n}</b> 題。</p>
      <p><b>2. 計次</b>：<code>次數(T) = 選到風格 T 的題數</code>。</p>
      <p><b>3. 比重</b>：<code>比重(T) = round( 次數(T) ÷ 已作答題數 × 100 )</code>，以長條圖呈現四型可能比重。</p>
      <p><b>4. 主型</b>：比重最高者；若有並列，畫面會列出並提醒再多觀察。作答題數少於 6 題時，會標註「僅供參考」。</p>
      <p><b>5. 結果僅判斷單一主型</b>，不計算輔型，且不儲存到資料庫。</p></div></div>`;
  }
}

/* ---------- 彈性調適 ---------- */
let adaptMap = {};
const loadAdapt = async () => { adaptMap = Object.fromEntries((await select("adapt_content", "select=key,data")).map(r => [r.key, r.data])); };
async function vTypes() {
  await loadAdapt();
  $("#view").innerHTML = `<p class="muted">調整 D、i、S、C 四種風格的基本對應之道。「已自訂」表示已覆寫預設內容；「還原預設」會刪除自訂。每行一條。</p>
  ${TYPES.map(t => { const d = getType(adaptMap, t), ed = isEdited(adaptMap, "type:" + t); return `
  <div class="card t-${t}" data-t="${t}" style="border-top:6px solid var(--c)"><div class="row between"><h2 style="color:var(--c)">${TLABEL[t]} ${TNAME[t]} ${ed ? `<span class="pill" style="background:var(--brand)">已自訂</span>` : ""}</h2></div>
    <label class="f">簡介</label><textarea data-f="summary" style="min-height:60px">${esc(d.summary)}</textarea>
    <div class="grid c2"><div><label class="f">在乎什麼</label><input type="text" data-f="want" value="${esc(d.want)}"></div><div><label class="f">壓力來源</label><input type="text" data-f="stress" value="${esc(d.stress)}"></div></div>
    <label class="f">這樣溝通（每行一條）</label><textarea data-f="dos">${esc(d.dos.join("\n"))}</textarea>
    <label class="f">避免（每行一條）</label><textarea data-f="donts">${esc(d.donts.join("\n"))}</textarea>
    <label class="f">讓他買單的一句話</label><textarea data-f="tip" style="min-height:60px">${esc(d.tip)}</textarea>
    <div class="row" style="margin-top:12px"><button data-save="${t}">💾 儲存</button><button class="ghost" data-reset="${t}" ${ed ? "" : "disabled"}>還原預設</button></div></div>`; }).join("")}`;
  $$("[data-save]").forEach(b => b.onclick = () => busy(b, async () => {
    const c = b.closest(".card"), g = f => $(`[data-f="${f}"]`, c).value;
    await A("admin_upsert_adapt", { p_key: "type:" + b.dataset.save, p_data: { summary: g("summary").trim(), want: g("want").trim(), stress: g("stress").trim(), dos: lines(g("dos")), donts: lines(g("donts")), tip: g("tip").trim() } });
    toast("已儲存"); vTypes();
  }));
  $$("[data-reset]").forEach(b => b.onclick = () => { if (confirm("還原為預設內容？")) busy(b, async () => { await A("admin_delete_adapt", { p_key: "type:" + b.dataset.reset }); toast("已還原"); vTypes(); }); });
}
let comboSel = { my: "D", other: "I" }, comboDir = "peer";
async function vCombos() {
  await loadAdapt();
  const key = comboKey(comboSel.my, comboSel.other, comboDir), c = getCombo(adaptMap, comboSel.my, comboSel.other, comboDir), ed = isEdited(adaptMap, key);
  // 判斷「已自訂」只看目前這個方向的 key，跟其他方向互不影響（平行＝沒有 :down / :up 後綴）
  const edited = Object.keys(adaptMap).filter(k => k.startsWith("combo:") && (comboDir === "peer" ? !/:(down|up)$/.test(k) : k.endsWith(":" + comboDir))).length;
  $("#view").innerHTML = `<div class="card"><h2>風格應對神器：144 種組合</h2>
    <p class="muted">除了我的風格／對方風格，還可以依關係方向分開管理建議內容。</p>
    <div class="row" style="gap:8px">${DIRECTIONS.map(d => `<button class="${comboDir === d.id ? "" : "ghost"}" data-dirtab="${d.id}">${d.label}</button>`).join("")}</div>
    <p class="muted small" style="margin-top:6px">${esc(DIRECTIONS.find(d => d.id === comboDir).hint)}</p></div>
  <div class="card" style="margin-top:16px"><p class="muted">列＝「我的風格」，欄＝「對方風格」。點選格子即可編輯；<span class="pill" style="background:var(--brand)">實心</span>＝這個方向下已自訂（目前 ${edited} / 144），其餘為系統預設建議。</p>
    <div class="scroll-x"><div class="matrix" style="min-width:640px"><div class="h"></div>${STYLES.map(s => `<div class="h">${esc(styleLabel(s))}</div>`).join("")}
      ${STYLES.map(m => `<div class="h" style="text-align:right;padding-right:6px">${esc(styleLabel(m))}</div>${STYLES.map(o => `<button data-m="${m}" data-o="${o}" class="${isEdited(adaptMap, comboKey(m, o, comboDir)) ? "edited" : ""} ${m === comboSel.my && o === comboSel.other ? "sel" : ""}">${isEdited(adaptMap, comboKey(m, o, comboDir)) ? "●" : "·"}</button>`).join("")}`).join("")}</div></div></div>
  <div class="card" id="cbEd" style="margin-top:16px"><h2>我：<span class="pill t-${styleParts(comboSel.my).p}">${esc(styleLabel(comboSel.my))}</span> → 對方：<span class="pill t-${styleParts(comboSel.other).p}">${esc(styleLabel(comboSel.other))}</span>
      <span class="pill" style="background:var(--muted)">${esc(DIRECTIONS.find(d => d.id === comboDir).label)}</span>
      ${ed ? `<span class="pill" style="background:var(--brand)">已自訂</span>` : `<span class="small muted">（預設）</span>`}</h2>
    <label class="f">一句話重點</label><textarea data-f="summary" style="min-height:60px">${esc(c.summary)}</textarea>
    <div class="grid c2"><div><label class="f">配合對方：這樣說、這樣做（每行一條）</label><textarea data-f="adapt">${esc(c.adapt.join("\n"))}</textarea></div>
      <div><label class="f">避免踩雷</label><textarea data-f="avoid">${esc(c.avoid.join("\n"))}</textarea></div>
      <div><label class="f">善用你的優勢</label><textarea data-f="leverage">${esc(c.leverage.join("\n"))}</textarea></div>
      <div><label class="f">雙方都能接受的共識</label><textarea data-f="ground">${esc(c.ground.join("\n"))}</textarea></div></div>
    <label class="f">需要對方買單時</label><textarea data-f="ask">${esc(c.ask.join("\n"))}</textarea>
    <div class="row" style="margin-top:12px"><button id="cbSave">💾 儲存此組合</button><button class="ghost" id="cbReset" ${ed ? "" : "disabled"}>還原預設</button></div></div>`;
  $$("[data-dirtab]").forEach(b => b.onclick = () => { comboDir = b.dataset.dirtab; vCombos(); });
  $$(".matrix button").forEach(b => b.onclick = () => { comboSel = { my: b.dataset.m, other: b.dataset.o }; vCombos(); setTimeout(() => $("#cbEd").scrollIntoView({ behavior: "smooth" }), 50); });
  $("#cbSave").onclick = e => busy(e.target, async () => {
    const g = f => $(`#cbEd [data-f="${f}"]`).value;
    await A("admin_upsert_adapt", { p_key: key, p_data: { summary: g("summary").trim(), adapt: lines(g("adapt")), avoid: lines(g("avoid")), leverage: lines(g("leverage")), ground: lines(g("ground")), ask: lines(g("ask")) } });
    toast("已儲存"); vCombos();
  });
  $("#cbReset").onclick = e => { if (confirm("還原此組合為預設內容？")) busy(e.target, async () => { await A("admin_delete_adapt", { p_key: key }); toast("已還原"); vCombos(); }); };
}

/* ---------- 啟動 ---------- */
(async () => {
  const saved = store.get("admin_pw");
  if (saved !== null) { try { if (await rpc("admin_login", { pw: saved })) { PW = saved; return boot(); } } catch {} }
  loginView();
})();
