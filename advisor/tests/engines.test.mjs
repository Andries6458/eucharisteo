/* Engine tests: FX conversion, movers screener, allocation splits.
   Run: node --test advisor/tests/ */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { convert, crossRate, fmtMoney, fmtPct, isValidRateTable, fetchRates } from '../assets/js/fx.js';
import { rankMovers, volumeSpikes, byMarket } from '../assets/js/movers.js';
import { computeAllocation, rebalancePlan, walletTotals, holdingValue } from '../assets/js/allocation.js';
import { FALLBACK_FX, BUCKETS } from '../assets/js/config.js';

const RATES = { USD: 1, ZAR: 18.10, GBP: 0.79 };

/* ---------------- FX ---------------- */

test('fx: identity and round-trip conversion', () => {
  assert.equal(convert(100, 'USD', 'USD', RATES), 100);
  const zar = convert(100, 'USD', 'ZAR', RATES);
  assert.ok(Math.abs(zar - 1810) < 1e-9);
  const back = convert(zar, 'ZAR', 'USD', RATES);
  assert.ok(Math.abs(back - 100) < 1e-9);
});

test('fx: GBP<->ZAR cross rate goes through USD', () => {
  const r = crossRate('GBP', 'ZAR', RATES);
  assert.ok(Math.abs(r - 18.10 / 0.79) < 1e-9);
});

test('fx: zero amounts convert to zero', () => {
  assert.equal(convert(0, 'ZAR', 'GBP', RATES), 0);
});

test('fx: massive FX swing stays finite and proportional', () => {
  const crazy = { USD: 1, ZAR: 1e9, GBP: 0.79 };
  const v = convert(5_000_000, 'ZAR', 'USD', crazy);
  assert.ok(Number.isFinite(v));
  assert.ok(Math.abs(v - 0.005) < 1e-12);
});

test('fx: invalid rate tables are rejected loudly', () => {
  assert.equal(isValidRateTable(null), false);
  assert.equal(isValidRateTable({ USD: 1, ZAR: 0, GBP: 0.79 }), false);
  assert.equal(isValidRateTable({ USD: 1, ZAR: -5, GBP: 0.79 }), false);
  assert.equal(isValidRateTable({ USD: 1, ZAR: NaN, GBP: 0.79 }), false);
  assert.equal(isValidRateTable({ USD: 2, ZAR: 18, GBP: 0.79 }), false);
  assert.throws(() => convert(10, 'USD', 'ZAR', { USD: 1 }));
  assert.throws(() => convert(10, 'USD', 'EUR', RATES));
  assert.throws(() => convert(NaN, 'USD', 'ZAR', RATES));
});

test('fx: fetchRates falls back to pinned rates on network failure', async () => {
  const fx = await fetchRates(async () => { throw new Error('offline'); });
  assert.equal(fx.source, 'pinned');
  assert.deepEqual(fx.rates, FALLBACK_FX.rates);
});

test('fx: fetchRates rejects malformed live payloads', async () => {
  const fx = await fetchRates(async () => ({ ok: true, json: async () => ({ rates: { ZAR: -1 } }) }));
  assert.equal(fx.source, 'pinned');
});

test('fx: fetchRates accepts a healthy live payload', async () => {
  const fx = await fetchRates(async () => ({ ok: true, json: async () => ({ date: '2026-07-08', rates: { ZAR: 17.5, GBP: 0.8 } }) }));
  assert.equal(fx.source, 'ecb');
  assert.equal(fx.rates.ZAR, 17.5);
  assert.equal(fx.rates.USD, 1);
});

test('fx: formatting carries the right symbols and signs', () => {
  assert.ok(fmtMoney(1234.5, 'USD').startsWith('$'));
  assert.ok(fmtMoney(1234.5, 'ZAR').startsWith('R'));
  assert.ok(fmtMoney(1234.5, 'GBP').startsWith('£'));
  assert.ok(fmtMoney(50, 'USD', { signed: true }).startsWith('+$'));
  assert.equal(fmtPct(0.0512), '+5.12%');
  assert.equal(fmtPct(-0.0512), '-5.12%');
  assert.equal(fmtPct(NaN), '+0.00%'.replace('+', '')  === '0.00%' ? fmtPct(NaN) : fmtPct(NaN)); // NaN never leaks
  assert.ok(!fmtPct(NaN).includes('NaN'));
});

/* ---------------- movers ---------------- */

const Q = (symbol, changePct, extra = {}) => ({ symbol, name: symbol, market: 'S&P 500', currency: 'USD', price: 100, prevClose: 100, changePct, volume: 1000, avgVolume: 1000, series: [], source: 'test', ...extra });

test('movers: ranks top gainers and losers by magnitude', () => {
  const quotes = [Q('A', 0.05), Q('B', -0.08), Q('C', 0.12), Q('D', -0.01), Q('E', 0.001), Q('F', 0.30), Q('G', -0.2), Q('H', 0.07), Q('I', 0.02), Q('J', -0.03), Q('K', 0.04), Q('L', -0.09)];
  const { gainers, losers } = rankMovers(quotes);
  assert.deepEqual(gainers.map((q) => q.symbol), ['F', 'C', 'H', 'A', 'K']);
  assert.deepEqual(losers.map((q) => q.symbol), ['G', 'L', 'B', 'J', 'D']);
});

test('movers: handles fewer than five symbols and empty input', () => {
  const { gainers, losers } = rankMovers([Q('A', 0.05), Q('B', -0.05)]);
  assert.equal(gainers.length, 1);
  assert.equal(losers.length, 1);
  const empty = rankMovers([]);
  assert.deepEqual(empty, { gainers: [], losers: [] });
  assert.deepEqual(rankMovers(null), { gainers: [], losers: [] });
});

test('movers: quotes without a computable change are excluded, flat is neither', () => {
  const { gainers, losers } = rankMovers([Q('A', null), Q('B', NaN), Q('C', 0), Q('D', 0.01)]);
  assert.deepEqual(gainers.map((q) => q.symbol), ['D']);
  assert.equal(losers.length, 0);
});

test('movers: volume spikes need a positive average volume', () => {
  const spikes = volumeSpikes([
    Q('SPIKE', 0.01, { volume: 5000, avgVolume: 1000 }),
    Q('DIV0', 0.01, { volume: 5000, avgVolume: 0 }),
    Q('QUIET', 0.01, { volume: 900, avgVolume: 1000 }),
    Q('NOVOL', 0.01, { volume: null, avgVolume: 1000 }),
  ]);
  assert.deepEqual(spikes.map((s) => s.symbol), ['SPIKE']);
  assert.equal(spikes[0].volumeRatio, 5);
});

test('movers: byMarket groups quotes', () => {
  const groups = byMarket([Q('A', 0.1), { ...Q('B', 0.1), market: 'JSE' }]);
  assert.equal(groups.get('S&P 500').length, 1);
  assert.equal(groups.get('JSE').length, 1);
});

/* ---------------- allocation ---------------- */

const H = (symbol, units, avgCost, bucket, currency = 'USD') => ({ id: symbol, symbol, units, avgCost, bucket, currency });
const W = (name, balance, currency = 'USD', bucket = 'LOW') => ({ id: name, name, balance, currency, bucket });

test('allocation: zero balances produce zero weights, never NaN', () => {
  const a = computeAllocation({ holdings: [], wallets: [W('empty', 0)], rates: RATES, base: 'USD' });
  assert.equal(a.grandTotal, 0);
  for (const b of BUCKETS) {
    assert.equal(a.weights[b], 0);
    assert.ok(Number.isFinite(a.weights[b]));
  }
  const plan = rebalancePlan(a, 'balanced');
  assert.equal(plan.anyAction, false);
  for (const r of plan.rows) assert.ok(Number.isFinite(r.move));
});

test('allocation: buckets aggregate holdings and wallet cash in base currency', () => {
  const quotes = new Map([['AAPL', { symbol: 'AAPL', price: 200, currency: 'USD' }]]);
  const a = computeAllocation({
    holdings: [H('AAPL', 10, 150, 'HIGH')],
    wallets: [W('ZAR cash', 18_100, 'ZAR')], // = 1,000 USD
    quotesBySymbol: quotes, rates: RATES, base: 'USD',
  });
  assert.equal(a.totals.HIGH, 2000);
  assert.ok(Math.abs(a.totals.LOW - 1000) < 1e-9);
  assert.ok(Math.abs(a.grandTotal - 3000) < 1e-9);
  assert.ok(Math.abs(a.weights.HIGH - 2 / 3) < 1e-9);
});

test('allocation: holding without a live quote falls back to avg cost', () => {
  const v = holdingValue(H('XYZ', 5, 40, 'MEDIUM'), new Map(), RATES, 'USD');
  assert.equal(v, 200);
});

test('allocation: rebalance moves sum to zero and flag drift beyond 5%', () => {
  const a = computeAllocation({
    holdings: [H('AAPL', 100, 100, 'HIGH')], // everything HIGH
    wallets: [], quotesBySymbol: new Map(), rates: RATES, base: 'USD',
  });
  const plan = rebalancePlan(a, 'balanced'); // target HIGH 25%
  const sum = plan.rows.reduce((s, r) => s + r.move, 0);
  assert.ok(Math.abs(sum) < 1e-6);
  const high = plan.rows.find((r) => r.bucket === 'HIGH');
  assert.equal(high.needsAction, true);
  assert.ok(high.move < 0); // trim
});

test('allocation: unknown bucket names are coerced, not dropped', () => {
  const a = computeAllocation({
    holdings: [{ ...H('AAPL', 1, 100, 'MEDIUM'), bucket: 'WILD' }],
    wallets: [{ ...W('w', 100), bucket: 'NOPE' }],
    quotesBySymbol: new Map(), rates: RATES, base: 'USD',
  });
  assert.equal(a.totals.MEDIUM, 100);
  assert.equal(a.totals.LOW, 100);
});

test('allocation: wallet totals convert each currency to base', () => {
  const { rows, total } = walletTotals([W('usd', 100), W('gbp', 79, 'GBP')], RATES, 'USD');
  assert.equal(rows[0].baseValue, 100);
  assert.ok(Math.abs(rows[1].baseValue - 100) < 1e-9);
  assert.ok(Math.abs(total - 200) < 1e-9);
});
