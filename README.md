# Treder

Jonli bozor grafiklari va **Matematik 2.6** algoritmi signallari.

## Fayllar

- `index.html` — sahifa
- `treder.css` — dizayn (qorongʻi / yorugʻ mavzu)
- `treder.js` — TradingView vidjetlari: BTCUSD, XAUUSD, ETHUSD, EURUSD, GBPUSD, USDJPY, USDUZS, XAGUSD, neft, SOL, S&P 500
- `market.js` — umumiy maʼlumot qatlami: Binance jonli shamlari, grafik va narx kartochkalari
- `algo26.js` — Matematik 2.6 algoritmining JavaScript talqini
- `spectra.js` — SPECTRA Clone indikatorining JavaScript talqini (Kalman + Supertrend, TP/SL, backtest, MTF)
- `signal.html` + `signal.js` — "Eng maqul harakat": barcha indikatorlar konsensusi (BUY / SELL / KUTISH, kirish zonasi, SL, TP1, TP2), aktivlar skaneri va oʻz indikatorimiz **Treder Pulse**
- `news.js` — oʻzbek tilidagi jonli moliyaviy yangiliklar (Google News + Spot.uz, Gazeta.uz, Kun.uz; avtomatik tarjima)
- `vendor/` — TradingView Lightweight Charts™ 4.2.3 (Apache 2.0)
- `downloads/` — Pine Script indikatori, qoʻllanma va Capital Guard V2 (MT5 roboti) (muallif: [@Takrorlanmas_robotlar](https://t.me/takrorlanmas_robotlar))

## Matematik 2.6

TradingView vidjetlariga oʻzimizning Pine skriptimizni qoʻshib boʻlmaydi, shuning uchun algoritm `algo26.js` da qayta yozilgan:

1. Oxirgi tasdiqlangan Swing High / Swing Low topiladi (pivot: chap 5, oʻng 3 sham).
2. `Range = |Maks − Min|`, `Offset = Range / 2.6`.
3. BUY zonasi: `Min − Offset`, SELL zonasi: `Maks + Offset`.
4. SL: zonadan offsetning 35% narida; TP1: yorib oʻtilgan daraja; TP2: toʻlqinning 50%.

Oltin uchun Binance'dagi PAXG/USDT ishlatiladi — u XAU/USD narxiga bogʻlangan token.

## Eng maqul harakat (konsensus)

| Ovoz beruvchi | Ogʻirlik | Qanday ovoz beradi |
|---|---|---|
| SPECTRA Clone | 30% | Ochiq bitim yoʻnalishi (yangi boʻlsa kuchliroq), boʻlmasa Supertrend trendi |
| Matematik 2.6 | 20% | Faqat faol BUY/SELL signali |
| Treder Pulse | 30% | EMA 50/200 trendi, MACD, RSI, EMA20 qiyaligi |
| Katta oraliqlar | 20% | H1 / H4 / D1 dagi SPECTRA trendi |

Ball ≥ +35 — BUY, ≤ −35 — SELL, oraligʻida — KUTISH. Kelishuv boʻlmasa, Matematik 2.6 kutilayotgan zonasi limit reja sifatida koʻrsatiladi (narx zonani oʻtib ketgan boʻlsa — koʻrsatilmaydi).
