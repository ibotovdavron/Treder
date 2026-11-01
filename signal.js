// Treder — "Eng maqul harakat": barcha indikatorlar konsensusi.
// Ovoz beruvchilar: SPECTRA Clone, Matematik 2.6, Treder Pulse (shu fayldagi oʻz indikatorimiz)
// va katta vaqt oraliqlaridagi trend (MTF). Natija: BUY / SELL / KUTISH + kirish zonasi, SL, TP1, TP2.

(() => {
  "use strict";

  const M = window.TrederMarket;
  const S = window.trederSpectra;
  const A26 = window.trederAlgo26;
  const $ = (id) => document.getElementById(id);
  if (!M || !S || !A26) return;

  const STORE_KEY = "treder:signal";
  const cfg = (() => {
    try { return { symbol: "BTCUSDT", tf: "15m", ...JSON.parse(localStorage.getItem(STORE_KEY) || "{}") }; }
    catch { return { symbol: "BTCUSDT", tf: "15m" }; }
  })();
  const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(cfg)); } catch {} };

  // Indikatorlar standart sozlamalarda ishlaydi
  const A26_CFG = { ...window.trederAlgo26Defaults };
  const SP_CFG = { ...S.DEFAULTS };

  const WEIGHTS = { spectra: 0.3, algo: 0.2, pulse: 0.3, mtf: 0.2 };
  const MTF_TFS = [{ id: "1h", sec: 3600, label: "H1" }, { id: "4h", sec: 14400, label: "H4" }, { id: "1d", sec: 86400, label: "D1" }];
  const COL = { buy: "#16c784", sell: "#f6465d", gold: "#f5c451", wait: "#8b93a9" };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const last = (a) => a[a.length - 1];

  // ===========================================================================
  // 1. TREDER PULSE — oʻz indikatorimiz
  //    Trend (EMA 50/200) 40% · Momentum (MACD gistogrammasi) 30% · RSI 20% · EMA20 qiyaligi 10%
  //    Darajalar: kirish zonasi EMA20 tomon ≤0.6 ATR orqaga qaytish; SL — 20 sham ekstremumi ortida;
  //    TP1 = 1R, TP2 = 2R.
  // ===========================================================================
  function pulse(bars) {
    const close = bars.map((b) => b.close);
    const e20 = S.ema(close, 20), e50 = S.ema(close, 50), e200 = S.ema(close, 200);
    const e12 = S.ema(close, 12), e26 = S.ema(close, 26);
    const macd = e12.map((v, i) => v - e26[i]);
    const sig = S.ema(macd.map((v) => (Number.isFinite(v) ? v : NaN)), 9);
    const hist = macd.map((v, i) => v - sig[i]);
    const rsi = S.rsi(close, 14);
    const atr = S.atr(bars, 14);
    const lo20 = S.lowest(bars.map((b) => b.low), 20);
    const hi20 = S.highest(bars.map((b) => b.high), 20);
    const i = bars.length - 1;
    const c = close[i];

    // Trend
    let trend;
    if (Number.isFinite(e200[i])) {
      trend = c > e50[i] && e50[i] > e200[i] ? 1 : c < e50[i] && e50[i] < e200[i] ? -1 : Math.sign(c - e50[i]) * 0.5;
    } else trend = Math.sign(c - e50[i]) * 0.5 || 0;

    // Momentum
    const h = hist[i], h1 = hist[i - 1];
    const mom = !Number.isFinite(h) ? 0 : h > 0 ? (h > h1 ? 1 : 0.5) : (h < h1 ? -1 : -0.5);

    // RSI (haddan tashqari zonalarda ishonch kamayadi)
    const r = rsi[i];
    let rs = 0;
    if (Number.isFinite(r)) {
      if (r >= 75) rs = 0.2; else if (r <= 25) rs = -0.2;
      else if (r > 52) rs = clamp((r - 50) / 20, 0, 1);
      else if (r < 48) rs = -clamp((50 - r) / 20, 0, 1);
    }

    // EMA20 qiyaligi (ATR birligida)
    const slope = Number.isFinite(e20[i - 5]) && atr[i] > 0 ? clamp((e20[i] - e20[i - 5]) / atr[i], -1, 1) : 0;

    const score = Math.round(100 * (0.4 * trend + 0.3 * mom + 0.2 * rs + 0.1 * slope));
    const dir = score >= 20 ? 1 : score <= -20 ? -1 : 0;
    const a = atr[i];

    let lv = null;
    if (dir !== 0 && a > 0) {
      const zoneNear = c;
      const zoneFar = dir === 1 ? Math.max(c - 0.6 * a, Math.min(e20[i], c)) : Math.min(c + 0.6 * a, Math.max(e20[i], c));
      const entry = (zoneNear + zoneFar) / 2;
      const swing = dir === 1 ? lo20[i] - 0.5 * a : hi20[i] + 0.5 * a;
      const minStop = dir === 1 ? zoneFar - 0.8 * a : zoneFar + 0.8 * a;
      const sl = dir === 1 ? Math.min(swing, minStop) : Math.max(swing, minStop);
      const risk = Math.abs(entry - sl);
      lv = {
        zoneLo: Math.min(zoneNear, zoneFar), zoneHi: Math.max(zoneNear, zoneFar),
        entry, sl, tp1: entry + dir * risk, tp2: entry + dir * 2 * risk,
      };
    }

    return {
      score, dir, lv, atr: a,
      parts: { trend, mom, rsi: r, slope },
      text: `${score > 0 ? "+" : ""}${score} · RSI ${Number.isFinite(r) ? r.toFixed(0) : "—"} · MACD ${h > 0 ? "▲" : "▼"}`,
    };
  }
  window.trederPulse = pulse;

  // ===========================================================================
  // 2. KONSENSUS
  // ===========================================================================
  function consensus(bars, mtf) {
    const L = bars.length - 1;
    const atr = last(S.atr(bars, 14));
    const sp = S.compute(bars, SP_CFG);
    const al = A26(bars, A26_CFG);
    const pu = pulse(bars);

    // SPECTRA: ochiq bitim yoʻnalishi (yangi boʻlsa kuchliroq), boʻlmasa Supertrend yoʻnalishi
    const spPos = sp.dash.pos;
    const lastTrade = sp.trades[sp.trades.length - 1];
    const fresh = spPos && lastTrade && L - lastTrade.openBar <= 10;
    const vSp = spPos ? spPos.dir * (fresh ? 1 : 0.7) : sp.dash.dir * 0.4;
    const spText = spPos
      ? `${spPos.dir === 1 ? "LONG" : "SHORT"}${spPos.strong ? "+" : ""} ochiq (${spPos.u >= 0 ? "+" : ""}${spPos.u.toFixed(2)}R)`
      : `Bitim yoʻq · trend ${sp.dash.dir === 1 ? "▲" : "▼"}`;

    // Matematik 2.6: faqat faol signal ovoz beradi
    const vAl = !al.valid ? 0 : al.buyActive ? 1 : al.sellActive ? -1 : 0;

    // MTF: joriy oraliqdan katta oraliqlardagi SPECTRA trendi
    const mtfVals = (mtf || []).filter((m) => m && (m.dir === 1 || m.dir === -1));
    const vMtf = mtfVals.length ? mtfVals.reduce((s, m) => s + m.dir, 0) / mtfVals.length : 0;

    const votes = [
      { key: "spectra", name: "SPECTRA Clone", v: vSp, text: spText },
      { key: "algo", name: "Matematik 2.6", v: vAl, text: al.valid ? al.status : "Toʻlqin kutilmoqda" },
      { key: "pulse", name: "Treder Pulse", v: pu.score / 100, text: pu.text },
      { key: "mtf", name: "Katta oraliqlar", v: vMtf, text: mtfVals.length ? mtfVals.map((m) => `${m.label} ${m.dir === 1 ? "▲" : "▼"}`).join(" · ") : "—" },
    ];
    const score = Math.round(100 * votes.reduce((s, v) => s + WEIGHTS[v.key] * v.v, 0));
    const action = score >= 35 ? "BUY" : score <= -35 ? "SELL" : "KUTISH";
    const dir = action === "BUY" ? 1 : action === "SELL" ? -1 : 0;
    const strength = Math.abs(score) >= 65 ? "Kuchli" : Math.abs(score) >= 35 ? "Oʻrtacha" : "Zaif";

    // Darajalar: yoʻnalishga mos keluvchi eng aniq manba
    let lv = null, source = "", pending = 0;
    let zoneBroken = false;
    if (dir === 0 && al.valid) {
      // Kelishuv yoʻq: Matematik 2.6 kutilayotgan zonasi — limit buyurtma rejasi.
      // Narx zonani allaqachon oʻtib ketgan boʻlsa, reja eskirgan.
      const span = al.off * (A26_CFG.zone / 100);
      const side = al.buySide ? 1 : -1;
      const c = bars[L].close;
      const zLo = al.zonePrice - span, zHi = al.zonePrice + span;
      const valid = side === 1 ? c > zLo && c > al.sl : c < zHi && c < al.sl;
      if (valid) {
        pending = side;
        lv = { zoneLo: zLo, zoneHi: zHi, entry: al.entry, sl: al.sl, tp1: al.tp1, tp2: al.tp2 };
        source = `Limit reja: Matematik 2.6 ${side === 1 ? "BUY" : "SELL"} zonasi — narx shu zonaga kelsa`;
      } else zoneBroken = true;
    }
    if (dir !== 0) {
      if (al.valid && ((dir === 1 && al.buyActive) || (dir === -1 && al.sellActive))) {
        const span = al.off * (A26_CFG.zone / 100);
        lv = { zoneLo: al.zonePrice - span, zoneHi: al.zonePrice + span, entry: al.entry, sl: al.sl, tp1: al.tp1, tp2: al.tp2 };
        source = "Matematik 2.6 reaksiya zonasi";
      } else if (spPos && spPos.dir === dir) {
        lv = { zoneLo: spPos.entry - 0.25 * atr, zoneHi: spPos.entry + 0.25 * atr, entry: spPos.entry, sl: spPos.sl, tp1: spPos.tp1, tp2: spPos.tp2 };
        source = "SPECTRA ochiq bitimi";
      } else if (pu.lv && pu.dir === dir) {
        lv = pu.lv;
        source = "Treder Pulse (ATR va swing)";
      } else if (pu.atr > 0) {
        // Pulse neytral boʻlsa ham yoʻnalish boʻyicha ATR darajalari
        const c = bars[L].close, a = pu.atr;
        const entry = c - dir * 0.3 * a;
        const sl = entry - dir * 1.5 * a;
        lv = { zoneLo: Math.min(c, c - dir * 0.6 * a), zoneHi: Math.max(c, c - dir * 0.6 * a), entry, sl, tp1: entry + dir * 1.5 * a, tp2: entry + dir * 3 * a };
        source = "ATR asosida";
      }
    }

    return {
      action, dir, score, strength, lv, source, pending, zoneBroken, votes, al, sp, pu,
      price: bars[L].close,
      waitZones: al.valid ? { buy: al.buyT, sell: al.sellT } : null,
    };
  }
  window.trederConsensus = consensus;

  // ===========================================================================
  // 3. SAHIFA: tanlangan aktiv
  // ===========================================================================
  const chartEl = $("sgChart");
  const overlay = $("sgOverlay");
  if (!chartEl || !window.LightweightCharts) return;

  let bars = [];
  let res = null;
  let mtfCache = { key: "", data: [] };
  let decimals = 2;
  let feed = null;
  let levels = null;
  let priceLines = [];

  const { chart, prepare, onRedraw } = M.makeChart(chartEl, overlay, { futureBars: 20 });
  const series = chart.addCandlestickSeries({
    upColor: COL.buy, downColor: COL.sell, borderVisible: false, wickUpColor: COL.buy, wickDownColor: COL.sell,
    autoscaleInfoProvider: (orig) => {
      const r = orig();
      if (!r || !levels) return r;
      return { ...r, priceRange: { minValue: Math.min(r.priceRange.minValue, ...levels), maxValue: Math.max(r.priceRange.maxValue, ...levels) } };
    },
  });
  const fmt = (v) => M.fmtNum(v, decimals);

  function draw() {
    const { ctx, paneW, paneH, X, Y } = prepare(series);
    if (!res || !res.lv) return;
    const n = bars.length - 1, r = n + 20;
    const lv = res.lv;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, paneW, paneH);
    ctx.clip();
    const box = (p1, p2, color, i1 = n, i2 = r) => {
      const x1 = X(i1), x2 = X(i2), y1 = Y(p1), y2 = Y(p2);
      if ([x1, x2, y1, y2].some((v) => v === null)) return;
      ctx.fillStyle = color;
      ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.max(Math.abs(y2 - y1), 2));
    };
    const line = (p, color, w, dash) => {
      const x1 = X(n), x2 = X(r), y = Y(p);
      if ([x1, x2, y].some((v) => v === null)) return;
      ctx.strokeStyle = color; ctx.lineWidth = w; ctx.setLineDash(dash || []);
      ctx.beginPath(); ctx.moveTo(x1, Math.round(y) + 0.5); ctx.lineTo(x2, Math.round(y) + 0.5); ctx.stroke();
      ctx.setLineDash([]);
    };
    box(lv.entry, lv.tp2, M.alpha(COL.buy, 0.12));
    box(lv.entry, lv.sl, M.alpha(COL.sell, 0.14));
    box(lv.zoneLo, lv.zoneHi, M.alpha(COL.gold, 0.28), n - 12, r);
    line(lv.entry, COL.gold, 2);
    line(lv.tp1, COL.buy, 1, [5, 4]);
    line(lv.tp2, COL.buy, 2);
    line(lv.sl, COL.sell, 2);
    ctx.restore();
  }
  const scheduleDraw = onRedraw(draw);

  async function loadMtf() {
    const key = cfg.symbol + "|" + cfg.tf;
    const cur = (M.TFS.find((t) => t.id === cfg.tf) || {}).sec || 0;
    const tfs = MTF_TFS.filter((t) => t.sec > cur);
    const data = await Promise.all(tfs.map(async (t) => {
      try { return { ...S.mtfPack(await M.fetchKlines(cfg.symbol, t.id, 500), SP_CFG), label: t.label }; }
      catch { return null; }
    }));
    if (key !== cfg.symbol + "|" + cfg.tf) return;
    mtfCache = { key, data };
    recompute();
  }

  function recompute() {
    if (bars.length < 60) return;
    res = consensus(bars, mtfCache.key === cfg.symbol + "|" + cfg.tf ? mtfCache.data : []);
    priceLines.forEach((p) => series.removePriceLine(p));
    priceLines = [];
    if (res.lv) {
      const lv = res.lv;
      levels = [lv.entry, lv.sl, lv.tp1, lv.tp2, lv.zoneLo, lv.zoneHi];
      const add = (price, color, title) => priceLines.push(series.createPriceLine({ price, color, title, lineVisible: false, axisLabelVisible: true }));
      add(lv.entry, COL.gold, "KIRISH");
      add(lv.tp1, COL.buy, "TP1");
      add(lv.tp2, COL.buy, "TP2");
      add(lv.sl, COL.sell, "SL");
    } else levels = null;
    render();
    scheduleDraw();
  }

  function render() {
    const r = res;
    const card = $("sgAction");
    card.className = "action-card " + (r.dir === 1 ? "is-buy" : r.dir === -1 ? "is-sell" : "is-wait");
    $("sgActionText").textContent = r.action === "KUTISH" ? "KUTISH" : r.action;
    $("sgActionSub").textContent = r.action === "KUTISH"
      ? (r.pending ? `Indikatorlar kelishmagan · limit ${r.pending === 1 ? "BUY" : "SELL"} rejasi pastda` : "Indikatorlar kelishmagan — yaxshiroq nuqtani kuting")
      : `${r.strength} signal · ${r.action === "BUY" ? "sotib olish" : "sotish"}`;
    $("sgScore").textContent = (r.score > 0 ? "+" : "") + r.score;
    $("sgMeterFill").style.background = r.dir === 1 ? COL.buy : r.dir === -1 ? COL.sell : COL.wait;
    $("sgMeterFill").style.marginLeft = r.score >= 0 ? "50%" : (50 - Math.abs(r.score) / 2) + "%";
    $("sgMeterFill").style.width = Math.abs(r.score) / 2 + "%";
    $("sgPrice").textContent = fmt(r.price);

    const lv = r.lv;
    $("sgZone").textContent = lv ? `${fmt(lv.zoneLo)} – ${fmt(lv.zoneHi)}` : "—";
    $("sgEntry").textContent = lv ? fmt(lv.entry) : "—";
    $("sgSl").textContent = lv ? fmt(lv.sl) : "—";
    $("sgTp1").textContent = lv ? fmt(lv.tp1) : "—";
    $("sgTp2").textContent = lv ? fmt(lv.tp2) : "—";
    const risk = lv ? Math.abs(lv.entry - lv.sl) : 0;
    $("sgRr").textContent = lv && risk > 0 ? `1 : ${(Math.abs(lv.tp2 - lv.entry) / risk).toFixed(2)}` : "—";
    $("sgRiskPct").textContent = lv ? (risk / lv.entry * 100).toFixed(2) + "%" : "—";
    $("sgSource").textContent = lv ? (r.pending ? r.source : "Darajalar manbai: " + r.source)
      : r.zoneBroken ? "Kutilgan zona narx tomonidan buzildi — yangi toʻlqin shakllanishini kuting."
        : "Hozircha aniq daraja yoʻq — toʻlqin shakllanishini kuting.";

    const box = $("sgVotes");
    box.innerHTML = "";
    r.votes.forEach((v) => {
      const d = v.v > 0.15 ? 1 : v.v < -0.15 ? -1 : 0;
      const el = document.createElement("div");
      el.className = "vote";
      el.innerHTML = `<div class="vote-top"><b></b><span class="pill"></span></div><div class="vote-bar"><i></i></div><small></small>`;
      el.querySelector("b").textContent = v.name;
      const pill = el.querySelector(".pill");
      pill.textContent = d === 1 ? "BUY" : d === -1 ? "SELL" : "Neytral";
      pill.className = "pill " + (d === 1 ? "pill-buy" : d === -1 ? "pill-sell" : "");
      const bar = el.querySelector(".vote-bar i");
      bar.style.width = Math.abs(v.v) * 50 + "%";
      bar.style.left = v.v >= 0 ? "50%" : 50 - Math.abs(v.v) * 50 + "%";
      bar.style.background = d === 1 ? COL.buy : d === -1 ? COL.sell : COL.wait;
      el.querySelector("small").textContent = `${v.text} · ogʻirlik ${Math.round(WEIGHTS[v.key] * 100)}%`;
      box.appendChild(el);
    });
  }

  function setConn(text, cls) {
    const el = $("sgConn");
    el.textContent = text;
    el.className = "conn" + (cls ? " " + cls : "");
  }
  function showMsg(text) {
    const el = $("sgMsg");
    el.hidden = !text;
    el.textContent = text || "";
  }

  let tick = null;
  function loadSymbol() {
    if (feed) feed.stop();
    const a = M.ASSETS.find((x) => x.id === cfg.symbol) || M.ASSETS[0];
    $("sgTitle").textContent = a.title;
    $("sgSub").textContent = a.sub;
    showMsg("Narxlar yuklanmoqda…");
    feed = M.createFeed({
      symbol: cfg.symbol, tf: cfg.tf, limit: 1000,
      onConn: setConn, onError: showMsg,
      onLoad: (data) => {
        bars = data;
        decimals = M.decimalsFor(last(bars).close);
        series.applyOptions({ priceFormat: { type: "price", precision: decimals, minMove: 1 / 10 ** decimals } });
        series.setData(bars);
        chart.timeScale().setVisibleLogicalRange({ from: bars.length - 120, to: bars.length + 20 });
        showMsg("");
        recompute();
      },
      onTick: (bar) => {
        if (!M.upsertBar(bars, bar, 1000)) return;
        series.update(bar);
        if (!tick) tick = setTimeout(() => { tick = null; recompute(); }, 500);
      },
    });
    loadMtf();
  }
  setInterval(loadMtf, 120000);

  const row = window.trederButtonRow;
  function renderControls() {
    row($("sgSymbols"), M.ASSETS, cfg.symbol, "chip", (id) => { cfg.symbol = id; save(); renderControls(); loadSymbol(); });
    row($("sgIntervals"), M.TFS, cfg.tf, "seg-btn", (id) => { cfg.tf = id; save(); renderControls(); loadSymbol(); scan(); });
  }

  // ===========================================================================
  // 4. SKANER: barcha aktivlar, eng kuchli signal yuqorida
  // ===========================================================================
  let scanning = false;
  async function scan() {
    if (scanning) return;
    scanning = true;
    const tf = cfg.tf;
    const cur = (M.TFS.find((t) => t.id === tf) || {}).sec || 0;
    const tfs = MTF_TFS.filter((t) => t.sec > cur).slice(0, 2);
    const rows = await Promise.all(M.ASSETS.map(async (a) => {
      try {
        const [b, ...htf] = await Promise.all([
          M.fetchKlines(a.id, tf, 1000),
          ...tfs.map((t) => M.fetchKlines(a.id, t.id, 500).then((x) => ({ ...S.mtfPack(x, SP_CFG), label: t.label })).catch(() => null)),
        ]);
        return { a, r: consensus(b, htf), d: M.decimalsFor(last(b).close) };
      } catch { return { a, r: null }; }
    }));
    scanning = false;
    if (tf !== cfg.tf) return;
    rows.sort((x, y) => (y.r ? Math.abs(y.r.score) : -1) - (x.r ? Math.abs(x.r.score) : -1));
    const body = $("sgScanBody");
    body.innerHTML = "";
    rows.forEach(({ a, r, d }) => {
      const tr = document.createElement("tr");
      tr.innerHTML = "<td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>";
      const td = tr.children;
      td[0].textContent = a.title;
      if (!r) { td[1].textContent = "maʼlumot yoʻq"; body.appendChild(tr); return; }
      const f = (v) => M.fmtNum(v, d);
      td[1].innerHTML = `<span class="pill ${r.dir === 1 ? "pill-buy" : r.dir === -1 ? "pill-sell" : ""}"></span>`;
      td[1].firstChild.textContent = r.action + (r.pending ? (r.pending === 1 ? " · limit BUY" : " · limit SELL") : "");
      td[2].textContent = (r.score > 0 ? "+" : "") + r.score;
      td[2].className = r.dir === 1 ? "up" : r.dir === -1 ? "down" : "";
      td[3].textContent = f(r.price);
      td[4].textContent = r.lv ? `${f(r.lv.zoneLo)} – ${f(r.lv.zoneHi)}` : "—";
      td[5].textContent = r.lv ? f(r.lv.sl) : "—";
      td[5].className = "down";
      td[6].textContent = r.lv ? f(r.lv.tp1) : "—";
      td[6].className = "up";
      td[7].textContent = r.lv ? f(r.lv.tp2) : "—";
      td[7].className = "up";
      tr.tabIndex = 0;
      tr.className = "clickable";
      tr.onclick = () => { cfg.symbol = a.id; save(); renderControls(); loadSymbol(); $("signal").scrollIntoView({ behavior: "smooth" }); };
      body.appendChild(tr);
    });
    $("sgScanTime").textContent = "Yangilandi: " + new Date().toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" });
  }
  setInterval(scan, 90000);

  document.addEventListener("treder:pick", (e) => {
    cfg.symbol = e.detail; save(); renderControls(); loadSymbol();
    $("signal").scrollIntoView({ behavior: "smooth" });
  });

  renderControls();
  loadSymbol();
  scan();
})();
