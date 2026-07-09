/* State store — single source of truth, persisted to localStorage, with a
   monotonically increasing revision used by the LAN sync's last-write-wins.
   Subscribers re-render on every mutation. */

import { STORAGE_KEY, FALLBACK_FX, CURRENCIES, BUCKETS, RESIDENCIES, RISK_PROFILES } from './config.js';
import { isValidRateTable } from './fx.js';

const fin = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

const RESIDENCY_CODES = RESIDENCIES.map((r) => r.code);
const PROFILE_KEYS = Object.keys(RISK_PROFILES);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/* The user's local calendar day as YYYY-MM-DD (history keys, note titles). */
export function localDay(d = new Date()) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function defaultState() {
  return {
    schema: 1,
    rev: 0,
    updatedAt: new Date().toISOString(),
    deviceId: makeId('dev'),
    settings: {
      baseCurrency: 'USD',
      taxResidency: 'ZA',
      riskProfile: 'balanced',
      annualIncome: 0,
      age: 40,
      filingStatus: 'single',
      tfsaContributedYear: 0,
      tfsaContributedLife: 0,
      isaContributed: 0,
      finnhubKey: '',
      syncUrl: '',
    },
    wallets: [
      { id: makeId('w'), name: 'USD wallet', currency: 'USD', balance: 0, bucket: 'LOW' },
      { id: makeId('w'), name: 'ZAR wallet', currency: 'ZAR', balance: 0, bucket: 'LOW' },
      { id: makeId('w'), name: 'GBP wallet', currency: 'GBP', balance: 0, bucket: 'LOW' },
    ],
    holdings: [],
    history: [], // [{t: 'YYYY-MM-DD', value: number-in-USD}]
    fx: { ...FALLBACK_FX, rates: { ...FALLBACK_FX.rates } },
  };
}

export function makeId(prefix) {
  const rand = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  return `${prefix}_${rand}`;
}

/* Reject anything that is not structurally a state object; sanitise numbers
   so a corrupted payload (bad sync peer, hand-edited storage) can't poison
   the UI with NaN. */
export function sanitiseState(raw) {
  if (!raw || typeof raw !== 'object' || !raw.settings || !Array.isArray(raw.wallets) || !Array.isArray(raw.holdings)) {
    return null;
  }
  const base = defaultState();
  const merged = { ...base.settings, ...raw.settings };
  // hard-type every settings field: numbers coerced, strings whitelisted,
  // so a bad sync peer or imported backup can never inject markup or NaN
  const settings = {
    baseCurrency: CURRENCIES.includes(merged.baseCurrency) ? merged.baseCurrency : 'USD',
    taxResidency: RESIDENCY_CODES.includes(merged.taxResidency) ? merged.taxResidency : 'ZA',
    riskProfile: PROFILE_KEYS.includes(merged.riskProfile) ? merged.riskProfile : 'balanced',
    filingStatus: ['single', 'married_joint'].includes(merged.filingStatus) ? merged.filingStatus : 'single',
    annualIncome: fin(merged.annualIncome),
    age: fin(merged.age) || 40,
    tfsaContributedYear: fin(merged.tfsaContributedYear),
    tfsaContributedLife: fin(merged.tfsaContributedLife),
    isaContributed: fin(merged.isaContributed),
    finnhubKey: String(merged.finnhubKey || ''),
    syncUrl: String(merged.syncUrl || ''),
  };
  const s = {
    ...base,
    ...raw,
    rev: fin(raw.rev),
    settings,
    wallets: raw.wallets.map((w) => ({
      id: w.id || makeId('w'),
      name: String(w.name || 'Wallet'),
      currency: CURRENCIES.includes(w.currency) ? w.currency : 'USD',
      balance: fin(w.balance),
      bucket: BUCKETS.includes(w.bucket) ? w.bucket : 'LOW',
    })),
    holdings: raw.holdings.map((h) => ({
      id: h.id || makeId('h'),
      symbol: String(h.symbol || '').toUpperCase(),
      name: String(h.name || ''),
      currency: CURRENCIES.includes(h.currency) ? h.currency : 'USD',
      units: fin(h.units),
      avgCost: fin(h.avgCost),
      bucket: BUCKETS.includes(h.bucket) ? h.bucket : 'MEDIUM',
      acquiredAt: h.acquiredAt || null,
    })),
    history: Array.isArray(raw.history)
      ? raw.history.filter((p) => p && typeof p.t === 'string' && DAY_RE.test(p.t) && Number.isFinite(p.value)).slice(-730)
      : [],
  };
  // a synced/imported FX table must satisfy the same invariants convert() enforces
  if (!isValidRateTable(s.fx?.rates)) {
    s.fx = { ...FALLBACK_FX, rates: { ...FALLBACK_FX.rates } };
  } else {
    s.fx = {
      base: 'USD',
      rates: { USD: 1, ZAR: s.fx.rates.ZAR, GBP: s.fx.rates.GBP },
      asOf: String(s.fx.asOf || ''),
      source: String(s.fx.source || 'unknown'),
    };
  }
  return s;
}

export function createStore(storage = globalThis.localStorage) {
  let state = load();
  const listeners = new Set();

  function load() {
    try {
      const raw = storage?.getItem?.(STORAGE_KEY);
      const parsed = raw ? sanitiseState(JSON.parse(raw)) : null;
      return parsed || defaultState();
    } catch {
      return defaultState();
    }
  }

  function persist() {
    try { storage?.setItem?.(STORAGE_KEY, JSON.stringify(state)); } catch { /* quota/private mode */ }
  }

  function emit(meta = {}) {
    for (const fn of listeners) fn(state, meta);
  }

  return {
    get: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    /* Local mutation: bump rev so peers accept it as newer. */
    update(mutator, meta = {}) {
      const next = { ...state };
      mutator(next);
      next.rev = fin(state.rev) + 1;
      next.updatedAt = new Date().toISOString();
      state = sanitiseState(next) || state;
      persist();
      emit({ origin: 'local', ...meta });
      return state;
    },

    /* Remote state from a sync peer: accept only if strictly newer (LWW). */
    applyRemote(remoteRaw) {
      const remote = sanitiseState(remoteRaw);
      if (!remote) return false;
      const newer = remote.rev > state.rev
        || (remote.rev === state.rev && String(remote.updatedAt) > String(state.updatedAt));
      if (!newer) return false;
      remote.deviceId = state.deviceId; // identity never syncs
      remote.settings = { ...remote.settings, syncUrl: state.settings.syncUrl, finnhubKey: state.settings.finnhubKey };
      state = remote;
      persist();
      emit({ origin: 'remote' });
      return true;
    },

    /* Daily portfolio-value snapshot (USD) for the line graph.
       Keyed to the user's LOCAL day. Deliberately rev-neutral and flagged
       'local-snapshot' so automatic snapshots neither race user edits in the
       sync last-write-wins nor spam peers every poll tick. */
    snapshot(valueUSD) {
      if (!Number.isFinite(valueUSD)) return;
      const t = localDay();
      const hist = state.history.filter((p) => p.t !== t);
      hist.push({ t, value: valueUSD });
      state = sanitiseState({ ...state, history: hist.slice(-730) }) || state;
      persist();
      emit({ origin: 'local-snapshot' });
    },

    replaceAll(raw) {
      const next = sanitiseState(raw);
      if (!next) return false;
      state = { ...next, deviceId: state.deviceId, rev: fin(state.rev) + 1, updatedAt: new Date().toISOString() };
      persist();
      emit({ origin: 'local' });
      return true;
    },
  };
}
