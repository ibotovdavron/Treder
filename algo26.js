// Matematik Algoritm 2.6 LIVE — Takrorlanmas_robotlar indikatorining JavaScript talqini.
// Pine Script manbasi: downloads/Matematik_2_6_Indikator.pine
// Grafik: TradingView Lightweight Charts, narxlar: Binance ochiq bozor maʼlumotlari.

(() => {
  "use strict";

  const M = window.TrederMarket;
  const FUTURE_BARS = 16;     // Pine: rEdge = bar_index + 16
  const STORE_KEY = "treder:algo";
  const ASSETS = M ? M.ASSETS : [];
  const TFS = M ? M.TFS : [];

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
  window.trederAlgo26 = compute; // signal.html va tekshiruv uchun
  window.trederAlgo26Defaults = DEFAULTS;

  // ===========================================================================
  // 2. GRAFIK
  // ===========================================================================
  const chartEl = $("algoChart");
  const overlay = $("algoOverlay");
  if (!chartEl || !M || !window.LightweightCharts) return;

  let bars = [];
  let result = null;
  let decimals = 2;
  let levels = null;
  let priceLines = [];
  let feed = null;

  const { chart, prepare, onRedraw } = M.makeChart(chartEl, overlay, { futureBars: FUTURE_BARS });

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

  const fmt = (v) => M.fmtNum(v, decimals);
  const alpha = M.alpha;

  // ---- Canvas ustki qatlami: qutilar va chiziqlar ----
  function draw() {
    const { ctx, paneW, paneH, X, Y } = prepare(series);
    const r = result;
    if (!r || !r.valid) return;

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
  const scheduleDraw = onRedraw(draw);

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
  // 3. MAʼLUMOTLAR
  // ===========================================================================
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

  let recomputeTimer = null;
  function loadSymbol() {
    if (feed) feed.stop();
    const a = ASSETS.find((x) => x.id === cfg.symbol) || ASSETS[0];
    $("algoTitle").textContent = a.title;
    $("algoSub").textContent = a.sub;
    showMsg("Narxlar yuklanmoqda…");
    feed = M.createFeed({
      symbol: cfg.symbol, tf: cfg.tf, limit: 500,
      onConn: setConn,
      onError: showMsg,
      onLoad: (data) => {
        bars = data;
        decimals = M.decimalsFor(bars[bars.length - 1].close);
        series.applyOptions({ priceFormat: { type: "price", precision: decimals, minMove: 1 / 10 ** decimals } });
        series.setData(bars);
        chart.timeScale().setVisibleLogicalRange({ from: bars.length - 120, to: bars.length + FUTURE_BARS + 6 });
        showMsg("");
        recompute();
      },
      onTick: (bar) => {
        if (!M.upsertBar(bars, bar)) return;
        series.update(bar);
        $("kvPrice").textContent = fmt(bar.close);
        if (!recomputeTimer) recomputeTimer = setTimeout(() => { recomputeTimer = null; recompute(); }, 250);
      },
    });
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

  // Bosh sahifadagi kartochka bosilganda shu aktivni ochish
  document.addEventListener("treder:pick", (e) => {
    cfg.symbol = e.detail; save(); renderControls(); loadSymbol();
    $("algo").scrollIntoView({ behavior: "smooth" });
  });

  renderControls();
  renderPanel();
  loadSymbol();
})();
