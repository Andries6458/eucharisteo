/* 4-way allocation engine — HIGH / MEDIUM / LOW / TAX buckets.

   Values everything (holdings at live quotes, wallet cash) in the base
   currency, compares actual weights with the risk profile's ideal split,
   and produces concrete rebalancing moves. All functions are pure. */

import { BUCKETS, RISK_PROFILES, DRIFT_THRESHOLD } from './config.js';
import { convert } from './fx.js';

const fin = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/* Market value of one holding in the base currency.
   Quote price wins; avgCost is the stand-in until a quote arrives. */
export function holdingValue(holding, quotesBySymbol, rates, base) {
  const units = fin(holding.units);
  if (units === 0) return 0;
  const q = quotesBySymbol?.get?.(holding.symbol) || null;
  const price = q && typeof q.price === 'number' && Number.isFinite(q.price) && q.price > 0
    ? q.price
    : fin(holding.avgCost);
  const ccy = q?.currency || holding.currency || 'USD';
  return convert(units * price, ccy, base, rates);
}

/* Aggregate portfolio into the four buckets.
   Wallet cash counts toward LOW (cash & low risk) unless the wallet is
   explicitly tagged with another bucket. Returns:
   { totals: {HIGH,MEDIUM,LOW,TAX}, grandTotal, weights, positions } */
export function computeAllocation({ holdings = [], wallets = [], quotesBySymbol = new Map(), rates, base = 'USD' }) {
  const totals = { HIGH: 0, MEDIUM: 0, LOW: 0, TAX: 0 };
  const positions = [];

  for (const h of holdings) {
    const bucket = BUCKETS.includes(h.bucket) ? h.bucket : 'MEDIUM';
    const value = holdingValue(h, quotesBySymbol, rates, base);
    totals[bucket] += value;
    positions.push({ kind: 'holding', id: h.id, label: h.symbol, bucket, value });
  }

  for (const w of wallets) {
    const bucket = BUCKETS.includes(w.bucket) ? w.bucket : 'LOW';
    const value = convert(fin(w.balance), w.currency || base, base, rates);
    totals[bucket] += value;
    positions.push({ kind: 'wallet', id: w.id, label: w.name, bucket, value });
  }

  const grandTotal = BUCKETS.reduce((s, b) => s + totals[b], 0);
  const weights = {};
  for (const b of BUCKETS) weights[b] = grandTotal > 0 ? totals[b] / grandTotal : 0;

  return { totals, grandTotal, weights, positions, base };
}

/* Compare actual weights against a risk profile's ideal split.
   Returns per-bucket target value, drift and the money move (+buy / −sell)
   needed to land exactly on target. */
export function rebalancePlan(allocation, profileKey = 'balanced', driftThreshold = DRIFT_THRESHOLD) {
  const profile = RISK_PROFILES[profileKey] || RISK_PROFILES.balanced;
  const rows = BUCKETS.map((b) => {
    const target = profile.weights[b];
    const actual = allocation.weights[b];
    const targetValue = allocation.grandTotal * target;
    const drift = actual - target;
    return {
      bucket: b,
      target,
      actual,
      targetValue,
      actualValue: allocation.totals[b],
      drift,
      move: targetValue - allocation.totals[b], // >0 buy into bucket, <0 trim
      needsAction: Math.abs(drift) >= driftThreshold && allocation.grandTotal > 0,
    };
  });
  return { profile: profile.label, profileKey, rows, anyAction: rows.some((r) => r.needsAction) };
}

/* Wallet balances converted to the base currency, plus a combined total —
   the "live wallet balances" strip the splits are visualised against. */
export function walletTotals(wallets = [], rates, base = 'USD') {
  const rows = wallets.map((w) => ({
    ...w,
    baseValue: convert(fin(w.balance), w.currency || base, base, rates),
  }));
  return { rows, total: rows.reduce((s, r) => s + r.baseValue, 0) };
}
