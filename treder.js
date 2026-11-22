// Treder — TradingView vidjetlari (grafik, texnik tahlil, sharh, kalendar)

const SYMBOLS = [
  { id: "BITSTAMP:BTCUSD", label: "BTCUSD", title: "BTC / USD", sub: "Bitcoin" },
  { id: "OANDA:XAUUSD", label: "XAUUSD", title: "XAU / USD", sub: "Oltin" },
  { id: "BITSTAMP:ETHUSD", label: "ETHUSD", title: "ETH / USD", sub: "Ethereum" },
  { id: "FX:EURUSD", label: "EURUSD", title: "EUR / USD", sub: "Yevro / Dollar" },
  { id: "FX:GBPUSD", label: "GBPUSD", title: "GBP / USD", sub: "Funt / Dollar" },
  { id: "FX:USDJPY", label: "USDJPY", title: "USD / JPY", sub: "Dollar / Iyena" },
  { id: "FX_IDC:USDUZS", label: "USDUZS", title: "USD / UZS", sub: "Dollar / Soʻm" },
  { id: "OANDA:XAGUSD", label: "XAGUSD", title: "XAG / USD", sub: "Kumush" },
  { id: "TVC:USOIL", label: "USOIL", title: "WTI neft", sub: "AQSH neft" },
  { id: "BINANCE:SOLUSDT", label: "SOLUSDT", title: "SOL / USDT", sub: "Solana" },
  { id: "FOREXCOM:SPXUSD", label: "S&P 500", title: "S&P 500", sub: "AQSH indeksi" },
];

const INTERVALS = [
  { v: "1", label: "1m" },
  { v: "5", label: "5m" },
  { v: "15", label: "15m" },
  { v: "60", label: "1s" },
  { v: "240", label: "4s" },
  { v: "D", label: "1K" },
  { v: "W", label: "1H" },
];

const LOCALE = "ru";
const STORE_KEY = "treder:prefs";

const state = loadPrefs();

function loadPrefs() {
  const defaults = { symbol: SYMBOLS[0].id, interval: "60", theme: "dark" };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    return { ...defaults, ...saved };
  } catch {
    return defaults;
  }
}

function savePrefs() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch {}
}

// TradingView embed vidjetini konteynerga joylash
function mountWidget(el, script, config) {
  if (!el) return;
  el.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "tradingview-widget-container";
  wrap.style.height = "100%";
  const inner = document.createElement("div");
  inner.className = "tradingview-widget-container__widget";
  inner.style.height = "100%";
  wrap.appendChild(inner);
  const s = document.createElement("script");
  s.type = "text/javascript";
  s.async = true;
  s.src = `https://s3.tradingview.com/external-embedding/${script}`;
  s.innerHTML = JSON.stringify(config);
  wrap.appendChild(s);
  el.appendChild(wrap);
}

const $ = (id) => document.getElementById(id);

function renderTicker() {
  mountWidget($("tickerTape"), "embed-widget-ticker-tape.js", {
    symbols: SYMBOLS.map((s) => ({ proName: s.id, title: s.label })),
    showSymbolLogo: true,
    isTransparent: true,
    displayMode: "adaptive",
    colorTheme: state.theme,
    locale: LOCALE,
  });
}

function renderChart() {
  const sym = SYMBOLS.find((s) => s.id === state.symbol) || SYMBOLS[0];
  $("chartTitle").textContent = sym.title;
  $("chartSub").textContent = sym.sub;
  mountWidget($("mainChart"), "embed-widget-advanced-chart.js", {
    autosize: true,
    symbol: sym.id,
    interval: state.interval,
    timezone: "Asia/Tashkent",
    theme: state.theme,
    style: "1",
    locale: LOCALE,
    backgroundColor: "rgba(0,0,0,0)",
    allow_symbol_change: true,
    hide_side_toolbar: false,
    calendar: false,
    withdateranges: true,
    support_host: "https://www.tradingview.com",
  });
}

function taInterval(v) {
  return { "1": "1m", "5": "5m", "15": "15m", "60": "1h", "240": "4h", D: "1D", W: "1W" }[v] || "1h";
}

function renderTA() {
  mountWidget($("techAnalysis"), "embed-widget-technical-analysis.js", {
    interval: taInterval(state.interval),
    width: "100%",
    height: "100%",
    isTransparent: true,
    symbol: state.symbol,
    showIntervalTabs: true,
    displayMode: "single",
    colorTheme: state.theme,
    locale: LOCALE,
  });
}

function renderOverview() {
  mountWidget($("marketOverview"), "embed-widget-market-overview.js", {
    colorTheme: state.theme,
    dateRange: "1D",
    showChart: true,
    locale: LOCALE,
    width: "100%",
    height: "100%",
    isTransparent: true,
    showSymbolLogo: true,
    tabs: [
      {
        title: "Kripto",
        symbols: [
          { s: "BITSTAMP:BTCUSD", d: "Bitcoin" },
          { s: "BITSTAMP:ETHUSD", d: "Ethereum" },
          { s: "BINANCE:SOLUSDT", d: "Solana" },
          { s: "BINANCE:BNBUSDT", d: "BNB" },
          { s: "BINANCE:XRPUSDT", d: "XRP" },
        ],
      },
      {
        title: "Forex",
        symbols: [
          { s: "FX:EURUSD", d: "EUR/USD" },
          { s: "FX:GBPUSD", d: "GBP/USD" },
          { s: "FX:USDJPY", d: "USD/JPY" },
          { s: "FX:USDCHF", d: "USD/CHF" },
          { s: "FX:AUDUSD", d: "AUD/USD" },
          { s: "FX_IDC:USDUZS", d: "USD/UZS" },
        ],
      },
      {
        title: "Metallar",
        symbols: [
          { s: "OANDA:XAUUSD", d: "Oltin" },
          { s: "OANDA:XAGUSD", d: "Kumush" },
          { s: "OANDA:XPTUSD", d: "Platina" },
          { s: "TVC:USOIL", d: "WTI neft" },
          { s: "TVC:UKOIL", d: "Brent neft" },
        ],
      },
    ],
  });
}

function renderCalendar() {
  mountWidget($("calendar"), "embed-widget-events.js", {
    colorTheme: state.theme,
    isTransparent: true,
    width: "100%",
    height: "100%",
    locale: LOCALE,
    importanceFilter: "0,1",
    countryFilter: "us,eu,gb,jp,cn",
  });
}

// Umumiy tugmalar qatori (chips / segment)
function buttonRow(box, items, activeId, cls, onPick) {
  box.innerHTML = "";
  items.forEach((it) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = cls + (it.id === activeId ? " active" : "");
    b.textContent = it.label;
    b.setAttribute("aria-pressed", it.id === activeId);
    b.onclick = () => { if (it.id !== activeId) onPick(it.id); };
    box.appendChild(b);
  });
}
window.trederButtonRow = buttonRow;

function renderTabs() {
  buttonRow($("symbolTabs"), SYMBOLS, state.symbol, "chip", (id) => {
    state.symbol = id;
    savePrefs();
    renderTabs();
    renderChart();
    renderTA();
  });
}

function renderIntervals() {
  buttonRow($("intervals"), INTERVALS.map((i) => ({ id: i.v, label: i.label })), state.interval, "seg-btn", (id) => {
    state.interval = id;
    savePrefs();
    renderIntervals();
    renderChart();
    renderTA();
  });
}

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  $("themeToggle").textContent = state.theme === "dark" ? "☀︎" : "☾";
  document.dispatchEvent(new CustomEvent("treder:theme", { detail: state.theme }));
}
window.trederTheme = () => state.theme;

$("themeToggle").onclick = () => {
  state.theme = state.theme === "dark" ? "light" : "dark";
  savePrefs();
  applyTheme();
  renderAll();
};

// signal.html kabi sahifalarda asosiy grafik yoʻq — faqat mavjud vidjetlar chiziladi
const hasMain = !!$("mainChart");

function renderAll() {
  renderTicker();
  if (hasMain) {
    renderChart();
    renderTA();
  }
  renderOverview();
  renderCalendar();
  document.dispatchEvent(new CustomEvent("treder:render"));
}

applyTheme();
if (hasMain) {
  renderTabs();
  renderIntervals();
}
renderAll();

// ===========================================================================
// Mobil ilova (PWA): service worker, oʻrnatish tugmasi va banner
// ===========================================================================
(() => {
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }

  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  document.documentElement.classList.toggle("is-app", standalone);

  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isMobile = isIOS || /Android/i.test(ua);
  const DISMISS_KEY = "treder:install-dismissed";
  let deferred = null;

  const dismissed = () => { try { return Date.now() - (+localStorage.getItem(DISMISS_KEY) || 0) < 7 * 864e5; } catch { return false; } };

  async function install() {
    if (deferred) {
      deferred.prompt();
      const choice = await deferred.userChoice.catch(() => null);
      deferred = null;
      if (choice && choice.outcome === "accepted") hideBanner();
      updateButtons();
      return;
    }
    // Brauzer oʻzi taklif qilmasa — yoʻriqnoma sahifasi
    if (!/ilova\.html$/.test(location.pathname)) location.href = "ilova.html";
    else document.getElementById(isIOS ? "ios" : "android")?.scrollIntoView({ behavior: "smooth" });
  }
  window.trederInstall = install;

  function updateButtons() {
    document.querySelectorAll("[data-install]").forEach((b) => {
      b.hidden = standalone;
      b.onclick = install;
    });
    const st = document.getElementById("installState");
    if (st) {
      st.textContent = standalone ? "✓ Ilova oʻrnatilgan va hozir ilova rejimida ochiq."
        : deferred ? "Brauzeringiz ilovani bir bosishda oʻrnatishga tayyor."
        : isIOS ? "iPhone/iPad: pastdagi 4 qadamni bajaring (Safari orqali)."
        : "Brauzer menyusidan “Ilovani oʻrnatish” yoki “Bosh ekranga qoʻshish” ni tanlang.";
    }
  }

  let banner = null;
  function showBanner() {
    if (banner || standalone || dismissed() || !isMobile || /ilova\.html$/.test(location.pathname)) return;
    banner = document.createElement("div");
    banner.className = "install-banner";
    banner.innerHTML = `
      <img src="icons/icon-192.png" alt="" width="40" height="40">
      <div><b>Treder ilovasi</b><span>${isIOS ? "Bosh ekranga qoʻshib, ilova kabi oching" : "Telefoningizga bir bosishda oʻrnating"}</span></div>
      <button type="button" class="ib-go">Oʻrnatish</button>
      <button type="button" class="ib-x" aria-label="Yopish">✕</button>`;
    banner.querySelector(".ib-go").onclick = install;
    banner.querySelector(".ib-x").onclick = () => {
      try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
      hideBanner();
    };
    document.body.appendChild(banner);
  }
  function hideBanner() { if (banner) { banner.remove(); banner = null; } }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    updateButtons();
    showBanner();
  });
  window.addEventListener("appinstalled", () => { deferred = null; hideBanner(); updateButtons(); });

  updateButtons();
  if (isIOS) setTimeout(showBanner, 2500); // iOS'da avtomatik taklif yoʻq — oʻzimiz koʻrsatamiz
})();
