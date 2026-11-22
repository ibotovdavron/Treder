// Treder 3D — jonli shamlar grafigi uch oʻlchamda (three.js).
// Kamera: aylantirish, yaqinlashish, orqa/yon/yuqori koʻrinish, shamlar orasida uchish (WASD/QE).
// Fibonachchi: ikki shamni bosib chiziladi, darajalar 3D shisha qatlamlar sifatida koʻrinadi.

import * as THREE from "three";
import { OrbitControls } from "./vendor/three/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "./vendor/three/CSS2DRenderer.js";

const M = window.TrederMarket;
const $ = (id) => document.getElementById(id);
const stage = $("d3Stage");
const holder = $("d3Canvas");

const STORE_KEY = "treder:3d";
const FIB_KEY = "treder:3d-fibs";
const H = 40;          // narx diapazonining sahnadagi balandligi
const STEP = 1;        // shamlar orasidagi masofa
const BODY_W = 0.66;
const COL = { up: 0x16c784, down: 0xf6465d, gold: 0xf5c451, ema20: 0x5b7cff, ema50: 0x22d3ee, fib: 0x9fa8ff };
const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
const FIB_EXT = [-0.272, -0.618];

const cfg = (() => {
  const d = { symbol: "BTCUSDT", tf: "15m", count: 150, ext: false, vol: true, ema: true };
  try { return { ...d, ...JSON.parse(localStorage.getItem(STORE_KEY) || "{}") }; } catch { return d; }
})();
const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(cfg)); } catch {} };

function showMsg(text) {
  const el = $("d3Msg");
  el.hidden = !text;
  el.textContent = text || "";
}

// ---------------------------------------------------------------------------
// WebGL tekshiruvi
// ---------------------------------------------------------------------------
function webglOk() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch { return false; }
}

if (!M || !holder) {
  // sahifa notoʻgʻri yuklangan
} else if (!webglOk()) {
  showMsg("Brauzeringiz 3D (WebGL) ni qoʻllab-quvvatlamaydi. Chrome yoki Safari'ning yangi versiyasida oching.");
} else {
  init();
}

function init() {
  // -------------------------------------------------------------------------
  // Sahna, kamera, renderer
  // -------------------------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  holder.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = "d3-labels";
  holder.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 1.2;
  controls.maxDistance = 400;
  controls.screenSpacePanning = true;
  controls.autoRotateSpeed = 0.6;

  scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x10131f, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(30, 60, 50);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x5b7cff, 0.8);
  rim.position.set(-40, 20, -60);
  scene.add(rim);

  function applyTheme() {
    const dark = (window.trederTheme ? window.trederTheme() : "dark") === "dark";
    const bg = dark ? 0x080b14 : 0xeef1f8;
    scene.background = new THREE.Color(bg);
    scene.fog = new THREE.Fog(bg, 120, 420);
    stage.classList.toggle("d3-light", !dark);
    if (grid) grid.material.color.set(dark ? 0x2a3350 : 0xc5cbe0);
  }

  // -------------------------------------------------------------------------
  // Holat
  // -------------------------------------------------------------------------
  let bars = [];
  let view = [];          // koʻrinadigan shamlar (oxirgi cfg.count ta)
  let pMin = 0, pMax = 1, pMid = 0.5, pRange = 1;
  let decimals = 2;
  let feed = null;
  let floorY = -H / 2 - 4;

  const Y = (p) => ((p - pMid) / pRange) * H;
  const P = (y) => (y / H) * pRange + pMid;
  const X = (i) => (i - (view.length - 1)) * STEP; // oxirgi sham x = 0
  const fmt = (v) => M.fmtNum(v, decimals);

  // Shamlar: InstancedMesh (tez ishlaydi)
  const MAXN = 260;
  const bodyGeo = new THREE.BoxGeometry(BODY_W, 1, BODY_W);
  const wickGeo = new THREE.BoxGeometry(0.08, 1, 0.08);
  const volGeo = new THREE.BoxGeometry(BODY_W, 1, 0.5);
  const bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.15 });
  const wickMat = new THREE.MeshStandardMaterial({ roughness: 0.6 });
  const volMat = new THREE.MeshStandardMaterial({ roughness: 0.8, transparent: true, opacity: 0.45 });
  const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, MAXN);
  const wicks = new THREE.InstancedMesh(wickGeo, wickMat, MAXN);
  const vols = new THREE.InstancedMesh(volGeo, volMat, MAXN);
  [bodies, wicks, vols].forEach((m) => { m.count = 0; m.frustumCulled = false; scene.add(m); });

  let grid = null;
  const axisGroup = new THREE.Group();    // narx/vaqt yorliqlari va chiziqlar
  const emaGroup = new THREE.Group();
  const fibGroup = new THREE.Group();
  const liveGroup = new THREE.Group();    // joriy narx chizigʻi va nuqta
  scene.add(axisGroup, emaGroup, fibGroup, liveGroup);

  const tmpM = new THREE.Matrix4();
  const tmpC = new THREE.Color();
  const upC = new THREE.Color(COL.up), downC = new THREE.Color(COL.down);
  let hoverId = -1;

  function label(text, cls) {
    const el = document.createElement("div");
    el.className = "d3-lbl " + (cls || "");
    el.textContent = text;
    return new CSS2DObject(el);
  }

  function disposeGroup(g) {
    g.children.slice().forEach((c) => {
      g.remove(c);
      c.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
        if (o.element && o.element.remove) o.element.remove();
      });
    });
  }

  // -------------------------------------------------------------------------
  // Shamlarni joylash
  // -------------------------------------------------------------------------
  function computeRange() {
    let lo = Infinity, hi = -Infinity;
    view.forEach((b) => { lo = Math.min(lo, b.low); hi = Math.max(hi, b.high); });
    const pad = (hi - lo) * 0.04 || hi * 0.001;
    pMin = lo - pad; pMax = hi + pad;
    pMid = (pMin + pMax) / 2;
    pRange = pMax - pMin;
  }

  function placeCandle(i) {
    const b = view[i];
    const x = X(i);
    const yO = Y(b.open), yC = Y(b.close);
    const h = Math.max(Math.abs(yC - yO), 0.05);
    tmpM.makeScale(1, h, 1).setPosition(x, (yO + yC) / 2, 0);
    bodies.setMatrixAt(i, tmpM);
    const yH = Y(b.high), yL = Y(b.low);
    tmpM.makeScale(1, Math.max(yH - yL, 0.05), 1).setPosition(x, (yH + yL) / 2, 0);
    wicks.setMatrixAt(i, tmpM);
    const c = b.close >= b.open ? upC : downC;
    tmpC.copy(c);
    if (i === hoverId) tmpC.offsetHSL(0, 0, 0.18);
    bodies.setColorAt(i, tmpC);
    wicks.setColorAt(i, c);
    vols.setColorAt(i, c);
  }

  function placeVolumes() {
    const maxV = Math.max(...view.map((b) => b.volume || 0), 1);
    view.forEach((b, i) => {
      const h = Math.max(((b.volume || 0) / maxV) * 9, 0.02);
      tmpM.makeScale(1, h, 1).setPosition(X(i), floorY + h / 2, -2.2);
      vols.setMatrixAt(i, tmpM);
    });
    vols.visible = cfg.vol;
  }

  function flagUpdate() {
    bodies.instanceMatrix.needsUpdate = true;
    wicks.instanceMatrix.needsUpdate = true;
    vols.instanceMatrix.needsUpdate = true;
    if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
    if (wicks.instanceColor) wicks.instanceColor.needsUpdate = true;
    if (vols.instanceColor) vols.instanceColor.needsUpdate = true;
    // Raycast toʻgʻri ishlashi uchun chegaraviy sferani yangilash
    bodies.computeBoundingSphere();
    wicks.computeBoundingSphere();
  }

  function niceStep(range, target) {
    const raw = range / target;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const n = raw / mag;
    return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
  }

  function timeText(t) {
    const iso = new Date(t * 1000).toISOString(); // vaqt allaqachon Toshkentga surilgan
    return cfg.tf === "1d" ? iso.slice(5, 10).replace("-", ".") : iso.slice(11, 16);
  }

  function buildAxes() {
    disposeGroup(axisGroup);
    if (grid) { scene.remove(grid); grid.geometry.dispose(); grid.material.dispose(); }
    const n = view.length;
    const xL = X(0) - 2, xR = X(n - 1) + 8;
    const width = xR - xL;
    floorY = -H / 2 - 4;

    // Pol toʻri
    const size = Math.ceil(Math.max(width, 60) / 10) * 10 + 20;
    grid = new THREE.GridHelper(size, size / 2, 0x3a4566, 0x2a3350);
    grid.position.set((xL + xR) / 2, floorY, 0);
    grid.material.transparent = true;
    grid.material.opacity = 0.55;
    scene.add(grid);
    applyTheme();

    // Orqa devordagi narx chiziqlari va yorliqlar
    const step = niceStep(pMax - pMin, 7);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x5b7cff, transparent: true, opacity: 0.16 });
    for (let p = Math.ceil(pMin / step) * step; p <= pMax; p += step) {
      const y = Y(p);
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(xL, y, -3), new THREE.Vector3(xR, y, -3)]);
      axisGroup.add(new THREE.Line(g, lineMat.clone()));
      const l = label(fmt(p), "d3-axis");
      l.position.set(xR + 1.5, y, -3);
      axisGroup.add(l);
    }

    // Vaqt yorliqlari
    const every = Math.max(1, Math.ceil(n / 8));
    for (let i = 0; i < n; i += every) {
      const l = label(timeText(view[i].time), "d3-axis d3-time");
      l.position.set(X(i), floorY - 1.2, 1.5);
      axisGroup.add(l);
    }
  }

  // EMA chiziqlari — trubka koʻrinishida
  function ema(src, len) {
    const a = 2 / (len + 1);
    const out = [];
    let prev = NaN;
    src.forEach((v, i) => {
      if (i < len - 1) { out.push(NaN); return; }
      if (Number.isNaN(prev)) { prev = src.slice(i - len + 1, i + 1).reduce((s, x) => s + x, 0) / len; }
      else prev = a * v + (1 - a) * prev;
      out.push(prev);
    });
    return out;
  }

  function buildEma() {
    disposeGroup(emaGroup);
    if (!cfg.ema) return;
    const off = bars.length - view.length;
    const closes = bars.map((b) => b.close);
    [[20, COL.ema20], [50, COL.ema50]].forEach(([len, color]) => {
      const e = ema(closes, len).slice(off);
      const pts = [];
      e.forEach((v, i) => { if (Number.isFinite(v)) pts.push(new THREE.Vector3(X(i), Y(v), 0.9)); });
      if (pts.length < 2) return;
      const curve = new THREE.CatmullRomCurve3(pts);
      const geo = new THREE.TubeGeometry(curve, pts.length * 3, 0.07, 6, false);
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, transparent: true, opacity: 0.85 }));
      emaGroup.add(mesh);
    });
  }

  // Joriy narx: chiziq + porlovchi shar + yorliq
  const liveDot = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 16), new THREE.MeshBasicMaterial({ color: COL.gold }));
  const liveHalo = new THREE.Mesh(new THREE.SphereGeometry(0.7, 20, 16), new THREE.MeshBasicMaterial({ color: COL.gold, transparent: true, opacity: 0.25 }));
  const liveLineMat = new THREE.LineDashedMaterial({ color: COL.gold, dashSize: 0.6, gapSize: 0.4, transparent: true, opacity: 0.8 });
  let liveLine = null;
  const liveLabel = label("", "d3-live");
  liveGroup.add(liveDot, liveHalo, liveLabel);

  function placeLive() {
    const last = view[view.length - 1];
    if (!last) return;
    const y = Y(last.close);
    liveDot.position.set(0, y, BODY_W / 2 + 0.3);
    liveHalo.position.copy(liveDot.position);
    if (liveLine) { liveGroup.remove(liveLine); liveLine.geometry.dispose(); }
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(X(0) - 2, y, 0), new THREE.Vector3(8, y, 0)]);
    liveLine = new THREE.Line(g, liveLineMat);
    liveLine.computeLineDistances();
    liveGroup.add(liveLine);
    liveLabel.element.textContent = fmt(last.close);
    liveLabel.position.set(9.5, y, 0);
    liveLabel.element.classList.toggle("down", last.close < last.open);
  }

  // -------------------------------------------------------------------------
  // Fibonachchi
  // -------------------------------------------------------------------------
  const fibStoreKey = () => `${cfg.symbol}|${cfg.tf}`;
  function loadFibs() {
    try { return (JSON.parse(localStorage.getItem(FIB_KEY) || "{}")[fibStoreKey()]) || []; } catch { return []; }
  }
  function saveFibs() {
    try {
      const all = JSON.parse(localStorage.getItem(FIB_KEY) || "{}");
      all[fibStoreKey()] = fibs;
      localStorage.setItem(FIB_KEY, JSON.stringify(all));
    } catch {}
  }
  let fibs = [];
  let fibMode = 0;          // 0 — oʻchiq, 1 — birinchi nuqta kutilmoqda, 2 — ikkinchi
  let fibFirst = null;
  const fibMarker = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12), new THREE.MeshBasicMaterial({ color: COL.gold }));
  fibMarker.visible = false;
  scene.add(fibMarker);

  const FIB_COLORS = { "-0.618": 0x22d3ee, "-0.272": 0x22d3ee, 0: 0x9aa3b8, 0.236: 0xef5350, 0.382: 0xff9800, 0.5: 0x4caf50, 0.618: 0xf5c451, 0.786: 0x42a5f5, 1: 0x9aa3b8 };

  function indexOfTime(t) {
    // koʻrinishdagi indeks (koʻrinishdan tashqarida boʻlsa — chegaradan tashqarida)
    let lo = 0, hi = view.length - 1;
    if (!view.length) return 0;
    if (t < view[0].time) return -((view[0].time - t) / tfSec()) ;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (view[mid].time < t) lo = mid + 1; else hi = mid; }
    return lo;
  }
  const tfSec = () => (M.TFS.find((t) => t.id === cfg.tf) || { sec: 60 }).sec;

  function buildFibs() {
    disposeGroup(fibGroup);
    const levels = FIB_LEVELS.concat(cfg.ext ? FIB_EXT : []);
    fibs.forEach((f, k) => {
      const iA = indexOfTime(f.aTime), iB = indexOfTime(f.bTime);
      const xStart = X(Math.min(iA, iB));
      const xEnd = 9;
      const w = xEnd - xStart;
      const priceAt = (L) => f.bPrice + (f.aPrice - f.bPrice) * L;

      // Oltin zona 0.5 – 0.618
      const y5 = Y(priceAt(0.5)), y6 = Y(priceAt(0.618));
      const gz = new THREE.Mesh(
        new THREE.BoxGeometry(w, Math.max(Math.abs(y6 - y5), 0.05), 3.2),
        new THREE.MeshStandardMaterial({ color: COL.gold, transparent: true, opacity: 0.13, depthWrite: false, emissive: COL.gold, emissiveIntensity: 0.25 }),
      );
      gz.position.set(xStart + w / 2, (y5 + y6) / 2, 0);
      fibGroup.add(gz);

      levels.forEach((L) => {
        const y = Y(priceAt(L));
        const color = FIB_COLORS[L] || COL.fib;
        // Shisha qatlam
        const plane = new THREE.Mesh(
          new THREE.PlaneGeometry(w, 3.2),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: L === 0.618 || L === 0.5 ? 0.16 : 0.08, side: THREE.DoubleSide, depthWrite: false }),
        );
        plane.rotation.x = -Math.PI / 2;
        plane.position.set(xStart + w / 2, y, 0);
        fibGroup.add(plane);
        // Old qirradagi chiziq
        const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(xStart, y, 1.6), new THREE.Vector3(xEnd, y, 1.6)]);
        fibGroup.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 })));
        const l = label(`${L} · ${fmt(priceAt(L))}`, "d3-fib-lbl");
        l.element.style.setProperty("--c", "#" + color.toString(16).padStart(6, "0"));
        l.position.set(xStart - 0.4, y, 1.6); // darajaning chap boshida
        fibGroup.add(l);
      });

      // Swing chizigʻi A → B
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(X(iA), Y(f.aPrice), 1.6), new THREE.Vector3(X(iB), Y(f.bPrice), 1.6),
      ]);
      const ln = new THREE.Line(g, new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.5, gapSize: 0.35, transparent: true, opacity: 0.7 }));
      ln.computeLineDistances();
      fibGroup.add(ln);
      [[iA, f.aPrice], [iB, f.bPrice]].forEach(([i, p]) => {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), new THREE.MeshBasicMaterial({ color: COL.gold }));
        s.position.set(X(i), Y(p), 1.6);
        fibGroup.add(s);
      });
    });
    renderFibList();
  }

  function renderFibList() {
    const box = $("d3FibList");
    box.innerHTML = "";
    fibs.forEach((f, k) => {
      const row = document.createElement("div");
      row.className = "d3-fib-row";
      const up = f.bPrice > f.aPrice;
      row.innerHTML = `<span></span><button type="button" aria-label="Oʻchirish">✕</button>`;
      row.firstChild.textContent = `${up ? "▲" : "▼"} ${fmt(f.aPrice)} → ${fmt(f.bPrice)}`;
      row.firstChild.className = up ? "up" : "down";
      row.lastChild.onclick = () => { fibs.splice(k, 1); saveFibs(); buildFibs(); };
      box.appendChild(row);
    });
    if (!fibs.length) box.innerHTML = '<p class="muted">Hali Fibonachchi yoʻq</p>';
  }

  function setFibMode(m) {
    fibMode = m;
    $("d3FibDraw").classList.toggle("on", m > 0);
    $("d3FibHint").textContent = m === 1 ? "1-nuqta: swing boshidagi shamni bosing" : m === 2 ? "2-nuqta: swing oxiridagi shamni bosing" : "";
    renderer.domElement.style.cursor = m ? "crosshair" : "";
    if (!m) { fibMarker.visible = false; fibFirst = null; }
  }

  function autoFib() {
    const n = view.length;
    const look = view.slice(Math.max(0, n - 100));
    const off = n - look.length;
    let hiI = 0, loI = 0;
    look.forEach((b, i) => { if (b.high > look[hiI].high) hiI = i; if (b.low < look[loI].low) loI = i; });
    const a = Math.min(hiI, loI), b = Math.max(hiI, loI);
    const aIsLow = a === loI;
    fibs.push({
      aTime: view[off + a].time, aPrice: aIsLow ? look[a].low : look[a].high,
      bTime: view[off + b].time, bPrice: aIsLow ? look[b].high : look[b].low,
    });
    saveFibs();
    buildFibs();
  }

  // -------------------------------------------------------------------------
  // Toʻliq qayta qurish
  // -------------------------------------------------------------------------
  function rebuild() {
    view = bars.slice(-cfg.count);
    if (!view.length) return;
    computeRange();
    bodies.count = wicks.count = vols.count = view.length;
    view.forEach((_, i) => placeCandle(i));
    placeVolumes();
    flagUpdate();
    buildAxes();
    buildEma();
    buildFibs();
    placeLive();
    updateHeader();
  }

  // Faqat oxirgi sham oʻzgarganda (diapazon ichida)
  function updateLast() {
    const i = view.length - 1;
    const b = view[i];
    if (b.high > pMax || b.low < pMin) { rebuild(); return; }
    placeCandle(i);
    placeVolumes();
    flagUpdate();
    placeLive();
    updateHeader();
  }

  function updateHeader() {
    const last = view[view.length - 1];
    if (!last) return;
    $("d3Price").textContent = fmt(last.close);
    const first = view[0];
    const chg = (last.close - first.open) / first.open * 100;
    const el = $("d3Chg");
    el.textContent = (chg >= 0 ? "+" : "") + chg.toFixed(2) + "%";
    el.className = "d3-chg " + (chg >= 0 ? "up" : "down");
  }

  // -------------------------------------------------------------------------
  // Kamera koʻrinishlari (silliq oʻtish)
  // -------------------------------------------------------------------------
  let tween = null;
  function flyTo(pos, target, ms = 900) {
    tween = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: target, start: performance.now(), ms };
  }
  function centerY() { const last = view[view.length - 1]; return last ? Y(last.close) * 0.5 : 0; }
  function setView(v) {
    const n = view.length;
    const midX = X(Math.floor(n * 0.62));
    const cy = centerY();
    const span = Math.max(n * STEP, 60);
    if (v === "front") flyTo(new THREE.Vector3(midX + 4, cy + 8, span * 0.66), new THREE.Vector3(midX + 4, cy, 0));
    if (v === "side") flyTo(new THREE.Vector3(30, cy + 14, 30), new THREE.Vector3(-18, cy, 0));
    if (v === "back") flyTo(new THREE.Vector3(midX - 4, cy + 10, -span * 0.6), new THREE.Vector3(midX + 4, cy, 0));
    if (v === "top") flyTo(new THREE.Vector3(midX, cy + span * 0.9, 6), new THREE.Vector3(midX, cy, 0));
    if (v === "inside") {
      const last = view[n - 1];
      const y = last ? Y(last.close) : 0;
      flyTo(new THREE.Vector3(6, y + 1.2, 1.4), new THREE.Vector3(-20, y, 0));
    }
  }
  stage.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));

  $("d3Rotate").addEventListener("click", (e) => {
    controls.autoRotate = !controls.autoRotate;
    e.currentTarget.setAttribute("aria-pressed", controls.autoRotate);
    e.currentTarget.classList.toggle("on", controls.autoRotate);
  });
  $("d3Full").addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (stage.requestFullscreen) stage.requestFullscreen().catch(() => {});
  });

  // -------------------------------------------------------------------------
  // Klaviatura bilan uchish
  // -------------------------------------------------------------------------
  const keys = new Set();
  window.addEventListener("keydown", (e) => {
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    const k = e.key.toLowerCase();
    if (["w", "a", "s", "d", "q", "e", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
      keys.add(k);
      if (k.startsWith("arrow")) e.preventDefault();
    }
    if (k === "escape") setFibMode(0);
  });
  window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener("blur", () => keys.clear());

  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), move = new THREE.Vector3();
  function flyStep(dt, shift) {
    if (!keys.size) return;
    const speed = (shift ? 40 : 14) * dt;
    camera.getWorldDirection(fwd);
    right.crossVectors(fwd, camera.up).normalize();
    move.set(0, 0, 0);
    if (keys.has("w") || keys.has("arrowup")) move.add(fwd);
    if (keys.has("s") || keys.has("arrowdown")) move.sub(fwd);
    if (keys.has("d") || keys.has("arrowright")) move.add(right);
    if (keys.has("a") || keys.has("arrowleft")) move.sub(right);
    if (keys.has("e")) move.y += 1;
    if (keys.has("q")) move.y -= 1;
    if (!move.lengthSq()) return;
    move.normalize().multiplyScalar(speed);
    camera.position.add(move);
    controls.target.add(move);
    tween = null;
  }
  let shiftDown = false;
  window.addEventListener("keydown", (e) => { shiftDown = e.shiftKey; });
  window.addEventListener("keyup", (e) => { shiftDown = e.shiftKey; });

  // -------------------------------------------------------------------------
  // Sichqoncha: hover, bosish (yaqinlashish yoki Fibonachchi)
  // -------------------------------------------------------------------------
  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  function pick(ev) {
    const r = renderer.domElement.getBoundingClientRect();
    ptr.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const hit = ray.intersectObjects([bodies, wicks], false)[0];
    return hit && hit.instanceId !== undefined ? hit : null;
  }

  const tip = $("d3Tip");
  let lastMove = 0;
  renderer.domElement.addEventListener("pointermove", (ev) => {
    const now = performance.now();
    if (now - lastMove < 40) return;
    lastMove = now;
    const hit = pick(ev);
    const id = hit ? hit.instanceId : -1;
    if (id !== hoverId) {
      const old = hoverId;
      hoverId = id;
      if (old >= 0 && old < view.length) placeCandle(old);
      if (id >= 0) placeCandle(id);
      flagUpdate();
    }
    if (hit) {
      const b = view[id];
      const r = stage.getBoundingClientRect();
      tip.hidden = false;
      tip.style.left = ev.clientX - r.left + 14 + "px";
      tip.style.top = ev.clientY - r.top + 14 + "px";
      tip.textContent = `${timeText(b.time)} · O ${fmt(b.open)} · H ${fmt(b.high)} · L ${fmt(b.low)} · C ${fmt(b.close)}`;
    } else tip.hidden = true;
  });
  renderer.domElement.addEventListener("pointerleave", () => { tip.hidden = true; });

  // Bosish va sudrashni ajratish
  let downAt = null;
  renderer.domElement.addEventListener("pointerdown", (ev) => { downAt = { x: ev.clientX, y: ev.clientY }; });
  renderer.domElement.addEventListener("pointerup", (ev) => {
    if (!downAt || Math.hypot(ev.clientX - downAt.x, ev.clientY - downAt.y) > 6) { downAt = null; return; }
    downAt = null;
    const hit = pick(ev);
    if (!hit) { if (!fibMode) $("d3Info").hidden = true; return; }
    const i = hit.instanceId;
    const b = view[i];
    const mid = (Y(b.high) + Y(b.low)) / 2;
    const price = hit.point.y >= mid ? b.high : b.low;

    if (fibMode === 1) {
      fibFirst = { time: b.time, price };
      fibMarker.position.set(X(i), Y(price), 1.6);
      fibMarker.visible = true;
      setFibMode(2);
      return;
    }
    if (fibMode === 2) {
      if (b.time !== fibFirst.time) {
        const [a, c] = fibFirst.time < b.time ? [fibFirst, { time: b.time, price }] : [{ time: b.time, price }, fibFirst];
        fibs.push({ aTime: a.time, aPrice: a.price, bTime: c.time, bPrice: c.price });
        saveFibs();
        buildFibs();
      }
      setFibMode(0);
      return;
    }
    // Shamga yaqinlashish va maʼlumot
    const x = X(i), y = (Y(b.high) + Y(b.low)) / 2;
    flyTo(new THREE.Vector3(x + 3.5, y + 2, 5.5), new THREE.Vector3(x, y, 0), 700);
    showInfo(i);
  });

  function showInfo(i) {
    const b = view[i];
    const prev = view[i - 1];
    const chg = prev ? (b.close - prev.close) / prev.close * 100 : (b.close - b.open) / b.open * 100;
    const el = $("d3Info");
    el.hidden = false;
    el.innerHTML = `
      <div class="d3-info-head"><b></b><button type="button" aria-label="Yopish">✕</button></div>
      <dl class="kv">
        <div><dt>Ochilish</dt><dd></dd></div><div><dt>Eng yuqori</dt><dd class="up"></dd></div>
        <div><dt>Eng past</dt><dd class="down"></dd></div><div><dt>Yopilish</dt><dd></dd></div>
        <div><dt>Oʻzgarish</dt><dd></dd></div><div><dt>Hajm</dt><dd></dd></div>
      </dl>`;
    el.querySelector("b").textContent = new Date(b.time * 1000).toISOString().slice(0, 16).replace("T", " ");
    const dd = el.querySelectorAll("dd");
    dd[0].textContent = fmt(b.open);
    dd[1].textContent = fmt(b.high);
    dd[2].textContent = fmt(b.low);
    dd[3].textContent = fmt(b.close);
    dd[4].textContent = (chg >= 0 ? "+" : "") + chg.toFixed(2) + "%";
    dd[4].className = chg >= 0 ? "up" : "down";
    dd[5].textContent = M.fmtNum(b.volume, 2);
    el.querySelector("button").onclick = () => { el.hidden = true; };
  }

  // -------------------------------------------------------------------------
  // Boshqaruv elementlari
  // -------------------------------------------------------------------------
  $("d3FibDraw").addEventListener("click", () => setFibMode(fibMode ? 0 : 1));
  $("d3FibAuto").addEventListener("click", () => { if (view.length > 10) autoFib(); });
  $("d3FibClear").addEventListener("click", () => { fibs = []; saveFibs(); buildFibs(); });
  const bindCheck = (id, key, fn) => {
    const el = $(id);
    el.checked = !!cfg[key];
    el.addEventListener("change", () => { cfg[key] = el.checked; save(); fn(); });
  };
  bindCheck("d3FibExt", "ext", buildFibs);
  bindCheck("d3Vol", "vol", () => { vols.visible = cfg.vol; });
  bindCheck("d3Ema", "ema", buildEma);
  // Telefonda Fibonachchi paneli yigʻilgan holda ochiladi
  if (window.matchMedia("(max-width: 700px)").matches) $("d3FibPanel").open = false;

  const countEl = $("d3Count");
  countEl.value = String(cfg.count);
  countEl.addEventListener("change", () => { cfg.count = +countEl.value; save(); rebuild(); setView("front"); });

  function setConn(text, cls) {
    const el = $("d3Conn");
    el.textContent = text;
    el.className = "conn" + (cls ? " " + cls : "");
  }

  let tickTimer = null;
  function loadSymbol() {
    if (feed) feed.stop();
    const a = M.ASSETS.find((x) => x.id === cfg.symbol) || M.ASSETS[0];
    $("d3Title").textContent = a.title;
    showMsg("Narxlar yuklanmoqda…");
    setFibMode(0);
    $("d3Info").hidden = true;
    fibs = loadFibs();
    feed = M.createFeed({
      symbol: cfg.symbol, tf: cfg.tf, limit: 500,
      onConn: setConn,
      onError: showMsg,
      onLoad: (data) => {
        bars = data;
        decimals = M.decimalsFor(bars[bars.length - 1].close);
        showMsg("");
        rebuild();
        setView("front");
      },
      onTick: (bar) => {
        const len = bars.length;
        if (!M.upsertBar(bars, bar, 1000)) return;
        const isNew = bars.length !== len || bar.time !== view[view.length - 1]?.time;
        if (tickTimer) return;
        tickTimer = setTimeout(() => {
          tickTimer = null;
          if (isNew) rebuild();
          else { view[view.length - 1] = bars[bars.length - 1]; updateLast(); }
        }, 200);
      },
    });
  }

  const row = window.trederButtonRow;
  function renderControls() {
    row($("d3Symbols"), M.ASSETS, cfg.symbol, "chip", (id) => { cfg.symbol = id; save(); renderControls(); loadSymbol(); });
    row($("d3Intervals"), M.TFS, cfg.tf, "seg-btn", (id) => { cfg.tf = id; save(); renderControls(); loadSymbol(); });
  }

  // -------------------------------------------------------------------------
  // Oʻlcham va animatsiya sikli
  // -------------------------------------------------------------------------
  function resize() {
    const w = holder.clientWidth, h = holder.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = w + "px";
    renderer.domElement.style.height = h + "px";
    labelRenderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(holder);
  document.addEventListener("treder:theme", applyTheme);

  const clock = new THREE.Clock();
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    if (tween) {
      const k = Math.min(1, (performance.now() - tween.start) / tween.ms);
      const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
      camera.position.lerpVectors(tween.p0, tween.p1, e);
      controls.target.lerpVectors(tween.t0, tween.t1, e);
      if (k >= 1) tween = null;
    }
    flyStep(dt, shiftDown);
    const s = 1 + 0.35 * Math.sin(t * 3);
    liveHalo.scale.setScalar(s);
    liveHalo.material.opacity = 0.32 - 0.12 * Math.sin(t * 3);
    controls.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  window.treder3d = { scene, camera, controls, setView, autoFib, get fibs() { return fibs; }, get view() { return view; }, Y, X };

  applyTheme();
  resize();
  camera.position.set(10, 10, 90);
  renderControls();
  renderFibList();
  loadSymbol();
  frame();
}
