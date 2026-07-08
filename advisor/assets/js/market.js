/* Market data aggregator.
   Provider chain, best first:
     1. relay  — the PC sync server proxies Yahoo Finance over the LAN socket
                 (covers S&P 500, JSE and FTSE symbols).
     2. finnhub — direct polling with the user's free API key (US symbols only).
     3. sim    — deterministic on-device simulator so every screen always works
                 offline; quotes are flagged source:'sim' and the UI labels them.

   A quote is normalised to:
   { symbol, name, market, currency, price, prevClose, changePct, volume,
     avgVolume, series: [{t, price}...], source, asOf } */

import { UNIVERSE, POLL_INTERVAL_MS } from './config.js';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function universeEntry(symbol) {
  return UNIVERSE.find((u) => u.symbol === symbol) || null;
}

/* ---------- deterministic simulator ---------- */

/* mulberry32 PRNG — same seed, same tape, on every device. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const SIM_BASE_PRICE = { 'S&P 500': 180, JSE: 320, FTSE: 24 };

/* Simulate one symbol for a given date (UTC day) + intraday step.
   The walk is seeded per symbol+day so gainers/losers differ day to day
   but every device computes the identical tape. */
export function simulateQuote(symbol, now = new Date()) {
  const entry = universeEntry(symbol);
  const day = now.toISOString().slice(0, 10);
  const daySeed = hashStr(`${symbol}|${day}`);
  const rng = mulberry32(daySeed);

  const base = (SIM_BASE_PRICE[entry?.market] || 100) * (0.5 + rng() * 1.5);
  const prevClose = Math.max(0.01, base);
  const dailyDrift = (rng() - 0.5) * 0.12;            // up to ±6% daily move
  const vol = 0.015 + rng() * 0.02;                    // intraday wobble

  // intraday minutes elapsed drives how much of the day's move has happened
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const progress = Math.min(1, Math.max(0.05, minutes / (24 * 60)));

  const series = [];
  let price = prevClose;
  const steps = 48;
  const stepRng = mulberry32(daySeed ^ 0x9e3779b9);
  for (let i = 1; i <= steps; i++) {
    const frac = i / steps;
    const target = prevClose * (1 + dailyDrift * frac);
    const noise = (stepRng() - 0.5) * vol * prevClose;
    price = Math.max(0.01, target + noise);
    if (frac <= progress) series.push({ t: frac, price: round2(price) });
  }
  const last = series.length ? series[series.length - 1].price : prevClose;

  const avgVolume = Math.round(1e6 * (0.5 + rng() * 4));
  const spike = rng() > 0.85 ? 1.8 + rng() * 2 : 0.6 + rng() * 0.9;
  return normalise({
    symbol,
    price: last,
    prevClose: round2(prevClose),
    volume: Math.round(avgVolume * spike * progress),
    avgVolume,
    series,
    source: 'sim',
    asOf: now.toISOString(),
  });
}

function round2(v) { return Math.round(v * 100) / 100; }

/* ---------- finnhub provider (direct, free key, US symbols) ---------- */

export async function fetchFinnhubQuote(symbol, apiKey, fetchImpl = globalThis.fetch) {
  const entry = universeEntry(symbol);
  if (!entry?.finnhub || !apiKey) return null;
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(entry.finnhub)}&token=${encodeURIComponent(apiKey)}`;
  const res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`finnhub HTTP ${res.status}`);
  const q = await res.json();
  if (!num(q.c) || q.c <= 0) return null; // finnhub returns c:0 for unknown symbols
  return normalise({
    symbol,
    price: q.c,
    prevClose: num(q.pc) || q.c,
    volume: null,
    avgVolume: null,
    series: [],
    source: 'finnhub',
    asOf: new Date((num(q.t) ? q.t * 1000 : Date.now())).toISOString(),
  });
}

/* ---------- normalisation ---------- */

/* Fill identity fields from the universe and derive changePct defensively:
   a missing or zero prevClose must never produce Infinity/NaN in the UI. */
export function normalise(raw) {
  const entry = universeEntry(raw.symbol);
  const price = num(raw.price);
  const prevClose = num(raw.prevClose);
  let changePct = null;
  if (price !== null && prevClose !== null && prevClose > 0) {
    changePct = (price - prevClose) / prevClose;
  }
  return {
    symbol: raw.symbol,
    name: entry?.name || raw.name || raw.symbol,
    market: entry?.market || raw.market || '—',
    currency: entry?.currency || raw.currency || 'USD',
    price,
    prevClose,
    changePct,
    volume: num(raw.volume),
    avgVolume: num(raw.avgVolume),
    series: Array.isArray(raw.series) ? raw.series : [],
    source: raw.source || 'unknown',
    asOf: raw.asOf || new Date().toISOString(),
  };
}

/* ---------- aggregator ---------- */

/* Fetch quotes for `symbols` using the best available provider.
   `relay`   — optional { requestQuotes(symbols) -> Promise<rawQuote[]> } from sync.js
   `finnhubKey` — optional API key for direct polling
   Always resolves with a full quote per symbol (simulator backfills gaps). */
export async function fetchQuotes(symbols, { relay = null, finnhubKey = '', fetchImpl = globalThis.fetch, now = new Date() } = {}) {
  const out = new Map();

  if (relay) {
    try {
      const relayQuotes = await relay.requestQuotes(symbols);
      for (const rq of relayQuotes || []) {
        const q = normalise(rq);
        if (q.price !== null) out.set(q.symbol, q);
      }
    } catch { /* relay down — fall through to the next provider */ }
  }

  if (finnhubKey) {
    const missing = symbols.filter((s) => !out.has(s) && universeEntry(s)?.finnhub);
    const results = await Promise.allSettled(missing.map((s) => fetchFinnhubQuote(s, finnhubKey, fetchImpl)));
    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value) out.set(missing[i], r.value);
    });
  }

  for (const s of symbols) {
    if (!out.has(s)) out.set(s, simulateQuote(s, now));
  }
  return symbols.map((s) => out.get(s));
}

/* Visibility-aware polling loop. Returns a stop() handle.
   `getOptions` is read on every tick so provider settings apply live. */
export function startPolling(symbols, onQuotes, getOptions = () => ({}), intervalMs = POLL_INTERVAL_MS) {
  let timer = null;
  let stopped = false;

  async function tick() {
    if (stopped) return;
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    if (!hidden) {
      try {
        const quotes = await fetchQuotes(symbols, getOptions());
        if (!stopped) onQuotes(quotes);
      } catch (err) {
        if (typeof console !== 'undefined') console.warn('market poll failed', err);
      }
    }
    if (!stopped) timer = setTimeout(tick, intervalMs);
  }

  tick();
  const onVisible = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible' && !stopped) {
      clearTimeout(timer);
      tick();
    }
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);

  return function stop() {
    stopped = true;
    clearTimeout(timer);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
  };
}
