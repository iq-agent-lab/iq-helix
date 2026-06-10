/**
 * iq-helix 3D 궤도 렌더러 (의존성 없음).
 * 시간축(가로)을 따라 진행하는 이중나선을 3D 투영으로 그린다.
 * - 가닥 1 = Layer (골드), 가닥 2 = Question (단청 레드)
 * - 가로대(rung) = 한 회전(layer): 3D에서 두 가닥은 만나지 않으므로 DNA처럼 잇는다
 * - 드래그: 가로 = 자전(위상), 세로 = 관측 각도(틸트). 가만두면 천천히 자전.
 */

const GOLD = [212, 178, 122];
const RED = [232, 72, 82];
const PURPLE = [139, 111, 191];
const CREAM = [242, 234, 216];

export function mountHelix3D(container, subject, opts = {}) {
  const height = opts.height ?? 300;
  const canvas = document.createElement("canvas");
  container.replaceChildren(canvas);
  const ctx = canvas.getContext("2d");

  const layers = subject.layers ?? [];
  const n = layers.length;
  const openQs = (subject.questions ?? []).filter((q) => q.status === "open");
  const resolvedQs = (subject.questions ?? []).filter(
    (q) => q.status === "resolved" && q.resolvedAtLayer != null,
  );
  const depths = layers.map((l, i) => l.depth ?? i + 1);
  const maxD = Math.max(...depths, 1);
  const ghost = 0.85;
  const span = Math.max(n, 1) + ghost;

  let W = 0;
  let H = 0;
  let dpr = 1;
  let margin = 70;
  let period = 100;
  let Rmax = 60;
  let cy = 0;

  function resize() {
    W = container.clientWidth || 600;
    H = height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    margin = Math.max(56, W * 0.09);
    period = (W - margin * 2) / Math.max(span, 1.7);
    Rmax = H * 0.3;
    cy = H / 2;
  }
  resize();

  // 반경: depth가 깊어질수록 궤도가 자란다 (layer 사이 보간)
  function radius(t) {
    if (n === 0) return Rmax * 0.55;
    const i = Math.min(Math.max(Math.floor(t), 0), n - 1);
    const d0 = depths[i] ?? 1;
    const d1 = depths[i + 1] ?? d0 + (t > n - 1 ? 0.35 : 0);
    const frac = Math.min(Math.max(t - i, 0), 1);
    const d = d0 + (d1 - d0) * frac;
    return Rmax * (0.4 + 0.6 * (d / Math.max(maxD + 0.35, 1.35)));
  }

  let phase = 0.6;
  let tilt = 0.42;
  const FOCAL = 560;

  /** t(시간), side(+1 layer 가닥 / -1 question 가닥) → 화면 좌표 */
  function point(t, side) {
    const theta = 2 * Math.PI * t + phase + (side < 0 ? Math.PI : 0);
    const r = radius(t);
    const y0 = r * Math.cos(theta);
    const z0 = r * Math.sin(theta);
    const y = y0 * Math.cos(tilt) - z0 * Math.sin(tilt);
    const z = y0 * Math.sin(tilt) + z0 * Math.cos(tilt);
    const s = FOCAL / (FOCAL - z * 0.85);
    return { x: margin + t * period, y: cy + y * s, z, s };
  }

  function strandSegments(side, color) {
    const segs = [];
    const step = 0.022;
    let prev = point(0, side);
    for (let t = step; t <= span + 1e-6; t += step) {
      const cur = point(Math.min(t, span), side);
      const isGhost = t > n;
      // 점선: 유령 회전 구간은 한 칸 건너 그린다
      if (!isGhost || Math.floor(t / 0.055) % 2 === 0) {
        const zn = (Math.min(prev.z, cur.z) / Rmax + 1) / 2; // 0(뒤)..1(앞)
        segs.push({
          x1: prev.x, y1: prev.y, x2: cur.x, y2: cur.y,
          z: (prev.z + cur.z) / 2,
          w: (isGhost ? 1.1 : 1.3) + 1.7 * zn,
          a: (isGhost ? 0.32 : 0.42) + 0.55 * zn,
          color,
        });
      }
      prev = cur;
    }
    return segs;
  }

  const nodeHits = []; // {x, y, layer}

  function draw(now) {
    ctx.clearRect(0, 0, W, H);
    nodeHits.length = 0;

    // 시간축
    const axisY = cy;
    ctx.strokeStyle = "rgba(242,234,216,0.13)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin - 30, axisY);
    ctx.lineTo(W - 16, axisY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(W - 23, axisY - 4);
    ctx.lineTo(W - 16, axisY);
    ctx.lineTo(W - 23, axisY + 4);
    ctx.stroke();
    ctx.fillStyle = "rgba(126,120,148,0.95)";
    ctx.font = "11px 'IBM Plex Mono', monospace";
    ctx.textAlign = "right";
    ctx.fillText("시간 →", W - 16, axisY - 11);

    // 가닥 + 가로대(rung) 세그먼트를 z순으로 그린다 (painter's algorithm)
    const segs = [
      ...strandSegments(1, GOLD),
      ...strandSegments(-1, RED),
    ];
    for (let k = 1; k <= n; k++) {
      const a = point(k, 1);
      const b = point(k, -1);
      segs.push({
        x1: a.x, y1: a.y, x2: b.x, y2: b.y,
        z: (a.z + b.z) / 2,
        w: 1.2,
        a: 0.4,
        color: CREAM,
      });
    }
    segs.sort((p, q) => p.z - q.z);
    for (const s of segs) {
      ctx.strokeStyle = `rgba(${s.color[0]},${s.color[1]},${s.color[2]},${s.a})`;
      ctx.lineWidth = s.w;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      ctx.stroke();
    }

    // 해소 마커: question 가닥 위 (퍼플)
    for (const q of resolvedQs) {
      const p = point(q.resolvedAtLayer - 0.25, -1);
      const r = 2.6 + 1.6 * p.s;
      ctx.fillStyle = `rgba(${PURPLE[0]},${PURPLE[1]},${PURPLE[2]},${0.5 + 0.5 * ((p.z / Rmax + 1) / 2)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // 열린 질문 위성: 유령 회전의 question 가닥 위에서 맥동
    const shown = Math.min(openQs.length, 5);
    for (let k = 0; k < shown; k++) {
      const t = Math.max(n, 0.0) + 0.18 + (k * (ghost - 0.32)) / Math.max(shown, 1);
      const p = point(t, -1);
      const pulse = 1 + 0.18 * Math.sin(now / 420 + k * 1.7);
      const r = (2.6 + 1.9 * p.s) * pulse;
      const zn = (p.z / Rmax + 1) / 2;
      ctx.fillStyle = `rgba(${RED[0]},${RED[1]},${RED[2]},${0.45 + 0.55 * zn})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (openQs.length > shown) {
      ctx.fillStyle = "rgba(232,72,82,0.85)";
      ctx.font = "11px 'IBM Plex Mono', monospace";
      ctx.textAlign = "right";
      ctx.fillText(`+${openQs.length - shown}`, W - 16, axisY - 28);
    }

    // layer 노드: 축 위의 안정점 (가로대 중심) — 라벨이 흔들리지 않는다
    for (let k = 1; k <= n; k++) {
      const x = margin + k * period;
      nodeHits.push({ x, y: axisY, layer: k });
      ctx.fillStyle = "#0d0a18";
      ctx.strokeStyle = `rgba(${CREAM[0]},${CREAM[1]},${CREAM[2]},0.9)`;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(x, axisY, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = `rgba(${CREAM[0]},${CREAM[1]},${CREAM[2]},0.92)`;
      ctx.font = "11.5px 'IBM Plex Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText(`L${k}`, x, axisY + 24);
      ctx.fillStyle = "rgba(126,120,148,0.95)";
      ctx.font = "10.5px 'IBM Plex Mono', monospace";
      ctx.fillText(layers[k - 1].date.slice(5), x, axisY + 38);
    }
    // 출발점
    ctx.fillStyle = "rgba(212,178,122,0.7)";
    ctx.beginPath();
    ctx.arc(margin, axisY, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------- 인터랙션 ----------
  let dragging = false;
  let moved = 0;
  let lastX = 0;
  let lastY = 0;
  let autoSpin = true;

  canvas.addEventListener("pointerdown", (e) => {
    dragging = true;
    moved = 0;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    moved += Math.abs(dx) + Math.abs(dy);
    phase += dx * 0.012;
    tilt = Math.min(Math.max(tilt - dy * 0.005, 0.06), 1.25);
    lastX = e.clientX;
    lastY = e.clientY;
    autoSpin = false;
  });
  const release = () => { dragging = false; setTimeout(() => { autoSpin = true; }, 2600); };
  canvas.addEventListener("pointerup", (e) => {
    if (moved < 6 && opts.onLayerClick) {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const hit = nodeHits.find((h) => (h.x - mx) ** 2 + (h.y - my) ** 2 < 16 ** 2);
      if (hit) opts.onLayerClick(hit.layer);
    }
    release();
  });
  canvas.addEventListener("pointercancel", release);

  // ---------- 루프 ----------
  let raf = 0;
  let alive = true;
  function loop(now) {
    if (!alive) return;
    if (autoSpin && !dragging) phase += 0.0035;
    draw(now);
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);

  const onResize = () => { resize(); };
  window.addEventListener("resize", onResize);

  return function destroy() {
    alive = false;
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", onResize);
  };
}

/** 옅은 별밭: 정적 별 + 느린 트윙클 (배경 고정 캔버스) */
export function startStarfield() {
  const canvas = document.getElementById("stars");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let stars = [];

  function seed() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.round((innerWidth * innerHeight) / 16000);
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * innerWidth,
      y: Math.random() * innerHeight,
      r: Math.random() < 0.85 ? 0.7 : 1.3,
      base: 0.12 + Math.random() * 0.3,
      tw: 1200 + Math.random() * 4000,
      off: Math.random() * 7,
      gold: Math.random() < 0.16,
    }));
  }
  seed();
  window.addEventListener("resize", seed);

  function loop(now) {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const s of stars) {
      const a = s.base * (0.7 + 0.3 * Math.sin(now / s.tw + s.off));
      ctx.fillStyle = s.gold
        ? `rgba(212,178,122,${a})`
        : `rgba(242,234,216,${a})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}
