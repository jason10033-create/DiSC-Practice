/* 共用：Supabase 連線、主題、DiSC 資料／計分／預設建議產生器 */
const SUPABASE_URL = "https://rgtgwmbbbdbygasoknuv.supabase.co";
const SUPABASE_KEY = "sb_publishable_DjB0CSECYgCGf4dS1HMuLA_wSjnFah7"; // 公開金鑰；資料表皆由 RLS / 密碼 RPC 保護
const MEDIA_FN = `${SUPABASE_URL}/functions/v1/admin-media`;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/* ---------- API ---------- */
const H = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" };
async function api(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...opts, headers: { ...H, ...(opts.headers || {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(text || res.statusText);
  return text ? JSON.parse(text) : null;
}
const rpc = (name, args = {}) => api(`rpc/${name}`, { method: "POST", body: JSON.stringify(args) });
const select = (table, q = "") => api(`${table}?${q}`);

/* ---------- 主題 ---------- */
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  const b = $("#themeBtn"); if (b) b.textContent = t === "dark" ? "☀️" : "🌙";
}
function initTheme() {
  let t = null; try { t = localStorage.getItem("disc_theme"); } catch {}
  if (!t) t = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  applyTheme(t);
  const b = $("#themeBtn");
  if (b) b.onclick = () => {
    const n = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(n); try { localStorage.setItem("disc_theme", n); } catch {}
  };
}
function toast(msg) {
  let t = $("#toast"); if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add("on"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("on"), 2200);
}

/* ---------- 簡易 Markdown（粗體、斜體、清單、換行）---------- */
function md(text) {
  const lines = esc(text).split("\n"); let out = "", inList = false;
  const inline = s => s.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\*(.+?)\*/g, "<i>$1</i>")
    .replace(/\[(.+?)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  for (const l of lines) {
    const m = l.match(/^\s*[-•]\s+(.*)$/);
    if (m) { if (!inList) { out += "<ul>"; inList = true; } out += `<li>${inline(m[1])}</li>`; }
    else { if (inList) { out += "</ul>"; inList = false; } out += l.trim() ? `<p>${inline(l)}</p>` : ""; }
  }
  return out + (inList ? "</ul>" : "");
}

/* 教材區塊渲染（前台預覽與後台共用） */
function embedUrl(u) {
  let m = u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
  if (m) return `https://www.youtube.com/embed/${m[1]}`;
  m = u.match(/vimeo\.com\/(\d+)/); if (m) return `https://player.vimeo.com/video/${m[1]}`;
  return null;
}
const safeUrl = u => /^https?:\/\//i.test(u || "") ? u : "";
function renderBlock(b) {
  const u = safeUrl(b.url);
  switch (b.type) {
    case "heading": return `<h2 class="blk">${esc(b.text)}</h2>`;
    case "text": return `<div class="blk">${md(b.text || "")}</div>`;
    case "callout": return `<div class="blk callout ${esc(b.tone || "info")}">${md(b.text || "")}</div>`;
    case "image": return u ? `<figure class="blk" style="margin:14px 0"><img src="${esc(u)}" alt="${esc(b.caption || "")}" loading="lazy">${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ""}</figure>` : "";
    case "video": {
      if (!u) return "";
      const e = embedUrl(u);
      return e ? `<div class="blk"><iframe class="ratio" src="${esc(e)}" allowfullscreen loading="lazy"></iframe>${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ""}</div>`
        : `<div class="blk"><video controls preload="metadata" src="${esc(u)}"></video>${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ""}</div>`;
    }
    case "pdf": return u ? `<div class="blk"><iframe class="pdf" src="${esc(u)}"></iframe><p class="small"><a href="${esc(u)}" target="_blank" rel="noopener">📄 ${esc(b.caption || "開啟 PDF")}</a></p></div>` : "";
    case "link": return u ? `<p class="blk"><a class="btn" href="${esc(u)}" target="_blank" rel="noopener">🔗 ${esc(b.text || u)}</a></p>` : "";
    default: return "";
  }
}

/* ============ DiSC 核心資料 ============ */
const TYPES = ["D", "I", "S", "C"];
const STYLES = ["D", "Di", "DC", "I", "IS", "ID", "C", "CS", "CD", "S", "Si", "SC"];
const ADJ = { D: ["I", "C"], I: ["D", "S"], S: ["I", "C"], C: ["S", "D"] };
const TNAME = { D: "主導型", I: "影響型", S: "穩健型", C: "謹慎型" };
const TLABEL = { D: "D", I: "i", S: "S", C: "C" }; // Everything DiSC 慣用小寫 i
const styleParts = s => ({ p: s[0].toUpperCase(), s: s[1] ? s[1].toUpperCase() : null });
const styleLabel = s => { const { p, s: q } = styleParts(s); return TLABEL[p] + (q ? TLABEL[q] : ""); };
const styleDesc = s => { const { p, s: q } = styleParts(s); return `${TNAME[p]}` + (q ? `・帶有${TNAME[q]}傾向` : ""); };

/* 風格判定：主型＝分數最高；輔型＝主型相鄰兩型中較高者，且與主型差距 ≤ gap 才成立 */
function scoreAnswers(questions, answers) {
  const n = questions.length, raw = { D: 0, I: 0, S: 0, C: 0 };
  questions.forEach((q, i) => {
    const a = answers[q.id]; if (!a) return;
    raw[q.options[a.most].type]++; raw[q.options[a.least].type]--;
  });
  const scores = {};
  TYPES.forEach(t => scores[t] = Math.round((raw[t] + n) / (2 * n) * 100));
  return { raw, scores };
}
function judgeStyle(scores, gap) {
  const order = [...TYPES].sort((a, b) => scores[b] - scores[a] || TYPES.indexOf(a) - TYPES.indexOf(b));
  const p = order[0];
  const [a1, a2] = ADJ[p];
  const sec = scores[a1] >= scores[a2] ? a1 : a2;
  const hasSec = scores[p] - scores[sec] <= gap;
  // 對應到 12 種風格代碼（Di、Si 的輔型 i 為小寫；I、IS、ID 的主型 I 為大寫）
  const raw = hasSec ? p + sec : p;
  const style = STYLES.find(x => x.toLowerCase() === raw.toLowerCase()) || p;
  return { style, primary: p, secondary: hasSec ? sec : null };
}

/* ============ 預設建議內容（後台可覆寫）============ */
const PROFILE = {
  D: { short: "果斷、直接、重視結果", want: "掌控局面、快速看到成果、迎接挑戰", stress: "被拖延、被質疑能力、失去掌控",
    comm: ["直接講結論與重點，先說「要做什麼、預期成果」", "給予選擇與自主空間，而不是逐步指示", "用事實與效率說服，避免冗長鋪陳與情緒訴求", "保持自信與眼神接觸，敢於表達不同意見"],
    avoid: ["囉嗦、模糊、繞圈子", "過度閒聊或情緒化表達", "在對方面前顯得猶豫、沒有準備"],
    strength: "決斷力與行動力", blind: "可能太快下結論、忽略他人感受與細節",
    ask: "直接說出需求與期限，並提供 1–2 個選項讓對方決定：「我需要您在○日前決定○○，這樣可以達成○○成果。」" },
  I: { short: "熱情、樂觀、擅長影響他人", want: "被認可、有趣、自由表達、與人連結", stress: "被忽略、被批評、過於嚴格的規範",
    comm: ["先建立關係，友善熱情地開場", "給對方發表想法的空間，並表達欣賞與肯定", "用故事、願景與正向語氣描述，而非過多細節", "把重要細節用書面補充或約定追蹤"],
    avoid: ["冷冰冰、只談數字", "當眾批評或忽視其貢獻", "要求長時間獨立處理繁瑣細節"],
    strength: "感染力與人脈連結", blind: "可能承諾過多、細節與追蹤不足",
    ask: "先肯定、拉近距離，再用願景說明價值：「這件事做成會很有影響力，也需要您的支持。」並約定具體的下一步。" },
  S: { short: "耐心、可靠、重視合作", want: "穩定、和諧、被支持、有充足的準備時間", stress: "突發變動、衝突、被催促",
    comm: ["以溫和、真誠的方式開場，給予安全感", "說明變動的原因與影響，給予足夠的適應時間", "主動詢問想法，耐心等待對方表達", "肯定其付出與長期貢獻"],
    avoid: ["突然大幅變動或施壓催促", "強勢逼迫對方立刻表態", "忽視他們的感受"],
    strength: "耐心傾聽與穩定支持", blind: "可能不敢表達異議、抗拒變動",
    ask: "給予安全感與時間：「我知道這需要調整，我會陪你一起完成，我們可以分階段進行。」並說明對團隊的好處。" },
  C: { short: "嚴謹、精確、重視品質", want: "正確性、專業品質、充足資訊與明確標準", stress: "被批評出錯、資訊不足、被迫倉促決定",
    comm: ["提供事實、數據與清楚的邏輯依據", "給予充足時間思考，避免當場逼迫決定", "以書面、條列方式溝通，重點明確", "尊重其專業，用具體例子而非籠統形容"],
    avoid: ["情緒化、模糊、缺乏依據的說法", "逼迫倉促決定", "忽視細節與品質標準"],
    strength: "分析力與品質把關", blind: "可能過度追求完美、批判性強",
    ask: "準備好依據：「根據○○資料，我的建議是○○，風險與因應如下。」並給對方時間檢視後再回覆。" }
};
const SEC_OTHER = {
  D: "對方也帶有 D 的傾向：更重效率與結果，請說話更直接，並保留決定空間。",
  I: "對方也帶有 i 的傾向：更需要一些熱度與認可，可多一點友善的互動與肯定。",
  S: "對方也帶有 S 的傾向：更在意和諧與節奏，決定前請給予適應與思考的空間。",
  C: "對方也帶有 C 的傾向：更在意邏輯與正確，請備妥依據與細節。"
};
const SEC_ME = {
  D: "你也具備 D 的果斷，必要時可以更明確地表態、推進決定。",
  I: "你也具備 i 的感染力，可以善用熱情與故事讓訊息更有溫度。",
  S: "你也具備 S 的耐心，可善用傾聽與同理拉近距離。",
  C: "你也具備 C 的嚴謹，可善用資料與邏輯增加說服力。"
};
const PAIR = {
  DD: ["兩位都重效率、敢表態，容易正面碰撞、爭奪主導。", "善用你的果斷，直接把目標與期限講清楚，效率會很高。", "先對齊「共同要達成的成果」，再分工各自掌控的範圍，避免爭誰說了算。"],
  DI: ["對方熱情外向，你偏重結果，可能覺得對方不夠聚焦；對方則可能覺得你太嚴肅。", "善用你的果斷幫對話收斂，同時刻意給對方一點表達與被肯定的空間。", "用「有趣又有成果」的方式推進：短時間的分享＋明確的行動事項。"],
  DS: ["你步調快、對方偏穩，容易讓對方覺得被催促，你則覺得對方太慢。", "善用你的行動力給出清楚方向，同時放慢節奏、主動關心對方的感受。", "約定合理的時程與進度節點：你看得到進度，對方也有足夠的準備時間。"],
  DC: ["你們都重任務與邏輯，但你求快、對方求準，容易因速度與細節產生摩擦。", "善用你的決斷力，在對方提供的資料基礎上快速做決定並負責。", "約定「夠用就行」的資訊門檻與決策期限，讓速度與品質取得平衡。"],
  ID: ["你熱情愛表達，對方直接重結果，可能覺得你話多、缺乏重點。", "善用你的感染力與說服力，但先講結論與價值，再補充故事。", "用簡短、聚焦成果的方式呈現熱情，讓對方看到你的行動力與可靠。"],
  II: ["兩人都熱情愛聊，氣氛很好，但容易離題、忽略執行與細節。", "善用你的創意與感染力共同發想，並刻意留意時間與行動項目。", "每次交流結束前用一句話確認「誰、做什麼、何時」。"],
  IS: ["你外向熱絡、對方溫和穩重，可能讓對方感到壓力或跟不上你的節奏。", "善用你的親和力建立信任，並放慢節奏，給對方安靜思考與回應的空間。", "用一對一、輕鬆溫暖的方式互動，讓對方參與決定過程。"],
  IC: ["你重感覺與人際、對方重邏輯與正確，可能覺得你不夠嚴謹，你則覺得對方冷淡。", "善用你的熱情與創意，但備妥資料與依據，避免只靠感覺說服。", "把創意轉成有依據的方案：你提供願景，對方協助檢核可行性。"],
  SD: ["對方強勢快速、你偏穩重配合，容易覺得被壓迫而不敢表達。", "善用你的穩定與可靠，用明確、簡潔的方式表達你的觀點與需求。", "事先確認優先順序與期限，並清楚說出你需要的資源或時間。"],
  SI: ["對方熱情多話、你溫和穩重，相處輕鬆，但你可能一直配合對方而累積壓力。", "善用你的傾聽與支持，同時適度說出自己的想法與界線。", "讓對方多表達，你負責把承諾落實與追蹤細節，形成互補。"],
  SS: ["兩人都溫和、重和諧，相處舒服，但可能都避免衝突、遲遲不做決定。", "善用你的耐心與支持，主動提出想法，並約定決策時點。", "指定一人主導推進，避免因為互相禮讓而拖延。"],
  SC: ["兩人都偏謹慎穩健，合作踏實，但可能過度保守、面對變動反應較慢。", "善用你的穩定與體貼，關心對方的同時，鼓勵嘗試小幅調整。", "用循序漸進的方式試行新做法，並保留檢視與調整的空間。"],
  CD: ["對方直接快速、你重視細節與正確，可能覺得被催促、被要求太快決定。", "善用你的分析力，事先整理精簡的重點與數據，直接提出建議與風險。", "約定決策所需的最低資訊，先給對方結論與建議，再提供細節備查。"],
  CI: ["對方熱情跳躍、重感覺，你重邏輯與細節，可能覺得對方不夠嚴謹。", "善用你的精準與條理，把對方的創意轉化為可行的步驟與細節。", "肯定對方的想法，再用提問方式協助釐清可行性，避免直接否定。"],
  CS: ["對方溫和穩重、你嚴謹謹慎，相處穩定，但可能過於保守或壓抑真實想法。", "善用你的專業與細心，同時用溫和的方式表達意見與關心。", "約定清楚的流程與角色，讓雙方都有安全感與時間準備。"],
  CC: ["兩人都重細節與正確，合作嚴謹，但可能過度分析、彼此挑剔。", "善用你的分析與品質意識，並主動表達肯定，減少過度批判。", "先約定品質標準與決策截止時間，避免無止盡地修正。"]
};

/* 四型基本應對之道（後台 key: type:D） */
function defaultType(t) {
  const P = PROFILE[t];
  return {
    summary: `${TLABEL[t]} ${TNAME[t]}：${P.short}。`,
    want: P.want, stress: P.stress,
    dos: P.comm.slice(), donts: P.avoid.slice(),
    tip: `想讓${TLABEL[t]}型的人買單：${P.ask}`
  };
}
/* 12×12 組合建議（後台 key: combo:我的風格>對方風格） */
function defaultCombo(my, other) {
  const a = styleParts(my), b = styleParts(other), A = PROFILE[a.p], B = PROFILE[b.p];
  const [dyn, lev, ground] = PAIR[a.p + b.p];
  const adapt = B.comm.slice(); if (b.s) adapt.push(SEC_OTHER[b.s]);
  const leverage = [lev, `你的核心優勢是「${A.strength}」，在這段關係中請有意識地發揮。`]; if (a.s) leverage.push(SEC_ME[a.s]);
  const avoid = B.avoid.slice(); avoid.push(`留意你自己的盲點：${A.blind}。`);
  const ask = [B.ask, "同時說明這件事對對方（與雙方）的好處，讓對方是「認同」而不是「被迫配合」。"];
  if (b.s) ask.push(SEC_OTHER[b.s]);
  return { summary: dyn, adapt, leverage, ground: [ground], ask, avoid };
}
const isEdited = (map, key) => !!map[key];
const getType = (map, t) => map["type:" + t] || defaultType(t);
const getCombo = (map, my, other) => map[`combo:${my}>${other}`] || defaultCombo(my, other);

/* ============ DiSC 圓形圖（點位置表示強弱與傾向）============ */
function circleSvg(scores) {
  const R = 100, v = { D: [-1, -1], I: [1, -1], S: [1, 1], C: [-1, 1] };
  let x = 0, y = 0;
  TYPES.forEach(t => { const w = (scores[t] - 50) / 50; x += v[t][0] * w; y += v[t][1] * w; });
  x /= 2; y /= 2; // 約 -1..1
  const len = Math.hypot(x, y), max = 0.92; if (len > max) { x = x / len * max; y = y / len * max; }
  const cx = 110 + x * R, cy = 110 + y * R;
  return `<svg viewBox="0 0 220 220" role="img" aria-label="DiSC 圓形圖">
    <defs><clipPath id="cc"><circle cx="110" cy="110" r="104"/></clipPath></defs>
    <g clip-path="url(#cc)">
      <rect x="6" y="6" width="104" height="104" fill="var(--D)" opacity=".85"/><rect x="110" y="6" width="104" height="104" fill="var(--I)" opacity=".85"/>
      <rect x="110" y="110" width="104" height="104" fill="var(--S)" opacity=".85"/><rect x="6" y="110" width="104" height="104" fill="var(--C)" opacity=".85"/></g>
    <circle cx="110" cy="110" r="104" fill="none" stroke="var(--surface)" stroke-width="4"/>
    <line x1="110" y1="6" x2="110" y2="214" stroke="var(--surface)" stroke-width="3"/><line x1="6" y1="110" x2="214" y2="110" stroke="var(--surface)" stroke-width="3"/>
    <text x="58" y="66" font-size="30" font-weight="900" fill="#fff" text-anchor="middle">D</text><text x="162" y="66" font-size="30" font-weight="900" fill="#fff" text-anchor="middle">i</text>
    <text x="162" y="170" font-size="30" font-weight="900" fill="#fff" text-anchor="middle">S</text><text x="58" y="170" font-size="30" font-weight="900" fill="#fff" text-anchor="middle">C</text>
    <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="11" fill="#fff" stroke="#1d2233" stroke-width="4"/></svg>`;
}
function barsHtml(scores, suffix = "") {
  return [...TYPES].sort((a, b) => scores[b] - scores[a]).map(t => `
    <div class="bar-row t-${t}"><b>${TLABEL[t]} ${TNAME[t]}</b><div class="track"><div class="fill" style="width:${scores[t]}%"></div></div><span>${scores[t]}${suffix}</span></div>`).join("");
}

initTheme();
