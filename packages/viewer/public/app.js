import { mountHelix3D, startStarfield } from "/helix3d.js";

const app = document.getElementById("app");
const routes = { "": renderHome, q: renderQuestions, s: renderTimeline };

let destroy3D = null;
let heroIndex = 0;

startStarfield();
window.addEventListener("hashchange", route);
route();

async function route() {
  if (destroy3D) { destroy3D(); destroy3D = null; }
  const [, page = "", id] = location.hash.split("/");
  const handler = routes[page] ?? renderHome;
  for (const a of document.querySelectorAll("nav a")) {
    if (a.dataset.nav === (page === "q" ? "questions" : "subjects")) {
      a.setAttribute("aria-current", "page");
    } else {
      a.removeAttribute("aria-current");
    }
  }
  app.innerHTML = `<p class="page-sub">관측 준비 중…</p>`;
  try {
    await handler(decodeURIComponent((id ?? "").split("?")[0]));
  } catch (err) {
    app.innerHTML = `<div class="empty">불러오기 실패: ${esc(String(err))}</div>`;
  }
}

/* ---------- 관측소 (랜딩) ---------- */

async function renderHome() {
  const subjects = await getJSON("/api/subjects");
  if (subjects.length === 0) {
    app.innerHTML = `
      <h1 class="page-title">관측소</h1>
      <div class="empty">아직 나선이 없습니다.<br/>
      <code>helix import spiral-buddy &lt;vault-path&gt;</code> 로 기존 노트를 가져오세요.</div>`;
    return;
  }
  const openTotal = subjects.reduce((n, s) => n + s.openQuestionCount, 0);
  heroIndex = ((heroIndex % subjects.length) + subjects.length) % subjects.length;

  app.innerHTML = `
    <div class="hero">
      <span class="hero-hint">드래그 — 가로: 자전 · 세로: 관측 각도</span>
      <div class="hero-canvas-slot"></div>
      <div class="hero-meta">
        <div>
          <h2 class="hero-title"><a id="hero-link" href="#"></a></h2>
          <div class="hero-stats" id="hero-stats"></div>
        </div>
        <div class="hero-nav">
          <button id="hero-prev" aria-label="이전 나선">←</button>
          <span class="pos" id="hero-pos"></span>
          <button id="hero-next" aria-label="다음 나선">→</button>
        </div>
      </div>
    </div>
    <p class="orbit-caption"><span class="g">가닥 1 = layer</span> · <span class="r">가닥 2 = 질문</span> · 가로대 = 한 회전 · 점선 = 다음 회전</p>
    <h2 class="sec-title">모든 나선 — ${subjects.length}개 · 열린 질문 ${openTotal}개</h2>
    <div class="subject-grid">
      ${subjects.map(subjectCard).join("")}
    </div>`;

  const slot = document.querySelector(".hero-canvas-slot");
  async function showHero() {
    const summary = subjects[heroIndex];
    const subject = await getJSON(`/api/subjects/${encodeURIComponent(summary.id)}`);
    if (destroy3D) destroy3D();
    destroy3D = mountHelix3D(slot, subject, {
      height: 320,
      onLayerClick: () => { location.hash = `#/s/${encodeURIComponent(summary.id)}`; },
    });
    const link = document.getElementById("hero-link");
    link.textContent = displayTitle(summary.title);
    link.href = `#/s/${encodeURIComponent(summary.id)}`;
    document.getElementById("hero-stats").innerHTML = `
      <span>layer ${summary.layerCount}</span>
      ${summary.openQuestionCount ? `<span class="oq">열린 질문 ${summary.openQuestionCount}</span>` : ""}
      <span>${esc(summary.lastTouched)}</span>`;
    document.getElementById("hero-pos").textContent = `${heroIndex + 1}/${subjects.length}`;
  }
  document.getElementById("hero-prev").addEventListener("click", () => {
    heroIndex = (heroIndex - 1 + subjects.length) % subjects.length;
    showHero();
  });
  document.getElementById("hero-next").addEventListener("click", () => {
    heroIndex = (heroIndex + 1) % subjects.length;
    showHero();
  });
  await showHero();
}

function subjectCard(s) {
  return `
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
    </a>`;
}

/** 카드용 미니 이중나선: 회전 수 = layer 수, 꼬리의 점 = 열린 질문 */
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
    dotsSvg += `<circle cx="${4 + turns * pw + 7 + k * 6}" cy="${cy}" r="2.2" fill="#E84852"/>`;
  }
  return `<svg class="glyph" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">
    <path d="${p1}" fill="none" stroke="#D4B27A" stroke-width="1.5" opacity="0.9"/>
    <path d="${p2}" fill="none" stroke="#E84852" stroke-width="1.5" opacity="0.85"/>
    ${dotsSvg}</svg>`;
}

/* ---------- subject 상세 ---------- */

async function renderTimeline(id) {
  const s = await getJSON(`/api/subjects/${encodeURIComponent(id)}`);
  const open = s.questions.filter((q) => q.status === "open");
  const solved = s.questions.filter((q) => q.status === "resolved");
  const qById = Object.fromEntries(s.questions.map((q) => [q.id, q]));
  const lanes = assignLanes(s.questions);
  const laneCount = Math.max(1, ...Object.values(lanes).map((l) => l + 1));
  const gutterW = 28 + laneCount * 18 + 16;

  app.innerHTML = `
    <h1 class="page-title">${esc(displayTitle(s.title))}</h1>
    <p class="page-sub tags">${s.tags.map(esc).join(" · ") || "&nbsp;"}</p>
    <div class="badges">
      <span class="badge layers">layer ${s.layers.length}</span>
      ${open.length ? `<span class="badge open">열린 질문 ${open.length}</span>` : ""}
      ${solved.length ? `<span class="badge solved">해소 ${solved.length}</span>` : ""}
    </div>
    <div class="orbit-wrap"><div class="orbit-slot"></div></div>
    <p class="orbit-caption"><span class="g">가닥 1 = layer</span> · <span class="r">가닥 2 = 질문</span> · 가로대 = 한 회전 · 노드 클릭 = 해당 layer로</p>
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

  destroy3D = mountHelix3D(document.querySelector(".orbit-slot"), s, {
    height: 280,
    onLayerClick: focusLayer,
  });
  drawStrands(s, lanes);
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
    end.title = resolved
      ? `${q.id} 해소 (layer ${q.resolvedAtLayer})`
      : `${q.id} 미해결`;
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
      <div class="empty">열린 질문이 없습니다. 모든 나선이 잠들어 있어요 — 다음 세션을 시작해 보세요.</div>`;
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

function mdInline(raw) {
  return esc(raw)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

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
