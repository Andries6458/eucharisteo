/* ==========================================================================
   EUCHARISTEO INVOICE TRACKER — Calculation engine (pure functions)
   No DOM, no storage. Safe to unit-test and reuse in exports.
   ========================================================================== */

export const PARTIES = {
  VULCAN: {
    key: 'VULCAN',
    name: 'Vulcan Mozambique',
    short: 'Vulcan',
    /* Eucharisteo invoices Vulcan -> money owed TO us (receivable) */
    direction: 'RECEIVABLE',
    defaultCurrency: 'USD',
    defaultVatMode: 'NONE',
  },
  AMSA: {
    key: 'AMSA',
    name: 'AMSA Vanderbijlpark',
    short: 'AMSA',
    /* AMSA invoices Eucharisteo -> money WE owe (payable) */
    direction: 'PAYABLE',
    defaultCurrency: 'ZAR',
    defaultVatMode: 'INCLUSIVE',
  },
};

export const VAT_RATE = 0.15; // 15% South African VAT

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
  const sub = subtotalOf(items);

  let net, vat, total;
  if (vatMode === 'INCLUSIVE') {
    // entered amounts already include VAT (AMSA)
    total = sub;
    net = round2(sub / (1 + VAT_RATE));
    vat = round2(total - net);
  } else if (vatMode === 'EXCLUSIVE') {
    net = sub;
    vat = round2(sub * VAT_RATE);
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
    const party = inv.party || 'VULCAN';
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

/** Build the reminder feed (most urgent first). */
export function buildReminders(invoices, refISO = todayISO(), opts = {}) {
  const dueSoonDays = opts.dueSoonDays ?? 7;
  const stalenessDays = opts.stalenessDays ?? 30;
  const out = [];

  for (const raw of invoices) {
    const inv = computeInvoice(raw, refISO);
    if (inv._status === 'PAID') continue;

    if (inv._status === 'OVERDUE') {
      out.push({
        level: 'overdue',
        priority: 100 + inv._daysOverdue,
        invoice: inv,
        title: `${ref(inv)} is ${inv._daysOverdue} day${plural(inv._daysOverdue)} overdue`,
        detail: `${PARTIES[inv.party]?.name} · balance ${fmtMoney(inv._balance, inv.currency)} · due ${fmtDate(inv.dueDate)}`,
      });
    } else if (inv._daysToDue != null && inv._daysToDue <= dueSoonDays) {
      out.push({
        level: 'due-soon',
        priority: 50 - inv._daysToDue,
        invoice: inv,
        title: `${ref(inv)} due in ${inv._daysToDue} day${plural(inv._daysToDue)}`,
        detail: `${PARTIES[inv.party]?.name} · balance ${fmtMoney(inv._balance, inv.currency)} · due ${fmtDate(inv.dueDate)}`,
      });
    }

    // No movement for a long time
    if (
      inv._balance > 0.005 &&
      inv._daysSinceActivity != null &&
      inv._daysSinceActivity >= stalenessDays &&
      inv._status !== 'OVERDUE'
    ) {
      out.push({
        level: 'stale',
        priority: 10 + (inv._daysSinceActivity - stalenessDays),
        invoice: inv,
        title: `No payment activity on ${ref(inv)} for ${inv._daysSinceActivity} days`,
        detail: `${PARTIES[inv.party]?.name} · balance ${fmtMoney(inv._balance, inv.currency)}`,
      });
    }
  }

  return out.sort((a, b) => b.priority - a.priority);
}

function ref(inv) {
  return inv.invoiceNumber ? `Invoice ${inv.invoiceNumber}` : 'Invoice';
}
function plural(n) {
  return Math.abs(n) === 1 ? '' : 's';
}
