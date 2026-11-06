/* Sentinel — portfolio risk monitor (static demo). */
(() => {
  "use strict";

  // ---------- Config ----------
  const DEMO_HOLDINGS = [
    { ticker: "NVDA", shares: 120, cost: 95 },
    { ticker: "AAPL", shares: 40, cost: 185 },
    { ticker: "MSFT", shares: 25, cost: 410 },
    { ticker: "AVGO", shares: 40, cost: 160 },
    { ticker: "AMZN", shares: 35, cost: 180 },
    { ticker: "GOOGL", shares: 30, cost: 160 },
    { ticker: "JPM", shares: 25, cost: 210 },
    { ticker: "META", shares: 12, cost: 480 },
    { ticker: "JNJ", shares: 20, cost: 155 },
    { ticker: "TSLA", shares: 15, cost: 240 },
    { ticker: "XOM", shares: 30, cost: 112 },
    { ticker: "BTC", shares: 0.08, cost: 62000 },
    { ticker: "ETH", shares: 1.5, cost: 2600 },
  ];

  const PRESETS = {
    conservative: { maxPosition: 7, maxSector: 25, maxCrypto: 0, maxBeta: 0.9, maxVol: 15, maxDrawdown: 12, minHoldings: 20, maxTop5: 40, maxPE: 35, earningsWindow: 21 },
    moderate: { maxPosition: 10, maxSector: 30, maxCrypto: 5, maxBeta: 1.15, maxVol: 22, maxDrawdown: 20, minHoldings: 12, maxTop5: 50, maxPE: 60, earningsWindow: 14 },
    aggressive: { maxPosition: 20, maxSector: 45, maxCrypto: 15, maxBeta: 1.5, maxVol: 35, maxDrawdown: 35, minHoldings: 6, maxTop5: 70, maxPE: 120, earningsWindow: 7 },
  };

  const FIELDS = [
    { key: "maxPosition", label: "Max single position", unit: "%", min: 2, max: 40, step: 1, hint: "Largest weight any one holding may carry." },
    { key: "maxSector", label: "Max sector exposure", unit: "%", min: 10, max: 80, step: 1, hint: "Flags over-concentration in a single GICS sector." },
    { key: "maxTop5", label: "Max top-5 concentration", unit: "%", min: 20, max: 100, step: 1, hint: "Combined weight of your five largest positions." },
    { key: "maxCrypto", label: "Max crypto allocation", unit: "%", min: 0, max: 50, step: 1, hint: "Set to 0 to prohibit digital assets." },
    { key: "maxBeta", label: "Max portfolio beta", unit: "", min: 0.5, max: 2, step: 0.05, hint: "Sensitivity to S&P 500 moves (1.0 = market)." },
    { key: "maxVol", label: "Max annualized volatility", unit: "%", min: 8, max: 60, step: 1, hint: "Standard deviation of weekly returns, annualized." },
    { key: "maxDrawdown", label: "Max tolerated drawdown", unit: "%", min: 5, max: 60, step: 1, hint: "Worst peak-to-trough decline over the last year." },
    { key: "maxPE", label: "Valuation ceiling (P/E)", unit: "x", min: 15, max: 200, step: 5, hint: "Flags holdings priced above this earnings multiple." },
    { key: "minHoldings", label: "Minimum number of holdings", unit: "", min: 1, max: 40, step: 1, hint: "Diversification floor." },
    { key: "earningsWindow", label: "Earnings alert window", unit: "d", min: 3, max: 45, step: 1, hint: "Warn when a large position reports within this many days." },
  ];

  const SECTORS = ["Information Technology", "Communication Services", "Consumer Discretionary", "Consumer Staples", "Financials", "Health Care", "Energy", "Industrials", "Materials", "Utilities", "Real Estate", "Crypto", "Unknown"];
  const SECTOR_COLORS = {
    "Information Technology": "#60a5fa", "Communication Services": "#a78bfa", "Consumer Discretionary": "#f472b6",
    "Consumer Staples": "#fb923c", Financials: "#34d399", "Health Care": "#2dd4bf", Energy: "#fbbf24",
    Industrials: "#94a3b8", Materials: "#c084fc", Utilities: "#4ade80", "Real Estate": "#f87171", Crypto: "#f59e0b", Unknown: "#475569",
  };
  const CRYPTO_IDS = { BTC: "bitcoin", ETH: "ethereum" };
  const BROKERS = [
    ["Robinhood", "OAuth · read-only"], ["Charles Schwab", "via SnapTrade"], ["Fidelity", "via Plaid"],
    ["Vanguard", "via Plaid"], ["E*TRADE", "via SnapTrade"], ["Coinbase", "API key · read-only"],
  ];

  // ---------- Utils ----------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isNum = (x) => typeof x === "number" && isFinite(x);
  const fmtUSD = (v, d = 0) => isNum(v) ? v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: d, minimumFractionDigits: d }) : "—";
  const fmtPct = (v, d = 1, sign = false) => isNum(v) ? `${sign && v > 0 ? "+" : ""}${v.toFixed(d)}%` : "—";
  const fmtNum = (v, d = 2) => isNum(v) ? v.toLocaleString("en-US", { maximumFractionDigits: d }) : "—";
  const fmtCompact = (v) => isNum(v) ? new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v) : "—";
  const cls = (v) => (isNum(v) ? (v >= 0 ? "up" : "down") : "");
  const today = new Date("2026-11-06T12:00:00Z");
  const daysUntil = (iso) => Math.round((new Date(iso + "T12:00:00Z") - today) / 864e5);
  const store = {
    get(k, f) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch { return f; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  };
  const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
  const std = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };
  const cov = (a, b) => { const ma = mean(a), mb = mean(b); let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - ma) * (b[i] - mb); return s / Math.max(1, a.length - 1); };
  const pctReturns = (s) => s.slice(1).map((v, i) => (s[i] ? v / s[i] - 1 : 0));

  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 3200);
  }

  // ---------- State ----------
  const state = {
    holdings: store.get("sentinel.holdings", DEMO_HOLDINGS),
    label: store.get("sentinel.label", "Demo portfolio"),
    settings: { ...PRESETS.moderate, excluded: [], ...store.get("sentinel.settings", {}) },
    view: (location.hash || "#overview").slice(1),
    range: 52,
    sort: { key: "value", dir: -1 },
    newsFilter: "All",
    filter: "",
  };
  let DATA = null;
  let A = null; // analysis result
  const charts = {};

  // ---------- Data ----------
  async function loadJSON(p) {
    try { const r = await fetch(p, { cache: "no-cache" }); if (!r.ok) throw 0; return await r.json(); } catch { return null; }
  }

  async function loadData() {
    const [eq, mac] = await Promise.all([loadJSON("data/equities.json"), loadJSON("data/macro.json")]);
    const assets = {};
    if (eq?.tickers) for (const [sym, t] of Object.entries(eq.tickers)) assets[sym] = { ...t, type: "equity" };
    if (mac?.crypto) {
      for (const [sym, id] of Object.entries(CRYPTO_IDS)) {
        const c = mac.crypto[id];
        if (c) assets[sym] = { name: c.name, sector: "Crypto", industry: "Digital asset", price: c.price, changePct: c.changePct, marketCap: c.marketCap, pe: null, beta: null, dividendYield: 0, history: c.history || [], analyst: null, news: [], type: "crypto" };
      }
    }
    const spy = eq?.benchmark?.SPY || null;
    const sources = [...new Set([...(eq?.sources || []), ...(mac?.sources || [])])];
    return {
      assets, spy, sources,
      asOf: eq?.asOf || mac?.asOf,
      macro: mac?.macro || {},
      earnings: mac?.earningsCalendar || [],
      econ: mac?.economicEvents || [],
      marketNews: mac?.marketNews || [],
      cryptoNews: mac?.cryptoNews || [],
    };
  }

  // Price for an asset at a date: last close on/before that date (or first available).
  function priceAt(hist, iso) {
    if (!hist?.length) return null;
    let lo = 0, hi = hist.length - 1, ans = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (hist[m].d <= iso) { ans = m; lo = m + 1; } else hi = m - 1; }
    return hist[Math.max(0, ans)].c;
  }

  // ---------- Analysis ----------
  function analyze() {
    const S = state.settings;
    const dates = (DATA.spy?.history || []).map((p) => p.d);
    const spySeries = (DATA.spy?.history || []).map((p) => p.c);

    const rows = state.holdings.map((h) => {
      const a = DATA.assets[h.ticker];
      const price = a?.price ?? (isNum(h.cost) ? h.cost : null);
      const value = isNum(price) ? price * h.shares : 0;
      const series = a?.history?.length && dates.length ? dates.map((d) => priceAt(a.history, d)) : null;
      let vol = null, beta = a?.beta ?? null, ret1y = null;
      if (series) {
        const r = pctReturns(series), rs = pctReturns(spySeries);
        vol = std(r) * Math.sqrt(52) * 100;
        if (beta == null) beta = cov(r, rs) / (std(rs) ** 2 || 1);
        ret1y = (series[series.length - 1] / series[0] - 1) * 100;
      }
      return {
        ticker: h.ticker, shares: h.shares, cost: h.cost, a, known: !!a,
        name: a?.name || "Not in data snapshot", sector: a?.sector || "Unknown",
        price, chg: a?.changePct ?? null, value, series, vol, beta, ret1y,
        pe: a?.pe ?? null, pl: isNum(h.cost) && isNum(price) ? (price - h.cost) * h.shares : null,
        plPct: isNum(h.cost) && isNum(price) && h.cost ? (price / h.cost - 1) * 100 : null,
      };
    });

    const total = rows.reduce((s, r) => s + r.value, 0) || 1;
    rows.forEach((r) => (r.weight = (r.value / total) * 100));
    const dayChg = rows.reduce((s, r) => s + (isNum(r.chg) ? r.value - r.value / (1 + r.chg / 100) : 0), 0);
    const costTotal = rows.reduce((s, r) => s + (isNum(r.cost) ? r.cost * r.shares : r.value), 0);

    // Portfolio series (current share counts held through the year).
    const port = dates.map((_, i) => rows.reduce((s, r) => s + (r.series ? r.series[i] * r.shares : r.value), 0));
    const pr = pctReturns(port), sr = pctReturns(spySeries);
    const vol = port.length > 2 ? std(pr) * Math.sqrt(52) * 100 : null;
    const beta = port.length > 2 ? cov(pr, sr) / (std(sr) ** 2 || 1) : null;
    const ret1y = port.length ? (port[port.length - 1] / port[0] - 1) * 100 : null;
    const spyRet = spySeries.length ? (spySeries[spySeries.length - 1] / spySeries[0] - 1) * 100 : null;
    let peak = -Infinity; const dd = port.map((v) => { peak = Math.max(peak, v); return (v / peak - 1) * 100; });
    const maxDD = dd.length ? Math.min(...dd) : null;
    const rf = isNum(DATA.macro?.tenYear) ? DATA.macro.tenYear : 4;
    const sharpe = isNum(vol) && vol > 0 ? (ret1y - rf) / vol : null;
    const te = port.length > 2 ? std(pr.map((x, i) => x - sr[i])) * Math.sqrt(52) * 100 : null;

    const sectors = {};
    rows.forEach((r) => (sectors[r.sector] = (sectors[r.sector] || 0) + r.weight));
    const sectorList = Object.entries(sectors).sort((a, b) => b[1] - a[1]);
    const sorted = [...rows].sort((a, b) => b.weight - a.weight);
    const top5 = sorted.slice(0, 5).reduce((s, r) => s + r.weight, 0);
    const hhi = rows.reduce((s, r) => s + (r.weight / 100) ** 2, 0);
    const effN = hhi ? 1 / hhi : 0;
    const crypto = sectors.Crypto || 0;
    const wPE = (() => { const p = rows.filter((r) => isNum(r.pe) && r.pe > 0); const w = p.reduce((s, r) => s + r.weight, 0); return w ? p.reduce((s, r) => s + r.pe * r.weight, 0) / w : null; })();
    const divYield = rows.reduce((s, r) => s + (r.a?.dividendYield || 0) * r.weight, 0);

    // Upcoming events for holdings
    const held = new Set(rows.map((r) => r.ticker));
    const events = [
      ...DATA.earnings.filter((e) => held.has(e.ticker) && e.date && daysUntil(e.date) >= 0).map((e) => ({ ...e, kind: "earnings", days: daysUntil(e.date), weight: rows.find((r) => r.ticker === e.ticker)?.weight || 0 })),
      ...DATA.econ.filter((e) => e.date && daysUntil(e.date) >= 0).map((e) => ({ ...e, kind: "macro", days: daysUntil(e.date) })),
    ].sort((a, b) => a.days - b.days);

    // ---------- Rules ----------
    const alerts = [];
    const add = (sev, title, detail, tags = []) => alerts.push({ sev, title, detail, tags });

    sorted.filter((r) => r.weight > S.maxPosition).forEach((r) =>
      add(r.weight > S.maxPosition * 1.5 ? "high" : "med", `${r.ticker} is ${fmtPct(r.weight)} of the portfolio`, `Above your ${S.maxPosition}% single-position limit by ${fmtPct(r.weight - S.maxPosition)} (~${fmtUSD(((r.weight - S.maxPosition) / 100) * total)}).`, [r.ticker]));
    sectorList.filter(([s, w]) => w > S.maxSector && s !== "Crypto").forEach(([s, w]) => {
      const names = sorted.filter((r) => r.sector === s).map((r) => r.ticker).join(", ");
      add("high", `${s} exposure at ${fmtPct(w)}`, `Over your ${S.maxSector}% sector cap. Holdings: ${names}.`, [s]);
    });
    if (crypto > S.maxCrypto) add(S.maxCrypto === 0 || crypto > S.maxCrypto * 1.5 ? "high" : "med", `Crypto allocation at ${fmtPct(crypto)}`, S.maxCrypto === 0 ? "Your guidelines prohibit digital assets." : `Above your ${S.maxCrypto}% crypto limit.`, ["Crypto"]);
    (S.excluded || []).forEach((s) => { const w = sectors[s]; if (w) add("high", `Holds excluded sector: ${s}`, `${fmtPct(w)} of the portfolio is in a sector your guidelines exclude (${sorted.filter((r) => r.sector === s).map((r) => r.ticker).join(", ")}).`, [s]); });
    if (top5 > S.maxTop5) add("med", `Top 5 positions are ${fmtPct(top5)} of assets`, `Above your ${S.maxTop5}% top-5 concentration limit. Effective number of holdings: ${effN.toFixed(1)}.`);
    if (isNum(beta) && beta > S.maxBeta) add("med", `Portfolio beta ${beta.toFixed(2)}`, `Above your ${S.maxBeta.toFixed(2)} ceiling; a 10% S&P drop implies roughly a ${(beta * 10).toFixed(1)}% portfolio drop.`);
    if (isNum(vol) && vol > S.maxVol) add("med", `Volatility ${fmtPct(vol)} annualized`, `Above your ${S.maxVol}% tolerance (S&P 500: ${fmtPct(std(sr) * Math.sqrt(52) * 100)}).`);
    if (isNum(maxDD) && -maxDD > S.maxDrawdown) add("med", `1Y max drawdown ${fmtPct(maxDD)}`, `Deeper than your ${S.maxDrawdown}% drawdown tolerance.`);
    if (rows.length < S.minHoldings) add("med", `Only ${rows.length} holdings`, `Below your diversification floor of ${S.minHoldings}.`);
    rows.filter((r) => isNum(r.pe) && r.pe > S.maxPE).forEach((r) => add("info", `${r.ticker} trades at ${r.pe.toFixed(0)}x earnings`, `Above your ${S.maxPE}x valuation ceiling.`, [r.ticker]));
    events.filter((e) => e.kind === "earnings" && e.days <= S.earningsWindow).forEach((e) =>
      add(e.weight > S.maxPosition / 2 ? "med" : "info", `${e.ticker} reports earnings in ${e.days} day${e.days === 1 ? "" : "s"}`, `${fmtPct(e.weight)} position${isNum(e.epsEstimate) ? ` · EPS estimate ${fmtUSD(e.epsEstimate, 2)}` : ""}. Expect elevated volatility around the print.`, [e.ticker]));
    rows.filter((r) => r.a && isNum(r.a.week52Low) && r.price <= r.a.week52Low * 1.05).forEach((r) => add("info", `${r.ticker} is near its 52-week low`, `${fmtUSD(r.price, 2)} vs low of ${fmtUSD(r.a.week52Low, 2)}.`, [r.ticker]));
    rows.filter((r) => !r.known).forEach((r) => add("info", `No market data for ${r.ticker}`, isNum(r.cost) ? "Valued at your cost basis; excluded from risk statistics." : "Add a cost basis or connect a data source to include it in the review.", [r.ticker]));

    const passes = [];
    if (!sorted.some((r) => r.weight > S.maxPosition)) passes.push(`All positions within ${S.maxPosition}% limit`);
    if (!sectorList.some(([s, w]) => w > S.maxSector && s !== "Crypto")) passes.push(`All sectors within ${S.maxSector}% cap`);
    if (crypto <= S.maxCrypto) passes.push(`Crypto ${fmtPct(crypto)} within ${S.maxCrypto}% limit`);
    if (isNum(beta) && beta <= S.maxBeta) passes.push(`Beta ${beta.toFixed(2)} within ${S.maxBeta.toFixed(2)}`);
    if (isNum(vol) && vol <= S.maxVol) passes.push(`Volatility ${fmtPct(vol)} within ${S.maxVol}%`);
    if (isNum(maxDD) && -maxDD <= S.maxDrawdown) passes.push(`Drawdown ${fmtPct(maxDD)} within tolerance`);
    if (top5 <= S.maxTop5) passes.push(`Top-5 concentration ${fmtPct(top5)} within ${S.maxTop5}%`);
    if (rows.length >= S.minHoldings) passes.push(`${rows.length} holdings meets diversification floor`);

    const order = { high: 0, med: 1, info: 2 };
    alerts.sort((a, b) => order[a.sev] - order[b.sev]);
    const score = Math.max(0, Math.round(100 - alerts.reduce((s, a) => s + (a.sev === "high" ? 10 : a.sev === "med" ? 5 : 1), 0)));

    return { rows, total, dayChg, costTotal, dates, port, spySeries, dd, vol, beta, ret1y, spyRet, maxDD, sharpe, te, rf, sectors, sectorList, top5, hhi, effN, crypto, wPE, divYield, events, alerts, passes, score };
  }

  // ---------- Render: shared ----------
  const icon = {
    high: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/></svg>',
    med: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>',
    info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
    pass: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 11.1V12a10 10 0 1 1-5.9-9.1"/><path d="m22 4-10 10-3-3"/></svg>',
  };
  const sevLabel = { high: "breach", med: "warning", info: "note" };
  const alertHTML = (a) => `<li class="alert ${a.sev}">${icon[a.sev]}<div><b>${esc(a.title)}<span class="sev ${a.sev}">${sevLabel[a.sev]}</span></b><p>${esc(a.detail)}</p></div></li>`;
  const passHTML = (t) => `<li class="alert pass">${icon.pass}<div><b>${esc(t)}</b></div></li>`;
  const avatar = (t, sector) => `<span class="av" style="background:${SECTOR_COLORS[sector] || "#475569"}">${esc(t.slice(0, 4))}</span>`;
  const dateBox = (iso) => { const d = new Date(iso + "T12:00:00Z"); return `<div class="date"><small>${d.toLocaleString("en-US", { month: "short", timeZone: "UTC" })}</small><b>${d.getUTCDate()}</b></div>`; };

  function eventHTML(e) {
    const soon = e.days <= state.settings.earningsWindow;
    if (e.kind === "earnings") {
      const time = e.time === "bmo" ? "Before open" : e.time === "amc" ? "After close" : "Time TBA";
      return `<li class="event">${dateBox(e.date)}<div><div class="t">${esc(e.ticker)} earnings</div><div class="s">${time}${isNum(e.epsEstimate) ? ` · EPS est. ${fmtUSD(e.epsEstimate, 2)}` : ""} · ${fmtPct(e.weight)} of portfolio</div></div><span class="pill ${soon ? "soon" : ""}">${e.days === 0 ? "today" : `in ${e.days}d`}</span></li>`;
    }
    return `<li class="event">${dateBox(e.date)}<div><div class="t">${esc(e.title || e.name || e.event || "Economic release")}</div><div class="s">${esc(e.description || e.detail || "Macro event")}</div></div><span class="pill macro">in ${e.days}d</span></li>`;
  }

  function allNews() {
    const items = [];
    A.rows.forEach((r) => (r.a?.news || []).forEach((n) => items.push({ ...n, tickers: [r.ticker] })));
    const held = new Set(A.rows.map((r) => r.ticker));
    DATA.marketNews.forEach((n) => items.push({ ...n, tickers: (n.tickers || []).filter((t) => held.has(t)), market: true }));
    if (A.crypto > 0) DATA.cryptoNews.forEach((n) => items.push({ ...n, tickers: ["Crypto"] }));
    const seen = new Set();
    return items.filter((n) => n.title && !seen.has(n.title) && seen.add(n.title)).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  }
  const newsHTML = (n) => `<li><a href="${esc(n.url || "#")}" target="_blank" rel="noopener noreferrer"><span class="h">${esc(n.title)}</span><span class="m">${(n.tickers || []).map((t) => `<span class="tk">${esc(t)}</span>`).join("")}${n.market && !(n.tickers || []).length ? '<span class="tk">Market</span>' : ""}<span>${esc(n.source || "")}</span><span>${esc(String(n.date || "").slice(0, 10))}</span>${n.sentiment ? `<span class="sent ${esc(n.sentiment)}">${esc(n.sentiment)}</span>` : ""}</span></a></li>`;

  // ---------- Charts ----------
  function chartDefaults() {
    if (!window.Chart) return;
    Chart.defaults.color = "#94a3b8";
    Chart.defaults.font.family = '"Fira Sans", system-ui, sans-serif';
    Chart.defaults.font.size = 12;
    Chart.defaults.borderColor = "#1f2940";
    Chart.defaults.plugins.tooltip.backgroundColor = "#141a2e";
    Chart.defaults.plugins.tooltip.borderColor = "#334155";
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.titleFont = { family: '"Fira Code", monospace', weight: "600" };
    Chart.defaults.plugins.tooltip.bodyFont = { family: '"Fira Code", monospace' };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) Chart.defaults.animation = false;
  }
  function draw(id, cfg) {
    if (!window.Chart) return;
    charts[id]?.destroy();
    const el = document.getElementById(id);
    if (el) charts[id] = new Chart(el, cfg);
  }
  const monthTick = (dates) => (v, i) => { const d = dates[i]; if (!d) return ""; const prev = dates[i - 1]; return !prev || prev.slice(5, 7) !== d.slice(5, 7) ? new Date(d + "T12:00:00Z").toLocaleString("en-US", { month: "short", timeZone: "UTC" }) : ""; };

  function limitLine(value, label) {
    return {
      id: "limit-" + label,
      afterDatasetsDraw(chart) {
        const { ctx, chartArea, scales } = chart; const x = scales.x.getPixelForValue(value);
        ctx.save(); ctx.strokeStyle = "#f87171"; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x, chartArea.top); ctx.lineTo(x, chartArea.bottom); ctx.stroke();
        ctx.setLineDash([]); ctx.fillStyle = "#f87171"; ctx.font = '600 11px "Fira Code", monospace';
        ctx.fillText(`limit ${value}%`, Math.min(x + 6, chartArea.right - 60), chartArea.bottom - 6); ctx.restore();
      },
    };
  }

  function drawOverviewCharts() {
    const n = Math.min(state.range + 1, A.dates.length);
    const dates = A.dates.slice(-n), p = A.port.slice(-n), s = A.spySeries.slice(-n);
    const pi = p.map((v) => (v / p[0]) * 100), si = s.map((v) => (v / s[0]) * 100);
    draw("perfChart", {
      type: "line",
      data: { labels: dates, datasets: [
        { label: "Your portfolio", data: pi, borderColor: "#22c55e", backgroundColor: (c) => { const g = c.chart.ctx.createLinearGradient(0, 0, 0, 320); g.addColorStop(0, "rgba(34,197,94,.22)"); g.addColorStop(1, "rgba(34,197,94,0)"); return g; }, fill: true, tension: 0.3, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4 },
        { label: "S&P 500 (SPY)", data: si, borderColor: "#64748b", borderDash: [5, 4], tension: 0.3, borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 4 },
      ] },
      options: {
        maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
        plugins: { legend: { display: false },
          tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${c.parsed.y.toFixed(1)} (${fmtPct(c.parsed.y - 100, 1, true)})`, afterBody: (items) => items[0].datasetIndex === 0 || items.length ? [`Value: ${fmtUSD(p[items[0].dataIndex])}`] : [] } } },
        scales: { x: { grid: { display: false }, ticks: { autoSkip: false, maxRotation: 0, callback: monthTick(dates) } }, y: { ticks: { callback: (v) => v.toFixed(0) } } },
      },
    });

    const sl = A.sectorList;
    draw("sectorChart", {
      type: "doughnut",
      data: { labels: sl.map((x) => x[0]), datasets: [{ data: sl.map((x) => +x[1].toFixed(2)), backgroundColor: sl.map((x) => SECTOR_COLORS[x[0]] || "#475569"), borderColor: "#0e1223", borderWidth: 3, hoverOffset: 6 }] },
      options: { maintainAspectRatio: false, cutout: "68%", plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${c.parsed.toFixed(1)}%` } } } },
    });
  }

  function drawRiskCharts() {
    const S = state.settings;
    const pos = [...A.rows].sort((a, b) => b.weight - a.weight);
    const bar = (labels, values, limit, colorFn) => ({
      type: "bar",
      data: { labels, datasets: [{ data: values, backgroundColor: values.map(colorFn), borderRadius: 4, barThickness: 14 }] },
      options: { indexAxis: "y", maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.parsed.x.toFixed(1)}% (limit ${limit}%)` } } },
        scales: { x: { suggestedMax: Math.max(limit * 1.25, ...values) , ticks: { callback: (v) => v + "%" } }, y: { grid: { display: false }, ticks: { font: { family: '"Fira Code", monospace', size: 11 } } } } },
      plugins: [limitLine(limit, labels.length)],
    });
    draw("weightChart", bar(pos.map((r) => r.ticker), pos.map((r) => +r.weight.toFixed(2)), S.maxPosition, (v) => (v > S.maxPosition ? "#f87171" : "#60a5fa")));
    const sl = A.sectorList.filter(([s]) => s !== "Crypto");
    draw("sectorBarChart", bar(sl.map((x) => x[0].replace("Information Technology", "Info Tech").replace("Communication Services", "Comm Services").replace("Consumer Discretionary", "Cons Discretionary")), sl.map((x) => +x[1].toFixed(2)), S.maxSector, (v) => (v > S.maxSector ? "#f87171" : "#a78bfa")));

    draw("ddChart", {
      type: "line",
      data: { labels: A.dates, datasets: [{ label: "Drawdown", data: A.dd.map((v) => +v.toFixed(2)), borderColor: "#f87171", backgroundColor: "rgba(248,113,113,.15)", fill: true, tension: 0.25, borderWidth: 1.5, pointRadius: 0 }] },
      options: { maintainAspectRatio: false, interaction: { mode: "index", intersect: false }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.parsed.y.toFixed(1)}% from peak` } } },
        scales: { x: { grid: { display: false }, ticks: { autoSkip: false, maxRotation: 0, callback: monthTick(A.dates) } }, y: { max: 0, ticks: { callback: (v) => v + "%" } } } },
    });

    const pts = A.rows.filter((r) => isNum(r.vol) && isNum(r.ret1y));
    draw("scatterChart", {
      type: "bubble",
      data: { datasets: [{ data: pts.map((r) => ({ x: +r.vol.toFixed(1), y: +r.ret1y.toFixed(1), r: Math.max(4, Math.sqrt(r.weight) * 3.2), t: r.ticker, w: r.weight })), backgroundColor: pts.map((r) => (SECTOR_COLORS[r.sector] || "#475569") + "b3"), borderColor: pts.map((r) => SECTOR_COLORS[r.sector] || "#475569") }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.raw.t}: vol ${c.raw.x}%, 1Y ${fmtPct(c.raw.y, 1, true)}, weight ${c.raw.w.toFixed(1)}%` } } },
        scales: { x: { title: { display: true, text: "Annualized volatility %" } }, y: { title: { display: true, text: "1Y return %" } } } },
      plugins: [{ id: "lbl", afterDatasetsDraw(ch) { const { ctx } = ch; ctx.save(); ctx.font = '500 10px "Fira Code", monospace'; ctx.fillStyle = "#cbd5e1"; ch.getDatasetMeta(0).data.forEach((el, i) => ctx.fillText(pts[i].ticker, el.x + el.options.radius + 3, el.y + 3)); ctx.restore(); } }],
    });
  }

  // ---------- Views ----------
  function renderOverview() {
    const plTot = A.total - A.costTotal;
    const k = [
      ["Portfolio value", fmtUSD(A.total), `<span class="${cls(A.dayChg)}">${A.dayChg >= 0 ? "+" : ""}${fmtUSD(A.dayChg)} today</span>`],
      ["Unrealized P/L", `<span class="${cls(plTot)}">${plTot >= 0 ? "+" : ""}${fmtUSD(plTot)}</span>`, `<span class="${cls(plTot)}">${fmtPct((plTot / A.costTotal) * 100, 1, true)} on cost</span>`],
      ["1Y return", `<span class="${cls(A.ret1y)}">${fmtPct(A.ret1y, 1, true)}</span>`, `<span class="muted">S&amp;P ${fmtPct(A.spyRet, 1, true)}</span>`],
      ["Beta · Volatility", `${isNum(A.beta) ? A.beta.toFixed(2) : "—"} · ${fmtPct(A.vol, 0)}`, `<span class="muted">Sharpe ${isNum(A.sharpe) ? A.sharpe.toFixed(2) : "—"}</span>`],
      ["Concentration", `${fmtPct(A.top5, 0)}`, `<span class="muted">top 5 · ${A.effN.toFixed(1)} effective names</span>`],
    ];
    $("#kpis").innerHTML = k.map(([a, b, c]) => `<div class="kpi"><div class="k">${a}</div><div class="v">${b}</div><div class="d">${c}</div></div>`).join("");

    const sc = A.score, color = sc >= 80 ? "var(--up)" : sc >= 55 ? "var(--warn)" : "var(--down)";
    const highs = A.alerts.filter((a) => a.sev === "high").length, meds = A.alerts.filter((a) => a.sev === "med").length;
    const verdict = sc >= 80 ? "Within your guidelines" : sc >= 55 ? "Needs attention" : "Off-policy";
    $("#score").innerHTML = `<div class="ring" style="--p:${sc};--c:${color}"><b>${sc}</b></div><div><strong>${verdict}</strong><p>${highs} breach${highs === 1 ? "" : "es"} · ${meds} warning${meds === 1 ? "" : "s"} against the guidelines you set.</p></div>`;
    const top = A.alerts.filter((a) => a.sev !== "info").slice(0, 5);
    $("#alertsMini").innerHTML = top.length ? top.map(alertHTML).join("") : passHTML("No breaches against your guidelines");

    $("#sectorLegend").innerHTML = A.sectorList.map(([s, w]) => `<li class="${w > state.settings.maxSector && s !== "Crypto" ? "over" : ""}"><i style="background:${SECTOR_COLORS[s] || "#475569"}"></i><span>${esc(s)}</span><span>${fmtPct(w)}</span></li>`).join("");
    const ev = A.events.filter((e) => e.days <= 30).slice(0, 6);
    $("#eventsMini").innerHTML = ev.length ? ev.map(eventHTML).join("") : `<li class="empty">No scheduled catalysts for your holdings in the next 30 days.</li>`;
    const nw = allNews().slice(0, 5);
    $("#newsMini").innerHTML = nw.length ? nw.map(newsHTML).join("") : `<li class="empty">No recent headlines in the snapshot.</li>`;
    drawOverviewCharts();
  }

  function renderRisk() {
    $("#alertsFull").innerHTML = A.alerts.map(alertHTML).join("") + A.passes.map(passHTML).join("");
    $("#ruleSummary").textContent = `${A.alerts.filter((a) => a.sev !== "info").length} flagged · ${A.passes.length} passing`;
    const m = [
      ["Annualized volatility", fmtPct(A.vol)], ["Realized beta (1Y weekly)", isNum(A.beta) ? A.beta.toFixed(2) : "—"],
      ["1Y return", fmtPct(A.ret1y, 1, true)], ["S&P 500 1Y", fmtPct(A.spyRet, 1, true)],
      ["Max drawdown", fmtPct(A.maxDD)], [`Sharpe (rf ${fmtPct(A.rf, 2)})`, isNum(A.sharpe) ? A.sharpe.toFixed(2) : "—"],
      ["Tracking error", fmtPct(A.te)], ["Herfindahl index", A.hhi.toFixed(3)],
      ["Effective # of holdings", A.effN.toFixed(1)], ["Top-5 weight", fmtPct(A.top5)],
      ["Weighted P/E", isNum(A.wPE) ? A.wPE.toFixed(1) + "x" : "—"], ["Dividend yield", fmtPct(A.divYield, 2)],
      ["Crypto weight", fmtPct(A.crypto)], ["Largest sector", A.sectorList[0] ? `${A.sectorList[0][0].replace("Information Technology", "Info Tech")} ${fmtPct(A.sectorList[0][1], 0)}` : "—"],
    ];
    $("#metrics").innerHTML = m.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join("");
    drawRiskCharts();
  }

  function renderHoldings() {
    const S = state.settings, f = state.filter.toLowerCase();
    const { key, dir } = state.sort;
    const rows = A.rows.filter((r) => !f || r.ticker.toLowerCase().includes(f) || r.sector.toLowerCase().includes(f) || r.name.toLowerCase().includes(f))
      .sort((a, b) => { const x = a[key], y = b[key]; if (typeof x === "string") return dir * x.localeCompare(y); return dir * ((isNum(x) ? x : -1e15) - (isNum(y) ? y : -1e15)); });
    const maxW = Math.max(...A.rows.map((r) => r.weight), S.maxPosition);
    $("#holdTable tbody").innerHTML = rows.map((r) => {
      const an = r.a?.analyst; const tot = an ? an.buy + an.hold + an.sell : 0;
      const up = an && isNum(an.target) && r.price ? (an.target / r.price - 1) * 100 : null;
      return `<tr>
        <td><div class="asset">${avatar(r.ticker, r.sector)}<div><b>${esc(r.ticker)}</b><small>${esc(r.name)}</small></div></div></td>
        <td>${esc(r.sector)}${r.known ? "" : ' <span class="flag">· no data</span>'}${(S.excluded || []).includes(r.sector) ? ' <span class="flag">· excluded</span>' : ""}</td>
        <td class="num">${fmtNum(r.shares, 4)}</td>
        <td class="num">${fmtUSD(r.price, 2)}</td>
        <td class="num ${cls(r.chg)}">${fmtPct(r.chg, 2, true)}</td>
        <td class="num">${fmtUSD(r.value)}</td>
        <td class="num"><span class="wbar ${r.weight > S.maxPosition ? "over" : ""}"><i style="width:${(r.weight / maxW) * 60}px"></i>${fmtPct(r.weight)}</span></td>
        <td class="num ${cls(r.pl)}">${isNum(r.pl) ? `${r.pl >= 0 ? "+" : ""}${fmtUSD(r.pl)} <small>(${fmtPct(r.plPct, 0, true)})</small>` : "—"}</td>
        <td class="num ${cls(r.ret1y)}">${fmtPct(r.ret1y, 1, true)}</td>
        <td class="num">${isNum(r.beta) ? r.beta.toFixed(2) : "—"}</td>
        <td class="num ${isNum(r.pe) && r.pe > S.maxPE ? "down" : ""}">${isNum(r.pe) ? r.pe.toFixed(1) : "—"}</td>
        <td>${an && tot ? `<div title="${an.buy} buy · ${an.hold} hold · ${an.sell} sell · target ${fmtUSD(an.target, 2)}"><div class="an"><i style="width:${(an.buy / tot) * 100}%"></i><i style="width:${(an.hold / tot) * 100}%"></i><i style="width:${(an.sell / tot) * 100}%"></i></div><small class="muted">${Math.round((an.buy / tot) * 100)}% buy${isNum(up) ? ` · tgt ${fmtPct(up, 0, true)}` : ""}</small></div>` : '<span class="muted">—</span>'}</td>
        <td><button class="icon-btn rm" data-rm="${esc(r.ticker)}" aria-label="Remove ${esc(r.ticker)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg></button></td>
      </tr>`;
    }).join("");
    $$("#holdTable th[data-sort]").forEach((th) => { if (th.dataset.sort === key) th.setAttribute("aria-sort", dir > 0 ? "ascending" : "descending"); else th.removeAttribute("aria-sort"); });
  }

  function renderCalendar() {
    $("#eventsFull").innerHTML = A.events.length ? A.events.map(eventHTML).join("") : `<li class="empty">No upcoming earnings or macro events found for your holdings in the data snapshot.</li>`;
    $("#calNote").textContent = `alerts within ${state.settings.earningsWindow} days`;
    const M = DATA.macro || {}, notes = M.asOfNotes || {};
    const row = (label, k, unit = "%") => [label, isNum(M[k]) ? `${M[k].toFixed(2)}${unit}` : "—", notes[k]];
    const items = [row("Fed funds rate", "fedFunds"), row("10Y Treasury", "tenYear"), row("2Y Treasury", "twoYear"), row("CPI inflation (YoY)", "cpiYoY"), row("Unemployment", "unemployment")];
    if (isNum(M.tenYear) && isNum(M.twoYear)) items.push(["2s10s curve", `${((M.tenYear - M.twoYear) * 100).toFixed(0)} bps`]);
    $("#macroList").innerHTML = items.map(([a, b, n]) => `<div><dt>${a}${n ? `<br><small class="hint">${esc(n)}</small>` : ""}</dt><dd>${b}</dd></div>`).join("");
  }

  function renderNews() {
    const items = allNews();
    const tags = ["All", ...new Set(items.flatMap((n) => (n.tickers?.length ? n.tickers : ["Market"])))];
    if (!tags.includes(state.newsFilter)) state.newsFilter = "All";
    $("#newsChips").innerHTML = tags.map((t) => `<button type="button" class="chip" aria-pressed="${t === state.newsFilter}" data-news="${esc(t)}">${esc(t)}</button>`).join("");
    const f = state.newsFilter;
    const shown = items.filter((n) => f === "All" || (n.tickers?.length ? n.tickers.includes(f) : f === "Market"));
    $("#newsFull").innerHTML = shown.length ? shown.map(newsHTML).join("") : `<li class="empty">No headlines for this filter in the snapshot.</li>`;
  }

  function renderSettings() {
    const S = state.settings;
    $("#settingsGrid").innerHTML = FIELDS.map((f) => `<div class="field"><div class="field-top"><label for="f-${f.key}">${f.label}</label><output id="o-${f.key}" for="f-${f.key}">${fmtSetting(f, S[f.key])}</output></div><input type="range" id="f-${f.key}" data-key="${f.key}" min="${f.min}" max="${f.max}" step="${f.step}" value="${S[f.key]}" /><p class="hint">${f.hint}</p></div>`).join("");
    $("#excludeChips").innerHTML = SECTORS.filter((s) => s !== "Unknown").map((s) => `<button type="button" class="chip ex" data-ex="${esc(s)}" aria-pressed="${(S.excluded || []).includes(s)}">${esc(s)}</button>`).join("");
    const match = Object.entries(PRESETS).find(([, p]) => Object.keys(p).every((k) => p[k] === S[k]));
    $$("#presetSeg button").forEach((b) => b.classList.toggle("on", match?.[0] === b.dataset.preset));
  }
  const fmtSetting = (f, v) => (f.key === "maxBeta" ? Number(v).toFixed(2) : `${v}${f.unit === "d" ? " days" : f.unit}`);

  function renderChrome() {
    const n = A.alerts.filter((a) => a.sev === "high" || a.sev === "med").length;
    const b = $("#alertCount"); b.hidden = !n; b.textContent = n;
    $("#portfolioLabel").textContent = `${state.label} · ${A.rows.length} holdings · ${fmtUSD(A.total)}`;
    const names = DATA.sources.length ? DATA.sources : ["Snapshot unavailable"];
    $("#sourceList").innerHTML = names.map((s) => `<li><span class="dot ${DATA.sources.length ? "" : "off"}"></span>${esc(s)}</li>`).join("");
    $("#asOf").textContent = DATA.asOf ? `Snapshot ${new Date(DATA.asOf).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "";
  }

  const RENDER = { overview: renderOverview, risk: renderRisk, holdings: renderHoldings, calendar: renderCalendar, news: renderNews, settings: renderSettings };
  const TITLES = { overview: "Overview", risk: "Risk review", holdings: "Holdings", calendar: "Calendar", news: "News", settings: "Guidelines" };

  function render() {
    A = analyze();
    renderChrome();
    (RENDER[state.view] || renderOverview)();
  }

  function setView(v) {
    if (!RENDER[v]) v = "overview";
    state.view = v;
    $$(".nav button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.view === v)));
    $$(".view").forEach((s) => (s.hidden = s.id !== "view-" + v));
    $("#viewTitle").textContent = TITLES[v];
    if (location.hash !== "#" + v) history.replaceState(null, "", "#" + v);
    render();
    window.scrollTo({ top: 0 });
  }

  // ---------- Persistence ----------
  function saveHoldings(h, label) {
    state.holdings = h; state.label = label;
    store.set("sentinel.holdings", h); store.set("sentinel.label", label);
    render();
  }
  let saveT;
  function saveSettings() {
    store.set("sentinel.settings", state.settings);
    $("#savedMsg").textContent = "Saved · guidelines rechecked";
    clearTimeout(saveT); saveT = setTimeout(() => ($("#savedMsg").textContent = ""), 1800);
    A = analyze(); renderChrome();
    $$("#presetSeg button").forEach((b) => b.classList.remove("on"));
    const match = Object.entries(PRESETS).find(([, p]) => Object.keys(p).every((k) => p[k] === state.settings[k]));
    if (match) $(`#presetSeg [data-preset="${match[0]}"]`).classList.add("on");
  }

  // ---------- Parsing ----------
  function normTicker(t) { return String(t || "").trim().toUpperCase().replace(/^\$/, "").replace(/-USD$/, ""); }
  function parsePaste(text) {
    const out = [], bad = [];
    text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((line, i) => {
      const parts = line.split(/[\s,;\t]+/).filter(Boolean);
      const t = normTicker(parts[0]), q = parseFloat(String(parts[1] || "").replace(/[$,]/g, "")), c = parseFloat(String(parts[2] || "").replace(/[$,]/g, ""));
      if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(t) || !(q > 0)) bad.push(i + 1); else out.push({ ticker: t, shares: q, cost: isNum(c) && c > 0 ? c : null });
    });
    return { out: merge(out), bad };
  }
  function parseCSV(text) {
    const rows = []; let row = [], cur = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true; else if (ch === ",") { row.push(cur); cur = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; }
      else cur += ch;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    const hi = rows.findIndex((r) => r.some((c) => /symbol|ticker/i.test(c)));
    if (hi < 0) throw new Error("Couldn't find a ticker/symbol column.");
    const h = rows[hi].map((c) => c.trim().toLowerCase());
    const ti = h.findIndex((c) => /^(symbol|ticker)/.test(c));
    const qi = h.findIndex((c) => /(shares|quantity|qty|units)/.test(c));
    let ci = h.findIndex((c) => /(avg|average).*(cost|price)|cost.*(share|unit)|cost_basis|cost basis/.test(c));
    const totalCost = ci >= 0 && /total/.test(h[ci]);
    if (qi < 0) throw new Error("Couldn't find a shares/quantity column.");
    const num = (s) => parseFloat(String(s || "").replace(/[$,\s]/g, ""));
    const out = rows.slice(hi + 1).map((r) => {
      const t = normTicker(r[ti]), sh = num(r[qi]); let c = ci >= 0 ? num(r[ci]) : NaN;
      if (totalCost && sh) c = c / sh;
      return { ticker: t, shares: sh, cost: isNum(c) && c > 0 ? c : null };
    }).filter((x) => /^[A-Z][A-Z0-9.\-]{0,9}$/.test(x.ticker) && x.shares > 0);
    return merge(out);
  }
  function merge(list) {
    const m = new Map();
    list.forEach((x) => { const e = m.get(x.ticker); if (!e) m.set(x.ticker, { ...x }); else { const tot = e.shares + x.shares; e.cost = isNum(e.cost) && isNum(x.cost) ? (e.cost * e.shares + x.cost * x.shares) / tot : e.cost ?? x.cost; e.shares = tot; } });
    return [...m.values()];
  }

  // ---------- Export ----------
  function exportReview() {
    const S = state.settings, lines = [
      `# Portfolio risk review — ${state.label}`, `Snapshot: ${DATA.asOf || "n/a"} · Sources: ${DATA.sources.join(", ")}`, "",
      `Value ${fmtUSD(A.total)} · 1Y ${fmtPct(A.ret1y, 1, true)} (S&P ${fmtPct(A.spyRet, 1, true)}) · Beta ${A.beta?.toFixed(2)} · Vol ${fmtPct(A.vol)} · Max DD ${fmtPct(A.maxDD)} · Health score ${A.score}/100`, "",
      "## Guidelines", ...FIELDS.map((f) => `- ${f.label}: ${fmtSetting(f, S[f.key])}`), `- Excluded sectors: ${(S.excluded || []).join(", ") || "none"}`, "",
      "## Flags", ...A.alerts.map((a) => `- [${sevLabel[a.sev]}] ${a.title} — ${a.detail}`), "", "## Passing", ...A.passes.map((p) => `- ${p}`), "",
      "## Holdings", "| Ticker | Sector | Qty | Value | Weight |", "|---|---|---|---|---|", ...[...A.rows].sort((a, b) => b.weight - a.weight).map((r) => `| ${r.ticker} | ${r.sector} | ${r.shares} | ${fmtUSD(r.value)} | ${fmtPct(r.weight)} |`), "",
      "## Upcoming", ...A.events.map((e) => `- ${e.date}: ${e.kind === "earnings" ? e.ticker + " earnings" : e.title || e.name}`), "",
      "_Flags compare holdings against user-set guidelines. Not investment advice._",
    ];
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/markdown" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "portfolio-risk-review.md" });
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Review exported as Markdown");
  }

  // ---------- Events ----------
  function bind() {
    $$(".nav button").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
    document.addEventListener("click", (e) => {
      const g = e.target.closest("[data-goto]"); if (g) setView(g.dataset.goto);
      const r = e.target.closest("[data-rm]");
      if (r) { const t = r.dataset.rm; saveHoldings(state.holdings.filter((h) => h.ticker !== t), state.label.includes("(edited)") ? state.label : state.label + " (edited)"); toast(`Removed ${t}`); }
      const n = e.target.closest("[data-news]"); if (n) { state.newsFilter = n.dataset.news; renderNews(); }
    });
    window.addEventListener("hashchange", () => setView(location.hash.slice(1)));

    $$("#rangeSeg button").forEach((b) => b.addEventListener("click", () => { state.range = +b.dataset.range; $$("#rangeSeg button").forEach((x) => x.classList.toggle("on", x === b)); drawOverviewCharts(); }));
    $$("#holdTable th[data-sort]").forEach((th) => th.addEventListener("click", () => { const k = th.dataset.sort; state.sort = { key: k, dir: state.sort.key === k ? -state.sort.dir : (["ticker", "sector"].includes(k) ? 1 : -1) }; renderHoldings(); }));
    $("#holdFilter").addEventListener("input", (e) => { state.filter = e.target.value; renderHoldings(); });

    // Settings
    $("#settingsGrid").addEventListener("input", (e) => {
      const k = e.target.dataset.key; if (!k) return;
      state.settings[k] = parseFloat(e.target.value);
      $("#o-" + k).textContent = fmtSetting(FIELDS.find((f) => f.key === k), state.settings[k]);
      saveSettings();
    });
    $("#excludeChips").addEventListener("click", (e) => {
      const c = e.target.closest("[data-ex]"); if (!c) return;
      const s = c.dataset.ex, ex = new Set(state.settings.excluded || []);
      ex.has(s) ? ex.delete(s) : ex.add(s); state.settings.excluded = [...ex];
      c.setAttribute("aria-pressed", String(ex.has(s))); saveSettings();
    });
    $$("#presetSeg button").forEach((b) => b.addEventListener("click", () => { Object.assign(state.settings, PRESETS[b.dataset.preset]); saveSettings(); renderSettings(); toast(`${b.textContent} profile applied`); }));
    $("#resetSettings").addEventListener("click", () => { state.settings = { ...PRESETS.moderate, excluded: [] }; saveSettings(); renderSettings(); });
    $("#exportBtn").addEventListener("click", exportReview);

    // Link dialog
    const dlg = $("#linkDialog");
    let pending = null, ltab = "connect";
    $("#linkBtn").addEventListener("click", () => {
      $("#pasteBox").value = state.holdings.map((h) => `${h.ticker} ${h.shares}${isNum(h.cost) ? " " + +h.cost.toFixed(2) : ""}`).join("\n");
      $("#pasteErr").textContent = ""; $("#csvMsg").textContent = ""; pending = null;
      dlg.showModal();
    });
    $$(".tabs2 button").forEach((b) => b.addEventListener("click", () => {
      ltab = b.dataset.ltab;
      $$(".tabs2 button").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
      $$(".ltab").forEach((p) => (p.hidden = p.dataset.lpanel !== ltab));
    }));
    $("#brokers").innerHTML = BROKERS.map(([n, s]) => `<button type="button" class="broker" data-broker="${esc(n)}"><b>${esc(n)}</b><small>${esc(s)}</small></button>`).join("");
    $("#brokers").addEventListener("click", (e) => { const b = e.target.closest("[data-broker]"); if (b) toast(`Demo: ${b.dataset.broker} read-only OAuth would open here. Use Paste or CSV for now.`); });
    const readFile = (file) => {
      const r = new FileReader();
      r.onload = () => { try { pending = parseCSV(String(r.result)); $("#csvMsg").className = "ok"; $("#csvMsg").textContent = `Parsed ${pending.length} positions from ${file.name}.`; } catch (err) { pending = null; $("#csvMsg").className = "err"; $("#csvMsg").textContent = err.message; } };
      r.readAsText(file);
    };
    $("#csvFile").addEventListener("change", (e) => e.target.files[0] && readFile(e.target.files[0]));
    const drop = $("#drop");
    ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
    drop.addEventListener("drop", (e) => e.dataTransfer.files[0] && readFile(e.dataTransfer.files[0]));
    $("#applyLink").addEventListener("click", () => {
      if (ltab === "paste") {
        const { out, bad } = parsePaste($("#pasteBox").value);
        if (bad.length) { $("#pasteErr").textContent = `Couldn't read line${bad.length > 1 ? "s" : ""} ${bad.join(", ")}. Use TICKER QTY [COST].`; return; }
        if (!out.length) { $("#pasteErr").textContent = "Add at least one position."; return; }
        saveHoldings(out, "My portfolio"); dlg.close(); toast(`Reviewing ${out.length} positions`); setView("risk");
      } else if (ltab === "csv") {
        if (!pending?.length) { $("#csvMsg").className = "err"; $("#csvMsg").textContent = "Choose a CSV first."; return; }
        saveHoldings(pending, "Imported portfolio"); dlg.close(); toast(`Imported ${pending.length} positions`); setView("risk");
      } else toast("Pick Paste holdings or Upload CSV to review real positions in this demo.");
    });
    $("#loadDemo").addEventListener("click", () => { saveHoldings(DEMO_HOLDINGS, "Demo portfolio"); dlg.close(); toast("Demo portfolio loaded"); });
  }

  // ---------- Boot ----------
  async function boot() {
    DATA = await loadData();
    chartDefaults();
    bind();
    if (!Object.keys(DATA.assets).length) toast("Market data snapshot failed to load.");
    setView(state.view);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
