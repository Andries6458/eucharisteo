/* App-layer tests: state store sanitising + last-write-wins, sync URL
   normalisation, market simulator/normaliser, advisory report and the
   Obsidian vault builder. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createStore, sanitiseState, defaultState } from '../assets/js/store.js';
import { normaliseSyncUrl } from '../assets/js/sync.js';
import { simulateQuote, normalise, fetchQuotes } from '../assets/js/market.js';
import { rankMovers } from '../assets/js/movers.js';
import { buildReport, unrealisedGain } from '../assets/js/advisor.js';
import { buildVaultFiles, VAULT_FOLDER } from '../assets/js/vault-md.js';
import { UNIVERSE, FALLBACK_FX } from '../assets/js/config.js';

const RATES = { USD: 1, ZAR: 18.10, GBP: 0.79 };

function memStorage() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
}

/* ---------------- store ---------------- */

test('store: garbage input is rejected, numbers sanitised', () => {
  assert.equal(sanitiseState(null), null);
  assert.equal(sanitiseState('nope'), null);
  assert.equal(sanitiseState({ settings: {} }), null);

  const dirty = defaultState();
  dirty.wallets[0].balance = NaN;
  dirty.holdings = [{ symbol: 'aapl', units: 'ten', avgCost: Infinity, bucket: 'WRONG', currency: 'XXX' }];
  const clean = sanitiseState(dirty);
  assert.equal(clean.wallets[0].balance, 0);
  assert.equal(clean.holdings[0].symbol, 'AAPL');
  assert.equal(clean.holdings[0].units, 0);
  assert.equal(clean.holdings[0].avgCost, 0);
  assert.equal(clean.holdings[0].bucket, 'MEDIUM');
  assert.equal(clean.holdings[0].currency, 'USD');
});

test('store: settings are hard-typed against injection from peers/backups', () => {
  const dirty = defaultState();
  dirty.settings = {
    ...dirty.settings,
    baseCurrency: '<script>', taxResidency: 'XX', riskProfile: 'yolo',
    filingStatus: '"><img>', annualIncome: '5e5', age: '"><b>',
    tfsaContributedYear: {}, isaContributed: [],
  };
  const clean = sanitiseState(dirty).settings;
  assert.equal(clean.baseCurrency, 'USD');
  assert.equal(clean.taxResidency, 'ZA');
  assert.equal(clean.riskProfile, 'balanced');
  assert.equal(clean.filingStatus, 'single');
  assert.equal(clean.annualIncome, 0);
  assert.equal(clean.age, 40);
  assert.equal(clean.tfsaContributedYear, 0);
  assert.equal(clean.isaContributed, 0);
});

test('store: history labels must be YYYY-MM-DD — markup is dropped (XSS hardening)', () => {
  const dirty = defaultState();
  dirty.history = [
    { t: '2026-<img src=x onerror=alert(1)>', value: 1 },
    { t: '2026-07-08', value: 2 },
    { t: 12345, value: 3 },
  ];
  const clean = sanitiseState(dirty);
  assert.deepEqual(clean.history, [{ t: '2026-07-08', value: 2 }]);
});

test('store: an invalid synced FX table is replaced by the pinned fallback', () => {
  const dirty = defaultState();
  dirty.fx = { rates: { ZAR: 18.1 } }; // missing USD/GBP — convert() would throw
  const clean = sanitiseState(dirty);
  assert.deepEqual(clean.fx.rates, FALLBACK_FX.rates);
  const bad2 = { ...defaultState(), fx: { rates: { USD: 2, ZAR: 18, GBP: 0.8 } } };
  assert.deepEqual(sanitiseState(bad2).fx.rates, FALLBACK_FX.rates);
});

test('store: snapshots are rev-neutral so they never race user edits over sync', () => {
  const store = createStore(memStorage());
  const rev0 = store.get().rev;
  store.snapshot(1234);
  assert.equal(store.get().rev, rev0);
  assert.equal(store.get().history.length, 1);
});

test('store: update bumps rev and persists', () => {
  const storage = memStorage();
  const store = createStore(storage);
  const rev0 = store.get().rev;
  store.update((s) => { s.settings.baseCurrency = 'ZAR'; });
  assert.equal(store.get().rev, rev0 + 1);
  assert.equal(store.get().settings.baseCurrency, 'ZAR');
  const store2 = createStore(storage);
  assert.equal(store2.get().settings.baseCurrency, 'ZAR');
});

test('store: last-write-wins accepts only strictly newer remote state', () => {
  const store = createStore(memStorage());
  store.update((s) => { s.settings.baseCurrency = 'GBP'; }); // rev 1

  const stale = { ...store.get(), rev: 0, settings: { ...store.get().settings, baseCurrency: 'USD' } };
  assert.equal(store.applyRemote(stale), false);
  assert.equal(store.get().settings.baseCurrency, 'GBP');

  const newer = { ...store.get(), rev: 99, settings: { ...store.get().settings, baseCurrency: 'ZAR' } };
  assert.equal(store.applyRemote(newer), true);
  assert.equal(store.get().settings.baseCurrency, 'ZAR');
});

test('store: remote state never overwrites device identity or local secrets', () => {
  const store = createStore(memStorage());
  store.update((s) => { s.settings.finnhubKey = 'local-secret'; s.settings.syncUrl = '192.168.0.5'; });
  const myDevice = store.get().deviceId;
  const remote = { ...store.get(), rev: 50, deviceId: 'dev_intruder', settings: { ...store.get().settings, finnhubKey: 'remote-key', syncUrl: 'evil:1' } };
  store.applyRemote(remote);
  assert.equal(store.get().deviceId, myDevice);
  assert.equal(store.get().settings.finnhubKey, 'local-secret');
  assert.equal(store.get().settings.syncUrl, '192.168.0.5');
});

test('store: snapshot keeps one point per day, capped history', () => {
  const store = createStore(memStorage());
  store.snapshot(1000);
  store.snapshot(2000);
  const today = new Date().toISOString().slice(0, 10);
  const points = store.get().history.filter((p) => p.t === today);
  assert.equal(points.length, 1);
  assert.equal(points[0].value, 2000);
  store.snapshot(NaN); // ignored
  assert.equal(store.get().history.filter((p) => p.t === today)[0].value, 2000);
});

/* ---------------- sync url ---------------- */

test('sync: url normalisation accepts hosts, host:port and ws://', () => {
  assert.equal(normaliseSyncUrl('192.168.1.20'), 'ws://192.168.1.20:8765');
  assert.equal(normaliseSyncUrl('192.168.1.20:9000'), 'ws://192.168.1.20:9000');
  assert.equal(normaliseSyncUrl('ws://pc.local:8765'), 'ws://pc.local:8765');
  assert.equal(normaliseSyncUrl('wss://hub.example.com'), 'wss://hub.example.com');
  assert.equal(normaliseSyncUrl(''), null);
  assert.equal(normaliseSyncUrl('http://nope'), null);
  assert.equal(normaliseSyncUrl('bad url with spaces'), null);
});

/* ---------------- market ---------------- */

test('market: simulator is deterministic per symbol and day', () => {
  const at = new Date('2026-07-08T14:00:00Z');
  const a = simulateQuote('AAPL', at);
  const b = simulateQuote('AAPL', at);
  assert.deepEqual(a, b);
  assert.equal(a.source, 'sim');
  assert.ok(a.price > 0);
  assert.ok(Number.isFinite(a.changePct));
});

test('market: normalise never emits Infinity/NaN change', () => {
  assert.equal(normalise({ symbol: 'X', price: 10, prevClose: 0 }).changePct, null);
  assert.equal(normalise({ symbol: 'X', price: null, prevClose: 5 }).changePct, null);
  assert.equal(normalise({ symbol: 'X', price: NaN, prevClose: NaN }).changePct, null);
  const ok = normalise({ symbol: 'X', price: 11, prevClose: 10 });
  assert.ok(Math.abs(ok.changePct - 0.1) < 1e-9);
});

test('market: fetchQuotes backfills every requested symbol via the simulator', async () => {
  const symbols = UNIVERSE.slice(0, 6).map((u) => u.symbol);
  const quotes = await fetchQuotes(symbols, { now: new Date('2026-07-08T14:00:00Z') });
  assert.equal(quotes.length, symbols.length);
  for (const q of quotes) assert.equal(q.source, 'sim');
  const { gainers, losers } = rankMovers(quotes);
  assert.ok(gainers.length + losers.length > 0);
});

test('market: a failing relay falls back cleanly', async () => {
  const relay = { requestQuotes: async () => { throw new Error('down'); } };
  const quotes = await fetchQuotes(['AAPL'], { relay, now: new Date('2026-07-08T14:00:00Z') });
  assert.equal(quotes.length, 1);
  assert.equal(quotes[0].source, 'sim');
});

test('market: relay quotes win over the simulator', async () => {
  const relay = { requestQuotes: async () => [{ symbol: 'AAPL', price: 123.45, prevClose: 120, source: 'yahoo' }] };
  const quotes = await fetchQuotes(['AAPL', 'MSFT'], { relay, now: new Date('2026-07-08T14:00:00Z') });
  assert.equal(quotes[0].source, 'yahoo');
  assert.equal(quotes[0].price, 123.45);
  assert.equal(quotes[1].source, 'sim'); // MSFT backfilled
});

/* ---------------- advisor + vault ---------------- */

function sampleState() {
  const s = defaultState();
  s.settings.baseCurrency = 'USD';
  s.settings.taxResidency = 'ZA';
  s.settings.annualIncome = 500_000;
  s.wallets[1].balance = 18_100; // R -> $1,000
  s.holdings = [
    { id: 'h1', symbol: 'AAPL', name: 'Apple', currency: 'USD', units: 10, avgCost: 100, bucket: 'HIGH', acquiredAt: '2025-01-01' },
    { id: 'h2', symbol: 'STX40', name: 'Satrix 40', currency: 'ZAR', units: 100, avgCost: 80, bucket: 'TAX', acquiredAt: '2025-01-01' },
  ];
  return s;
}

test('advisor: report is finite, converts net worth to all three currencies', async () => {
  const state = sampleState();
  const quotes = await fetchQuotes(UNIVERSE.map((u) => u.symbol), { now: new Date('2026-07-08T14:00:00Z') });
  const report = buildReport(state, quotes, { rates: RATES, asOf: '2026-07-08', source: 'test' });
  assert.ok(Number.isFinite(report.netWorth) && report.netWorth > 0);
  assert.ok(report.netWorthBy.ZAR > report.netWorthBy.USD);
  assert.ok(report.netWorthBy.GBP < report.netWorthBy.USD);
  assert.ok(report.recommendations.length > 0);
  assert.equal(report.tax.residency, 'ZA');
  assert.ok(report.movers.gainers.length <= 5 && report.movers.losers.length <= 5);
});

test('advisor: unrealised gain handles zero units and missing quotes', () => {
  assert.equal(unrealisedGain([], new Map(), RATES, 'USD'), 0);
  const flat = unrealisedGain(
    [{ symbol: 'ZZZ', units: 0, avgCost: 100, currency: 'USD' }], new Map(), RATES, 'USD');
  assert.equal(flat, 0);
  const gain = unrealisedGain(
    [{ symbol: 'AAPL', units: 10, avgCost: 100, currency: 'USD' }],
    new Map([['AAPL', { symbol: 'AAPL', price: 150, currency: 'USD' }]]), RATES, 'USD');
  assert.equal(gain, 500);
});

test('advisor: report works with an empty portfolio and no quotes', () => {
  const report = buildReport(defaultState(), [], { rates: RATES, asOf: 'x', source: 'test' });
  assert.equal(report.netWorth, 0);
  assert.ok(report.recommendations.length > 0);
});

test('vault: builds the four Obsidian notes with frontmatter and wikilinks', async () => {
  const state = sampleState();
  const quotes = await fetchQuotes(UNIVERSE.map((u) => u.symbol), { now: new Date('2026-07-08T14:00:00Z') });
  const report = buildReport(state, quotes, { rates: RATES, asOf: '2026-07-08', source: 'test' });
  const files = buildVaultFiles(state, report);
  assert.equal(files.length, 4);
  for (const f of files) {
    assert.ok(f.path.startsWith(VAULT_FOLDER + '/'), f.path);
    assert.ok(f.content.startsWith('---\n'), `${f.path} has frontmatter`);
    assert.ok(!f.content.includes('NaN'), `${f.path} has no NaN`);
    assert.ok(!f.content.includes('undefined'), `${f.path} has no undefined`);
  }
  const portfolio = files.find((f) => f.path.endsWith('Portfolio.md'));
  assert.ok(portfolio.content.includes('[[Allocation]]'));
  assert.ok(portfolio.content.includes('AAPL'));
  const movers = files.find((f) => f.path.includes('Movers'));
  assert.ok(movers.content.includes('## Gainers'));
});

test('vault: UK and US variants render their own tax blocks', async () => {
  const quotes = await fetchQuotes(['AAPL'], { now: new Date('2026-07-08T14:00:00Z') });
  for (const [res, marker] of [['UK', 'HMRC'], ['US', 'IRS']]) {
    const s = sampleState();
    s.settings.taxResidency = res;
    s.settings.annualIncome = res === 'UK' ? 60_000 : 120_000;
    const report = buildReport(s, quotes, { rates: RATES, asOf: 'x', source: 'test' });
    const advisory = buildVaultFiles(s, report).find((f) => f.path.includes('Advisory'));
    assert.ok(advisory.content.includes(marker), `${res} advisory mentions ${marker}`);
  }
});

test('fx config: fallback table is internally valid', () => {
  assert.equal(FALLBACK_FX.rates.USD, 1);
  assert.ok(FALLBACK_FX.rates.ZAR > 0 && FALLBACK_FX.rates.GBP > 0);
});
