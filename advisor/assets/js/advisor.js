/* Advisory report generator — combines allocation, movers, FX and the
   residency's tax engine into one structured, pure-data report that the UI
   renders and the Obsidian vault writer serialises. */

import { RISK_PROFILES, CURRENCIES } from './config.js';
import { convert, crossRate } from './fx.js';
import { computeAllocation, rebalancePlan, walletTotals } from './allocation.js';
import { rankMovers, volumeSpikes } from './movers.js';
import { usCapitalGainsSummary } from './tax/us.js';
import { zaCapitalGainsSummary } from './tax/za.js';
import { ukCapitalGainsSummary } from './tax/uk.js';

const fin = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

const RESIDENCY_CURRENCY = { US: 'USD', ZA: 'ZAR', UK: 'GBP' };

/* Unrealised gain across holdings, in the given currency. Cost basis uses
   avgCost in the holding's own currency. */
export function unrealisedGain(holdings = [], quotesBySymbol = new Map(), rates, toCurrency = 'USD') {
  let gain = 0;
  for (const h of holdings) {
    const units = fin(h.units);
    if (units === 0) continue;
    const q = quotesBySymbol.get?.(h.symbol);
    const price = q && fin(q.price) > 0 ? q.price : fin(h.avgCost);
    const ccy = q?.currency || h.currency || 'USD';
    const value = convert(units * price, ccy, toCurrency, rates);
    const cost = convert(units * fin(h.avgCost), h.currency || ccy, toCurrency, rates);
    gain += value - cost;
  }
  return gain;
}

/* Residency-specific tax insight on the portfolio's unrealised gains. */
export function taxInsight(state, quotesBySymbol, rates) {
  const residency = state.settings.taxResidency || 'ZA';
  const ccy = RESIDENCY_CURRENCY[residency];
  const gain = Math.max(0, unrealisedGain(state.holdings, quotesBySymbol, rates, ccy));
  const income = fin(state.settings.annualIncome);

  if (residency === 'US') {
    return { residency, currency: ccy, gain, detail: usCapitalGainsSummary({ gain, annualIncome: income, filingStatus: state.settings.filingStatus || 'single' }) };
  }
  if (residency === 'UK') {
    return { residency, currency: ccy, gain, detail: ukCapitalGainsSummary({ gain, annualIncome: income, isa: { contributedThisYear: fin(state.settings.isaContributed) } }) };
  }
  return {
    residency: 'ZA', currency: ccy, gain,
    detail: zaCapitalGainsSummary({
      gain, annualIncome: income, age: fin(state.settings.age) || 40,
      tfsa: { contributedThisYear: fin(state.settings.tfsaContributedYear), lifetimeContributed: fin(state.settings.tfsaContributedLife) },
    }),
  };
}

/* Plain-language recommendations derived from the numbers. */
export function recommendations(report) {
  const recs = [];
  const { rebalance, tax, movers } = report;

  for (const row of rebalance.rows) {
    if (!row.needsAction) continue;
    const dir = row.move > 0 ? 'Add to' : 'Trim';
    recs.push({
      kind: 'rebalance',
      text: `${dir} the ${row.bucket} bucket by about ${Math.abs(row.move).toFixed(0)} ${report.base} — it sits at ${(row.actual * 100).toFixed(1)}% against a ${(row.target * 100).toFixed(0)}% target.`,
    });
  }

  if (tax.residency === 'ZA') {
    const room = tax.detail.tfsa.room;
    if (room > 0) recs.push({ kind: 'tax', text: `You still have R${room.toFixed(0)} of TFSA room this tax year — contributions grow entirely tax-free.` });
    if (tax.detail.tfsa.excess > 0) recs.push({ kind: 'tax', text: `TFSA over-contribution of R${tax.detail.tfsa.excess.toFixed(0)} detected — SARS levies a 40% penalty (R${tax.detail.tfsa.penalty.toFixed(0)}). Stop contributions immediately.` });
    if (tax.gain > 0) recs.push({ kind: 'tax', text: `Unrealised gains of R${tax.gain.toFixed(0)}: the first R40,000 realised per tax year is CGT-free — consider using the annual exclusion before February.` });
  }
  if (tax.residency === 'UK') {
    const room = tax.detail.isa.room;
    if (room > 0) recs.push({ kind: 'tax', text: `£${room.toFixed(0)} of ISA allowance remains this tax year — shelter income-producing assets first.` });
    if (tax.gain > 0) recs.push({ kind: 'tax', text: `Unrealised gains of £${tax.gain.toFixed(0)}: the £3,000 annual exempt amount resets on 6 April — realising up to that is tax-free.` });
  }
  if (tax.residency === 'US' && tax.gain > 0 && tax.detail.holdLongSaving > 0) {
    recs.push({ kind: 'tax', text: `Holding positions past 12 months would cut the tax on current gains by about $${tax.detail.holdLongSaving.toFixed(0)} (long-term 0/15/20% vs ordinary rates).` });
  }

  if (movers.spikes.length > 0) {
    const names = movers.spikes.slice(0, 3).map((s) => s.symbol).join(', ');
    recs.push({ kind: 'market', text: `Unusual volume in ${names} — volume spikes often precede news; review before trading.` });
  }
  if (recs.length === 0) {
    recs.push({ kind: 'ok', text: 'Portfolio is within its target allocation and no tax actions are outstanding. Stay the course.' });
  }
  return recs;
}

/* The full advisory report. `state` is the persisted app state,
   `quotes` the latest normalised quote list. */
export function buildReport(state, quotes, fx) {
  const base = state.settings.baseCurrency || 'USD';
  const rates = fx.rates;
  const quotesBySymbol = new Map((quotes || []).map((q) => [q.symbol, q]));

  const allocation = computeAllocation({ holdings: state.holdings, wallets: state.wallets, quotesBySymbol, rates, base });
  const rebalance = rebalancePlan(allocation, state.settings.riskProfile || 'balanced');
  const wallets = walletTotals(state.wallets, rates, base);
  const { gainers, losers } = rankMovers(quotes || []);
  const spikes = volumeSpikes(quotes || []);
  const tax = taxInsight(state, quotesBySymbol, rates);

  const netWorthBy = {};
  for (const c of CURRENCIES) netWorthBy[c] = convert(allocation.grandTotal, base, c, rates);

  const report = {
    generatedAt: new Date().toISOString(),
    base,
    fx: { asOf: fx.asOf, source: fx.source, usdZar: crossRate('USD', 'ZAR', rates), gbpUsd: crossRate('GBP', 'USD', rates), gbpZar: crossRate('GBP', 'ZAR', rates) },
    netWorth: allocation.grandTotal,
    netWorthBy,
    allocation,
    rebalance,
    wallets,
    movers: { gainers, losers, spikes },
    tax,
    profile: RISK_PROFILES[state.settings.riskProfile || 'balanced'].label,
    dataSources: [...new Set((quotes || []).map((q) => q.source))],
  };
  report.recommendations = recommendations(report);
  return report;
}
