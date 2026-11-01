// Treder — jonli moliyaviy yangiliklar (oʻzbek tilida)
// Manbalar: Google News RSS (Forex, Oltin, Bitcoin/kripto, Tesla/aksiyalar) va
// oʻzbekcha saytlar (Spot.uz, Gazeta.uz, Kun.uz). RSS → JSON: rss2json.com.
// Inglizcha sarlavhalar Google Translate orqali avtomatik oʻzbekchaga oʻgiriladi.

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const list = $("newsList");
  if (!list) return;

  const RSS2JSON = "https://api.rss2json.com/v1/api.json?rss_url=";
  const TRANSLATE = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=uz&dt=t&q=";
  const CACHE_KEY = "treder:tr-cache";
  const REFRESH_MS = 5 * 60 * 1000;

  const gnews = (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q + " when:1d")}&hl=en-US&gl=US&ceid=US:en`;

  const CATS = [
    { id: "all", label: "Hammasi" },
    { id: "forex", label: "Forex", feeds: [{ url: gnews("forex dollar EUR/USD Fed"), tr: true }] },
    { id: "gold", label: "Oltin", feeds: [{ url: gnews("gold price XAU/USD"), tr: true }] },
    { id: "crypto", label: "Bitcoin va kripto", feeds: [{ url: gnews("bitcoin crypto market"), tr: true }] },
    { id: "stocks", label: "Tesla va aksiyalar", feeds: [{ url: gnews("Tesla stock"), tr: true }, { url: gnews("Nasdaq S&P 500 stocks"), tr: true }] },
    {
      id: "uz", label: "Oʻzbekiston", feeds: [
        { url: "https://www.spot.uz/oz/rss/", tr: false, filter: true },
        { url: "https://www.gazeta.uz/oz/rss/", tr: false, filter: true },
        { url: "https://kun.uz/news/rss", tr: false, filter: true },
      ],
    },
  ];
  const CAT_LABEL = Object.fromEntries(CATS.map((c) => [c.id, c.label]));

  // Oʻzbekcha saytlardan faqat iqtisodiy yangiliklar
  const UZ_KEYWORDS = /dollar|kurs|valyuta|oltin|bitkoin|kripto|birja|aksiya|bank|iqtisod|narx|inflyatsiya|soʻm|so'm|soʼm|markaziy bank|eksport|import|investitsiya|neft|tesla/i;

  let active = "all";
  let items = [];

  // ---- Tarjima keshi ----
  const cache = (() => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); } catch { return {}; } })();
  function saveCache() {
    try {
      const keys = Object.keys(cache);
      if (keys.length > 400) keys.slice(0, keys.length - 400).forEach((k) => delete cache[k]);
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch {}
  }
  async function translate(text) {
    if (!text) return text;
    if (cache[text]) return cache[text];
    try {
      const res = await fetch(TRANSLATE + encodeURIComponent(text));
      if (!res.ok) throw new Error();
      const data = await res.json();
      const out = (data[0] || []).map((p) => p[0]).join("").trim();
      if (out) { cache[text] = out; return out; }
    } catch {}
    return null; // tarjima boʻlmadi
  }

  const stripHtml = (html) => {
    const d = document.createElement("div");
    d.innerHTML = html || "";
    return (d.textContent || "").replace(/\s+/g, " ").trim();
  };

  async function loadFeed(cat, feed) {
    const res = await fetch(RSS2JSON + encodeURIComponent(feed.url));
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (data.status !== "ok") throw new Error(data.message || "rss");
    const feedTitle = (data.feed && data.feed.title) || "";
    return (data.items || []).map((it) => {
      let title = (it.title || "").trim();
      let source = it.author || feedTitle;
      // Google News: "Sarlavha - Manba"
      if (feed.url.includes("news.google.com")) {
        const k = title.lastIndexOf(" - ");
        if (k > 20) { source = title.slice(k + 3); title = title.slice(0, k); }
      } else {
        source = feedTitle.replace(/\s*[-–|].*$/, "") || source;
      }
      const desc = feed.url.includes("news.google.com") ? "" : stripHtml(it.description).slice(0, 220);
      return {
        cat: cat.id, title, desc, source, link: it.link,
        time: new Date((it.pubDate || "").replace(" ", "T") + (/(Z|[+-]\d\d:?\d\d)$/.test(it.pubDate || "") ? "" : "Z")).getTime() || Date.now(),
        img: it.thumbnail || (it.enclosure && it.enclosure.link) || "",
        tr: feed.tr, uz: feed.tr ? null : title,
      };
    }).filter((x) => x.title && (!feed.filter || UZ_KEYWORDS.test(x.title + " " + x.desc)));
  }

  async function loadAll() {
    setState("Yangiliklar yuklanmoqda…");
    const jobs = [];
    CATS.forEach((cat) => (cat.feeds || []).forEach((f) => jobs.push(loadFeed(cat, f).catch(() => []))));
    const results = (await Promise.all(jobs)).flat();

    // Takrorlarni olib tashlash va saralash
    const seen = new Set();
    const fresh = results.filter((x) => {
      const k = x.title.toLowerCase().slice(0, 80);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).sort((a, b) => b.time - a.time);

    if (!fresh.length) {
      setState("Yangiliklarni yuklab boʻlmadi. Pastdagi TradingView lentasidan foydalaning yoki keyinroq urinib koʻring.");
      return;
    }
    items = fresh;
    render();

    // Sarlavhalarni oʻzbekchaga oʻgirish (navbat bilan, kesh bilan)
    for (const it of items) {
      if (!it.tr || it.uz) continue;
      it.uz = cache[it.title] || (await translate(it.title)) || it.title;
      it.trFailed = it.uz === it.title;
      updateItem(it);
    }
    saveCache();
    $("newsTime").textContent = "Yangilandi: " + new Date().toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" });
  }

  function setState(text) {
    list.innerHTML = "";
    const p = document.createElement("p");
    p.className = "muted news-state";
    p.textContent = text;
    list.appendChild(p);
  }

  function ago(t) {
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return "hozirgina";
    if (s < 3600) return Math.floor(s / 60) + " daqiqa oldin";
    if (s < 86400) return Math.floor(s / 3600) + " soat oldin";
    return Math.floor(s / 86400) + " kun oldin";
  }

  const nodes = new Map();
  function updateItem(it) {
    const el = nodes.get(it);
    if (!el) return;
    el.querySelector(".news-title").textContent = it.uz || it.title;
    el.querySelector(".news-orig").textContent = it.tr && it.uz && !it.trFailed ? it.title : "";
    el.querySelector(".news-tr").hidden = !(it.tr && it.uz && !it.trFailed);
  }

  function render() {
    list.innerHTML = "";
    nodes.clear();
    const shown = items.filter((x) => active === "all" || x.cat === active).slice(0, active === "all" ? 40 : 25);
    if (!shown.length) { setState("Bu boʻlimda hozircha yangilik yoʻq."); return; }
    shown.forEach((it) => {
      const a = document.createElement("a");
      a.className = "news-item card";
      a.href = it.link;
      a.target = "_blank";
      a.rel = "noopener";
      a.innerHTML = `
        <div class="news-meta"><span class="news-cat"></span><span class="news-src"></span><span class="news-ago"></span><span class="news-tr" hidden>avtomatik tarjima</span></div>
        <h4 class="news-title"></h4>
        <p class="news-orig"></p>
        <p class="news-desc"></p>`;
      a.querySelector(".news-cat").textContent = CAT_LABEL[it.cat];
      a.querySelector(".news-cat").dataset.cat = it.cat;
      a.querySelector(".news-src").textContent = it.source;
      a.querySelector(".news-ago").textContent = ago(it.time);
      a.querySelector(".news-desc").textContent = it.desc;
      nodes.set(it, a);
      updateItem(it);
      list.appendChild(a);
    });
  }

  function renderTabs() {
    window.trederButtonRow($("newsTabs"), CATS, active, "chip", (id) => { active = id; renderTabs(); render(); });
  }

  // TradingView yangiliklar lentasi (zaxira manba)
  function renderTimeline() {
    const el = $("newsTimeline");
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
    s.async = true;
    s.src = "https://s3.tradingview.com/external-embedding/embed-widget-timeline.js";
    s.innerHTML = JSON.stringify({
      feedMode: "all_symbols", isTransparent: true, displayMode: "regular",
      width: "100%", height: "100%", colorTheme: window.trederTheme ? window.trederTheme() : "dark", locale: "ru",
    });
    wrap.appendChild(s);
    el.appendChild(wrap);
  }
  document.addEventListener("treder:render", renderTimeline);

  renderTabs();
  renderTimeline();
  loadAll();
  setInterval(loadAll, REFRESH_MS);
  setInterval(() => nodes.forEach((el, it) => { el.querySelector(".news-ago").textContent = ago(it.time); }), 60000);
})();
