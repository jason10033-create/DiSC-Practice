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
/* 「需要對方買單時」專用的輔型補充，刻意與 SEC_OTHER（配合對方溝通）寫不同角度，避免兩欄內容重複 */
const SEC_OTHER_ASK = {
  D: "對方也帶有 D 的傾向：除了說明好處，也給他一點挑戰或自主空間，讓他覺得是自己做的決定，而不是被你說服的。",
  I: "對方也帶有 i 的傾向：除了講道理，也讓他有機會公開表態支持、被看見是促成這件事的人，他會更願意買單。",
  S: "對方也帶有 S 的傾向：除了說明好處，也給他一點時間消化、並確認不會影響團隊和諧，他才會真心點頭而不是口頭答應。",
  C: "對方也帶有 C 的傾向：除了說明好處，最好附上具體的依據或先例，讓他確認這個決定經得起檢驗，才會真正放心支持。"
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
/* 關係方向（風格應對神器用）：平行沿用原本無後綴的 key，向下相容既有 144 組自訂內容 */
const DIRECTIONS = [
  { id: "peer", label: "平行單位", hint: "同儕或跨部門" },
  { id: "down", label: "上對下", hint: "我是主管，對方是部屬" },
  { id: "up", label: "下對上", hint: "我是部屬，對方是主管" }
];
/* 上對下：key＝我(主管)+對方(部屬)的主型，各給 [互動張力, 善用優勢的具體做法, 怎麼讓部屬買單] */
const PAIR_DOWN = {
  DD: ["你和部屬都要效率與主導權，管得太細他會覺得不被信任，容易正面頂撞。", "把目標與底線講清楚後就放手，給他足夠的決策空間，D型部屬要的是舞台不是監督。", "用「挑戰」說服最有效：把任務講成值得拿下的目標，而不是交辦事項，他會自動衝。"],
  DI: ["你重結果、步調快，I型部屬重視被看見與互動，只下指令不給肯定，他會漸漸提不起勁。", "用你的決斷力定方向，同時刻意留時間讓他發表想法、公開肯定他的貢獻。", "簡短說明「為什麼這麼做、做成有什麼意義」，再給他發揮空間，比單純交辦更讓他投入。"],
  DS: ["你步調快、要直接的回應，S型部屬需要時間消化與安全感，太急會讓他不敢說真話。", "用你的行動力給出清楚方向，同時放慢詢問的節奏，主動問「你覺得呢」。", "給明確的期限與步驟，先肯定他一向的穩定可靠，他會配合，但要感覺被尊重而非被催促。"],
  DC: ["你要速度，C型部屬要精準，一直催促決定，他可能因為怕出錯而更謹慎、顯得拖延。", "設定清楚的時限與「夠用就好」的標準，讓他在範圍內發揮專業，而非等他做到完美。", "說明「最壞的風險是什麼、可接受的誤差多少」，他確認過風險後會更快跟上你的節奏。"],
  ID: ["你喜歡先聊再做，D型部屬只想知道結果跟期限，太多鋪陳他會覺得沒效率、沒方向。", "開口先講清楚目標跟截止日，再用願景補充動機；用熱情激勵士氣，但順序要對。", "給明確的成果指標跟自主空間，少用情感訴求、多給挑戰與授權，他會自己衝出成績。"],
  II: ["你和部屬都熱情愛聊，氣氛融洽，但容易只有共識沒有行動，進度追蹤常被忽略。", "善用共同的感染力一起發想，同時你要主動當「收尾的人」，每次談完訂出行動項目與期限。", "熱情鼓勵加上具體里程碑一起說，例如「這個月做到這樣，我們就會很有成就感」。"],
  IS: ["你表達直接又有感染力，S型部屬習慣安靜觀察，容易在你開口前就選擇不說、默默照做。", "用親和力建立信任感，同時放慢節奏、主動一對一詢問他的想法，給安全的表達空間。", "私下溫和地問「你真正的想法是什麼」，並肯定他一直以來的穩定付出，他才會說真心話。"],
  IC: ["你喜歡先有願景再邊做邊調，C型部屬需要清楚規格與邏輯，太籠統的指示會讓他卡住。", "用你的創意提出方向，把細節確認與規劃交給他負責，讓他把想法落地成可執行步驟。", "提供具體依據或範例、而不只是問「你覺得呢」，他確認規格合理後會比你想像的更快做好。"],
  SD: ["你習慣穩紮穩打、照顧大家感受，D型部屬要明快的決定，太多猶豫會讓他不耐、甚至越級行動。", "善用你的耐心建立信任，同時練習更快給出明確的決定和期限，讓他感受到你也能帶節奏。", "直接告訴他「你的決定是什麼、要他做什麼」，少用委婉徵詢的語氣，他反而會更尊重你。"],
  SI: ["你習慣安靜支持、不太張揚，I型部屬需要熱度與被看見的感覺，太少互動會讓他失去動力。", "用你的傾聽與穩定讓他安心，同時主動多給公開的肯定與一些表現舞台，滿足他被認可的需求。", "用輕鬆、帶點熱度的方式交辦，並明確說出「這件事對團隊有多重要」，他會更有衝勁。"],
  SS: ["你們都溫和重和諧，相處舒服，但可能都不想當那個「逼進度」的人，事情容易一拖再拖。", "善用彼此的信任鼓勵他，同時你要主動扮演推進的角色，溫和但明確地訂出時間點與檢核方式。", "用支持的語氣加上具體期限，例如「我相信你做得到，我們約定這週五前完成」。"],
  SC: ["你習慣用感受和關係帶人，C型部屬需要清楚標準和邏輯依據，太模糊的指示會讓他反覆確認、沒安全感。", "用你的體貼建立信任，同時把要求和標準講得更具體有條理，讓他知道「怎樣算做對」。", "先肯定他的專業，再用數據或明確標準說明你的期待，他確認方向正確後會比誰都可靠。"],
  CD: ["你重視正確與流程，D型部屬要速度與結果，等你確認完所有細節，他可能已經想自己先衝了。", "善用你的分析力先把風險與底線講清楚，然後放手讓他用自己的方式快速執行，別事事要求先匯報。", "直接告訴他「目標跟不能碰的紅線是什麼」，剩下交給他決定怎麼做，他要的是信任不是流程。"],
  CI: ["你重視精準與邏輯，I型部屬重視感覺與被肯定，你覺得理所當然的「就事論事」，對他可能像在挑剔。", "善用你的嚴謹把關品質，同時記得先肯定他的努力和創意，再提出需要修正的地方，順序很重要。", "用具體標準說明「哪裡需要調整、為什麼」，但開場先給一點溫度和肯定，他才聽得進去。"],
  CS: ["你習慣用標準和邏輯溝通，S型部屬習慣配合、不太主動反映困難，你以為沒問題，他可能在默默硬撐。", "善用你的專業把方向定清楚，同時主動關心他的狀況，明確地問「這樣的量你吃得消嗎」。", "把要求拆成清楚步驟、給足夠時間，並肯定他一直以來的穩定，他會比你想像中更願意扛起責任。"],
  CC: ["你們都重視精準與邏輯，討論會很扎實，但也容易陷入反覆確認、彼此挑剔細節，遲遲無法定案。", "善用共同的專業互相把關品質，同時你要主動設定「討論到此為止、該決定了」的時間點。", "明確訂出品質標準與決策期限，並肯定他的嚴謹，他在清楚的規則下會比誰都讓人放心。"]
};
/* 下對上：key＝我(部屬)+對方(主管)的主型，各給 [互動張力, 善用優勢的具體做法, 怎麼讓主管買單] */
const PAIR_UP = {
  DD: ["你和主管都直接果斷，想法不同時容易正面衝突，但把重點講清楚，他反而會尊重有主見的人。", "直接提出你的判斷和建議方案，不要拐彎抹角，D型主管最怕部屬沒有想法。", "先講結論、再講理由，清楚說明「需要他決定或授權的是什麼」，這種直接最對他的胃口。"],
  ID: ["你習慣先聊再切入重點，D型主管只想先知道結果，開場拖太久會讓他失去耐性、覺得你沒重點。", "用親和力建立關係，但報告時先講結論和數字，再補充你的想法和熱情，順序對了才有效。", "開口先說「這樣做能達成什麼目標、要花多少時間」，再補充細節，而不是先閒聊。"],
  SD: ["D型主管步調快、說話直接，你習慣多想一下再回應，不主動跟上節奏容易顯得被動。", "善用你的穩定和可靠贏得信任，同時練習更快、更明確地表達立場，不要只是默默配合。", "需要時間就直接說「我需要到幾號才能給答覆」，他尊重清楚的界線多過模糊的配合。"],
  CD: ["你重視把事情做對、做完整，D型主管重視速度，每次都想確認到完美才回報，他會覺得你在拖。", "善用你的嚴謹把關風險，但先給「重點結論＋關鍵風險」的精簡版，細節備查就好。", "說明「這個決定要花多少時間、風險是什麼」，給他一個可以馬上拍板的簡化版本。"],
  DI: ["你習慣直接講重點，I型主管重視互動和被肯定，每次只回報結果、不給任何回應，他會覺得難溝通。", "善用你的效率把事情做好，同時花一點時間回應他的熱情、給一點肯定和互動，關係會順很多。", "講結果之前先肯定他的想法或這件事的意義，他會更願意支持你接下來要的資源或決定。"],
  II: ["你和主管都健談、容易聊開，關係通常很好，但也容易只有共識沒有具體下一步，事情不了了之。", "善用默契和熱情爭取資源與支持，同時主動把「結論跟行動項目」講清楚，不要全靠他記得。", "用熱情加上具體提案說服他，例如「這樣做大家都會很有感，而且下週就能看到成果」。"],
  SI: ["I型主管喜歡互動和熱度，你習慣安靜做好份內的事，都不主動表達容易被忽略或誤會沒想法。", "善用你的穩定讓他放心交辦任務，同時練習主動分享你的進度和想法，不要等他來問。", "用稍微外顯一點的方式讓他知道你的努力和成果，沉默容易被誤解成沒在做事。"],
  CI: ["I型主管重視感覺和氛圍，你重視精準和邏輯，直接指出問題或風險，容易讓他覺得你在潑冷水。", "善用你的嚴謹把關細節，表達疑慮前先肯定他的想法和方向，再提出具體的修正建議。", "用「這樣做會更好」取代「這樣不對」，他需要先感覺被支持，才聽得進去你的專業意見。"],
  DS: ["你習慣直接要答案、要行動，S型主管需要時間考慮、重視大家的感受，太強勢會讓他感到壓力。", "善用你的行動力提出清楚的建議和時間表，同時放慢語氣、給他消化和討論的空間。", "先說明「這樣做對大家都好」，再提出你的建議，他在感覺安全、沒被逼迫時會更願意支持你。"],
  IS: ["你熱情外向、話多，S型主管習慣安靜傾聽、不太主動打斷，你可能不知不覺就主導了對話。", "善用你的感染力帶動氣氛，同時記得放慢節奏、主動留空檔讓他回應，確認他真正的想法。", "講完想法後具體地問「你覺得呢」並安靜等他回答，他需要空間才會說出真正的意見。"],
  SS: ["你和主管都溫和、重視和諧，相處舒服，但也容易都不想當提出問題的人，小狀況容易被放著。", "善用彼此的信任，覺得不對勁時溫和但明確地主動提出來，不用等他先開口。", "用「我有一個想法，想跟你確認一下」這種溫和但明確的開場，他會認真回應。"],
  CS: ["S型主管重視關係和穩定，你重視邏輯和精準，太直接指出流程或決策的問題，容易讓他感到被針對。", "善用你的分析力提供扎實的建議，但提出疑慮前先表達理解和肯定，讓他感覺你是在幫忙。", "用「我整理了一些資料，想請你參考」取代直接糾正，他在感覺被尊重時會更願意採納。"],
  DC: ["你想要快速拍板、往前推進，C型主管需要足夠資訊和邏輯才安心決定，太急會讓他更謹慎、更慢。", "善用你的行動力先把事情推進到一定程度，同時主動補齊他在意的細節和依據，減少來回。", "附上明確的資料和風險評估，證明「這個決定有把握」，他確認依據後批准速度會比你想像快。"],
  IC: ["C型主管重視精準和依據，你習慣用感覺和熱情表達，報告缺乏具體數據，容易讓他覺得不夠嚴謹。", "善用你的創意提出想法，同時報告前先準備好具體的數字或範例，讓熱情有扎實的內容支撐。", "先條列重點、附上依據，再分享你的想法和熱情，他看到準備充分會更願意相信你的判斷。"],
  SC: ["C型主管重視標準和細節，你習慣配合、不太主動提出困難，久了容易默默累積壓力卻不說。", "善用你的細心把事情做到位，標準不清楚或負荷太重時主動提出來討論，而不是自己硬撐。", "具體說明「目前卡在哪裡、需要什麼協助」，清楚的描述比委婉的暗示對他更有效。"],
  CC: ["你和主管都重視精準和邏輯，討論會很扎實，但也容易陷入反覆確認、要求完美，遲遲沒有定案。", "善用共同的專業把分析做扎實，同時主動提出「這個版本已經足夠，建議這樣定案」，幫忙收斂。", "附上完整的依據和比較，並清楚標示你的建議方案，他在資訊充足、邏輯清楚時會很快決定。"]
};
/* 上對下：key＝我(主管)+對方(部屬)的主型，「找到雙方都能接受的共識」客製版 */
const GROUND_DOWN = {
  DD: "與其爭論誰的方法對，不如一起訂出「這次用誰的方式、下次換誰主導」的規則，兩個D型都需要感覺自己有掌控權。",
  DI: "把成果分成「主管要的數字」和「部屬想要的舞台」分開談：達標的同時，也給他對外分享成果的機會。",
  DS: "約定一個「你盯進度、他抓細節」的分工，讓他在穩定的框架裡有自己能掌控的節奏，雙方都安心。",
  DC: "先定「必須達成的目標」，再讓他決定「用什麼方法、什麼標準」去做，速度和品質各退一步。",
  ID: "把「你重視的氣氛和認同」與「他重視的效率和成果」放在同一個目標裡：例如公開表揚達標的具體數字。",
  II: "找一個你們都負責的角色分工：你主持氣氛、對外溝通，另外指定一個人專門盯進度和截止日。",
  IS: "約定「你來提案、他來把關可行性」的合作模式，讓他有時間消化，也讓你保有主導的熱度。",
  IC: "你提供方向和創意，讓他負責把關細節和風險，彼此在各自擅長的部分有決定權。",
  SD: "約定「重大方向你裁示、執行細節部屬決定」的界線，讓他有可以衝的空間，你也不用事事妥協。",
  SI: "一起規劃一個能讓他發揮、又不失焦的舞台，例如由他負責對外展示成果，你負責把關內容。",
  SS: "明訂「誰是這件事最後拍板的人」，避免兩人都太客氣、互相禮讓而遲遲沒有結論。",
  SC: "先一起確認「做到什麼程度算完成」的具體標準，再各自按自己的步調執行，減少反覆確認的來回。",
  CD: "把決策拆成「你定的風險底線」和「他負責的執行速度」兩塊，讓他在底線內自由發揮。",
  CI: "先一起討論出一個「有邏輯又有溫度」的版本：你把關事實，他負責讓這個方案講起來更有說服力。",
  CS: "明確約定檢核的頻率和方式，讓他知道「什麼時候該回報、回報到什麼程度」，雙方都有安全感。",
  CC: "一起訂出「這個版本已經足夠」的具體判斷標準，避免兩個人都想做到完美而沒完沒了。"
};
/* 下對上：key＝我(部屬)+對方(主管)的主型，「找到雙方都能接受的共識」客製版 */
const GROUND_UP = {
  DD: "與其堅持己見，不如明確提出「我建議這樣做，但最終由你決定」，讓他保有拍板權，你也表達了立場。",
  ID: "把你的想法包成一個「附帶成果預期的提案」，讓他看到具體效益，而不是只感受到你的熱情。",
  SD: "主動提出一個你能負責、又符合他要求速度的方案，讓他看到你不只是配合、也有自己的判斷。",
  CD: "給他一個附風險評估的簡化版建議，讓他能快速拍板，同時你保留了你重視的嚴謹。",
  DI: "在你的結論裡加一句肯定他或團隊的話，讓他感覺到被在乎，也達到你想要的效率溝通。",
  II: "把共識整理成一句簡短的行動宣言，讓你們熱絡的討論真的能收斂成下一步要做的事。",
  SI: "主動安排一個固定的分享時間，讓他感受到你的參與感，你也不用一直被動等他來問。",
  CI: "先肯定他的方向，再附上你整理的資料當作「加分的細節」，讓熱情和嚴謹可以並存。",
  DS: "提出一個有明確時間表、但保留他可以調整空間的方案，讓他感覺被尊重、不是被逼迫。",
  IS: "放慢你說話的速度，主動留時間讓他回應，確認他真正同意後再往下推進，而不是你一個人講完就算數。",
  SS: "你們都重和諧，可以用「我們先試一週，不行再調整」這種低風險的方式取得共識，雙方都有安全感。",
  CS: "用「我提供分析，你做最後決定」的方式合作，讓他感覺被支持，而不是被要求照做。",
  DC: "給他一個附具體數據的精簡版建議，讓他能用邏輯判斷，而不用等你把全部細節講完。",
  IC: "把你的想法用條列、有依據的方式呈現，讓他看到你的熱情背後也有扎實的準備。",
  SC: "主動依照他重視的標準先把你負責的部分整理清楚，讓他感覺流程是在掌控之中。",
  CC: "一起列出「目前已經足夠、不需要再深究」的判斷清單，避免兩人都想追求完美而卡住決策。"
};
/* 上對下：key＝我(主管)+對方(部屬)的主型，「避免踩雷」客製版（3條） */
const AVOID_DOWN = {
  DD: ["不要事事插手細節，會讓他覺得不被信任", "不要用「因為我是主管」壓他，他更吃「誰的方案更好」", "不要在他面前猶豫不決，會讓他對你失去信心"],
  DI: ["不要只看結果不給肯定，他會覺得努力被忽視", "不要在大家面前直接否定他的點子，私下給建議比較有效", "不要用冷冰冰、純數字的方式交辦，他需要一點熱度"],
  DS: ["不要臨時變更方向又要求立刻執行，他需要時間調整", "不要在會議上逼他當場表態，他需要先消化", "不要忽略他長期的穩定付出，只看最新的結果"],
  DC: ["不要催他跳過該有的檢查步驟，他會因此更不安", "不要用「差不多就好」打發他對品質的堅持", "不要在資訊不足的狀態下逼他做決定"],
  ID: ["不要花太多時間閒聊才進入正題，他會失去耐性", "不要只給願景沒有具體的目標和期限", "不要在他已經有結論時還一直想重新討論"],
  II: ["不要只顧著氣氛熱絡卻沒訂出具體的行動項目", "不要兩人都避開需要嚴肅處理的進度落後問題", "不要忘記定期追蹤承諾過的事有沒有做到"],
  IS: ["不要用強勢熱情的語氣逼他立刻回應", "不要公開點名要求他表態，他更適合私下溝通", "不要忽略他安靜背後可能藏著還沒說出口的疑慮"],
  IC: ["不要只給籠統的方向卻沒有具體的規格依據", "不要對他指出的風險或問題表現不耐煩", "不要臨時改變決定卻沒說明原因，他需要邏輯支撐"],
  SD: ["不要用委婉、模糊的方式交辦，他會覺得沒有方向", "不要猶豫太久才做決定，他的耐心有限", "不要因為怕衝突而不糾正他過於強勢的行為"],
  SI: ["不要太少互動和肯定，他會覺得被冷落", "不要讓他長期沒有表現或發聲的機會", "不要用過於安靜含蓄的方式回應他的熱情"],
  SS: ["不要兩人都迴避該做的決定，進度會停滯", "不要因為顧慮和諧而不指出真正的問題", "不要忘記定期檢核進度，只靠彼此信任不夠"],
  SC: ["不要用模糊的標準或口頭交代，他需要明確依據", "不要因為心軟而放寬不該放寬的品質要求", "不要忽略他反覆確認背後其實是想把事情做對"],
  CD: ["不要要求他等所有細節都確認完才能行動", "不要用過多流程綁住他，他需要行動的空間", "不要在他已經準備好執行時還反覆修改方向"],
  CI: ["不要一開口就先指出問題，先肯定再糾正", "不要用太生硬、沒有溫度的方式給回饋", "不要忽視他的創意，只用邏輯全面否定"],
  CS: ["不要只給標準不給足夠完成的時間", "不要忽略他默默配合背後可能已經負荷過重", "不要用過於嚴苛的語氣指出他的疏漏"],
  CC: ["不要兩人都陷入反覆修改、遲遲不定案", "不要用過於挑剔的方式檢視他的成果", "不要忘記在夠好的時候該放手讓他執行"]
};
/* 下對上：key＝我(部屬)+對方(主管)的主型，「避免踩雷」客製版（3條） */
const AVOID_UP = {
  DD: ["不要只質疑他的決定方式，卻不提出替代方案", "不要用強硬的語氣頂撞，會變成意氣之爭", "不要在還沒想清楚替代方案前就直接反對"],
  ID: ["不要用太長的鋪陳才講到重點，他會失去耐性", "不要只靠感覺或熱情說服他，要有具體的依據", "不要忽略他已經下的結論還一直想多聊"],
  SD: ["不要因為怕衝突而完全不表達自己的想法", "不要等他主動來問，應該主動回報進度", "不要用模糊的方式回應，他需要明確的答案"],
  CD: ["不要堅持把每個細節都報告完才給結論", "不要用過於保守、猶豫的語氣提出建議", "不要在他要你快速決定時還一直要求更多時間"],
  DI: ["不要只給結論不給任何情感上的回應", "不要在他分享想法時顯得不耐煩或敷衍", "不要忽略跟他維繫關係，只專注在任務本身"],
  II: ["不要只顧著聊得開心卻沒收斂出具體的下一步", "不要忘記追蹤彼此口頭答應過的事", "不要用情緒化的方式處理意見不合"],
  SI: ["不要太安靜被動，他需要你主動表達和分享", "不要把成果悶著不說，適度讓他看見你的努力", "不要誤以為沉默配合就是最好的支持方式"],
  CI: ["不要太直接指出問題，容易讓他覺得被潑冷水", "不要只給數據不給一點溫度和肯定", "不要用過於嚴肅的語氣回應他的熱情提案"],
  DS: ["不要用強勢、急迫的態度逼他立刻決定", "不要忽略他需要時間消化變動", "不要用「這很簡單」打發他謹慎的考量"],
  IS: ["不要一直主導對話，沒有留空間讓他回應", "不要用太快的節奏推進，讓他來不及消化", "不要誤把他的安靜當成沒意見或默許"],
  SS: ["不要兩人都不想當提出問題的人，小事拖成大事", "不要用過於委婉、模糊的方式表達需求", "不要忘記主動確認彼此對進度的認知是否一致"],
  CS: ["不要用太直接、沒有鋪陳的方式指出流程的問題", "不要讓他覺得你在挑剔而不是在幫忙", "不要忽略他需要時間接受你建議的改變"],
  DC: ["不要跳過他在意的細節，直接要求快速拍板", "不要用「差不多就好」回應他對精準度的要求", "不要在資訊不足時催促他立刻做決定"],
  IC: ["不要只憑感覺和熱情報告，缺乏具體依據", "不要忽略他指出的風險，覺得他想太多", "不要用籠統的說法回應他想要的明確數字"],
  SC: ["不要因為不想造成困擾而隱瞞真實的進度或困難", "不要用模糊的回應敷衍他想要的具體標準", "不要默默硬撐超出負荷的工作量不說"],
  CC: ["不要兩人都陷入反覆確認、遲遲無法定案", "不要忽略在資訊已經足夠時該提出具體建議", "不要用過度保守的方式迴避表達自己的判斷"]
};
/* 依「對方的風格」額外補充一條溝通眉角（上對下看部屬類型／下對上看主管類型） */
const ADAPT_DOWN = {
  D: "交辦時給他清楚的目標和期限，然後放手讓他決定怎麼做，不需要時時確認進度。",
  I: "交辦工作時記得多給他公開肯定和表現的機會，單純的「謝謝」比制式的回饋更有感。",
  S: "給他足夠的準備時間，變動盡量提前告知，讓他有心理準備而不是臨時被通知。",
  C: "把要求的標準和格式講清楚，並讓他知道可以參考的依據，減少他來回確認的次數。"
};
const ADAPT_UP = {
  D: "報告時先講結論和數字，需要他決定的事項列清楚，他沒空聽你鋪陳過程。",
  I: "多花一點時間互動、回應他的想法，純粹的工作彙報對他來說可能顯得生硬。",
  S: "重大的變動或壞消息提早一點讓他知道，給他一些消化和準備的時間。",
  C: "報告附上依據和數據，讓他知道你的判斷是有邏輯根據的，而不只是直覺。"
};
/* 12×12×3 組合建議（後台 key: combo:我的風格>對方風格，上對下/下對上加 :down / :up 後綴） */
function defaultCombo(my, other, direction = "peer") {
  const a = styleParts(my), b = styleParts(other), A = PROFILE[a.p], B = PROFILE[b.p];
  const dirTable = direction === "down" ? PAIR_DOWN : direction === "up" ? PAIR_UP : null;
  const groundTable = direction === "down" ? GROUND_DOWN : direction === "up" ? GROUND_UP : null;
  const avoidTable = direction === "down" ? AVOID_DOWN : direction === "up" ? AVOID_UP : null;
  const [dyn, lev, groundPeer] = PAIR[a.p + b.p];
  const adapt = B.comm.slice(); if (b.s) adapt.push(SEC_OTHER[b.s]);
  const avoid = (avoidTable ? avoidTable[a.p + b.p].slice() : B.avoid.slice());
  avoid.push(`留意你自己的盲點：${A.blind}。`);
  let summary = dyn, leverage = [lev, `你的核心優勢是「${A.strength}」，在這段關係中請有意識地發揮。`];
  let ask = [B.ask, "同時說明這件事對對方（與雙方）的好處，讓對方是「認同」而不是「被迫配合」。"];
  let ground = groundPeer;
  if (dirTable) {
    const [d2, lev2, ask2] = dirTable[a.p + b.p];
    summary = d2; leverage = [lev2]; ask = [ask2];
    adapt.push(direction === "down" ? ADAPT_DOWN[b.p] : ADAPT_UP[b.p]);
  }
  if (groundTable) ground = groundTable[a.p + b.p];
  if (a.s) leverage.push(SEC_ME[a.s]);
  if (b.s) ask.push(SEC_OTHER_ASK[b.s]);
  return { summary, adapt, leverage, ground: [ground], ask, avoid };
}
const isEdited = (map, key) => !!map[key];
const getType = (map, t) => map["type:" + t] || defaultType(t);
const comboKey = (my, other, direction = "peer") => `combo:${my}>${other}${direction === "peer" ? "" : ":" + direction}`;
const getCombo = (map, my, other, direction = "peer") => map[comboKey(my, other, direction)] || defaultCombo(my, other, direction);

/* ============ DiSC 圓形圖（點位置表示強弱與傾向）============ */
function discPoint(scores, R = 100, cx0 = 110, cy0 = 110) {
  const v = { D: [-1, -1], I: [1, -1], S: [1, 1], C: [-1, 1] };
  let x = 0, y = 0;
  TYPES.forEach(t => { const w = (scores[t] - 50) / 50; x += v[t][0] * w; y += v[t][1] * w; });
  x /= 2; y /= 2; // 約 -1..1
  const len = Math.hypot(x, y), max = 0.92; if (len > max) { x = x / len * max; y = y / len * max; }
  return { x: cx0 + x * R, y: cy0 + y * R };
}
const discQuadrantSvg = size => `<defs><clipPath id="cc${size}"><circle cx="110" cy="110" r="104"/></clipPath></defs>
  <g clip-path="url(#cc${size})">
    <rect x="6" y="6" width="104" height="104" fill="var(--D)" opacity=".85"/><rect x="110" y="6" width="104" height="104" fill="var(--I)" opacity=".85"/>
    <rect x="110" y="110" width="104" height="104" fill="var(--S)" opacity=".85"/><rect x="6" y="110" width="104" height="104" fill="var(--C)" opacity=".85"/></g>
  <circle cx="110" cy="110" r="104" fill="none" stroke="var(--surface)" stroke-width="4"/>
  <line x1="110" y1="6" x2="110" y2="214" stroke="var(--surface)" stroke-width="3"/><line x1="6" y1="110" x2="214" y2="110" stroke="var(--surface)" stroke-width="3"/>
  <text x="58" y="66" font-size="30" font-weight="900" fill="#fff" text-anchor="middle">D</text><text x="162" y="66" font-size="30" font-weight="900" fill="#fff" text-anchor="middle">i</text>
  <text x="162" y="170" font-size="30" font-weight="900" fill="#fff" text-anchor="middle">S</text><text x="58" y="170" font-size="30" font-weight="900" fill="#fff" text-anchor="middle">C</text>`;
function circleSvg(scores) {
  const p = discPoint(scores);
  return `<svg viewBox="0 0 220 220" role="img" aria-label="DiSC 圓形圖">${discQuadrantSvg("main")}
    <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="11" fill="#fff" stroke="#1d2233" stroke-width="4"/></svg>`;
}
/* 多人散點圖：每個填答者一個點，滑鼠移到點上顯示姓名（title 提示）；
   位置相近（分數雷同）的填答者會合併成同一個圓圈，圈上標示人數，提示文字列出所有人的姓名 */
function discScatterSvg(rows) {
  const CLUSTER_R = 5; // 視窗座標系 220×220 中，多近視為「雷同」
  const groups = [];
  rows.forEach(r => {
    const p = discPoint({ D: r.score_d, I: r.score_i, S: r.score_s, C: r.score_c });
    const t = (r.primary_types && r.primary_types[0]) || "D";
    let g = groups.find(g => Math.hypot(g.x - p.x, g.y - p.y) <= CLUSTER_R);
    if (!g) { g = { x: p.x, y: p.y, items: [] }; groups.push(g); }
    g.items.push({ name: r.user_name, style: r.style, t }); // 群中心固定用第一個加入者的位置
  });
  const dots = groups.map(g => {
    const n = g.items.length;
    const cnt = {}; g.items.forEach(i => cnt[i.t] = (cnt[i.t] || 0) + 1);
    const mainType = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
    const r = Math.min(7 + (n - 1) * 2.5, 16);
    const label = g.items.map(i => `${i.name}${i.style ? "（" + styleLabel(i.style) + "）" : ""}`).join("、");
    return `<g><circle cx="${g.x.toFixed(1)}" cy="${g.y.toFixed(1)}" r="${r}" fill="var(--${mainType})" stroke="#fff" stroke-width="2" opacity=".92"><title>${esc(label)}</title></circle>
      ${n > 1 ? `<text x="${g.x.toFixed(1)}" y="${(g.y + 4).toFixed(1)}" font-size="11" font-weight="800" fill="#fff" text-anchor="middle" pointer-events="none">${n}</text>` : ""}</g>`;
  }).join("");
  return `<svg viewBox="0 0 220 220" role="img" aria-label="所有填答者的 DiSC 分布散點圖">${discQuadrantSvg("rep")}${dots}</svg>`;
}
function barsHtml(scores, suffix = "") {
  return [...TYPES].sort((a, b) => scores[b] - scores[a]).map(t => `
    <div class="bar-row t-${t}"><b>${TLABEL[t]} ${TNAME[t]}</b><div class="track"><div class="fill" style="width:${scores[t]}%"></div></div><span>${scores[t]}${suffix}</span></div>`).join("");
}

/* ============ 首頁文字內容（後台「首頁內容」可覆寫；key: home）============ */
const DEFAULT_HOME = {
  siteName: "DiSC 人際風格工作坊",
  heroTitle: "看懂自己，也看懂別人",
  heroText: "DiSC 人際風格工作坊的學習夥伴：課前完成自我測評，課後隨時查閱教材、識別他人，並用更聰明的方式溝通。",
  stepLabel: "STEP",
  features: {
    tools: { name: "解密工具", desc: "掌握 DiSC 的原理與應用：教材、圖文、影音一次看。" },
    self: { name: "看懂自己", desc: "15 題自我測評，發現「原來我在別人眼中是這樣！」" },
    others: { name: "識別他人", desc: "從生活中的行為線索，觀察他人的風格與溝通偏好。" },
    adapt: { name: "彈性調適", desc: "依對方風格調整溝通，讓你的想法更容易被接受。" }
  },
  lockTitleHint: "此功能尚未開放，請輸入講師提供的密碼解鎖。",
  adminLinkText: "管理後台",
  copyright: { enabled: true, title: "著作權說明", text: "© 2026 版權所有。本網站內容僅供內部學習使用，未經授權請勿轉載、重製或散布。" }
};
function getHome(map) {
  const d = DEFAULT_HOME, h = (map && map["home"]) || {};
  const features = {};
  Object.keys(d.features).forEach(k => features[k] = { ...d.features[k], ...((h.features || {})[k] || {}) });
  return { ...d, ...h, features, copyright: { ...d.copyright, ...(h.copyright || {}) } };
}

/* ============ 測評開頭文字（後台「開頭文字」可覆寫；key: intro_self / intro_others）============ */
const DEFAULT_INTRO = {
  self: {
    title: "🪞 看懂自己",
    subtitle: "15 題精簡版 DiSC 行為風格自我測評，發現「原來我在別人眼中是這樣！」",
    noticeTitle: "施測前請留意",
    notices: ["請依照你**平時最自然一致**的行為反應作答。", "請**不要考慮**社會期待、工作及家庭壓力，或是理想狀態下的要求。", "請盡量在 **5 分鐘內**完成。"],
    howTitle: "作答方式",
    howText: "每題有四個描述，請選出「最像我」與「最不像我」各一個。",
    nameLabel: "你的姓名",
    namePlaceholder: "例如：王小明",
    startBtn: "開始測評"
  },
  others: {
    title: "🔍 識別他人",
    subtitle: "想著一位你想了解的人（同事、主管、客戶或家人），依據平常觀察到的行為線索作答。",
    noticeTitle: "",
    notices: ["請憑「實際觀察到的行為」作答，不要憑猜測或刻板印象。", "每題選最符合的一項；沒觀察過可以略過。", "結果只是「可能的傾向」，請搭配更多觀察驗證。"],
    howTitle: "",
    howText: "",
    nameLabel: "",
    namePlaceholder: "",
    startBtn: "開始"
  }
};
const getIntro = (map, kind) => ({ ...DEFAULT_INTRO[kind], ...((map && map["intro_" + kind]) || {}) });

initTheme();
