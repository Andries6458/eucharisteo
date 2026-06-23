/* ==========================================================================
   EUCHARISTEO INVOICE TRACKER — Calculation engine (pure functions)
   No DOM, no storage. Safe to unit-test and reuse in exports.
   ========================================================================== */

export const PARTIES = {
  VULCAN_EC: {
    key: 'VULCAN_EC',
    name: 'Vulcan Mozambique',
    client: 'Vulcan Mozambique',
    short: 'EC→Vulcan',
    tabLabel: 'EC Trading → Vulcan',
    direction: 'RECEIVABLE',
    defaultCurrency: 'MZN',
    defaultVatMode: 'INCLUSIVE',
    vatRate: 0.16, // Mozambique IVA (16%)
    defaultTermsDays: 30,
    selfEntityKey: 'ECT_LDA',
    selfEntityName: 'EC Trading LDA',
  },
  VULCAN_ECT: {
    key: 'VULCAN_ECT',
    name: 'Vulcan Mozambique',
    client: 'Vulcan Mozambique',
    short: 'ECT→Vulcan',
    tabLabel: 'Eucharisteo Trading → Vulcan',
    direction: 'RECEIVABLE',
    defaultCurrency: 'MZN',
    defaultVatMode: 'INCLUSIVE',
    vatRate: 0.16, // Mozambique IVA (16%)
    defaultTermsDays: 30,
    selfEntityKey: 'EUCHARISTEO_SA',
    selfEntityName: 'Eucharisteo Trading (Pty) Ltd',
  },
  AMSA: {
    key: 'AMSA',
    name: 'AMSA Vanderbijlpark',
    client: 'AMSA Vanderbijlpark',
    short: 'AMSA→ECT',
    tabLabel: 'AMSA → Eucharisteo Trading',
    direction: 'PAYABLE',
    defaultCurrency: 'ZAR',
    defaultVatMode: 'INCLUSIVE',
    vatRate: 0.15, // South African VAT (15%)
    defaultTermsDays: 30,
    selfEntityKey: 'EUCHARISTEO_SA',
    selfEntityName: 'Eucharisteo Trading (Pty) Ltd',
  },
  INYATHI: {
    key: 'INYATHI',
    name: 'Inyathi',
    client: 'Inyathi',
    short: 'INY→ECT',
    tabLabel: 'Inyathi → Eucharisteo Trading',
    direction: 'PAYABLE',
    defaultCurrency: 'ZAR',
    defaultVatMode: 'INCLUSIVE',
    vatRate: 0.15, // South African VAT (15%)
    defaultTermsDays: 30,
    selfEntityKey: 'EUCHARISTEO_SA',
    selfEntityName: 'Eucharisteo Trading (Pty) Ltd',
  },
};

/** Canonical party key, mapping any legacy 'VULCAN' records by currency. */
export function canonicalParty(inv) {
  const p = inv && inv.party;
  if (PARTIES[p]) return p;
  if (p === 'VULCAN') return inv.currency === 'MZN' ? 'VULCAN_EC' : 'VULCAN_ECT';
  return p || 'VULCAN_ECT';
}

export const PARTY_KEYS = ['VULCAN_EC', 'VULCAN_ECT', 'AMSA', 'INYATHI'];

export const VAT_RATE = 0.15; // default VAT fallback

export const CURRENCIES = {
  USD: { code: 'USD', symbol: '$', locale: 'en-US' },
  ZAR: { code: 'ZAR', symbol: 'R', locale: 'en-ZA' },
  MZN: { code: 'MZN', symbol: 'MT', locale: 'pt-MZ' },
  EUR: { code: 'EUR', symbol: '€', locale: 'de-DE' },
  GBP: { code: 'GBP', symbol: '£', locale: 'en-GB' },
};

/* ---------- Number / money helpers ---------- */

export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export function fmtMoney(amount, currency = 'ZAR') {
  const c = CURRENCIES[currency] || CURRENCIES.ZAR;
  const n = round2(amount || 0);
  try {
    return new Intl.NumberFormat(c.locale, {
      style: 'currency',
      currency: c.code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${c.symbol} ${n.toFixed(2)}`;
  }
}

export function fmtNumber(n, dp = 2) {
  return Number(n || 0).toLocaleString('en-ZA', {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}

/* ---------- Date helpers (all UTC-day based so timezones agree) ---------- */

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Whole-day difference a - b (positive if a is later). Date-only, TZ-safe. */
export function dayDiff(aISO, bISO) {
  if (!aISO || !bISO) return null;
  const a = Date.parse(aISO + 'T00:00:00Z');
  const b = Date.parse(bISO + 'T00:00:00Z');
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((a - b) / 86400000);
}

export function addDays(iso, days) {
  const t = Date.parse(iso + 'T00:00:00Z');
  return new Date(t + days * 86400000).toISOString().slice(0, 10);
}

export function fmtDate(iso) {
  if (!iso) return '—';
  const t = Date.parse(iso + 'T00:00:00Z');
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

/* ---------- Invoice maths ---------- */

/** Sum of line items (description, qty, unitPrice). */
export function subtotalOf(items = []) {
  return round2(
    items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0)
  );
}

export function paidOf(payments = []) {
  return round2(payments.reduce((s, p) => s + (Number(p.amount) || 0), 0));
}

/**
 * Full computed view of an invoice. Pure — derives every total, VAT split,
 * balance and ageing metric the UI / exports need.
 */
export function computeInvoice(inv, refISO = todayISO()) {
  const items = inv.items || [];
  const vatMode = inv.vatMode || 'NONE';
  const rate = inv.vatRate != null ? inv.vatRate : (PARTIES[canonicalParty(inv)]?.vatRate ?? VAT_RATE);
  const sub = subtotalOf(items);

  let net, vat, total;
  if (vatMode === 'INCLUSIVE') {
    // entered amounts already include VAT
    total = sub;
    net = round2(sub / (1 + rate));
    vat = round2(total - net);
  } else if (vatMode === 'EXCLUSIVE') {
    net = sub;
    vat = round2(sub * rate);
    total = round2(net + vat);
  } else {
    // NONE (Vulcan — USD, no VAT)
    net = sub;
    vat = 0;
    total = sub;
  }

  const paid = paidOf(inv.payments);
  const balance = round2(total - paid);

  const lastPayment = (inv.payments || [])
    .map((p) => p.date)
    .filter(Boolean)
    .sort()
    .pop() || null;

  const daysSinceIssue = inv.issueDate ? dayDiff(refISO, inv.issueDate) : null;
  const daysToDue = inv.dueDate ? dayDiff(inv.dueDate, refISO) : null; // +future, -past
  const daysOverdue = daysToDue != null && daysToDue < 0 ? -daysToDue : 0;
  const daysSinceLastPayment = lastPayment ? dayDiff(refISO, lastPayment) : null;
  const daysSinceActivity =
    daysSinceLastPayment != null ? daysSinceLastPayment : daysSinceIssue;

  let status; // PAID | PARTIAL | OVERDUE | DUE_SOON | OUTSTANDING
  const partial = paid > 0 && balance > 0.005;
  if (balance <= 0.005 && total > 0) status = 'PAID';
  else if (daysToDue != null && daysToDue < 0) status = 'OVERDUE';
  else if (daysToDue != null && daysToDue <= 7) status = 'DUE_SOON';
  else status = 'OUTSTANDING';

  return {
    ...inv,
    _subtotal: sub,
    _net: net,
    _vat: vat,
    _vatRate: rate,
    _total: total,
    _paid: paid,
    _balance: balance,
    _lastPayment: lastPayment,
    _daysSinceIssue: daysSinceIssue,
    _daysToDue: daysToDue,
    _daysOverdue: daysOverdue,
    _daysSinceLastPayment: daysSinceLastPayment,
    _daysSinceActivity: daysSinceActivity,
    _status: status,
    _partial: partial,
  };
}

export const STATUS_LABEL = {
  PAID: 'Paid',
  PARTIAL: 'Partially paid',
  OVERDUE: 'Overdue',
  DUE_SOON: 'Due soon',
  OUTSTANDING: 'Outstanding',
};

/** Group computed invoices into per-party, per-currency totals. */
export function summarise(invoices, refISO = todayISO()) {
  const computed = invoices.map((i) => computeInvoice(i, refISO));
  const byParty = {};

  for (const inv of computed) {
    const party = canonicalParty(inv);
    const cur = inv.currency || PARTIES[party]?.defaultCurrency || 'ZAR';
    byParty[party] ||= { currencies: {}, count: 0, overdue: 0 };
    const p = byParty[party];
    p.count += 1;
    if (inv._status === 'OVERDUE') p.overdue += 1;

    p.currencies[cur] ||= {
      invoiced: 0, paid: 0, outstanding: 0, vat: 0, net: 0, count: 0, overdue: 0,
    };
    const c = p.currencies[cur];
    c.invoiced = round2(c.invoiced + inv._total);
    c.paid = round2(c.paid + inv._paid);
    c.outstanding = round2(c.outstanding + inv._balance);
    c.vat = round2(c.vat + inv._vat);
    c.net = round2(c.net + inv._net);
    c.count += 1;
    if (inv._status === 'OVERDUE') c.overdue += 1;
  }

  return { computed, byParty };
}

/** Highest overdue tier reached (e.g. 7/14/30/60), or 0 if below the first. */
export function overdueTier(daysOverdue, tiers = [7, 14, 30, 60]) {
  let reached = 0;
  for (const t of tiers) if (daysOverdue >= t) reached = t;
  return reached;
}

/**
 * Build the reminder feed (most urgent first). Supports:
 *  - escalating overdue tiers (with a CRITICAL level at the top tier)
 *  - lead-time nudges before the due date (e.g. 7 / 3 / 1 days out)
 *  - stale invoices (no payment activity for N days)
 */
export function buildReminders(invoices, refISO = todayISO(), opts = {}) {
  const leadTimes = opts.leadTimeDays ?? [7, 3, 1];
  const tiers = opts.overdueTiers ?? [7, 14, 30, 60];
  const stalenessDays = opts.stalenessDays ?? 30;
  const maxLead = Math.max(...leadTimes, 0);
  const topTier = tiers[tiers.length - 1];
  const out = [];

  for (const raw of invoices) {
    const inv = computeInvoice(raw, refISO);
    if (inv._status === 'PAID' || inv._balance <= 0.005) continue;

    if (inv._daysToDue != null && inv._daysToDue < 0) {
      // OVERDUE — escalate by tier
      const d = inv._daysOverdue;
      const tier = overdueTier(d, tiers);
      const critical = d >= topTier;
      out.push({
        level: critical ? 'critical' : 'overdue',
        tier,
        atLeadMark: leadTimes.includes(0), // (not used for overdue)
        priority: 200 + d,
        invoice: inv,
        title: `${ref(inv)} is ${d} day${plural(d)} overdue`
          + (critical ? ' — CRITICAL' : tier ? ` (${tier}+ days)` : ''),
        detail: `${PARTIES[canonicalParty(inv)]?.tabLabel || PARTIES[canonicalParty(inv)]?.name} · balance ${fmtMoney(inv._balance, inv.currency)} · due ${fmtDate(inv.dueDate)}`,
      });
    } else if (inv._daysToDue != null && inv._daysToDue <= maxLead) {
      // DUE SOON — within the lead-time window
      const d = inv._daysToDue;
      out.push({
        level: 'due-soon',
        atLeadMark: leadTimes.includes(d) || d === 0,
        priority: 100 - d,
        invoice: inv,
        title: d === 0 ? `${ref(inv)} is due today` : `${ref(inv)} due in ${d} day${plural(d)}`,
        detail: `${PARTIES[canonicalParty(inv)]?.tabLabel || PARTIES[canonicalParty(inv)]?.name} · balance ${fmtMoney(inv._balance, inv.currency)} · due ${fmtDate(inv.dueDate)}`,
      });
    }

    // STALE — no payment movement for a long time (and not already overdue)
    if (
      inv._daysSinceActivity != null &&
      inv._daysSinceActivity >= stalenessDays &&
      !(inv._daysToDue != null && inv._daysToDue < 0)
    ) {
      out.push({
        level: 'stale',
        priority: 20 + (inv._daysSinceActivity - stalenessDays),
        invoice: inv,
        title: `No payment activity on ${ref(inv)} for ${inv._daysSinceActivity} days`,
        detail: `${PARTIES[canonicalParty(inv)]?.tabLabel || PARTIES[canonicalParty(inv)]?.name} · balance ${fmtMoney(inv._balance, inv.currency)}`,
      });
    }
  }

  return out.sort((a, b) => b.priority - a.priority);
}

/** One-line outstanding totals per party (for the weekly summary banner). */
export function outstandingSummaryLines(invoices, refISO = todayISO()) {
  const { byParty } = summarise(invoices, refISO);
  const lines = [];
  for (const key of PARTY_KEYS) {
    const data = byParty[key];
    if (!data) continue;
    const parts = Object.entries(data.currencies)
      .filter(([, c]) => c.outstanding > 0.005)
      .map(([cur, c]) => fmtMoney(c.outstanding, cur));
    if (parts.length) {
      lines.push({
        party: key,
        name: PARTIES[key].short,
        text: parts.join('  +  '),
        overdue: data.overdue,
      });
    }
  }
  return lines;
}

function ref(inv) {
  return inv.invoiceNumber ? `Invoice ${inv.invoiceNumber}` : 'Invoice';
}
function plural(n) {
  return Math.abs(n) === 1 ? '' : 's';
}
