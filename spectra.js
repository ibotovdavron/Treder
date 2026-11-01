// SPECTRA Clone [Treyding] v2.0 — Pine Script indikatorining JavaScript talqini.
// Manba: downloads/SPECTRA_Clone.pine (Pine v6). Pine'dagi `na` bu yerda NaN:
// arifmetikada tarqaladi, taqqoslashda false beradi — xuddi Pine kabi.
// Dvigatel: Kalman(HL2) + Kalman(ATR) → Supertrend; signal = Supertrend burilishi
// + narx Smart Trail ortida + RSI tasdigʻi + cooldown.

(() => {
  "use strict";

  const M = window.TrederMarket;
  const $ = (id) => document.getElementById(id);
  const STORE_KEY = "treder:spectra";

  const DEFAULTS = {
    symbol: "PAXGUSDT", tf: "5m",
    sens: 1.5, noiseLen: 9, smoothing: 0.7, trailSens: 2.1, rsiLen: 9,
    useRsi: true, useVol: true, volLen: 20, cooldown: 5, earlyExit: false,
    useTP1: true, useTP2: true, slLook: 10, slBuf: 1.0,
    showTZ: true, showTrail: true, showCloud: false, showRZ: false, colorBars: true,
    maxTrk: 500, costPx: 0,
  };

  const C = {
    bull: "#00E676", bear: "#FF1744", warn: "#FFD600", neut: "#787B86",
    tp: "#00E676", sl: "#FF1744", ent: "#FFA000",
    cBull: "#2196F3", cBear: "#FF1744", cNeut: "#787B86",
    cloud: "#2962FF", ob: "#FF1744", os: "#2196F3",
  };

  const OUT_TP1 = 1, OUT_TP2 = 2, OUT_TP12 = 3, OUT_TP1SL = 4, OUT_SL = 5, OUT_EARLY = 6;

  const cfg = (() => {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE_KEY) || "{}") }; }
    catch { return { ...DEFAULTS }; }
  })();
  const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(cfg)); } catch {} };

  // ===========================================================================
  // 1. PINE "ta.*" FUNKSIYALARI (massivlar ustida, NaN = na)
  // ===========================================================================
  const nz = (v) => (Number.isNaN(v) || v === undefined ? 0 : v);
  const at = (a, i) => (i >= 0 ? a[i] : NaN);

  function sma(src, len) {
    const out = new Array(src.length).fill(NaN);
    for (let i = len - 1; i < src.length; i++) {
      let s = 0;
      for (let k = i - len + 1; k <= i; k++) s += src[k];
      out[i] = s / len; // NaN boʻlsa NaN qoladi
    }
    return out;
  }
  // Pine: sum := na(sum[1]) ? ta.sma(src, len) : alpha*src + (1-alpha)*nz(sum[1])
  function emaLike(src, len, alpha) {
    const s = sma(src, len);
    const out = new Array(src.length).fill(NaN);
    let prev = NaN;
    for (let i = 0; i < src.length; i++) {
      out[i] = Number.isNaN(prev) ? s[i] : alpha * src[i] + (1 - alpha) * nz(prev);
      prev = out[i];
    }
    return out;
  }
  const ema = (src, len) => emaLike(src, len, 2 / (len + 1));
  const rma = (src, len) => emaLike(src, len, 1 / len);

  function trueRange(bars, handleNa) {
    return bars.map((b, i) => {
      if (i === 0) return handleNa ? b.high - b.low : NaN;
      const c1 = bars[i - 1].close;
      return Math.max(b.high - b.low, Math.abs(b.high - c1), Math.abs(b.low - c1));
    });
  }
  const atr = (bars, len) => rma(trueRange(bars, true), len);

  function rsi(src, len) {
    const ch = src.map((v, i) => v - at(src, i - 1));
    const up = rma(ch.map((v) => Math.max(v, 0)), len);
    const dn = rma(ch.map((v) => -Math.min(v, 0)), len);
    return up.map((u, i) => (dn[i] === 0 ? 100 : u === 0 ? 0 : 100 - 100 / (1 + u / dn[i])));
  }

  function lowest(src, len) {
    return src.map((_, i) => {
      if (i < len - 1) return NaN;
      let m = Infinity;
      for (let k = i - len + 1; k <= i; k++) m = Math.min(m, src[k]);
      return m;
    });
  }
  function highest(src, len) {
    return src.map((_, i) => {
      if (i < len - 1) return NaN;
      let m = -Infinity;
      for (let k = i - len + 1; k <= i; k++) m = Math.max(m, src[k]);
      return m;
    });
  }

  function fixnan(a) {
    let last = NaN;
    return a.map((v) => (Number.isNaN(v) ? last : (last = v)));
  }

  // ta.dmi(14, 14) → ADX
  function adx(bars, len, adxLen) {
    const plusDM = bars.map((b, i) => {
      if (i === 0) return NaN;
      const up = b.high - bars[i - 1].high, down = bars[i - 1].low - b.low;
      return up > down && up > 0 ? up : 0;
    });
    const minusDM = bars.map((b, i) => {
      if (i === 0) return NaN;
      const up = b.high - bars[i - 1].high, down = bars[i - 1].low - b.low;
      return down > up && down > 0 ? down : 0;
    });
    const trur = rma(trueRange(bars, false), len);
    const plus = fixnan(rma(plusDM, len).map((v, i) => 100 * v / trur[i]));
    const minus = fixnan(rma(minusDM, len).map((v, i) => 100 * v / trur[i]));
    const dx = plus.map((p, i) => {
      const s = p + minus[i];
      return Math.abs(p - minus[i]) / (s === 0 ? 1 : s);
    });
    return rma(dx, adxLen).map((v) => 100 * v);
  }

  // ===========================================================================
  // 2. YADRO: Kalman filtri va Supertrend
  // ===========================================================================
  function kalman(src, len, tr) {
    const d = src.map((v, i) => nz(v - at(src, i - 1)));
    const varM = ema(d.map((v) => v * v), len * 2);
    const drift = ema(d, len);
    const out = new Array(src.length).fill(NaN);
    let x = NaN, p = 1.0;
    for (let i = 0; i < src.length; i++) {
      const q = drift[i] * drift[i] + nz(varM[i]) * 0.01;
      const r = nz(varM[i]) * (1.0 - tr) / Math.max(tr, 0.01);
      if (Number.isNaN(x)) {
        x = src[i];
        p = r;
      } else if (!Number.isNaN(src[i])) {
        const pp = p + q;
        const k = pp + r > 0 ? pp / (pp + r) : 1.0;
        x = x + k * (src[i] - x);
        p = (1.0 - k) * pp;
      }
      out[i] = x;
    }
    return out;
  }

  function stCore(bars, mult, len, tr) {
    const kSrc = kalman(bars.map((b) => (b.high + b.low) / 2), len, tr);
    const kAtr = kalman(atr(bars, len), len, tr);
    const n = bars.length;
    const upB = new Array(n), dnB = new Array(n), dir = new Array(n);
    let pU = NaN, pD = NaN, dr = 1;
    for (let i = 0; i < n; i++) {
      const up = kSrc[i] - mult * kAtr[i];
      const dn = kSrc[i] + mult * kAtr[i];
      const c1 = i > 0 ? bars[i - 1].close : NaN;
      const u = Number.isNaN(pU) ? up : c1 > pU ? Math.max(up, pU) : up;
      const dd = Number.isNaN(pD) ? dn : c1 < pD ? Math.min(dn, pD) : dn;
      if (!Number.isNaN(pU) && !Number.isNaN(pD)) {
        if (dr === -1 && bars[i].close > pD) dr = 1;
        else if (dr === 1 && bars[i].close < pU) dr = -1;
      }
      upB[i] = u; dnB[i] = dd; dir[i] = dr;
      pU = u; pD = dd;
    }
    return { kSrc, kAtr, upB, dnB, dir };
  }

  function ctxCore(bars) {
    const close = bars.map((b) => b.close);
    const e = ema(close, 21);
    const a = atr(bars, 14);
    const slope = e.map((v, i) => (a[i] > 0 ? (v - at(e, i - 5)) / a[i] : 0.0));
    return { slope, adx: adx(bars, 14, 14) };
  }

  // ===========================================================================
  // 3. ASOSIY HISOB: signallar va savdo mexanizmi
  // ===========================================================================
  function compute(bars, p) {
    const n = bars.length;
    const trust = Math.min(0.95, Math.max(0.01, 0.32 * p.smoothing));
    const tpMode = p.useTP1 && p.useTP2 ? "Split" : p.useTP1 ? "TP1" : "TP2";

    const close = bars.map((b) => b.close);
    const vol = bars.map((b) => b.volume);
    const st = stCore(bars, p.sens, p.noiseLen, trust);
    const ctx = ctxCore(bars);
    const atrR = atr(bars, p.noiseLen);
    const rsiV = rsi(close, p.rsiLen);
    const volMa = sma(vol, p.volLen);
    const swLo = lowest(bars.map((b) => b.low), p.slLook);
    const swHi = highest(bars.map((b) => b.high), p.slLook);
    const volSma50 = sma(vol, 50);
    const vwma = sma(close.map((c, i) => c * vol[i]), 50).map((v, i) => v / volSma50[i]);
    const atr50 = atr(bars, 50);
    const atrP = atrR.map((a, i) => (close[i] > 0 ? a / close[i] * 100 : NaN));
    const atrPm = sma(atrP, 100);

    const trail = new Array(n).fill(NaN);
    const trades = [];
    const markers = [];
    const candle = new Array(n);
    const hist = []; // {pnl, r, strong, dir, out}

    let tr = NaN;
    let lastSigBar = -100000;
    let pos = null;

    const record = (ps, r, out) => {
      hist.push({ pnl: r * ps.risk, r, strong: ps.strong, dir: ps.dir, out });
      while (hist.length > p.maxTrk) hist.shift();
      ps.out = out;
    };

    for (let i = 0; i < n; i++) {
      const b = bars[i];
      const c = b.close, c1 = i > 0 ? close[i - 1] : NaN;

      // Smart Trail
      const tm = p.trailSens * atrR[i];
      const pt = tr;
      if (!Number.isNaN(tm)) {
        if (Number.isNaN(pt)) tr = c - tm;
        else if (c > pt && c1 > pt) tr = Math.max(pt, c - tm);
        else if (c < pt && c1 < pt) tr = Math.min(pt, c + tm);
        else if (c > pt) tr = c - tm;
        else tr = c + tm;
      }
      trail[i] = tr;

      const dir = st.dir[i], dir1 = i > 0 ? st.dir[i - 1] : NaN;
      const stFlipUp = dir === 1 && dir1 === -1;
      const stFlipDn = dir === -1 && dir1 === 1;
      const rsiLong = !p.useRsi || (rsiV[i] > 50 && rsiV[i] > at(rsiV, i - 1));
      const rsiShort = !p.useRsi || (rsiV[i] < 50 && rsiV[i] < at(rsiV, i - 1));
      const trailL = !Number.isNaN(tr) && c > tr;
      const trailS = !Number.isNaN(tr) && c < tr;
      const volStrong = p.useVol && !Number.isNaN(vol[i]) && !Number.isNaN(volMa[i]) && vol[i] > volMa[i];

      const ready = b.closed && !Number.isNaN(atrR[i]) && atrR[i] > 0 && !Number.isNaN(st.upB[i]);
      const cdOk = i - lastSigBar >= p.cooldown;
      const candL = ready && stFlipUp && trailL && rsiLong && cdOk;
      const candS = ready && stFlipDn && trailS && rsiShort && cdOk;

      candle[i] = dir === 1 && trailL ? C.cBull : dir === -1 && trailS ? C.cBear : C.cNeut;

      const ev = (shape, position, color, text) => markers.push({ time: b.time, shape, position, color, text, size: 0.6 });

      // 1) ochiq bitimni yuritish (kirishdan keyingi shamdan; bir shamda SL ustun)
      if (ready && pos && i > pos.openBar) {
        const d = pos.dir;
        const cR = p.costPx / pos.risk;
        const hitSL = d === 1 ? b.low <= pos.sl : b.high >= pos.sl;
        const hit1 = d === 1 ? b.high >= pos.tp1 : b.low <= pos.tp1;
        const hit2 = d === 1 ? b.high >= pos.tp2 : b.low <= pos.tp2;
        const split = tpMode === "Split";
        if (hitSL) {
          const out = split && pos.stage === 1 ? OUT_TP1SL : OUT_SL;
          record(pos, (out === OUT_TP1SL ? 0.0 : -1.0) - cR, out);
          pos.right = i;
          ev("circle", d === 1 ? "belowBar" : "aboveBar", C.sl, "SL");
          pos = null;
        } else {
          if (hit1 && pos.stage === 0) {
            pos.stage = 1;
            ev("circle", d === 1 ? "aboveBar" : "belowBar", C.tp, "TP1");
            if (tpMode === "TP1") {
              record(pos, 1.0 - cR, OUT_TP1);
              pos.right = i;
              pos = null;
            }
          }
          if (pos && hit2 && tpMode !== "TP1") {
            record(pos, (split ? 1.5 : 2.0) - cR, split ? OUT_TP12 : OUT_TP2);
            pos.right = i;
            ev("circle", d === 1 ? "aboveBar" : "belowBar", C.tp, "TP2");
            pos = null;
          }
        }
      }

      // 2) signallar: bitim ochiq boʻlsa bostiriladi (Exit +/BE bundan mustasno)
      let sigLong = false, sigShort = false;
      if (candL || candS) {
        const nd = candL ? 1 : -1;
        let take = !pos;
        if (pos && p.earlyExit) {
          const atBE = pos.dir === 1 ? c >= pos.entry : c <= pos.entry;
          if (atBE) {
            const u = (c - pos.entry) * pos.dir / pos.risk;
            const r = (tpMode === "Split" && pos.stage === 1 ? 0.5 + 0.5 * u : u) - p.costPx / pos.risk;
            record(pos, r, OUT_EARLY);
            pos.right = i;
            ev("square", pos.dir === 1 ? "aboveBar" : "belowBar", C.warn, "Exit");
            pos = null;
            take = true;
          }
        }
        if (take) {
          const raw = nd === 1 ? c - (swLo[i] - p.slBuf * atrR[i]) : (swHi[i] + p.slBuf * atrR[i]) - c;
          const risk = Math.max(raw, 0.1 * atrR[i]);
          pos = {
            dir: nd, strong: volStrong, entry: c,
            sl: c - nd * risk, tp1: c + nd * risk, tp2: c + nd * risk * 2.0,
            risk, openBar: i, stage: 0, right: i + 1, out: 0, tpMode,
          };
          trades.push(pos);
          lastSigBar = i;
          sigLong = nd === 1;
          sigShort = nd === -1;
        }
      }

      // 3) ochiq bitim zonasi narx bilan oʻsadi
      if (pos) pos.right = i + 1;

      if (sigLong) markers.push({ time: b.time, position: "belowBar", color: C.bull, shape: "arrowUp", text: volStrong ? "BUY+" : "BUY", size: volStrong ? 1.4 : 0.9 });
      if (sigShort) markers.push({ time: b.time, position: "aboveBar", color: C.bear, shape: "arrowDown", text: volStrong ? "SELL+" : "SELL", size: volStrong ? 1.4 : 0.9 });
    }

    // ---- Dashboard (oxirgi sham) ----
    const L = n - 1;
    const vPct = volMa[L] > 0 ? 100 * (vol[L] - volMa[L]) / volMa[L] : NaN;
    const vr = !(atrPm[L] > 0) ? NaN : atrP[L] / atrPm[L];
    const dash = {
      dir: st.dir[L],
      slope: Math.abs(ctx.slope[L]),
      adx: ctx.adx[L],
      vPct, vr, atrP: atrP[L],
      rsi: rsiV[L],
      pos: pos ? { dir: pos.dir, u: (close[L] - pos.entry) * pos.dir / pos.risk, entry: pos.entry, sl: pos.sl, tp1: pos.tp1, tp2: pos.tp2, stage: pos.stage, strong: pos.strong } : null,
    };

    return {
      tpMode, trail, trades, markers, candle, hist, dash,
      kSrc: st.kSrc, band: st.dir.map((d, i) => (d === 1 ? st.upB[i] : st.dnB[i])),
      zones: { ob1: vwma.map((v, i) => v + 2 * atr50[i]), ob2: vwma.map((v, i) => v + 3 * atr50[i]),
        os1: vwma.map((v, i) => v - 2 * atr50[i]), os2: vwma.map((v, i) => v - 3 * atr50[i]) },
    };
  }

  // MTF uchun: oldingi (yopilgan) shamdagi trend, kuch va ADX — Pine: expr[1] + lookahead_on
  function mtfPack(bars, p) {
    const trust = Math.min(0.95, Math.max(0.01, 0.32 * p.smoothing));
    const st = stCore(bars, p.sens, p.noiseLen, trust);
    const ctx = ctxCore(bars);
    const i = bars.length - 2;
    return { dir: st.dir[i], slope: ctx.slope[i], adx: ctx.adx[i] };
  }

  window.trederSpectra = { compute, mtfPack, kalman, ema, rma, rsi, atr, adx, sma, lowest, highest, DEFAULTS };

  // ===========================================================================
  // 4. GRAFIK
  // ===========================================================================
  const chartEl = $("spChart");
  const overlay = $("spOverlay");
  if (!chartEl || !M || !window.LightweightCharts) return;

  let bars = [];
  let res = null;
  let decimals = 2;
  let feed = null;

  const { chart, prepare, onRedraw } = M.makeChart(chartEl, overlay, { futureBars: 8 });
  const series = chart.addCandlestickSeries({
    upColor: "#16c784", downColor: "#f6465d", borderVisible: false,
    wickUpColor: "#16c784", wickDownColor: "#f6465d",
  });
  const trailSeries = chart.addLineSeries({
    lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
  });

  const fmt = (v) => M.fmtNum(v, decimals);
  const fmtSigned = (v, d = decimals) => (!isFinite(v) ? "—" : (v >= 0 ? "+" : "") + M.fmtNum(v, d));
  const alpha = M.alpha;

  function draw() {
    const { ctx, paneW, paneH, X, Y, range } = prepare(series);
    if (!res || !range) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, paneW, paneH);
    ctx.clip();

    const from = Math.max(0, Math.floor(range.from) - 2);
    const to = Math.min(bars.length - 1, Math.ceil(range.to) + 2);

    // Ikki qator orasini boʻyash (bulut va reversal zonalar)
    const fillBetween = (a, b, color) => {
      let open = false;
      const upper = [];
      const flush = () => {
        if (upper.length > 1) {
          ctx.beginPath();
          upper.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
          for (let k = upper.length - 1; k >= 0; k--) ctx.lineTo(upper[k][0], upper[k][2]);
          ctx.closePath();
          ctx.fillStyle = color;
          ctx.fill();
        }
        upper.length = 0;
      };
      for (let i = from; i <= to; i++) {
        const x = X(i), ya = Y(a[i]), yb = Y(b[i]);
        if (x === null || ya === null || yb === null || !isFinite(a[i]) || !isFinite(b[i])) { if (open) flush(); open = false; continue; }
        upper.push([x, ya, yb]);
        open = true;
      }
      flush();
    };

    if (cfg.showRZ) {
      fillBetween(res.zones.ob1, res.zones.ob2, alpha(C.ob, 0.22));
      fillBetween(res.zones.os1, res.zones.os2, alpha(C.os, 0.22));
    }
    if (cfg.showCloud) {
      const lv = (f) => res.kSrc.map((k, i) => k + (res.band[i] - k) * f);
      const layers = [[0, 0.2, 0.07], [0.2, 0.4, 0.15], [0.4, 0.6, 0.23], [0.6, 0.8, 0.15], [0.8, 1, 0.07]];
      layers.forEach(([f1, f2, a]) => fillBetween(lv(f1), lv(f2), alpha(C.cloud, a)));
    }

    // TP / SL zonalari
    if (cfg.showTZ) {
      ctx.font = "600 10px Inter, system-ui, sans-serif";
      ctx.textBaseline = "middle";
      const box = (i1, i2, p1, p2, color) => {
        const x1 = X(i1), x2 = X(i2), y1 = Y(p1), y2 = Y(p2);
        if ([x1, x2, y1, y2].some((v) => v === null)) return;
        ctx.fillStyle = color;
        ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.max(Math.abs(x2 - x1), 2), Math.max(Math.abs(y2 - y1), 1));
      };
      const line = (i1, i2, pr, color, w) => {
        const x1 = X(i1), x2 = X(i2), y = Y(pr);
        if ([x1, x2, y].some((v) => v === null)) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(x1, Math.round(y) + 0.5);
        ctx.lineTo(x2, Math.round(y) + 0.5);
        ctx.stroke();
      };
      const tag = (i, pr, text, color) => {
        const x = X(i), y = Y(pr);
        if (x === null || y === null) return;
        const w = ctx.measureText(text).width + 8;
        ctx.fillStyle = alpha(color, 0.85);
        ctx.fillRect(x, y - 7, w, 14);
        ctx.fillStyle = "#fff";
        ctx.fillText(text, x + 4, y);
      };
      res.trades.forEach((t) => {
        if (t.right < from || t.openBar > to) return;
        const tpFar = t.tpMode === "TP1" ? t.tp1 : t.tp2;
        box(t.openBar, t.right, t.entry, t.sl, alpha(C.sl, 0.15));
        box(t.openBar, t.right, t.entry, tpFar, alpha(C.tp, 0.12));
        line(t.openBar, t.right, t.entry, C.ent, 1);
        line(t.openBar, t.right, t.sl, C.sl, 2);
        if (t.tpMode !== "TP2") line(t.openBar, t.right, t.tp1, C.tp, 2);
        if (t.tpMode !== "TP1") line(t.openBar, t.right, t.tp2, C.tp, 2);
        if (t.tpMode !== "TP2") tag(t.openBar, t.tp1, "TP1: " + fmt(t.tp1), C.tp);
        if (t.tpMode !== "TP1") tag(t.openBar, t.tp2, "TP2: " + fmt(t.tp2), C.tp);
        tag(t.openBar, t.sl, "SL: " + fmt(t.sl), C.sl);
      });
    }
    ctx.restore();
  }
  const scheduleDraw = onRedraw(draw);

  // ---- Natijalarni chiqarish ----
  function paintSeries() {
    series.setData(bars.map((b, i) => (cfg.colorBars && res
      ? { time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, color: res.candle[i], wickColor: res.candle[i], borderColor: res.candle[i] }
      : { time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })));
    trailSeries.setData(cfg.showTrail && res
      ? bars.map((b, i) => (isFinite(res.trail[i])
        ? { time: b.time, value: res.trail[i], color: b.close > res.trail[i] ? C.bull : C.bear }
        : { time: b.time }))
      : []);
    series.setMarkers(res ? res.markers : []);
  }

  function recompute(repaint = true) {
    if (!bars.length) return;
    res = compute(bars, cfg);
    if (repaint) paintSeries();
    renderPanel();
    renderBacktest();
    scheduleDraw();
  }

  function setKV(id, text, cls) {
    const el = $(id);
    el.textContent = text;
    el.className = cls || "";
  }

  function renderPanel() {
    const d = res.dash;
    const last = bars[bars.length - 1];
    setKV("spPrice", fmt(last.close));
    setKV("spTrend", d.dir === 1 ? "▲ BULLISH" : "▼ BEARISH", d.dir === 1 ? "up" : "down");
    setKV("spStrength", d.slope >= 1 ? "Strong" : d.slope >= 0.4 ? "Moderate" : "Weak", d.slope >= 1 ? "up" : d.slope >= 0.4 ? "gold" : "down");
    setKV("spMarket", !isFinite(d.adx) ? "—" : d.adx > 25 ? "Trending" : "Ranging", !isFinite(d.adx) ? "" : d.adx > 25 ? "up" : "gold");
    setKV("spVola", !isFinite(d.vr) ? "—" : (d.vr > 1.3 ? "High " : d.vr < 0.9 ? "Low " : "Normal ") + d.atrP.toFixed(2) + "%",
      !isFinite(d.vr) ? "" : d.vr > 1.3 ? "down" : d.vr < 0.9 ? "up" : "gold");
    setKV("spVol", !isFinite(d.vPct) ? "n/a" : (d.vPct > 20 ? "High " : d.vPct < -20 ? "Low " : "Neutral ") + (d.vPct >= 0 ? "+" : "") + d.vPct.toFixed(0) + "%",
      !isFinite(d.vPct) ? "" : d.vPct > 20 ? "up" : d.vPct < -20 ? "down" : "");
    setKV("spMom", !isFinite(d.rsi) ? "—" : (d.rsi > 55 ? "Bullish " : d.rsi < 45 ? "Bearish " : "Neutral ") + d.rsi.toFixed(0),
      d.rsi > 55 ? "up" : d.rsi < 45 ? "down" : "");

    const st = $("spStatus");
    const p = d.pos;
    if (p) {
      st.className = "status " + (p.dir === 1 ? "status-buy" : "status-sell");
      $("spStatusText").textContent = (p.dir === 1 ? "LONG" : "SHORT") + (p.strong ? "+" : "") + " ochiq · " + (p.u >= 0 ? "+" : "") + p.u.toFixed(2) + "R";
    } else {
      st.className = "status status-wait";
      $("spStatusText").textContent = "Signal kutilmoqda…";
    }
    setKV("spEntry", p ? fmt(p.entry) : "—", "gold");
    setKV("spSl", p ? fmt(p.sl) : "—", "down");
    setKV("spTp1", p ? fmt(p.tp1) + (p.stage === 1 ? " ✓" : "") : "—", "up");
    setKV("spTp2", p ? fmt(p.tp2) : "—", "up");
  }

  function renderBacktest() {
    const h = res.hist;
    const rows = [
      ["OVERALL", () => true, ""],
      ["▲ Hamma BUY", (t) => t.dir === 1, "up"],
      ["BUY", (t) => t.dir === 1 && !t.strong, "up"],
      ["Strong BUY+", (t) => t.dir === 1 && t.strong, "up"],
      ["▼ Hamma SELL", (t) => t.dir === -1, "down"],
      ["SELL", (t) => t.dir === -1 && !t.strong, "down"],
      ["Strong SELL+", (t) => t.dir === -1 && t.strong, "down"],
    ];
    const tbody = $("spBtBody");
    tbody.innerHTML = "";
    rows.forEach(([name, f, cls], k) => {
      let n = 0, w = 0, l = 0, s = 0, gp = 0, gl = 0;
      h.forEach((t) => {
        if (!f(t)) return;
        n++; s += t.pnl;
        if (t.out === OUT_SL) l++; else w++; // faqat toʻliq stop yoʻqotish hisoblanadi
        if (t.pnl > 0) gp += t.pnl; else gl -= t.pnl;
      });
      const wr = n > 0 ? 100 * w / n : NaN;
      const pf = gl > 0 ? gp / gl : NaN;
      const tr = document.createElement("tr");
      if (k === 0) tr.className = "bt-major";
      tr.innerHTML = `<td class="${cls}"></td><td></td><td></td><td></td><td></td>`;
      const td = tr.children;
      td[0].textContent = name + (k === 0 ? ` (${n})` : "");
      td[1].textContent = `${w} / ${l}`;
      td[2].textContent = isFinite(wr) ? wr.toFixed(1) + "%" : "—";
      td[2].className = !isFinite(wr) ? "" : wr >= 50 ? "gold" : "down";
      td[3].textContent = n ? fmtSigned(s) : "—";
      td[3].className = !n ? "" : s >= 0 ? "up" : "down";
      td[4].textContent = isFinite(pf) ? pf.toFixed(2) : n ? "∞" : "—";
      tbody.appendChild(tr);
    });

    const cnt = {}, pl = {};
    let sumR = 0, sumP = 0;
    h.forEach((t) => { cnt[t.out] = (cnt[t.out] || 0) + 1; pl[t.out] = (pl[t.out] || 0) + t.pnl; sumR += t.r; sumP += t.pnl; });
    const winOut = res.tpMode === "Split" ? OUT_TP12 : res.tpMode === "TP1" ? OUT_TP1 : OUT_TP2;
    const winTxt = res.tpMode === "Split" ? "TP1 + TP2" : res.tpMode;
    const out = [
      ["✅ " + winTxt, winOut, "up"], ["➗ TP1 + SL", OUT_TP1SL, "gold"], ["✖ SL (toʻliq)", OUT_SL, "down"], ["🟦 Exit +/BE", OUT_EARLY, "gold"],
    ];
    $("spOutcomes").innerHTML = "";
    out.forEach(([name, o, cls]) => {
      const div = document.createElement("div");
      div.className = "oc";
      div.innerHTML = `<span></span><b class="${cls}"></b><small></small>`;
      div.children[0].textContent = name;
      div.children[1].textContent = cnt[o] || 0;
      div.children[2].textContent = fmtSigned(pl[o] || 0);
      $("spOutcomes").appendChild(div);
    });
    const modeT = res.tpMode === "Split" ? "½ TP1 + ½ TP2" : res.tpMode === "TP1" ? "Faqat TP1" : "Faqat TP2";
    $("spBtFoot").textContent = `${modeT} · Jami: ${fmtSigned(sumP)} · oʻrtacha ${h.length ? (sumR / h.length >= 0 ? "+" : "") + (sumR / h.length).toFixed(2) : "—"}R/bitim · yuklangan tarixdagi ${h.length} ta yopilgan bitim`;
  }

  // ---- MTF paneli ----
  const MTF = [
    { id: "5m", label: "5m", sec: 300 }, { id: "15m", label: "15m", sec: 900 }, { id: "1h", label: "1H", sec: 3600 },
    { id: "4h", label: "4H", sec: 14400 }, { id: "1d", label: "1D", sec: 86400 }, { id: "1w", label: "1W", sec: 604800 },
  ];
  let mtfToken = 0;
  async function loadMtf() {
    const my = ++mtfToken;
    const curSec = (M.TFS.find((t) => t.id === cfg.tf) || {}).sec || 0;
    const results = await Promise.all(MTF.map(async (t) => {
      if (t.sec < curSec) return { t, ok: false };
      try {
        const b = await M.fetchKlines(cfg.symbol, t.id, 500);
        const r = mtfPack(b, cfg);
        return { t, ok: r.dir === 1 || r.dir === -1, ...r };
      } catch { return { t, ok: false }; }
    }));
    if (my !== mtfToken) return;
    const body = $("spMtfBody");
    body.innerHTML = "";
    let bull = 0, valid = 0;
    results.forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = "<td></td><td></td><td></td><td></td>";
      const td = tr.children;
      td[0].textContent = (r.ok ? "● " : "○ ") + r.t.label;
      td[0].className = r.ok ? (r.dir === 1 ? "up" : "down") : "";
      if (r.ok) {
        valid++;
        if (r.dir === 1) bull++;
        const a = Math.abs(r.slope);
        td[1].textContent = r.dir === 1 ? "▲ Bull" : "▼ Bear";
        td[1].className = r.dir === 1 ? "up" : "down";
        td[2].textContent = a >= 1 ? "Strong" : a >= 0.4 ? "Moderate" : "Weak";
        td[2].className = a >= 1 ? "up" : a >= 0.4 ? "gold" : "down";
        td[3].textContent = isFinite(r.adx) && r.adx > 25 ? "Trend" : "Range";
        td[3].className = isFinite(r.adx) && r.adx > 25 ? "up" : "gold";
      } else {
        td[1].textContent = td[2].textContent = td[3].textContent = "—";
      }
      body.appendChild(tr);
    });
    const bias = $("spBias");
    if (!valid) { bias.textContent = "—"; bias.className = ""; }
    else if (bull * 2 > valid) { bias.textContent = `LONG BIAS ${bull}/${valid}`; bias.className = "up"; }
    else if (bull * 2 < valid) { bias.textContent = `SHORT BIAS ${valid - bull}/${valid}`; bias.className = "down"; }
    else { bias.textContent = "Aniq yoʻnalish yoʻq"; bias.className = "gold"; }
  }
  setInterval(loadMtf, 60000);

  // ===========================================================================
  // 5. MAʼLUMOTLAR VA BOSHQARUV
  // ===========================================================================
  function setConn(text, cls) {
    const el = $("spConn");
    el.textContent = text;
    el.className = "conn" + (cls ? " " + cls : "");
  }
  function showMsg(text) {
    const el = $("spMsg");
    el.hidden = !text;
    el.textContent = text || "";
  }

  let tickTimer = null;
  function loadSymbol() {
    if (feed) feed.stop();
    const a = M.ASSETS.find((x) => x.id === cfg.symbol) || M.ASSETS[0];
    $("spTitle").textContent = a.title;
    $("spSub").textContent = a.sub;
    showMsg("Narxlar yuklanmoqda…");
    feed = M.createFeed({
      symbol: cfg.symbol, tf: cfg.tf, limit: 1000,
      onConn: setConn,
      onError: showMsg,
      onLoad: (data) => {
        bars = data;
        decimals = M.decimalsFor(bars[bars.length - 1].close);
        const pf = { type: "price", precision: decimals, minMove: 1 / 10 ** decimals };
        series.applyOptions({ priceFormat: pf });
        trailSeries.applyOptions({ priceFormat: pf });
        showMsg("");
        recompute();
        chart.timeScale().setVisibleLogicalRange({ from: bars.length - 150, to: bars.length + 8 });
      },
      onTick: (bar) => {
        const wasLen = bars.length;
        if (!M.upsertBar(bars, bar, 1000)) return;
        // Joriy sham: tez yangilash; yangi sham yoki yopilish: toʻliq qayta hisob
        if (!tickTimer) {
          tickTimer = setTimeout(() => { tickTimer = null; recompute(); }, bars.length !== wasLen || bar.closed ? 0 : 400);
        }
      },
    });
    loadMtf();
  }

  const row = window.trederButtonRow;
  function renderControls() {
    row($("spSymbols"), M.ASSETS, cfg.symbol, "chip", (id) => { cfg.symbol = id; save(); renderControls(); loadSymbol(); });
    row($("spIntervals"), M.TFS, cfg.tf, "seg-btn", (id) => { cfg.tf = id; save(); renderControls(); loadSymbol(); });
  }

  // Sozlamalar: data-key atributi orqali
  document.querySelectorAll("#spSettings [data-key]").forEach((el) => {
    const key = el.dataset.key;
    if (el.type === "checkbox") el.checked = !!cfg[key];
    else if (el.tagName === "SELECT") el.value = key === "tpMode" ? (cfg.useTP1 && cfg.useTP2 ? "split" : cfg.useTP1 ? "tp1" : "tp2") : cfg[key];
    else el.value = cfg[key];
    el.addEventListener("change", () => {
      if (el.type === "checkbox") cfg[key] = el.checked;
      else if (key === "tpMode") { cfg.useTP1 = el.value !== "tp2"; cfg.useTP2 = el.value !== "tp1"; }
      else {
        let v = parseFloat(el.value);
        const min = parseFloat(el.min), max = parseFloat(el.max);
        if (!isFinite(v)) v = DEFAULTS[key];
        if (isFinite(min)) v = Math.max(min, v);
        if (isFinite(max)) v = Math.min(max, v);
        if (el.step === "1" || !el.step) v = Math.round(v);
        el.value = v;
        cfg[key] = v;
      }
      save();
      recompute();
      if (["sens", "noiseLen", "smoothing"].includes(key)) loadMtf();
    });
  });

  renderControls();
  loadSymbol();
})();
