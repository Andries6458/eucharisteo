import { CurrencyCode, FxPairQuote, FxRates, MarketIndex } from '../types';

/**
 * Local-first FX engine.
 *
 * Simulates a live rates feed with a bounded random walk around realistic
 * anchors, ticking every POLL_INTERVAL_MS. Components subscribe via
 * `subscribeToRates` and receive a fresh immutable snapshot each tick, so a
 * single engine instance drives every screen in the app without a server.
 */

export const POLL_INTERVAL_MS = 5000;

const ANCHOR_PER_USD: Record<CurrencyCode, number> = {
  USD: 1,
  ZAR: 18.42,
  GBP: 0.7885,
};

/** Maximum drift from anchor before the walk is pulled back (fraction). */
const MAX_DRIFT = 0.03;
/** Per-tick volatility (fraction of current rate). */
const TICK_VOL = 0.0018;

type RatesListener = (rates: FxRates) => void;

let currentPerUsd: Record<CurrencyCode, number> = { ...ANCHOR_PER_USD };
let tickCount = 0;
let previousPerUsd: Record<CurrencyCode, number> = { ...ANCHOR_PER_USD };
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<RatesListener>();

function snapshot(): FxRates {
  return {
    perUsd: { ...currentPerUsd },
    updatedAt: Date.now(),
    tick: tickCount,
  };
}

function walkOnce(): void {
  previousPerUsd = { ...currentPerUsd };
  (Object.keys(currentPerUsd) as CurrencyCode[]).forEach((code) => {
    if (code === 'USD') return;
    const anchor = ANCHOR_PER_USD[code];
    const shock = (Math.random() * 2 - 1) * TICK_VOL;
    // Mean reversion keeps the mock feed inside a believable band.
    const reversion = ((anchor - currentPerUsd[code]) / anchor) * 0.05;
    let next = currentPerUsd[code] * (1 + shock + reversion);
    const lo = anchor * (1 - MAX_DRIFT);
    const hi = anchor * (1 + MAX_DRIFT);
    next = Math.min(hi, Math.max(lo, next));
    currentPerUsd[code] = next;
  });
  tickCount += 1;
}

function emit(): void {
  const snap = snapshot();
  listeners.forEach((listener) => listener(snap));
}

function ensureTimer(): void {
  if (timer === null && listeners.size > 0) {
    timer = setInterval(() => {
      walkOnce();
      emit();
    }, POLL_INTERVAL_MS);
  }
}

function stopTimerIfIdle(): void {
  if (timer !== null && listeners.size === 0) {
    clearInterval(timer);
    timer = null;
  }
}

/** Subscribe to live rate ticks. Returns an unsubscribe function. */
export function subscribeToRates(listener: RatesListener): () => void {
  listeners.add(listener);
  listener(snapshot());
  ensureTimer();
  return () => {
    listeners.delete(listener);
    stopTimerIfIdle();
  };
}

export function getRatesSnapshot(): FxRates {
  return snapshot();
}

/**
 * Convert an amount between any two supported currencies using a rates
 * snapshot. All cross rates route through USD.
 */
export function convert(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
  rates: FxRates
): number {
  if (from === to) return amount;
  const usdAmount = amount / rates.perUsd[from];
  return usdAmount * rates.perUsd[to];
}

/** Cross rate: how many units of `quote` one unit of `base` buys. */
export function crossRate(
  base: CurrencyCode,
  quote: CurrencyCode,
  rates: FxRates
): number {
  return rates.perUsd[quote] / rates.perUsd[base];
}

function previousCrossRate(base: CurrencyCode, quote: CurrencyCode): number {
  return previousPerUsd[quote] / previousPerUsd[base];
}

/** Live FX pair board used by the Advisory screen. */
export function getFxPairQuotes(rates: FxRates): FxPairQuote[] {
  const pairs: Array<[CurrencyCode, CurrencyCode]> = [
    ['USD', 'ZAR'],
    ['USD', 'GBP'],
    ['GBP', 'ZAR'],
    ['GBP', 'USD'],
    ['ZAR', 'USD'],
    ['ZAR', 'GBP'],
  ];
  return pairs.map(([base, quote]) => {
    const rate = crossRate(base, quote, rates);
    const prev = previousCrossRate(base, quote);
    const changePct = prev === 0 ? 0 : ((rate - prev) / prev) * 100;
    return { pair: `${base}/${quote}`, base, quote, rate, changePct };
  });
}

const INDEX_ANCHORS: MarketIndex[] = [
  { symbol: 'SPX', name: 'S&P 500', region: 'US', value: 6215.4, changePct: 0 },
  { symbol: 'NDX', name: 'Nasdaq 100', region: 'US', value: 22110.8, changePct: 0 },
  { symbol: 'JSE', name: 'JSE All Share', region: 'ZA', value: 96540.2, changePct: 0 },
  { symbol: 'FTSE', name: 'FTSE 100', region: 'UK', value: 8842.6, changePct: 0 },
  { symbol: 'BTC', name: 'Bitcoin (USD)', region: 'Global', value: 108450.0, changePct: 0 },
  { symbol: 'GOLD', name: 'Gold Spot (USD)', region: 'Global', value: 3348.5, changePct: 0 },
];

/**
 * Deterministic pseudo-random index quotes derived from the tick counter so
 * every subscriber renders the same board for a given tick.
 */
export function getMarketIndices(rates: FxRates): MarketIndex[] {
  return INDEX_ANCHORS.map((anchor, i) => {
    const phase = rates.tick * 0.7 + i * 2.3;
    const wobble = Math.sin(phase) * 0.006 + Math.sin(phase * 0.31) * 0.004;
    const value = anchor.value * (1 + wobble);
    const prevWobble =
      Math.sin(phase - 0.7) * 0.006 + Math.sin((phase - 0.7) * 0.31) * 0.004;
    const prevValue = anchor.value * (1 + prevWobble);
    const changePct = ((value - prevValue) / prevValue) * 100;
    return { ...anchor, value, changePct };
  });
}
