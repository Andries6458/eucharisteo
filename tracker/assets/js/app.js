/* ==========================================================================
   EUCHARISTEO INVOICE TRACKER — UI controller
   ========================================================================== */
import {
  initStore, getMode, getUser, onAuth, onInvoices, signIn, signOutUser,
  saveInvoice, deleteInvoice, replaceAll, snapshot, genId,
} from './store.js';
import {
  PARTIES, CURRENCIES, VAT_RATE, computeInvoice, summarise, buildReminders,
  outstandingSummaryLines, fmtMoney, fmtDate, fmtNumber, todayISO, addDays, dayDiff,
  STATUS_LABEL, subtotalOf, paidOf,
} from './calc.js';
import {
  exportExcel, exportPDF, exportInvoicePDF, parseTable,
} from './export.js';
import { APP, ENTITIES, isFirebaseConfigured } from './config.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));

let state = { invoices: [], filter: 'ALL', search: '' };

/* ============================ boot ============================ */
(async function boot() {
  const { mode } = await initStore();
  paintModeBadge(mode);
  setupLoginUI(mode);

  onAuth((user) => {
    if (user) {
      $('#login').classList.add('hidden');
      $('#app').classList.remove('hidden');
      $('#user-email').textContent = user.email || '';
    } else {
      $('#app').classList.add('hidden');
      $('#login').classList.remove('hidden');
    }
  });

  onInvoices((list) => {
    state.invoices = list;
    if (getUser()) renderAll();
  });

  wireChrome();
})();

function paintModeBadge(mode) {
  const b = $('#mode-badge');
  if (mode === 'cloud') { b.textContent = 'Cloud · synced'; b.className = 'mode-badge mode-cloud'; }
  else { b.textContent = 'Local device'; b.className = 'mode-badge mode-local'; }
}

function setupLoginUI(mode) {
  const note = $('#login-note');
  const pwField = $('#pw-field');
  if (mode === 'local') {
    $('#login-btn').textContent = 'Continue (local mode)';
    pwField.classList.add('hidden');
    $('#password').required = false;
    note.innerHTML = 'Running in <b>local mode</b> — data is saved on this device only. '
      + 'To share live with up to 6 users across devices/countries, add your Firebase '
      + 'keys in <code>assets/js/config.js</code> (see the README).';
  } else {
    note.innerHTML = 'Cloud sync is active. Use the email &amp; password set up for you in Firebase. '
      + 'Up to 6 Eucharisteo users share the same live data.';
  }

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#login-error');
    err.classList.remove('show');
    const btn = $('#login-btn');
    btn.disabled = true;
    try {
      await signIn($('#email').value, $('#password').value);
    } catch (ex) {
      err.textContent = friendlyAuthError(ex);
      err.classList.add('show');
    } finally {
      btn.disabled = false;
    }
  });
}

function friendlyAuthError(ex) {
  const c = ex?.code || '';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found'))
    return 'Email or password is incorrect.';
  if (c.includes('too-many-requests')) return 'Too many attempts. Please wait and try again.';
  if (c.includes('network')) return 'Network error — check your connection.';
  return ex?.message || 'Sign-in failed.';
}

/* ============================ chrome ============================ */
function wireChrome() {
  $('#signout').addEventListener('click', () => signOutUser());
  $('#fab').addEventListener('click', () => openInvoiceModal(null));

  $$('#party-tabs .tab').forEach((t) => t.addEventListener('click', () => {
    $$('#party-tabs .tab').forEach((x) => x.classList.remove('active'));
    t.classList.add('active');
    state.filter = t.dataset.party;
    renderTable();
  }));

  $('#search').addEventListener('input', (e) => { state.search = e.target.value.toLowerCase(); renderTable(); });

  $('#btn-excel').addEventListener('click', () =>
    safe(() => exportExcel(filteredRaw(), todayISO(), state.filter === 'ALL' ? null : state.filter), 'Excel exported'));
  $('#btn-pdf').addEventListener('click', () =>
    safe(() => exportPDF(filteredRaw(), todayISO(), state.filter === 'ALL' ? null : state.filter), 'PDF exported'));

  $('#btn-paste').addEventListener('click', openPasteModal);
  $('#btn-menu').addEventListener('click', openMenu);
  $('#bell').addEventListener('click', () => $('#reminders-panel').scrollIntoView({ behavior: 'smooth' }));
  $('#notify-toggle').addEventListener('click', requestNotifications);

  updateNotifyButton();
}

/* ============================ render ============================ */
function renderAll() {
  renderSummary();
  renderReminders();
  renderTable();
}

function renderSummary() {
  const host = $('#summary');
  host.innerHTML = '';
  const { byParty } = summarise(state.invoices, todayISO());

  for (const key of ['VULCAN', 'AMSA']) {
    const meta = PARTIES[key];
    const data = byParty[key];
    const card = el('div', 'pcard');
    const flow = meta.direction === 'RECEIVABLE'
      ? `Receivable · ${meta.selfEntityName} invoices ${meta.short}`
      : `Payable · ${meta.short} invoices ${meta.selfEntityName}`;
    let html = `<h3>${esc(meta.name)}${data?.overdue ? `<span class="pill pill-red">${data.overdue} overdue</span>` : ''}</h3>`
      + `<div class="flow">${flow}</div>`;
    if (!data) {
      html += '<div class="empty">No invoices yet</div>';
    } else {
      for (const [cur, c] of Object.entries(data.currencies)) {
        html += `<div class="cur-block">`
          + `<div class="metric-row"><span class="lbl">${cur} · invoiced (${c.count})</span><span class="val">${esc(fmtMoney(c.invoiced, cur))}</span></div>`
          + `<div class="metric-row"><span class="lbl">Paid</span><span class="val paid">${esc(fmtMoney(c.paid, cur))}</span></div>`
          + `<div class="metric-row"><span class="lbl">Outstanding</span><span class="val out">${esc(fmtMoney(c.outstanding, cur))}</span></div>`
          + (c.vat ? `<div class="metric-row"><span class="lbl">of which VAT</span><span class="val">${esc(fmtMoney(c.vat, cur))}</span></div>` : '')
          + `</div>`;
      }
    }
    card.innerHTML = html;
    host.appendChild(card);
  }
}

function reminderOpts() {
  return {
    leadTimeDays: APP.leadTimeDays,
    overdueTiers: APP.overdueTiers,
    stalenessDays: APP.stalenessDays,
  };
}

function renderReminders() {
  const today = todayISO();
  const list = buildReminders(state.invoices, today, reminderOpts());
  const host = $('#reminders-list');
  host.innerHTML = '';

  // weekly outstanding summary banner
  const sumHost = $('#reminders-summary');
  const sum = outstandingSummaryLines(state.invoices, today);
  if (sumHost) {
    if (sum.length) {
      sumHost.classList.remove('hidden');
      sumHost.innerHTML = '<span class="sum-label">Outstanding</span>' + sum.map((s) =>
        `<span class="sum-chip"><b>${esc(PARTIES[s.party].short)}</b> ${esc(s.text)}`
        + `${s.overdue ? ` <span class="sum-od">${s.overdue} overdue</span>` : ''}</span>`).join('');
    } else {
      sumHost.classList.add('hidden');
      sumHost.innerHTML = '';
    }
  }

  const count = list.filter((r) => ['critical', 'overdue', 'due-soon'].includes(r.level)).length;
  const bc = $('#bell-count');
  if (count > 0) { bc.textContent = count > 99 ? '99+' : count; bc.classList.remove('hidden'); }
  else bc.classList.add('hidden');

  if (!list.length) {
    host.innerHTML = '<div class="empty">Nothing due — all invoices are on track. 🎉</div>';
    return;
  }
  list.slice(0, 20).forEach((r) => {
    const item = el('div', `rem-item rem-${r.level}`);
    item.innerHTML = `<span class="rem-dot"></span><div><div class="t">${esc(r.title)}</div><div class="d">${esc(r.detail)}</div></div>`;
    item.addEventListener('click', () => openInvoiceModal(r.invoice.id));
    host.appendChild(item);
  });
}

function filteredRaw() {
  let rows = state.invoices.slice();
  if (state.filter !== 'ALL') rows = rows.filter((i) => i.party === state.filter);
  if (state.search) {
    const q = state.search;
    rows = rows.filter((i) =>
      (i.invoiceNumber || '').toLowerCase().includes(q) ||
      (i.notes || '').toLowerCase().includes(q) ||
      (i.ctNumbers || []).some((ct) => String(ct).toLowerCase().includes(q)));
  }
  return rows;
}

function renderTable() {
  const body = $('#inv-body');
  body.innerHTML = '';
  const rows = filteredRaw().map((i) => computeInvoice(i, todayISO()));
  rows.sort((a, b) => {
    const order = { OVERDUE: 0, DUE_SOON: 1, OUTSTANDING: 2, PAID: 3 };
    if (order[a._status] !== order[b._status]) return order[a._status] - order[b._status];
    return (a.dueDate || '').localeCompare(b.dueDate || '');
  });

  $('#empty-state').classList.toggle('hidden', rows.length > 0);

  for (const i of rows) {
    const tr = el('tr');
    const cts = (i.ctNumbers || []).slice(0, 4).map((c) => `<span class="ct-chip">${esc(c)}</span>`).join(' ')
      + ((i.ctNumbers || []).length > 4 ? ` <span class="muted">+${i.ctNumbers.length - 4}</span>` : '');
    const overdueTxt = i._daysOverdue ? ` <span class="muted">${i._daysOverdue}d</span>` : '';
    const partial = i._partial ? '<span class="partial-tag">partial</span>' : '';
    tr.innerHTML =
      `<td class="nowrap">${esc(PARTIES[i.party]?.short || i.party)}</td>` +
      `<td class="nowrap"><b>${esc(i.invoiceNumber || '—')}</b></td>` +
      `<td>${cts || '<span class="muted">—</span>'}</td>` +
      `<td class="nowrap">${fmtDate(i.issueDate)}</td>` +
      `<td class="nowrap">${fmtDate(i.dueDate)}</td>` +
      `<td><span class="badge badge-${i._status.toLowerCase()}">${STATUS_LABEL[i._status]}</span>${overdueTxt}${partial}</td>` +
      `<td class="num">${esc(fmtMoney(i._total, i.currency))}</td>` +
      `<td class="num">${esc(fmtMoney(i._paid, i.currency))}</td>` +
      `<td class="num"><b>${esc(fmtMoney(i._balance, i.currency))}</b></td>`;
    tr.addEventListener('click', () => openInvoiceModal(i.id));
    body.appendChild(tr);
  }
}

/* ============================ invoice modal ============================ */
function blankInvoice(party = 'VULCAN') {
  const meta = PARTIES[party];
  return {
    id: null, party,
    invoiceNumber: '', ctNumbers: [],
    currency: meta.defaultCurrency, vatMode: meta.defaultVatMode,
    issueDate: todayISO(), dueDate: addDays(todayISO(), meta.defaultTermsDays ?? 30),
    items: [{ description: '', qty: 1, unitPrice: 0 }],
    payments: [], notes: '',
  };
}

function openInvoiceModal(id) {
  const existing = id ? state.invoices.find((i) => i.id === id) : null;
  // deep clone so edits aren't applied until Save
  const draft = existing ? JSON.parse(JSON.stringify(existing)) : blankInvoice();
  if (!draft.items?.length) draft.items = [{ description: '', qty: 1, unitPrice: 0 }];

  const host = $('#modal-host');
  host.innerHTML = '';
  const overlay = el('div', 'modal-overlay');
  const modal = el('div', 'modal');
  overlay.appendChild(modal);
  host.appendChild(overlay);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  function close() { host.innerHTML = ''; }

  const curOptions = Object.keys(CURRENCIES)
    .map((c) => `<option value="${c}" ${draft.currency === c ? 'selected' : ''}>${c}</option>`).join('');
  const partyOptions = Object.values(PARTIES)
    .map((p) => `<option value="${p.key}" ${draft.party === p.key ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  const vatOptions = [['NONE', 'No VAT'], ['INCLUSIVE', 'VAT included (15%)'], ['EXCLUSIVE', 'Add VAT (15%)']]
    .map(([v, l]) => `<option value="${v}" ${draft.vatMode === v ? 'selected' : ''}>${l}</option>`).join('');

  modal.innerHTML = `
    <div class="modal-head">
      <h2>${id ? 'Edit invoice' : 'New invoice'}</h2>
      <button class="close-x" data-act="close">&times;</button>
    </div>
    <div class="modal-body">
      <div class="grid2">
        <div class="field"><label>Party</label><select id="f-party">${partyOptions}</select></div>
        <div class="field"><label>Invoice number</label><input id="f-num" value="${esc(draft.invoiceNumber)}" placeholder="e.g. INV-0420"></div>
      </div>
      <div id="f-entity-note" class="entity-note"></div>
      <div class="field">
        <label>CT numbers <span class="muted" style="text-transform:none;letter-spacing:0">— type and press Enter (or paste comma/space separated)</span></label>
        <div class="chips" id="f-chips"><input id="f-chip-input" placeholder="Add CT number…"></div>
      </div>
      <div class="grid3">
        <div class="field"><label>Currency</label><select id="f-cur">${curOptions}</select></div>
        <div class="field"><label>VAT treatment</label><select id="f-vat">${vatOptions}</select></div>
        <div class="field"><label>&nbsp;</label><button class="btn btn-sm" id="f-apply-defaults" type="button">↺ Party defaults</button></div>
      </div>
      <div class="grid2">
        <div class="field"><label>Issue date</label><input id="f-issue" type="date" value="${esc(draft.issueDate || '')}"></div>
        <div class="field"><label>Due date</label><input id="f-due" type="date" value="${esc(draft.dueDate || '')}">
          <div style="margin-top:.3rem;display:flex;gap:.3rem;flex-wrap:wrap">
            ${[14, 30, 45, 60].map((d) => `<button type="button" class="btn btn-sm btn-ghost" data-terms="${d}">+${d}d</button>`).join('')}
          </div>
        </div>
      </div>

      <div class="subtle-head"><h4>Line items</h4><button class="btn btn-sm" id="f-paste-items" type="button">⎘ Paste rows</button></div>
      <table class="lines"><thead><tr>
        <th style="width:48%">Description</th><th style="width:14%">Qty</th>
        <th style="width:20%">Unit price</th><th style="width:16%" class="right">Line total</th><th></th>
      </tr></thead><tbody id="f-items"></tbody></table>
      <button class="btn btn-sm" id="f-add-item" type="button" style="margin-top:.5rem">+ Add line</button>

      <div class="totals-box" id="f-totals"></div>

      <div class="subtle-head"><h4>Payments ${PARTIES[draft.party]?.direction === 'RECEIVABLE' ? 'received' : 'made'}</h4></div>
      <table class="lines"><thead><tr>
        <th style="width:30%">Date</th><th style="width:30%">Amount</th><th>Note</th><th></th>
      </tr></thead><tbody id="f-pays"></tbody></table>
      <button class="btn btn-sm" id="f-add-pay" type="button" style="margin-top:.5rem">+ Record payment</button>

      <div class="field" style="margin-top:1.2rem"><label>Notes</label><textarea id="f-notes" placeholder="Internal notes…">${esc(draft.notes || '')}</textarea></div>
      ${existing ? `<p class="muted" style="font-size:.75rem">Created by ${esc(existing.createdBy || '—')} · last updated ${esc((existing.updatedAt || '').slice(0, 16).replace('T', ' '))} by ${esc(existing.updatedBy || '—')}</p>` : ''}
    </div>
    <div class="modal-foot">
      <div>${id ? '<button class="btn btn-danger" data-act="delete">Delete</button>' : ''}</div>
      <div style="display:flex;gap:.6rem;flex-wrap:wrap">
        ${id ? '<button class="btn" data-act="pdf">⬇ Invoice PDF</button>' : ''}
        <button class="btn btn-ghost" data-act="close">Cancel</button>
        <button class="btn btn-primary" data-act="save">${id ? 'Save changes' : 'Create invoice'}</button>
      </div>
    </div>`;

  /* ---- CT chips ---- */
  const chipsBox = $('#f-chips', modal);
  const chipInput = $('#f-chip-input', modal);
  function renderChips() {
    $$('.chip', chipsBox).forEach((c) => c.remove());
    draft.ctNumbers.forEach((ct, idx) => {
      const chip = el('span', 'chip', `${esc(ct)} <button type="button" data-i="${idx}">&times;</button>`);
      chip.querySelector('button').addEventListener('click', () => { draft.ctNumbers.splice(idx, 1); renderChips(); });
      chipsBox.insertBefore(chip, chipInput);
    });
  }
  function addChips(raw) {
    raw.split(/[,;\n\t ]+/).map((s) => s.trim()).filter(Boolean).forEach((c) => {
      if (!draft.ctNumbers.includes(c)) draft.ctNumbers.push(c);
    });
    renderChips();
  }
  chipInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addChips(chipInput.value); chipInput.value = ''; }
    else if (e.key === 'Backspace' && !chipInput.value && draft.ctNumbers.length) { draft.ctNumbers.pop(); renderChips(); }
  });
  chipInput.addEventListener('paste', (e) => { e.preventDefault(); addChips((e.clipboardData || window.clipboardData).getData('text')); });
  chipInput.addEventListener('blur', () => { if (chipInput.value.trim()) { addChips(chipInput.value); chipInput.value = ''; } });
  renderChips();

  /* ---- items ---- */
  const itemsBody = $('#f-items', modal);
  function renderItems() {
    itemsBody.innerHTML = '';
    draft.items.forEach((it, idx) => {
      const tr = el('tr');
      const lt = (Number(it.qty) || 0) * (Number(it.unitPrice) || 0);
      tr.innerHTML =
        `<td><input data-f="description" data-i="${idx}" value="${esc(it.description)}" placeholder="Description"></td>` +
        `<td class="num"><input data-f="qty" data-i="${idx}" type="number" step="any" value="${esc(it.qty)}"></td>` +
        `<td class="num"><input data-f="unitPrice" data-i="${idx}" type="number" step="any" value="${esc(it.unitPrice)}"></td>` +
        `<td class="lt">${esc(fmtMoney(lt, draft.currency))}</td>` +
        `<td><button type="button" class="row-x" data-del="${idx}">&times;</button></td>`;
      itemsBody.appendChild(tr);
    });
    renderTotals();
  }
  itemsBody.addEventListener('input', (e) => {
    const t = e.target; if (!t.dataset.f) return;
    const it = draft.items[+t.dataset.i];
    it[t.dataset.f] = t.dataset.f === 'description' ? t.value : t.value;
    // update only the line total + totals without full re-render (keep focus)
    const row = t.closest('tr');
    const lt = (Number(it.qty) || 0) * (Number(it.unitPrice) || 0);
    row.querySelector('.lt').textContent = fmtMoney(lt, draft.currency);
    renderTotals();
  });
  itemsBody.addEventListener('click', (e) => {
    const d = e.target.dataset.del; if (d == null) return;
    draft.items.splice(+d, 1);
    if (!draft.items.length) draft.items.push({ description: '', qty: 1, unitPrice: 0 });
    renderItems();
  });
  $('#f-add-item', modal).addEventListener('click', () => { draft.items.push({ description: '', qty: 1, unitPrice: 0 }); renderItems(); });
  $('#f-paste-items', modal).addEventListener('click', () => pasteIntoItems(draft, renderItems));

  /* ---- totals ---- */
  function renderTotals() {
    const c = computeInvoice(draft, todayISO());
    $('#f-totals', modal).innerHTML =
      `<div class="metric-row"><span class="lbl">Subtotal</span><span class="val">${esc(fmtMoney(c._subtotal, draft.currency))}</span></div>` +
      (c._vat ? `<div class="metric-row"><span class="lbl">Net</span><span class="val">${esc(fmtMoney(c._net, draft.currency))}</span></div>
                 <div class="metric-row"><span class="lbl">VAT (15%)</span><span class="val">${esc(fmtMoney(c._vat, draft.currency))}</span></div>` : '') +
      `<div class="metric-row grand"><span class="lbl">Invoice total</span><span class="val">${esc(fmtMoney(c._total, draft.currency))}</span></div>` +
      `<div class="metric-row"><span class="lbl">Paid</span><span class="val paid">${esc(fmtMoney(c._paid, draft.currency))}</span></div>` +
      `<div class="metric-row"><span class="lbl">Balance</span><span class="val out">${esc(fmtMoney(c._balance, draft.currency))}</span></div>`;
  }

  /* ---- payments ---- */
  const paysBody = $('#f-pays', modal);
  function renderPays() {
    paysBody.innerHTML = '';
    draft.payments.forEach((p, idx) => {
      const tr = el('tr');
      tr.innerHTML =
        `<td><input data-pf="date" data-i="${idx}" type="date" value="${esc(p.date || '')}"></td>` +
        `<td><input data-pf="amount" data-i="${idx}" type="number" step="any" value="${esc(p.amount)}"></td>` +
        `<td><input data-pf="note" data-i="${idx}" value="${esc(p.note || '')}" placeholder="ref / note"></td>` +
        `<td><button type="button" class="row-x" data-delp="${idx}">&times;</button></td>`;
      paysBody.appendChild(tr);
    });
    renderTotals();
  }
  paysBody.addEventListener('input', (e) => {
    const t = e.target; if (!t.dataset.pf) return;
    draft.payments[+t.dataset.i][t.dataset.pf] = t.value;
    renderTotals();
  });
  paysBody.addEventListener('click', (e) => {
    const d = e.target.dataset.delp; if (d == null) return;
    draft.payments.splice(+d, 1); renderPays();
  });
  $('#f-add-pay', modal).addEventListener('click', () => {
    draft.payments.push({ date: todayISO(), amount: 0, note: '' }); renderPays();
  });

  /* ---- header fields ---- */
  const entityText = (party) => {
    const p = PARTIES[party];
    return p.direction === 'RECEIVABLE'
      ? `🧾 Issued by ${p.selfEntityName} → invoiced to ${p.name}`
      : `🧾 ${p.name} → invoices ${p.selfEntityName}`;
  };
  const setEntityNote = () => { $('#f-entity-note', modal).textContent = entityText(draft.party); };
  $('#f-party', modal).addEventListener('change', (e) => { draft.party = e.target.value; setEntityNote(); });
  setEntityNote();
  $('#f-num', modal).addEventListener('input', (e) => { draft.invoiceNumber = e.target.value; });
  $('#f-cur', modal).addEventListener('change', (e) => { draft.currency = e.target.value; renderItems(); renderPays(); });
  $('#f-vat', modal).addEventListener('change', (e) => { draft.vatMode = e.target.value; renderTotals(); });
  $('#f-issue', modal).addEventListener('change', (e) => { draft.issueDate = e.target.value; });
  $('#f-due', modal).addEventListener('change', (e) => { draft.dueDate = e.target.value; });
  $('#f-notes', modal).addEventListener('input', (e) => { draft.notes = e.target.value; });
  $$('[data-terms]', modal).forEach((b) => b.addEventListener('click', () => {
    const base = draft.issueDate || todayISO();
    draft.dueDate = addDays(base, +b.dataset.terms);
    $('#f-due', modal).value = draft.dueDate;
  }));
  $('#f-apply-defaults', modal).addEventListener('click', () => {
    const m = PARTIES[draft.party];
    draft.currency = m.defaultCurrency; draft.vatMode = m.defaultVatMode;
    $('#f-cur', modal).value = m.defaultCurrency;
    $('#f-vat', modal).value = m.defaultVatMode;
    renderItems(); renderPays();
  });

  /* ---- footer actions ---- */
  modal.addEventListener('click', async (e) => {
    const act = e.target.dataset.act; if (!act) return;
    if (act === 'close') return close();
    if (act === 'pdf') return safe(() => exportInvoicePDF(draft, todayISO()), 'Invoice PDF created');
    if (act === 'delete') {
      if (!confirm('Delete this invoice permanently?')) return;
      await deleteInvoice(draft.id); toast('Invoice deleted'); return close();
    }
    if (act === 'save') {
      draft.invoiceNumber = draft.invoiceNumber.trim();
      draft.items = draft.items.filter((it) => (it.description || '').trim() || Number(it.qty) || Number(it.unitPrice));
      if (!draft.items.length) { toast('Add at least one line item', 'err'); return; }
      try {
        await saveInvoice(draft);
        toast(id ? 'Invoice updated' : 'Invoice created');
        close();
      } catch (ex) { toast('Save failed: ' + (ex.message || ex), 'err'); }
    }
  });

  renderItems(); renderPays(); renderTotals();
  setTimeout(() => $('#f-num', modal).focus(), 50);
}

/* paste rows directly into the line-item table of an open invoice */
function pasteIntoItems(draft, rerender) {
  const text = prompt('Paste rows copied from Excel/Windows.\nColumns: Description, Qty, Unit price (tab or comma separated). One item per line.');
  if (!text) return;
  const rows = parseTable(text);
  let added = 0;
  for (const r of rows) {
    if (!r.length) continue;
    const desc = r[0];
    const qty = parseNum(r[1]); const up = parseNum(r[2]);
    if (!desc && !qty && !up) continue;
    // skip a header row
    if (/qty|quantity|unit|price|description/i.test(desc) && added === 0 && !qty) continue;
    draft.items.push({ description: desc || '', qty: qty || 1, unitPrice: up || 0 });
    added++;
  }
  rerender();
  toast(`${added} line${added === 1 ? '' : 's'} added`);
}

/* ============================ bulk paste import ============================ */
function openPasteModal() {
  const host = $('#modal-host');
  const overlay = el('div', 'modal-overlay');
  const modal = el('div', 'modal');
  modal.style.maxWidth = '720px';
  overlay.appendChild(modal); host.appendChild(overlay);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) host.innerHTML = ''; });

  modal.innerHTML = `
    <div class="modal-head"><h2>Paste invoices</h2><button class="close-x" data-x>&times;</button></div>
    <div class="modal-body">
      <p class="muted" style="margin-bottom:.8rem">Copy rows from Excel / your Windows PC and paste below. Each row becomes one invoice.</p>
      <p class="muted" style="font-size:.82rem;margin-bottom:.6rem">Columns, in order (tab or comma separated):<br>
      <b>Party</b> (Vulcan/AMSA) · <b>Invoice No</b> · <b>CT Numbers</b> (space-separated) · <b>Issue date</b> (YYYY-MM-DD) · <b>Due date</b> · <b>Description</b> · <b>Qty</b> · <b>Unit price</b> · <b>Currency</b> (optional)</p>
      <div class="field"><textarea id="paste-area" style="min-height:180px;font-family:monospace;font-size:.82rem" placeholder="Vulcan&#9;INV-001&#9;CT100 CT101&#9;2026-05-01&#9;2026-05-31&#9;Coking coal&#9;1500&#9;142.50&#9;USD"></textarea></div>
      <div id="paste-preview" class="muted" style="font-size:.82rem"></div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" data-x>Cancel</button>
      <button class="btn btn-primary" id="paste-import">Import invoices</button>
    </div>`;

  const area = $('#paste-area', modal);
  const preview = $('#paste-preview', modal);
  const parsePreview = () => {
    const rows = rowsToInvoices(parseTable(area.value));
    preview.innerHTML = rows.length
      ? `Ready to import <b>${rows.length}</b> invoice${rows.length === 1 ? '' : 's'}.`
      : 'Nothing detected yet.';
    return rows;
  };
  area.addEventListener('input', parsePreview);
  modal.addEventListener('click', async (e) => {
    if (e.target.hasAttribute('data-x')) return host.innerHTML = '';
    if (e.target.id === 'paste-import') {
      const rows = parsePreview();
      if (!rows.length) { toast('Nothing to import', 'err'); return; }
      for (const inv of rows) await saveInvoice(inv);
      toast(`${rows.length} invoice${rows.length === 1 ? '' : 's'} imported`);
      host.innerHTML = '';
    }
  });
}

function rowsToInvoices(rows) {
  const out = [];
  for (const r of rows) {
    if (!r.length || r.every((c) => !c)) continue;
    if (/^party$/i.test(r[0]) || /invoice\s*no/i.test(r[1] || '')) continue; // header
    const party = /amsa/i.test(r[0] || '') ? 'AMSA' : 'VULCAN';
    const meta = PARTIES[party];
    const ct = (r[2] || '').split(/[ ,;]+/).map((s) => s.trim()).filter(Boolean);
    out.push({
      id: genId(), party,
      invoiceNumber: r[1] || '',
      ctNumbers: ct,
      issueDate: normDate(r[3]) || todayISO(),
      dueDate: normDate(r[4]) || addDays(normDate(r[3]) || todayISO(), 30),
      items: [{ description: r[5] || 'Item', qty: parseNum(r[6]) || 1, unitPrice: parseNum(r[7]) || 0 }],
      currency: (r[8] || meta.defaultCurrency).toUpperCase().trim() || meta.defaultCurrency,
      vatMode: meta.defaultVatMode,
      payments: [], notes: '',
    });
  }
  return out;
}

/* ============================ menu / backup ============================ */
function openMenu() {
  const host = $('#modal-host');
  const overlay = el('div', 'modal-overlay');
  const modal = el('div', 'modal'); modal.style.maxWidth = '560px';
  overlay.appendChild(modal); host.appendChild(overlay);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) host.innerHTML = ''; });

  const cloud = getMode() === 'cloud';
  modal.innerHTML = `
    <div class="modal-head"><h2>Settings &amp; backup</h2><button class="close-x" data-x>&times;</button></div>
    <div class="modal-body">
      <div class="field">
        <label>Data sync</label>
        <p class="muted" style="font-size:.88rem">${cloud
          ? '✅ <b>Cloud sync active.</b> Up to 6 signed-in users share this data live across devices and countries.'
          : '⚠️ <b>Local mode.</b> Data is on this device only. Add Firebase keys in <code>assets/js/config.js</code> to enable shared cloud sync (see README).'}</p>
      </div>
      <div class="field">
        <label>Backup</label>
        <div style="display:flex;gap:.6rem;flex-wrap:wrap">
          <button class="btn" id="bk-export">⬇ Download JSON backup</button>
          <button class="btn" id="bk-import">⬆ Restore from JSON</button>
          <input type="file" id="bk-file" accept="application/json" class="hidden">
        </div>
        <p class="muted" style="font-size:.78rem;margin-top:.4rem">A JSON backup lets you move all invoices between devices or restore after a reset.${cloud ? ' Importing adds/updates invoices in the shared cloud.' : ''}</p>
      </div>
      <div class="field">
        <label>Invoicing entities</label>
        <p class="muted" style="font-size:.85rem">
          <b>EC Trading LDA</b> (Mozambique) — invoices <b>Vulcan Mozambique</b>${ENTITIES.ECT_LDA.taxNo ? ` · NUIT ${esc(ENTITIES.ECT_LDA.taxNo)}` : ' · NUIT/reg to be added'}<br>
          <b>Eucharisteo Trading (Pty) Ltd</b> (RSA) — invoiced by <b>AMSA Vanderbijlpark</b> · Reg ${esc(ENTITIES.EUCHARISTEO_SA.reg)} · VAT ${esc(ENTITIES.EUCHARISTEO_SA.vatNo)}
        </p>
      </div>
      <div class="field">
        <label>Install as app / APK</label>
        <p class="muted" style="font-size:.85rem">On Android/Chrome use the browser menu → <b>Install app</b> / <b>Add to Home screen</b>. On Windows/Edge click the <b>install</b> icon in the address bar. To build a downloadable <b>.APK</b>, see the README (PWABuilder or the included GitHub Action).</p>
      </div>
    </div>
    <div class="modal-foot"><span></span><button class="btn btn-ghost" data-x>Close</button></div>`;

  modal.addEventListener('click', (e) => { if (e.target.hasAttribute('data-x')) host.innerHTML = ''; });
  $('#bk-export', modal).addEventListener('click', () => {
    const data = JSON.stringify({ app: 'eucharisteo-invoice-tracker', version: 1, exportedAt: new Date().toISOString(), invoices: snapshot() }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const a = el('a'); a.href = URL.createObjectURL(blob);
    a.download = `eucharisteo-backup-${todayISO()}.json`; a.click();
    URL.revokeObjectURL(a.href); toast('Backup downloaded');
  });
  $('#bk-import', modal).addEventListener('click', () => $('#bk-file', modal).click());
  $('#bk-file', modal).addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const invoices = Array.isArray(parsed) ? parsed : parsed.invoices;
      if (!Array.isArray(invoices)) throw new Error('Unrecognised file');
      if (!confirm(`Import ${invoices.length} invoices?${getMode() === 'local' ? ' This replaces local data.' : ''}`)) return;
      if (getMode() === 'local') await replaceAll(invoices);
      else for (const inv of invoices) await saveInvoice(inv);
      toast(`${invoices.length} invoices imported`); host.innerHTML = '';
    } catch (ex) { toast('Import failed: ' + (ex.message || ex), 'err'); }
  });
}

/* ============================ notifications ============================ */
async function requestNotifications() {
  if (!('Notification' in window)) { toast('Notifications not supported here', 'err'); return; }
  const perm = await Notification.requestPermission();
  updateNotifyButton();
  if (perm === 'granted') { toast('Device alerts enabled'); fireReminderNotifications(); }
  else toast('Notifications blocked', 'err');
}
function updateNotifyButton() {
  const btn = $('#notify-toggle'); if (!btn) return;
  if (!('Notification' in window)) { btn.classList.add('hidden'); return; }
  if (Notification.permission === 'granted') { btn.textContent = '🔔 Alerts on'; btn.disabled = true; }
  else btn.textContent = 'Enable device alerts';
}
function fireReminderNotifications() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const today = todayISO();

  // ----- daily attention alert (overdue/critical + lead-time marks), once/day -----
  const seenKey = 'eucharisteo:notified:' + today;
  if (!localStorage.getItem(seenKey)) {
    const rems = buildReminders(state.invoices, today, reminderOpts())
      .filter((r) => r.level === 'critical' || r.level === 'overdue'
        || (r.level === 'due-soon' && r.atLeadMark));
    if (rems.length) {
      const crit = rems.filter((r) => r.level === 'critical').length;
      new Notification(APP.brand + ' — Invoice Tracker', {
        body: rems.length === 1 ? rems[0].title
          : `${rems.length} invoices need attention${crit ? `, ${crit} CRITICAL` : ''} (overdue / due soon).`,
        icon: 'assets/icons/icon-192.png', tag: 'eucharisteo-reminders',
      });
      localStorage.setItem(seenKey, '1');
    }
  }

  // ----- weekly outstanding summary, once per ISO week on the chosen weekday -----
  if (new Date().getUTCDay() === (APP.weeklySummaryDay ?? 1)) {
    const wkKey = 'eucharisteo:weekly:' + isoWeekKey(new Date());
    if (!localStorage.getItem(wkKey)) {
      const lines = outstandingSummaryLines(state.invoices, today);
      if (lines.length) {
        new Notification(APP.brand + ' — Weekly outstanding', {
          body: lines.map((l) => `${PARTIES[l.party].short}: ${l.text}`
            + `${l.overdue ? ` (${l.overdue} overdue)` : ''}`).join('\n'),
          icon: 'assets/icons/icon-192.png', tag: 'eucharisteo-weekly',
        });
        localStorage.setItem(wkKey, '1');
      }
    }
  }
}

function isoWeekKey(d) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(
    ((date - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/* ============================ helpers ============================ */
function parseNum(v) {
  if (v == null) return 0;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isNaN(n) ? 0 : n;
}
function normDate(v) {
  if (!v) return '';
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/); // dd/mm/yyyy
  if (m) {
    let [, d, mo, y] = m; if (y.length === 2) y = '20' + y;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? '' : new Date(t).toISOString().slice(0, 10);
}
async function safe(fn, okMsg) {
  try { await fn(); if (okMsg) toast(okMsg); }
  catch (ex) { console.error(ex); toast('Failed: ' + (ex.message || ex), 'err'); }
}
function toast(msg, kind = 'ok') {
  const host = $('#toast-host');
  const t = el('div', `toast ${kind}`, esc(msg));
  host.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, 2600);
}

// fire reminder notifications shortly after load
setTimeout(() => { if (getUser()) fireReminderNotifications(); }, 4000);
