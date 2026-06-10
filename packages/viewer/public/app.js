const app = document.getElementById("app");

const routes = { "": renderSubjects, q: renderQuestions, s: renderTimeline };

window.addEventListener("hashchange", route);
route();

async function route() {
  const [, page = "", id] = location.hash.split("/");
  const handler = routes[page] ?? renderSubjects;
  for (const a of document.querySelectorAll("nav a")) {
    if (a.dataset.nav === (page === "q" ? "questions" : "subjects")) {
      a.setAttribute("aria-current", "page");
    } else {
      a.removeAttribute("aria-current");
    }
  }
  app.innerHTML = `<p class="page-sub">불러오는 중…</p>`;
  try {
    await handler(decodeURIComponent((id ?? "").split("?")[0]));
  } catch (err) {
    app.innerHTML = `<div class="empty">불러오기 실패: ${esc(String(err))}</div>`;
  }
}

/* ---------- subjects 목록 ---------- */

async function renderSubjects() {
  const subjects = await getJSON("/api/subjects");
  if (subjects.length === 0) {
    app.innerHTML = `
      <h1 class="page-title">Subjects</h1>
      <div class="empty">아직 subject가 없습니다.<br/>
      <code>helix import spiral-buddy &lt;vault-path&gt;</code> 로 기존 노트를 가져오세요.</div>`;
    return;
  }
  const openTotal = subjects.reduce((n, s) => n + s.openQuestionCount, 0);
  app.innerHTML = `
    <h1 class="page-title">Subjects</h1>
    <p class="page-sub">${subjects.length}개의 나선 · 열린 질문 ${openTotal}개</p>
    <div class="subject-grid">
      ${subjects
        .map(
          (s) => `
        <a class="subject-card" href="#/s/${encodeURIComponent(s.id)}">
          <div class="card-top">
            <h2>${esc(displayTitle(s.title))}</h2>
            ${glyphSVG(s.layerCount, s.openQuestionCount)}
          </div>
          <div class="subject-meta">
            <span>layer ${s.layerCount}</span>
            ${s.openQuestionCount ? `<span class="oq">열린 질문 ${s.openQuestionCount}</span>` : ""}
            <span>${esc(s.lastTouched)}</span>
          </div>
          ${
            s.tags.length
              ? `<div class="subject-tags">${s.tags
                  .slice(0, 4)
                  .map((t) => `<span class="tag">${esc(t)}</span>`)
                  .join("")}</div>`
              : ""
          }
        </a>`,
        )
        .join("")}
    </div>`;
}

/** 카드용 미니 이중나선 글리프: 회전 수 = layer 수, 꼬리의 점 = 열린 질문 */
function glyphSVG(layerCount, openCount) {
  const turns = Math.min(Math.max(layerCount, 1), 5);
  const pw = 15;
  const dots = Math.min(openCount, 3);
  const W = 8 + turns * pw + (dots ? 8 + dots * 6 : 4);
  const H = 22;
  const cy = H / 2;
  const a = 7;
  let p1 = "";
  let p2 = "";
  const steps = turns * 14;
  for (let i = 0; i <= steps; i++) {
    const t = (turns * i) / steps;
    const x = (4 + t * pw).toFixed(1);
    const y = a * Math.sin(2 * Math.PI * t);
    p1 += `${i ? " L" : "M"}${x} ${(cy + y).toFixed(1)}`;
    p2 += `${i ? " L" : "M"}${x} ${(cy - y).toFixed(1)}`;
  }
  let dotsSvg = "";
  for (let k = 0; k < dots; k++) {
    dotsSvg += `<circle cx="${4 + turns * pw + 7 + k * 6}" cy="${cy}" r="2.4" fill="#cc785c"/>`;
  }
  return `<svg class="glyph" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">
    <path d="${p1}" fill="none" stroke="#c9c2b4" stroke-width="1.6"/>
    <path d="${p2}" fill="none" stroke="#cc785c" stroke-width="1.6" opacity="0.85"/>
    ${dotsSvg}</svg>`;
}

/* ---------- 나선 타임라인 (킬러 뷰) ---------- */

async function renderTimeline(id) {
  const s = await getJSON(`/api/subjects/${encodeURIComponent(id)}`);
  const open = s.questions.filter((q) => q.status === "open");
  const solved = s.questions.filter((q) => q.status === "resolved");
  const qById = Object.fromEntries(s.questions.map((q) => [q.id, q]));
  const lanes = assignLanes(s.questions);
  const laneCount = Math.max(1, ...Object.values(lanes).map((l) => l + 1));
  const gutterW = 28 + laneCount * 18 + 16;

  app.innerHTML = `
    <div class="timeline-head">
      <h1 class="page-title">${esc(displayTitle(s.title))}</h1>
      <p class="page-sub">${s.tags.map(esc).join(" · ") || "&nbsp;"}</p>
      <div class="badges">
        <span class="badge layers">layer ${s.layers.length}</span>
        ${open.length ? `<span class="badge open">열린 질문 ${open.length}</span>` : ""}
        ${solved.length ? `<span class="badge solved">해소 ${solved.length}</span>` : ""}
      </div>
    </div>
    <div class="orbit-wrap" id="orbit">${orbitSVG(s, open.length)}</div>
    <p class="orbit-caption">옆에서 본 나선 — 가닥 1(회색) = layer · 가닥 2(코랄) = 질문 · 교차점 = 한 회전 · 점선 = 다음 회전</p>
    <div class="timeline" style="--gutter-w:${gutterW}px">
      <div class="strand-gutter"></div>
      <div class="layers-col">
        ${s.layers.map((l) => layerCard(l, qById)).join("")}
        ${
          open.length
            ? `<div class="next-fuel">열린 가닥 ${open.length}개가 <strong>다음 나선</strong>을 기다리는 중 —
               ${open
                 .map(
                   (q) =>
                     `<span class="fuel-item" title="${esc(plain(q.text))}"><span class="qid">${q.id}</span> ${esc(truncate(plain(q.text), 44))}</span>`,
                 )
                 .join(" · ")}</div>`
            : ""
        }
      </div>
    </div>`;

  drawStrands(s, lanes);
  for (const node of document.querySelectorAll(".orbit-node")) {
    node.addEventListener("click", () => focusLayer(node.dataset.layer));
  }
  const target = new URLSearchParams(location.hash.split("?")[1]).get("layer");
  if (target) focusLayer(target);
}

function focusLayer(index) {
  const card = document.querySelector(`[data-layer="${index}"]`);
  if (!card) return;
  for (const c of document.querySelectorAll(".layer-card.highlight")) {
    c.classList.remove("highlight");
  }
  card.classList.add("highlight");
  card.scrollIntoView({ behavior: "smooth", block: "center" });
}

/**
 * 시그니처: 옆에서 관측한 이중나선 궤도.
 * 시간축(가로)을 따라 두 가닥(layer/질문)이 꼬이고, 교차점이 layer.
 * depth가 깊어질수록 궤도 반경이 커진다 — 나선이 자란다.
 */
function orbitSVG(s, openCount) {
  const n = s.layers.length;
  const period = 118;
  const pad = 40;
  const ghost = 0.75;
  const W = pad * 2 + period * (n + ghost);
  const H = 168;
  const cy = H / 2;

  const depths = s.layers.map((l, i) => l.depth ?? i + 1);
  const maxD = Math.max(...depths, 1);
  const ampAt = (t) => {
    const i = Math.min(Math.max(Math.floor(t), 0), n - 1);
    const d0 = depths[i] ?? 1;
    const d1 = depths[i + 1] ?? d0 + (t > n - 1 ? 0.4 : 0);
    const frac = Math.min(Math.max(t - i, 0), 1);
    const d = d0 + (d1 - d0) * frac;
    return 18 + 40 * (d / Math.max(maxD + 0.4, 1.4));
  };
  const path = (sign, from, to) => {
    const steps = Math.max(Math.ceil((to - from) * 26), 2);
    let d = "";
    for (let i = 0; i <= steps; i++) {
      const t = from + ((to - from) * i) / steps;
      const x = pad + t * period;
      const y = cy + sign * ampAt(t) * Math.sin(2 * Math.PI * t);
      d += `${i ? " L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    return d;
  };

  let nodes = "";
  for (let k = 1; k <= n; k++) {
    const x = pad + k * period;
    const layer = s.layers[k - 1];
    nodes += `
      <g class="orbit-node" data-layer="${k}">
        <circle cx="${x}" cy="${cy}" r="13" fill="#faf8f4" opacity="0"/>
        <circle cx="${x}" cy="${cy}" r="6" fill="#faf8f4" stroke="#1f1d1a" stroke-width="2"/>
        <text x="${x}" y="${cy + 26}" text-anchor="middle" font-size="11.5"
          font-family="IBM Plex Mono, monospace" fill="#1f1d1a">L${k}</text>
        <text x="${x}" y="${cy + 41}" text-anchor="middle" font-size="10.5"
          font-family="IBM Plex Mono, monospace" fill="#8a857c">${esc(layer.date.slice(5))}</text>
      </g>`;
  }

  // 해소 마커: 해당 회전의 질문 가닥 위 (교차점 직전)
  let solvedDots = "";
  for (const q of s.questions) {
    if (q.status !== "resolved" || q.resolvedAtLayer == null) continue;
    const t = q.resolvedAtLayer - 0.25;
    const x = pad + t * period;
    const y = cy - ampAt(t) * Math.sin(2 * Math.PI * t);
    solvedDots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4"
      fill="#3e7c6f"><title>${esc(q.id)} 해소 (layer ${q.resolvedAtLayer})</title></circle>`;
  }

  // 열린 질문: 마지막 교차점 너머 점선 가닥 위의 위성들
  let openDots = "";
  const shown = Math.min(openCount, 5);
  for (let k = 0; k < shown; k++) {
    const t = n + 0.16 + (k * 0.42) / Math.max(shown, 1);
    const x = pad + t * period;
    const y = cy - ampAt(Math.min(t, n)) * Math.sin(2 * Math.PI * t);
    openDots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" fill="#cc785c"/>`;
  }
  if (openCount > shown) {
    openDots += `<text x="${(pad + (n + ghost) * period - 2).toFixed(1)}" y="${cy - 14}"
      text-anchor="end" font-size="11" font-family="IBM Plex Mono, monospace"
      fill="#cc785c">+${openCount - shown}</text>`;
  }

  const axisEnd = W - 8;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img"
    aria-label="시간축을 따라 진행하는 이중나선 궤도. 회전 ${n}회, 열린 질문 ${openCount}개.">
    <line x1="${pad - 26}" y1="${cy}" x2="${axisEnd}" y2="${cy}" stroke="#e5e0d6" stroke-width="1.5"/>
    <path d="M${axisEnd - 7} ${cy - 4} L${axisEnd} ${cy} L${axisEnd - 7} ${cy + 4}" fill="none" stroke="#c9c2b4" stroke-width="1.5"/>
    <text x="${axisEnd}" y="${cy - 10}" text-anchor="end" font-size="11"
      font-family="IBM Plex Mono, monospace" fill="#8a857c">시간 →</text>
    <path d="${path(1, 0, n)}" fill="none" stroke="#b9b2a4" stroke-width="2.5"/>
    <path d="${path(-1, 0, n)}" fill="none" stroke="#cc785c" stroke-width="2.5"/>
    <path d="${path(1, n, n + ghost)}" fill="none" stroke="#b9b2a4" stroke-width="2" stroke-dasharray="3 5" opacity="0.8"/>
    <path d="${path(-1, n, n + ghost)}" fill="none" stroke="#cc785c" stroke-width="2" stroke-dasharray="3 5" opacity="0.8"/>
    <circle cx="${pad}" cy="${cy}" r="3.5" fill="#b9b2a4"/>
    ${solvedDots}
    ${openDots}
    ${nodes}
  </svg>`;
}

function layerCard(l, qById) {
  const lede =
    l.content.sections.find((sec) => /한 줄 요약/.test(sec.heading))?.body ??
    l.content.sections[0]?.body ??
    "";
  const rest = l.content.sections.filter(
    (sec) => !/한 줄 요약/.test(sec.heading),
  );
  return `
  <article class="layer-card" data-layer="${l.index}">
    <div class="layer-head">
      <span class="ln">Layer ${l.index}</span>
      ${l.depth != null ? `<span>depth ${l.depth}</span>` : ""}
      <span>${esc(l.date)}</span>
      ${l.sessionRef ? `<span title="${esc(l.sessionRef)}">session</span>` : ""}
    </div>
    <p class="layer-lede">${mdInline(firstLine(lede))}</p>
    <div class="qchips">
      ${l.addedQuestionIds
        .map(
          (qid) =>
            `<span class="qchip add">＋ <span class="qid">${qid}</span> ${mdInline(qById[qid]?.text ?? "")}</span>`,
        )
        .join("")}
      ${l.resolvedQuestionIds
        .map(
          (qid) =>
            `<span class="qchip resolve">✓ <span class="qid">${qid}</span> 해소${
              qById[qid]?.resolution ? ` — ${mdInline(qById[qid].resolution)}` : ""
            }</span>`,
        )
        .join("")}
    </div>
    ${
      rest.length
        ? `<details class="sections"><summary>전체 내용 (${rest.length}섹션)</summary>
           ${rest
             .map(
               (sec) =>
                 `<div class="section">${sec.heading ? `<h3>${esc(sec.heading)}</h3>` : ""}<pre>${esc(sec.body)}</pre></div>`,
             )
             .join("")}</details>`
        : ""
    }
  </article>`;
}

/** 질문 가닥(카드 옆 상세): raised layer → resolved 카드 / 화면 끝까지 */
function drawStrands(s, lanes) {
  const gutter = document.querySelector(".strand-gutter");
  const timeline = document.querySelector(".timeline");
  const base = timeline.getBoundingClientRect();
  const cardY = {};
  for (const card of document.querySelectorAll(".layer-card")) {
    const r = card.getBoundingClientRect();
    cardY[card.dataset.layer] = {
      mid: r.top - base.top + Math.min(r.height / 2, 48),
      bottom: r.bottom - base.top,
    };
  }
  const last = cardY[String(s.layers.at(-1)?.index)] ?? { bottom: 0 };

  const spine = el("div", "spine");
  spine.style.height = `${last.bottom - 8}px`;
  gutter.appendChild(spine);
  for (const l of s.layers) {
    const dot = el("div", "spine-dot");
    dot.style.top = `${cardY[l.index].mid - 7}px`;
    gutter.appendChild(dot);
  }

  for (const q of s.questions) {
    const lane = lanes[q.id];
    const x = 28 + lane * 18;
    const from = cardY[q.raisedAtLayer]?.mid ?? 0;
    const resolved = q.status === "resolved" && cardY[q.resolvedAtLayer];
    const to = resolved ? cardY[q.resolvedAtLayer].mid : last.bottom + 28;
    const cls = resolved ? "resolved-strand" : "open-strand";

    const line = el("div", `strand ${cls}`);
    line.style.left = `${x}px`;
    line.style.top = `${from}px`;
    line.style.height = `${Math.max(to - from, 0)}px`;
    line.title = `${q.id}: ${plain(q.text)}`;
    gutter.appendChild(line);

    const raise = el("div", `strand-dot raise ${cls}-dot`);
    raise.style.left = `${x}px`;
    raise.style.top = `${from - 5}px`;
    raise.title = `${q.id} 제기 (layer ${q.raisedAtLayer})`;
    gutter.appendChild(raise);

    const end = el("div", `strand-dot ${resolved ? "resolve" : "still-open"}`);
    end.style.left = `${x}px`;
    end.style.top = `${to - 5}px`;
    end.title = resolved ? `${q.id} 해소 (layer ${q.resolvedAtLayer})` : `${q.id} 미해결`;
    gutter.appendChild(end);
  }
}

function assignLanes(questions) {
  const lanes = {};
  const laneEnd = [];
  const sorted = [...questions].sort((a, b) => a.raisedAtLayer - b.raisedAtLayer);
  for (const q of sorted) {
    const end = q.status === "resolved" ? q.resolvedAtLayer : Infinity;
    let lane = laneEnd.findIndex((e) => e < q.raisedAtLayer);
    if (lane === -1) lane = laneEnd.length;
    laneEnd[lane] = end;
    lanes[q.id] = lane;
  }
  return lanes;
}

/* ---------- 질문 대시보드 ---------- */

async function renderQuestions() {
  const [questions, subjects] = await Promise.all([
    getJSON("/api/questions"),
    getJSON("/api/subjects"),
  ]);
  const titleById = Object.fromEntries(
    subjects.map((s) => [s.id, displayTitle(s.title)]),
  );
  if (questions.length === 0) {
    app.innerHTML = `
      <h1 class="page-title">열린 질문</h1>
      <div class="empty">열린 질문이 없습니다. 나선이 전부 멈춰 있어요 — 다음 세션을 시작해 보세요.</div>`;
    return;
  }
  const groups = new Map();
  for (const q of questions) {
    if (!groups.has(q.subjectId)) groups.set(q.subjectId, []);
    groups.get(q.subjectId).push(q);
  }
  app.innerHTML = `
    <h1 class="page-title">열린 질문</h1>
    <p class="page-sub">${questions.length}개 — 다음 나선의 연료</p>
    ${[...groups.entries()]
      .map(
        ([sid, qs]) => `
      <section class="q-group">
        <h2>${esc(titleById[sid] ?? sid)}</h2>
        ${qs
          .map(
            (q) => `
          <a class="q-row" href="#/s/${encodeURIComponent(sid)}?layer=${q.raisedAtLayer}">
            <span class="qmark">${q.id}</span>
            <span class="qtext">${mdInline(q.text)}</span>
            <span class="qwhere">layer ${q.raisedAtLayer}</span>
          </a>`,
          )
          .join("")}
      </section>`,
      )
      .join("")}`;
}

/* ---------- utils ---------- */

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

function el(tag, className) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function esc(raw) {
  return String(raw).replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch],
  );
}

/** 노트 본문의 인라인 마크다운(**볼드**, `코드`)만 최소 렌더 */
function mdInline(raw) {
  return esc(raw)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

/** 마크다운 토큰 제거한 평문 (툴팁·요약용) */
function plain(raw) {
  return String(raw)
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}

function truncate(text, max) {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function displayTitle(title) {
  return String(title).replace(/^\d+[.)]\s*/, "");
}

function firstLine(text) {
  return text.split("\n").find((line) => line.trim()) ?? "";
}
