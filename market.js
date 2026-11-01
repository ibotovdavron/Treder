// Treder — umumiy bozor maʼlumotlari qatlami (Binance REST + WebSocket)
// algo26.js va spectra.js shu fayldan foydalanadi.

(() => {
  "use strict";

  const API = "https://data-api.binance.vision/api/v3";
  const WS = "wss://data-stream.binance.vision/ws";
  const TZ_OFFSET = 5 * 3600; // Toshkent vaqti (UTC+5)

  const ASSETS = [
    { id: "BTCUSDT", label: "BTC", title: "BTC / USDT", sub: "Bitcoin · Binance" },
    { id: "PAXGUSDT", label: "Oltin", title: "PAXG / USDT", sub: "Oltin tokeni (XAU/USD narxiga bogʻlangan) · Binance" },
    { id: "ETHUSDT", label: "ETH", title: "ETH / USDT", sub: "Ethereum · Binance" },
    { id: "SOLUSDT", label: "SOL", title: "SOL / USDT", sub: "Solana · Binance" },
    { id: "BNBUSDT", label: "BNB", title: "BNB / USDT", sub: "BNB · Binance" },
    { id: "XRPUSDT", label: "XRP", title: "XRP / USDT", sub: "XRP · Binance" },
  ];

  const TFS = [
    { id: "1m", label: "M1", sec: 60 },
    { id: "5m", label: "M5", sec: 300 },
    { id: "15m", label: "M15", sec: 900 },
    { id: "1h", label: "H1", sec: 3600 },
    { id: "4h", label: "H4", sec: 14400 },
    { id: "1d", label: "D1", sec: 86400 },
  ];

  const decimalsFor = (price) => price >= 100 ? 2 : price >= 1 ? 3 : price >= 0.01 ? 5 : 8;

  const toBar = (k) => ({
    time: Math.floor(k[0] / 1000) + TZ_OFFSET,
    open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5],
    closed: k[6] < Date.now(),
  });

  async function fetchKlines(symbol, tf, limit) {
    const res = await fetch(`${API}/klines?symbol=${symbol}&interval=${tf}&limit=${limit}`);
    if (!res.ok) throw new Error("HTTP " + res.status);
    return (await res.json()).map(toBar);
  }

  // Jonli shamlar oqimi: avval tarix, keyin WebSocket (ishlamasa — har 5 soniyada soʻrov).
  function createFeed({ symbol, tf, limit = 500, onLoad, onTick, onConn, onError }) {
    let alive = true;
    let ws = null;
    let pollTimer = null;
    let retryTimer = null;

    const conn = (t, c) => alive && onConn && onConn(t, c);

    function startPolling() {
      if (pollTimer) return;
      pollTimer = setInterval(async () => {
        if (!alive) return;
        try {
          (await fetchKlines(symbol, tf, 2)).forEach((b) => alive && onTick(b));
          conn("Jonli (soʻrov)", "ok");
        } catch { conn("Aloqa yoʻq", "bad"); }
      }, 5000);
    }

    function startWs(attempt) {
      if (!alive) return;
      let opened = false;
      try { ws = new WebSocket(`${WS}/${symbol.toLowerCase()}@kline_${tf}`); }
      catch { startPolling(); return; }
      ws.onopen = () => {
        opened = true;
        conn("Jonli", "ok");
        clearInterval(pollTimer);
        pollTimer = null;
      };
      ws.onmessage = (e) => {
        if (!alive) return;
        const k = JSON.parse(e.data).k;
        if (!k) return;
        onTick({
          time: Math.floor(k.t / 1000) + TZ_OFFSET,
          open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v, closed: !!k.x,
        });
      };
      ws.onclose = () => {
        if (!alive) return;
        startPolling();
        conn(opened ? "Qayta ulanmoqda…" : "Jonli (soʻrov)", opened ? "" : "ok");
        const delay = Math.min(30000, 2000 * 2 ** attempt);
        retryTimer = setTimeout(() => startWs(opened ? 0 : attempt + 1), delay);
      };
    }

    async function load() {
      conn("Ulanmoqda…");
      try {
        const bars = await fetchKlines(symbol, tf, limit);
        if (!alive) return;
        onLoad(bars);
        startWs(0);
      } catch {
        if (!alive) return;
        conn("Aloqa yoʻq", "bad");
        onError && onError("Narxlarni yuklab boʻlmadi. Internet aloqasini tekshiring — 10 soniyadan soʻng qayta urinamiz.");
        retryTimer = setTimeout(load, 10000);
      }
    }

    load();

    return {
      stop() {
        alive = false;
        clearInterval(pollTimer);
        clearTimeout(retryTimer);
        if (ws) { ws.onclose = ws.onmessage = ws.onerror = ws.onopen = null; try { ws.close(); } catch {} }
      },
    };
  }

  // Shamni massivga qoʻshish yoki oxirgisini yangilash. true — oʻzgarish boʻldi.
  function upsertBar(bars, bar, max = 1000) {
    const last = bars[bars.length - 1];
    if (last && bar.time === last.time) { bars[bars.length - 1] = bar; return true; }
    if (!last || bar.time > last.time) {
      if (last) last.closed = true;
      bars.push(bar);
      if (bars.length > max) bars.shift();
      return true;
    }
    return false;
  }

  // Lightweight Charts grafigi + ustki canvas qatlami
  function makeChart(chartEl, overlay, { futureBars = 16 } = {}) {
    const chart = LightweightCharts.createChart(chartEl, {
      autoSize: true,
      layout: { background: { type: "solid", color: "transparent" }, fontFamily: "Inter, system-ui, sans-serif" },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.12 } },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, rightOffset: futureBars + 6 },
      crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    });

    function applyTheme() {
      const dark = (window.trederTheme ? window.trederTheme() : "dark") === "dark";
      chart.applyOptions({
        layout: { textColor: dark ? "#8b93a9" : "#5b647a" },
        grid: {
          vertLines: { color: dark ? "rgba(255,255,255,0.04)" : "rgba(15,23,42,0.05)" },
          horzLines: { color: dark ? "rgba(255,255,255,0.04)" : "rgba(15,23,42,0.05)" },
        },
      });
    }
    applyTheme();
    document.addEventListener("treder:theme", applyTheme);

    // Canvas kontekstini tayyorlab, chizish funksiyasiga beradi
    function prepare(series) {
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
      const ts = chart.timeScale();
      const paneW = w - chart.priceScale("right").width();
      const paneH = h - ts.height();
      return {
        ctx, paneW, paneH,
        X: (i) => ts.logicalToCoordinate(i),
        Y: (p) => series.priceToCoordinate(p),
        range: ts.getVisibleLogicalRange(),
      };
    }

    function onRedraw(fn) {
      let pending = false;
      const schedule = () => {
        if (pending) return;
        pending = true;
        requestAnimationFrame(() => { pending = false; fn(); });
      };
      chart.timeScale().subscribeVisibleLogicalRangeChange(schedule);
      chart.subscribeCrosshairMove(schedule);
      new ResizeObserver(schedule).observe(chartEl);
      document.addEventListener("treder:theme", schedule);
      setInterval(schedule, 1000);
      return schedule;
    }

    return { chart, prepare, onRedraw };
  }

  const alpha = (hex, a) => {
    const v = parseInt(hex.slice(1), 16);
    return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
  };

  const fmtNum = (v, d) => (v === null || v === undefined || !isFinite(v)) ? "—"
    : Number(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

  // Bosh sahifadagi narx kartochkalari
  const HERO = ["BTCUSDT", "PAXGUSDT", "ETHUSDT", "SOLUSDT"];
  async function loadHero() {
    const box = document.getElementById("heroStats");
    if (!box) return;
    try {
      const res = await fetch(`${API}/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(HERO))}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      box.innerHTML = "";
      HERO.forEach((id) => {
        const t = data.find((d) => d.symbol === id);
        const a = ASSETS.find((x) => x.id === id);
        if (!t || !a) return;
        const price = +t.lastPrice, chg = +t.priceChangePercent;
        const b = document.createElement("button");
        b.type = "button";
        b.className = "stat";
        b.innerHTML = `
          <div class="stat-top"><span class="stat-name"></span><span class="stat-chg ${chg >= 0 ? "up" : "down"}"></span></div>
          <div class="stat-price"></div>
          <div class="stat-sub"></div>`;
        b.querySelector(".stat-name").textContent = a.title;
        b.querySelector(".stat-chg").textContent = (chg >= 0 ? "+" : "") + chg.toFixed(2) + "%";
        b.querySelector(".stat-price").textContent = fmtNum(price, decimalsFor(price));
        b.querySelector(".stat-sub").textContent = id === "PAXGUSDT" ? "Oltin · 24 soat" : "24 soat";
        b.onclick = () => document.dispatchEvent(new CustomEvent("treder:pick", { detail: id }));
        box.appendChild(b);
      });
    } catch {
      if (!box.children.length) box.innerHTML = '<p class="muted">Narxlarni yuklab boʻlmadi.</p>';
    }
  }
  loadHero();
  setInterval(loadHero, 15000);

  window.TrederMarket = {
    ASSETS, TFS, decimalsFor, fetchKlines, createFeed, upsertBar, makeChart, alpha, fmtNum,
  };
})();
