// Matematik Algoritm 2.6 LIVE — Takrorlanmas_robotlar indikatorining JavaScript talqini.
// Pine Script manbasi: downloads/Matematik_2_6_Indikator.pine
// Grafik: TradingView Lightweight Charts, narxlar: Binance ochiq bozor maʼlumotlari.

(() => {
  "use strict";

  const API = "https://data-api.binance.vision/api/v3";
  const WS = "wss://data-stream.binance.vision/ws";
  const TZ_OFFSET = 5 * 3600; // Toshkent vaqti (UTC+5)
  const FUTURE_BARS = 16;     // Pine: rEdge = bar_index + 16
  const STORE_KEY = "treder:algo";

  const ASSETS = [
    { id: "BTCUSDT", label: "BTC", title: "BTC / USDT", sub: "Bitcoin · Binance" },
    { id: "PAXGUSDT", label: "Oltin", title: "PAXG / USDT", sub: "Oltin tokeni (XAU/USD narxiga bogʻlangan) · Binance" },
    { id: "ETHUSDT", label: "ETH", title: "ETH / USDT", sub: "Ethereum · Binance" },
    { id: "SOLUSDT", label: "SOL", title: "SOL / USDT", sub: "Solana · Binance" },
    { id: "BNBUSDT", label: "BNB", title: "BNB / USDT", sub: "BNB · Binance" },
    { id: "XRPUSDT", label: "XRP", title: "XRP / USDT", sub: "XRP · Binance" },
  ];
  const HERO = ["BTCUSDT", "PAXGUSDT", "ETHUSDT", "SOLUSDT"];
  const TFS = [
    { id: "1m", label: "M1" },
    { id: "5m", label: "M5" },
    { id: "15m", label: "M15" },
    { id: "1h", label: "H1" },
    { id: "4h", label: "H4" },
    { id: "1d", label: "D1" },
  ];

  const DEFAULTS = {
    symbol: "BTCUSDT", tf: "5m",
    coef: 2.6, left: 5, right: 3, zone: 15, sl: 35, mode: "touch", minRange: 0,
  };

  const COL = {
    buy: "#16c784", sell: "#f6465d", wave: "#1e88e5", gold: "#f5c451",
  };

  const $ = (id) => document.getElementById(id);
  const cfg = load();

  function load() {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE_KEY) || "{}") }; }
    catch { return { ...DEFAULTS }; }
  }
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(cfg)); } catch {} }

  // ===========================================================================
  // 1. ALGORITM (Pine indikatoridagi hisob-kitoblar bilan bir xil)
  // ===========================================================================
  function compute(bars, p) {
    const n = bars.length;
    const L = p.left, R = p.right;
    let hiV = null, hiB = null, loV = null, loB = null;

    // ta.pivothigh / ta.pivotlow: markaziy sham chapdagi L va oʻngdagi R shamdan baland/past
    for (let i = L + R; i < n; i++) {
      const c = i - R;
      const h = bars[c].high, l = bars[c].low;
      let isH = true, isL = true;
      for (let k = c - L; k <= c + R && (isH || isL); k++) {
        if (k === c) continue;
        if (k < c ? bars[k].high >= h : bars[k].high > h) isH = false;
        if (k < c ? bars[k].low <= l : bars[k].low < l) isL = false;
      }
      if (isH) { hiV = h; hiB = c; }
      if (isL) { loV = l; loB = c; }
    }

    const res = { valid: false, hiV, hiB, loV, loB, status: "Toʻlqin kutilmoqda" };
    if (hiV === null || loV === null || n === 0) return res;

    const range = Math.abs(hiV - loV);
    if (!(range > 0) || range < p.minRange) return { ...res, range };
    const off = range / p.coef;

    const buyT = loV - off;
    const sellT = hiV + off;
    const span = off * (p.zone / 100);
    const last = bars[n - 1];

    let buyActive = false, sellActive = false, buyWaiting = false, sellWaiting = false;

    if (last.low <= loV) {
      buyActive = p.mode === "touch"
        ? last.low <= buyT + span && last.low >= buyT - span * 2.5
        : last.low <= buyT && last.close > buyT;
    }
    if (last.high >= hiV) {
      sellActive = p.mode === "touch"
        ? last.high >= sellT - span && last.high <= sellT + span * 2.5
        : last.high >= sellT && last.close < sellT;
    }
    if (!buyActive && !sellActive) {
      if (hiB > loB) buyWaiting = true; else sellWaiting = true;
    }

    const buySide = buyActive || buyWaiting;
    const entry = buyActive ? buyT : sellActive ? sellT : buyWaiting ? buyT : sellT;
    const sl = buySide ? buyT - off * (p.sl / 100) : sellT + off * (p.sl / 100);
    const tp1 = buySide ? loV : hiV;
    const tp2 = buySide ? loV + range * 0.5 : hiV - range * 0.5;

    const status = buyActive ? "BUY signali faol" : sellActive ? "SELL signali faol"
      : buyWaiting ? "BUY zonasi kutilmoqda" : "SELL zonasi kutilmoqda";
    const rec = buyActive ? "BUY ochish tavsiya" : sellActive ? "SELL ochish tavsiya" : "Zonaga kelishini kuting";

    return {
      valid: true, hiV, hiB, loV, loB, range, off, buyT, sellT,
      buyActive, sellActive, buyWaiting, sellWaiting, buySide,
      entry, sl, tp1, tp2, status, rec,
      brkPrice: buySide ? loV : hiV,
      brkBar: buySide ? loB : hiB,
      zonePrice: buySide ? buyT : sellT,
      lastIndex: n - 1,
    };
  }
  window.trederAlgo26 = compute; // tekshiruv uchun

  // ===========================================================================
  // 2. GRAFIK
  // ===========================================================================
  const chartEl = $("algoChart");
  const overlay = $("algoOverlay");
  if (!chartEl || !window.LightweightCharts) return;

  let bars = [];
  let result = null;
  let decimals = 2;
  let levels = null;
  let priceLines = [];

  const chart = LightweightCharts.createChart(chartEl, {
    autoSize: true,
    layout: { background: { type: "solid", color: "transparent" }, fontFamily: "Inter, system-ui, sans-serif" },
    rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.12 } },
    timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, rightOffset: FUTURE_BARS + 6 },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
  });

  const series = chart.addCandlestickSeries({
    upColor: COL.buy, downColor: COL.sell, borderVisible: false,
    wickUpColor: COL.buy, wickDownColor: COL.sell,
    autoscaleInfoProvider: (orig) => {
      const r = orig();
      if (!r || !levels) return r;
      return {
        ...r,
        priceRange: {
          minValue: Math.min(r.priceRange.minValue, ...levels),
          maxValue: Math.max(r.priceRange.maxValue, ...levels),
        },
      };
    },
  });

  function applyChartTheme() {
    const dark = (window.trederTheme ? window.trederTheme() : "dark") === "dark";
    chart.applyOptions({
      layout: { textColor: dark ? "#8b93a9" : "#5b647a" },
      grid: {
        vertLines: { color: dark ? "rgba(255,255,255,0.04)" : "rgba(15,23,42,0.05)" },
        horzLines: { color: dark ? "rgba(255,255,255,0.04)" : "rgba(15,23,42,0.05)" },
      },
    });
    draw();
  }
  document.addEventListener("treder:theme", applyChartTheme);

  function decimalsFor(price) {
    if (price >= 100) return 2;
    if (price >= 1) return 3;
    if (price >= 0.01) return 5;
    return 8;
  }
  const fmt = (v) => (v === null || v === undefined || !isFinite(v)) ? "—"
    : Number(v).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  // ---- Canvas ustki qatlami: qutilar va chiziqlar ----
  function draw() {
    const ctx = overlay.getContext("2d");
    const w = chartEl.clientWidth, h = chartEl.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    if (overlay.width !== Math.round(w * dpr) || overlay.height !== Math.round(h * dpr)) {
      overlay.width = Math.round(w * dpr);
      overlay.height = Math.round(h * dpr);
      overlay.style.width = w + "px";
      overlay.style.height = h + "px";
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const r = result;
    if (!r || !r.valid) return;

    const ts = chart.timeScale();
    const paneW = w - chart.priceScale("right").width();
    const paneH = h - ts.height();
    const X = (i) => ts.logicalToCoordinate(i);
    const Y = (p) => series.priceToCoordinate(p);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, paneW, paneH);
    ctx.clip();
    ctx.font = "600 11px Inter, system-ui, sans-serif";
    ctx.textBaseline = "top";

    const act = r.buySide ? COL.buy : COL.sell;
    const n = r.lastIndex;
    const rEdge = n + FUTURE_BARS;

    const box = (i1, p1, i2, p2, fill, stroke, dash, label, labelColor) => {
      const x1 = X(i1), x2 = X(i2), y1 = Y(p1), y2 = Y(p2);
      if ([x1, x2, y1, y2].some((v) => v === null || v === undefined)) return;
      const x = Math.min(x1, x2), y = Math.min(y1, y2);
      const bw = Math.max(Math.abs(x2 - x1), 2), bh = Math.max(Math.abs(y2 - y1), 1);
      ctx.fillStyle = fill;
      ctx.fillRect(x, y, bw, bh);
      ctx.setLineDash(dash || []);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, bw - 1, bh - 1);
      ctx.setLineDash([]);
      if (label) {
        ctx.fillStyle = labelColor || stroke;
        ctx.fillText(label, x + 6, y + 5);
      }
    };
    const hline = (i1, i2, p, color, width, dash) => {
      const x1 = X(i1), x2 = X(i2), y = Y(p);
      if ([x1, x2, y].some((v) => v === null || v === undefined)) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash(dash || []);
      ctx.beginPath();
      ctx.moveTo(x1, Math.round(y) + 0.5);
      ctx.lineTo(x2, Math.round(y) + 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
    };
    const alpha = (hex, a) => {
      const v = parseInt(hex.slice(1), 16);
      return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
    };

    // 1. Toʻlqin diapazoni (koʻk quti)
    box(Math.min(r.hiB, r.loB), r.hiV, Math.max(r.hiB, r.loB), r.loV,
      alpha(COL.wave, 0.12), alpha(COL.wave, 0.85), null,
      "DIAPAZON: " + fmt(r.range), COL.wave);

    // 2. Breakout chizigʻi va ÷2.6 offset qutisi
    hline(r.brkBar, rEdge, r.brkPrice, alpha(act, 0.7), 1, [5, 4]);
    box(r.brkBar, Math.max(r.brkPrice, r.zonePrice), n + 2, Math.min(r.brkPrice, r.zonePrice),
      alpha(act, 0.12), alpha(act, 0.8), [2, 3],
      `÷${cfg.coef} OFFSET: ${r.buySide ? "−" : "+"}${fmt(r.off)}`, act);

    // 3. TP / SL bloklari
    box(n, Math.max(r.entry, r.tp2), rEdge, Math.min(r.entry, r.tp2), alpha(COL.buy, 0.14), alpha(COL.buy, 0.55));
    box(n, Math.max(r.entry, r.sl), rEdge, Math.min(r.entry, r.sl), alpha(COL.sell, 0.14), alpha(COL.sell, 0.55));
    hline(n, rEdge, r.entry, COL.gold, 2);
    hline(n, rEdge, r.tp1, COL.buy, 1, [5, 4]);
    hline(n, rEdge, r.tp2, COL.buy, 2);
    hline(n, rEdge, r.sl, COL.sell, 2);

    ctx.restore();
  }

  let rafPending = false;
  function scheduleDraw() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => { rafPending = false; draw(); });
  }
  chart.timeScale().subscribeVisibleLogicalRangeChange(scheduleDraw);
  chart.subscribeCrosshairMove(scheduleDraw);
  new ResizeObserver(scheduleDraw).observe(chartEl);
  setInterval(scheduleDraw, 1000); // narx shkalasi qoʻlda surilganda ham yangilansin

  // ---- Natijani grafik va panelga chiqarish ----
  function recompute() {
    if (!bars.length) return;
    result = compute(bars, cfg);
    const r = result;

    priceLines.forEach((pl) => series.removePriceLine(pl));
    priceLines = [];

    if (r.valid) {
      levels = [r.entry, r.sl, r.tp1, r.tp2, r.zonePrice];
      const add = (price, color, title) => priceLines.push(series.createPriceLine({
        price, color, title, lineVisible: false, axisLabelVisible: true,
      }));
      add(r.entry, COL.gold, r.buySide ? "KIRISH BUY" : "KIRISH SELL");
      add(r.tp1, COL.buy, "TP1");
      add(r.tp2, COL.buy, "TP2");
      add(r.sl, COL.sell, "SL");

      const last = bars[bars.length - 1];
      const active = r.buyActive || r.sellActive;
      series.setMarkers([{
        time: last.time,
        position: r.buySide ? "belowBar" : "aboveBar",
        color: r.buySide ? COL.buy : COL.sell,
        shape: r.buySide ? "arrowUp" : "arrowDown",
        text: active ? `★ ${r.buySide ? "BUY" : "SELL"} 2.6` : `Kutilmoqda: ${r.buySide ? "BUY" : "SELL"}`,
      }]);
    } else {
      levels = null;
      series.setMarkers([]);
    }

    renderPanel();
    scheduleDraw();
  }

  function renderPanel() {
    const r = result || {};
    const last = bars[bars.length - 1];
    $("kvPrice").textContent = last ? fmt(last.close) : "—";
    $("kvCoef").textContent = cfg.coef;
    $("kvRange").textContent = fmt(r.range);
    $("kvOff").textContent = fmt(r.off);
    $("kvEntry").textContent = fmt(r.entry);
    $("kvSl").textContent = fmt(r.sl);
    $("kvTp1").textContent = fmt(r.tp1);
    $("kvTp2").textContent = fmt(r.tp2);
    const risk = r.valid ? Math.abs(r.entry - r.sl) : 0;
    $("kvRr").textContent = r.valid && risk > 0 ? "1 : " + (Math.abs(r.tp2 - r.entry) / risk).toFixed(2) : "—";

    const st = $("algoStatus");
    st.className = "status " + (r.buySide && r.valid ? "status-buy" : r.valid ? "status-sell" : "status-wait");
    if (r.valid && !r.buyActive && !r.sellActive) st.className += " status-wait";
    $("algoStatusText").textContent = r.status || "Hisoblanmoqda…";

    const rec = $("algoRec");
    rec.textContent = r.rec || "Zonaga kelishini kuting";
    rec.className = "rec" + (r.buyActive ? " buy" : r.sellActive ? " sell" : "");
  }

  // ===========================================================================
  // 3. MAʼLUMOTLAR (Binance REST + WebSocket)
  // ===========================================================================
  let session = 0;
  let ws = null;
  let pollTimer = null;

  const toBar = (k) => ({
    time: Math.floor(k[0] / 1000) + TZ_OFFSET,
    open: +k[1], high: +k[2], low: +k[3], close: +k[4],
  });

  function setConn(text, cls) {
    const el = $("algoConn");
    el.textContent = text;
    el.className = "conn" + (cls ? " " + cls : "");
  }
  function showMsg(text) {
    const el = $("algoMsg");
    el.hidden = !text;
    el.textContent = text || "";
  }

  async function fetchKlines(limit) {
    const url = `${API}/klines?symbol=${cfg.symbol}&interval=${cfg.tf}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    return (await res.json()).map(toBar);
  }

  function upsert(bar) {
    const last = bars[bars.length - 1];
    if (last && bar.time === last.time) bars[bars.length - 1] = bar;
    else if (!last || bar.time > last.time) { bars.push(bar); if (bars.length > 1000) bars.shift(); }
    else return;
    series.update(bar);
  }

  let recomputeTimer = null;
  function liveTick(bar) {
    upsert(bar);
    $("kvPrice").textContent = fmt(bar.close);
    if (!recomputeTimer) recomputeTimer = setTimeout(() => { recomputeTimer = null; recompute(); }, 250);
  }

  function stopLive() {
    if (ws) { ws.onclose = null; ws.onerror = null; ws.onmessage = null; try { ws.close(); } catch {} ws = null; }
    clearInterval(pollTimer);
    pollTimer = null;
  }

  function startPolling(my) {
    clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      if (my !== session) return;
      try {
        (await fetchKlines(2)).forEach(liveTick);
        setConn("Jonli (soʻrov)", "ok");
      } catch { setConn("Aloqa yoʻq", "bad"); }
    }, 5000);
  }

  function startWs(my, attempt = 0) {
    let opened = false;
    try {
      ws = new WebSocket(`${WS}/${cfg.symbol.toLowerCase()}@kline_${cfg.tf}`);
    } catch { startPolling(my); return; }
    ws.onopen = () => { opened = true; setConn("Jonli", "ok"); clearInterval(pollTimer); pollTimer = null; };
    ws.onmessage = (e) => {
      if (my !== session) return;
      const k = JSON.parse(e.data).k;
      if (k) liveTick({ time: Math.floor(k.t / 1000) + TZ_OFFSET, open: +k.o, high: +k.h, low: +k.l, close: +k.c });
    };
    ws.onclose = () => {
      if (my !== session) return;
      if (!pollTimer) startPolling(my);
      setConn(opened ? "Qayta ulanmoqda…" : "Jonli (soʻrov)", opened ? "" : "ok");
      const delay = Math.min(30000, 2000 * 2 ** attempt);
      setTimeout(() => { if (my === session) startWs(my, opened ? 0 : attempt + 1); }, delay);
    };
  }

  async function loadSymbol() {
    const my = ++session;
    stopLive();
    const a = ASSETS.find((x) => x.id === cfg.symbol) || ASSETS[0];
    $("algoTitle").textContent = a.title;
    $("algoSub").textContent = a.sub;
    setConn("Ulanmoqda…");
    showMsg("Narxlar yuklanmoqda…");
    try {
      const data = await fetchKlines(500);
      if (my !== session) return;
      bars = data;
      decimals = decimalsFor(bars[bars.length - 1].close);
      series.applyOptions({ priceFormat: { type: "price", precision: decimals, minMove: 1 / 10 ** decimals } });
      series.setData(bars);
      chart.timeScale().applyOptions({ rightOffset: FUTURE_BARS + 6 });
      chart.timeScale().setVisibleLogicalRange({ from: bars.length - 120, to: bars.length + FUTURE_BARS + 6 });
      showMsg("");
      recompute();
      startWs(my);
    } catch (err) {
      if (my !== session) return;
      setConn("Aloqa yoʻq", "bad");
      showMsg("Narxlarni yuklab boʻlmadi. Internet aloqasini tekshiring — 10 soniyadan soʻng qayta urinamiz.");
      setTimeout(() => { if (my === session) loadSymbol(); }, 10000);
    }
  }

  // ===========================================================================
  // 4. BOSHQARUV ELEMENTLARI
  // ===========================================================================
  const row = window.trederButtonRow;

  function renderControls() {
    row($("algoSymbols"), ASSETS, cfg.symbol, "chip", (id) => { cfg.symbol = id; save(); renderControls(); loadSymbol(); });
    row($("algoIntervals"), TFS, cfg.tf, "seg-btn", (id) => { cfg.tf = id; save(); renderControls(); loadSymbol(); });
  }

  const inputs = {
    setCoef: ["coef", 1, 5], setLeft: ["left", 2, 50], setRight: ["right", 1, 30],
    setZone: ["zone", 5, 50], setSl: ["sl", 15, 100],
  };
  Object.entries(inputs).forEach(([id, [key, min, max]]) => {
    const el = $(id);
    el.value = cfg[key];
    el.addEventListener("change", () => {
      let v = parseFloat(el.value);
      if (!isFinite(v)) v = DEFAULTS[key];
      v = Math.min(max, Math.max(min, v));
      if (key === "left" || key === "right") v = Math.round(v);
      el.value = v;
      cfg[key] = v;
      save();
      recompute();
    });
  });
  const modeEl = $("setMode");
  modeEl.value = cfg.mode;
  modeEl.addEventListener("change", () => { cfg.mode = modeEl.value; save(); recompute(); });

  // ===========================================================================
  // 5. BOSH SAHIFADAGI NARX KARTOCHKALARI
  // ===========================================================================
  async function loadHero() {
    const box = $("heroStats");
    if (!box) return;
    try {
      const url = `${API}/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(HERO))}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error();
      const data = await res.json();
      box.innerHTML = "";
      HERO.forEach((id) => {
        const t = data.find((d) => d.symbol === id);
        const a = ASSETS.find((x) => x.id === id);
        if (!t || !a) return;
        const price = +t.lastPrice, chg = +t.priceChangePercent;
        const d = decimalsFor(price);
        const b = document.createElement("button");
        b.type = "button";
        b.className = "stat";
        b.innerHTML = `
          <div class="stat-top"><span class="stat-name"></span><span class="stat-chg ${chg >= 0 ? "up" : "down"}"></span></div>
          <div class="stat-price"></div>
          <div class="stat-sub"></div>`;
        b.querySelector(".stat-name").textContent = a.title;
        b.querySelector(".stat-chg").textContent = (chg >= 0 ? "+" : "") + chg.toFixed(2) + "%";
        b.querySelector(".stat-price").textContent = price.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
        b.querySelector(".stat-sub").textContent = id === "PAXGUSDT" ? "Oltin · 24 soat" : "24 soat";
        b.onclick = () => {
          cfg.symbol = id; save(); renderControls(); loadSymbol();
          $("algo").scrollIntoView({ behavior: "smooth" });
        };
        box.appendChild(b);
      });
    } catch {
      if (!box.children.length) box.innerHTML = '<p class="muted">Narxlarni yuklab boʻlmadi.</p>';
    }
  }

  applyChartTheme();
  renderControls();
  renderPanel();
  loadSymbol();
  loadHero();
  setInterval(loadHero, 15000);
})();
