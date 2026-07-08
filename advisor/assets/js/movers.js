/* Top-movers screener — pure functions over normalised quotes. */

import { TOP_N_MOVERS, VOLUME_SPIKE_FACTOR } from './config.js';

const usable = (q) => q && typeof q.changePct === 'number' && Number.isFinite(q.changePct);

/* Top N gainers (changePct > 0) and losers (changePct < 0), each sorted by
   magnitude. Quotes without a computable change are excluded rather than
   treated as 0% so a dead feed can't crowd out real movers. */
export function rankMovers(quotes, topN = TOP_N_MOVERS) {
  const clean = (quotes || []).filter(usable);
  const gainers = clean
    .filter((q) => q.changePct > 0)
    .sort((a, b) => b.changePct - a.changePct)
    .slice(0, topN);
  const losers = clean
    .filter((q) => q.changePct < 0)
    .sort((a, b) => a.changePct - b.changePct)
    .slice(0, topN);
  return { gainers, losers };
}

/* Symbols trading above `factor` × their average volume. Zero/unknown average
   volume can never divide to Infinity — those quotes are skipped. */
export function volumeSpikes(quotes, factor = VOLUME_SPIKE_FACTOR) {
  return (quotes || [])
    .filter((q) => q
      && typeof q.volume === 'number' && Number.isFinite(q.volume)
      && typeof q.avgVolume === 'number' && Number.isFinite(q.avgVolume) && q.avgVolume > 0
      && q.volume / q.avgVolume >= factor)
    .map((q) => ({ ...q, volumeRatio: q.volume / q.avgVolume }))
    .sort((a, b) => b.volumeRatio - a.volumeRatio);
}

/* Group quotes by market for the per-exchange sections of the Movers screen. */
export function byMarket(quotes) {
  const groups = new Map();
  for (const q of quotes || []) {
    if (!q) continue;
    const key = q.market || '—';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(q);
  }
  return groups;
}
