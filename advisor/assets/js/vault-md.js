/* Obsidian vault builder — turns app state + advisory report into a set of
   Markdown files with YAML frontmatter and wikilinks. Pure functions shared
   by the browser writer (obsidian.js) and the PC sync server, which mirrors
   the vault to disk automatically. */

import { BUCKET_META, BUCKETS, CURRENCY_META } from './config.js';
import { fmtMoney, fmtPct } from './fx.js';
import { localDay } from './store.js';

export const VAULT_FOLDER = 'Eucharisteo Advisor';

const today = () => localDay();

function fm(fields) {
  const lines = Object.entries(fields).map(([k, v]) => `${k}: ${Array.isArray(v) ? `[${v.join(', ')}]` : v}`);
  return `---\n${lines.join('\n')}\n---\n`;
}

function mdTable(header, rows) {
  const h = `| ${header.join(' | ')} |`;
  const sep = `|${header.map(() => '---').join('|')}|`;
  const body = rows.map((r) => `| ${r.join(' | ')} |`).join('\n');
  return `${h}\n${sep}\n${body || `| ${header.map(() => '—').join(' | ')} |`}`;
}

const money = (v, c) => fmtMoney(v, c);

/* Portfolio.md — the always-current snapshot. */
export function portfolioNote(state, report) {
  const c = report.base;
  const holdings = state.holdings.map((h) => {
    const pos = report.allocation.positions.find((p) => p.kind === 'holding' && p.id === h.id);
    return [h.symbol, h.name || '—', String(h.units), h.bucket, money(pos ? pos.value : 0, c)];
  });
  const wallets = report.wallets.rows.map((w) => [w.name, w.currency, money(w.balance, w.currency), money(w.baseValue, c)]);

  return fm({
    type: 'portfolio', updated: report.generatedAt, base_currency: c,
    net_worth: report.netWorth.toFixed(2), tags: ['eucharisteo', 'portfolio'],
  })
  + `# Portfolio\n\n`
  + `**Net worth:** ${money(report.netWorth, c)}  \n`
  + `USD ${money(report.netWorthBy.USD, 'USD')} · ZAR ${money(report.netWorthBy.ZAR, 'ZAR')} · GBP ${money(report.netWorthBy.GBP, 'GBP')}\n\n`
  + `FX (as of ${report.fx.asOf}, ${report.fx.source}): 1 USD = R${report.fx.usdZar.toFixed(2)} · 1 GBP = $${report.fx.gbpUsd.toFixed(2)}\n\n`
  + `## Holdings\n\n${mdTable(['Symbol', 'Name', 'Units', 'Bucket', `Value (${c})`], holdings)}\n\n`
  + `## Wallets\n\n${mdTable(['Wallet', 'Currency', 'Balance', `In ${c}`], wallets)}\n\n`
  + `See [[Allocation]] · [[Advisory Report]] · [[Movers ${today()}]]\n`;
}

/* Allocation.md — 4-way split vs target. */
export function allocationNote(report) {
  const c = report.base;
  const rows = report.rebalance.rows.map((r) => [
    BUCKET_META[r.bucket].label,
    fmtPct(r.actual, { signed: false }),
    fmtPct(r.target, { signed: false }),
    money(r.actualValue, c),
    money(r.move, c),
    r.needsAction ? '⚠️ rebalance' : '✓ on target',
  ]);
  return fm({ type: 'allocation', updated: report.generatedAt, profile: report.rebalance.profile, tags: ['eucharisteo', 'allocation'] })
  + `# Allocation — ${report.rebalance.profile} profile\n\n`
  + `${mdTable(['Bucket', 'Actual', 'Target', `Value (${c})`, `Move (${c})`, 'Status'], rows)}\n\n`
  + BUCKETS.map((b) => `- **${BUCKET_META[b].label}** — ${BUCKET_META[b].hint}`).join('\n')
  + `\n\nBack to [[Portfolio]]\n`;
}

/* Advisory Report.md — recommendations + tax detail. */
export function advisoryNote(report) {
  const t = report.tax;
  let taxBlock = '';
  if (t.residency === 'ZA') {
    const d = t.detail;
    taxBlock = `**SARS ${d.year}** · marginal rate ${fmtPct(d.income.marginalRate, { signed: false, digits: 0 })}\n\n`
      + `- Estimated CGT if all gains realised now: ${money(d.cgt.tax, 'ZAR')} (effective ${fmtPct(d.cgt.effectiveRate, { signed: false })})\n`
      + `- TFSA room: ${money(d.tfsa.room, 'ZAR')} this year · lifetime room ${money(d.tfsa.lifetimeRoom, 'ZAR')}\n`;
  } else if (t.residency === 'UK') {
    const d = t.detail;
    taxBlock = `**HMRC ${d.year}** · ${d.income.band} rate band\n\n`
      + `- Estimated CGT if all gains realised now: ${money(d.cgt.tax, 'GBP')} (AEA applied: ${money(d.cgt.exemptApplied, 'GBP')})\n`
      + `- ISA room: ${money(d.isa.room, 'GBP')} · Personal savings allowance: ${money(d.psa, 'GBP')}\n`;
  } else {
    const d = t.detail;
    taxBlock = `**IRS ${d.year}** · filing ${d.filingStatus}\n\n`
      + `- Short-term (ordinary): ${money(d.shortTerm.tax, 'USD')} · Long-term: ${money(d.longTerm.tax, 'USD')}\n`
      + `- Hold-long saving: ${money(d.holdLongSaving, 'USD')} · NIIT exposure: ${money(d.niit.tax, 'USD')}\n`;
  }

  return fm({ type: 'advisory', updated: report.generatedAt, residency: t.residency, tags: ['eucharisteo', 'advisory'] })
  + `# Advisory Report — ${today()}\n\n`
  + `## Recommendations\n\n${report.recommendations.map((r) => `- ${r.text}`).join('\n')}\n\n`
  + `## Tax position (${t.residency})\n\n${taxBlock}\n`
  + `\nUnrealised gain basis: ${money(t.gain, t.currency)}\n\nBack to [[Portfolio]]\n`;
}

/* Movers YYYY-MM-DD.md — daily market log. */
export function moversNote(report) {
  const row = (q) => [q.symbol, q.name, q.market, fmtPct(q.changePct), `${money(q.price ?? 0, q.currency)}`, q.source];
  return fm({ type: 'movers', date: today(), tags: ['eucharisteo', 'movers'] })
  + `# Top movers — ${today()}\n\n`
  + `## Gainers\n\n${mdTable(['Symbol', 'Name', 'Market', 'Change', 'Price', 'Source'], report.movers.gainers.map(row))}\n\n`
  + `## Losers\n\n${mdTable(['Symbol', 'Name', 'Market', 'Change', 'Price', 'Source'], report.movers.losers.map(row))}\n\n`
  + (report.movers.spikes.length
      ? `## Volume spikes\n\n${mdTable(['Symbol', 'Volume ×avg'], report.movers.spikes.map((s) => [s.symbol, `${s.volumeRatio.toFixed(1)}×`]))}\n\n`
      : '')
  + `Back to [[Portfolio]]\n`;
}

/* The complete file set. Paths are vault-relative. */
export function buildVaultFiles(state, report) {
  return [
    { path: `${VAULT_FOLDER}/Portfolio.md`, content: portfolioNote(state, report) },
    { path: `${VAULT_FOLDER}/Allocation.md`, content: allocationNote(report) },
    { path: `${VAULT_FOLDER}/Advisory Report.md`, content: advisoryNote(report) },
    { path: `${VAULT_FOLDER}/Logs/Movers ${today()}.md`, content: moversNote(report) },
  ];
}

/* Currency sanity used by tests: every supported currency has a symbol. */
export function currencySymbols() {
  return Object.fromEntries(Object.entries(CURRENCY_META).map(([k, v]) => [k, v.symbol]));
}
