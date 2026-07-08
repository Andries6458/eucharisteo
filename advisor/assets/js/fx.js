/* FX engine — USD/ZAR/GBP conversion with live ECB rates and a pinned fallback.
   All rate tables are USD-based: rates[C] = how many C one USD buys. */

import { CURRENCIES, CURRENCY_META, FALLBACK_FX, FX_API } from './config.js';

const isFiniteNum = (v) => typeof v === 'number' && Number.isFinite(v);

/* A rate table is usable when every supported currency has a positive,
   finite rate and USD is exactly 1. */
export function isValidRateTable(rates) {
  if (!rates || typeof rates !== 'object') return false;
  if (rates.USD !== 1) return false;
  return CURRENCIES.every((c) => isFiniteNum(rates[c]) && rates[c] > 0);
}

/* Convert an amount between any two supported currencies.
   Returns 0 for a 0 amount; throws on unknown currencies or a broken table
   so a bad feed can never silently corrupt balances. */
export function convert(amount, from, to, rates) {
  if (!isFiniteNum(amount)) throw new Error(`convert: amount must be a finite number, got ${amount}`);
  if (!CURRENCIES.includes(from)) throw new Error(`convert: unknown currency "${from}"`);
  if (!CURRENCIES.includes(to)) throw new Error(`convert: unknown currency "${to}"`);
  if (!isValidRateTable(rates)) throw new Error('convert: invalid FX rate table');
  if (from === to) return amount;
  return (amount / rates[from]) * rates[to];
}

/* Cross rate: how many `to` one `from` buys. */
export function crossRate(from, to, rates) {
  return convert(1, from, to, rates);
}

/* Format money in its currency's own convention: $1,234.56 / R1 234,56 / £1,234.56.
   Falls back to a plain fixed string if Intl is unavailable. */
export function fmtMoney(amount, currency, { compact = false, signed = false } = {}) {
  const meta = CURRENCY_META[currency];
  if (!meta) throw new Error(`fmtMoney: unknown currency "${currency}"`);
  const value = isFiniteNum(amount) ? amount : 0;
  const sign = signed && value > 0 ? '+' : '';
  try {
    const nf = new Intl.NumberFormat(meta.locale, {
      minimumFractionDigits: compact ? 0 : 2,
      maximumFractionDigits: compact ? 0 : 2,
      ...(compact && Math.abs(value) >= 100_000 ? { notation: 'compact' } : {}),
    });
    return sign + meta.symbol + nf.format(value);
  } catch {
    return sign + meta.symbol + value.toFixed(2);
  }
}

export function fmtPct(fraction, { signed = true, digits = 2 } = {}) {
  const v = isFiniteNum(fraction) ? fraction * 100 : 0;
  const sign = signed && v > 0 ? '+' : '';
  return `${sign}${v.toFixed(digits)}%`;
}

/* Fetch live USD-based rates. `fetchImpl` is injectable for tests/Node.
   On any failure (network, HTTP, malformed body) returns the fallback table —
   the app must always have usable rates. */
export async function fetchRates(fetchImpl = globalThis.fetch) {
  try {
    const res = await fetchImpl(FX_API, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`FX HTTP ${res.status}`);
    const body = await res.json();
    const rates = { USD: 1, ZAR: body?.rates?.ZAR, GBP: body?.rates?.GBP };
    if (!isValidRateTable(rates)) throw new Error('FX response missing rates');
    return { base: 'USD', rates, asOf: body.date || new Date().toISOString().slice(0, 10), source: 'ecb' };
  } catch {
    return { ...FALLBACK_FX, rates: { ...FALLBACK_FX.rates } };
  }
}
