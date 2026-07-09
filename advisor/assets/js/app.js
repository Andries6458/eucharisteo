/* UI controller — wires the engines to the screens.
   State flows one way: store/quotes change -> buildReport -> render. */

import { CURRENCIES, UNIVERSE, RESIDENCIES, BUCKETS, BUCKET_META, RISK_PROFILES, FX_REFRESH_MS, CHART_COLORS } from './config.js';
import { convert, fmtMoney, fmtPct, fetchRates } from './fx.js';
import { startPolling } from './market.js';
import { byMarket, rankMovers, volumeSpikes } from './movers.js';
import { buildReport } from './advisor.js';
import { createStore, makeId, localDay } from './store.js';
import { holdingValue } from './allocation.js';
import { createSyncClient, normaliseSyncUrl } from './sync.js';
import { lineChart, allocationDonut, sparkline, driftBars } from './charts.js';
import { writeVault, downloadVault, forgetVault, supportsDirectoryPicker, savedVault } from './obsidian.js';

/* ---------- helpers ---------- */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* Set an input's value only when the user is not mid-typing in it. */
function setValue(input, value) {
  if (document.activeElement !== input) input.value = value;
}

/* ---------- app state ---------- */

const store = createStore();
let latestQuotes = [];
let activeMarket = 'ALL';
let syncStatus = { state: 'off' };

const sync = createSyncClient(store, {
  onStatus(s) {
    syncStatus = s;
    renderBadges();
    renderSyncNote();
  },
});

/* ---------- boot ---------- */

async function boot() {
  wireNav();
  wireHeader();
  wireDashboard();
  wireMovers();
  wireAllocation();
  wireAdvisor();
  wireSettings();

  // automatic snapshots re-render via the poll callback below; everything
  // else re-renders through this subscription — one render per change
  store.subscribe((state, meta) => {
    if (meta.origin !== 'local-snapshot') renderAll();
  });
  renderAll();

  // live FX now and on an interval
  refreshFx();
  setInterval(refreshFx, FX_REFRESH_MS);

  // market polling (provider options re-read every tick)
  startPolling(
    UNIVERSE.map((u) => u.symbol),
    (quotes) => {
      latestQuotes = quotes;
      const report = currentReport(); // built once, shared by snapshot + render
      recordSnapshot(report);
      renderAll(report);
    },
    () => ({
      relay: sync.isConnected() ? sync : null,
      finnhubKey: store.get().settings.finnhubKey || '',
    }),
  );

  // resume a previous sync connection
  const savedSync = store.get().settings.syncUrl;
  if (savedSync && normaliseSyncUrl(savedSync)) sync.connect(savedSync);

  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('./sw.js'); } catch { /* offline install unavailable */ }
  }
}

async function refreshFx() {
  const fx = await fetchRates();
  const cur = store.get().fx;
  if (fx.source !== 'pinned' || cur.source === 'pinned') {
    if (JSON.stringify(fx) !== JSON.stringify(cur)) {
      store.update((s) => { s.fx = fx; });
    }
  }
}

function currentReport() {
  return buildReport(store.get(), latestQuotes, store.get().fx);
}

function recordSnapshot(report) {
  const state = store.get();
  const usd = convert(report.netWorth, report.base, 'USD', state.fx.rates);
  const today = localDay();
  const existing = state.history.find((p) => p.t === today);
  if (!existing || Math.abs(existing.value - usd) > Math.max(1, usd * 0.001)) {
    store.snapshot(usd);
  }
}

/* ---------- navigation & header ---------- */

function wireNav() {
  $('#nav').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-screen]');
    if (!btn) return;
    $$('#nav button').forEach((b) => b.classList.toggle('active', b === btn));
    $$('.screen').forEach((s) => s.classList.toggle('hidden', s.id !== `screen-${btn.dataset.screen}`));
    renderAll();
  });
}

function wireHeader() {
  $('#ccy-switch').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-ccy]');
    if (!btn) return;
    store.update((s) => { s.settings.baseCurrency = btn.dataset.ccy; });
    toast(`Base currency: ${btn.dataset.ccy}`);
  });
}

function renderBadges() {
  const sources = new Set(latestQuotes.map((q) => q.source));
  const live = [...sources].some((s) => s !== 'sim');
  const badge = $('#data-badge');
  if (live) {
    const kinds = [...sources].filter((s) => s !== 'sim');
    badge.textContent = sources.has('sim') ? `Live + sim` : `Live (${kinds.join(', ')})`;
    badge.className = 'badge badge-live';
  } else {
    badge.textContent = 'Simulated';
    badge.className = 'badge badge-sim';
  }
  const sb = $('#sync-badge');
  if (syncStatus.state === 'connected') { sb.textContent = 'Synced'; sb.className = 'badge badge-sync-on'; }
  else if (syncStatus.state === 'connecting' || syncStatus.state === 'retrying') { sb.textContent = 'Sync…'; sb.className = 'badge badge-sync-off'; }
  else { sb.textContent = 'Sync off'; sb.className = 'badge badge-sync-off'; }
}

/* ---------- dashboard ---------- */

function wireDashboard() {
  $('#add-wallet').addEventListener('click', () => walletModal());
  $('#add-holding').addEventListener('click', () => holdingModal());
  $('#wallet-list').addEventListener('click', (e) => {
    const row = e.target.closest('[data-wallet]');
    if (row) walletModal(store.get().wallets.find((w) => w.id === row.dataset.wallet));
  });
  $('#holding-list').addEventListener('click', (e) => {
    const row = e.target.closest('[data-holding]');
    if (row) holdingModal(store.get().holdings.find((h) => h.id === row.dataset.holding));
  });
}

function renderDashboard(report) {
  const state = store.get();
  const base = report.base;

  $('#networth').textContent = fmtMoney(report.netWorth, base);
  $('#networth-sub').textContent = `${report.profile} profile · ${state.holdings.length} holdings · ${state.wallets.length} wallets`;

  $('#ccy-stats').innerHTML = CURRENCIES.map((c) =>
    `<div class="stat"><small>${c}</small><b>${fmtMoney(report.netWorthBy[c], c, { compact: true })}</b></div>`).join('');

  $('#fx-note').textContent = `1 USD = R${report.fx.usdZar.toFixed(2)} · £1 = $${report.fx.gbpUsd.toFixed(2)} (${report.fx.source}, ${report.fx.asOf})`;

  // history in base currency
  const points = state.history.map((p) => ({ t: p.t.slice(5), value: convert(p.value, 'USD', base, state.fx.rates) }));
  lineChart($('#history-chart'), points, { formatValue: (v) => fmtMoney(v, base, { compact: true }) });

  // wallets
  $('#wallet-list').innerHTML = state.wallets.map((w) => {
    const baseVal = convert(w.balance, w.currency, base, state.fx.rates);
    return `<div class="row" data-wallet="${w.id}" style="cursor:pointer">
      <div class="grow"><span class="sym">${escapeHtml(w.name)}</span>
        <span class="sub">${w.currency} · <span class="bucket-tag bucket-${w.bucket}">${BUCKET_META[w.bucket].label}</span></span></div>
      <div class="right"><span class="val">${fmtMoney(w.balance, w.currency)}</span>
        <span class="sub">${fmtMoney(baseVal, base)}</span></div>
    </div>`;
  }).join('') || '<p class="note">No wallets yet.</p>';

  // holdings
  const quotesBySymbol = new Map(latestQuotes.map((q) => [q.symbol, q]));
  $('#holding-list').innerHTML = state.holdings.map((h) => {
    const q = quotesBySymbol.get(h.symbol);
    const val = holdingValue(h, quotesBySymbol, state.fx.rates, base);
    const chg = q?.changePct;
    const pill = chg == null ? '<span class="pill pill-flat">—</span>'
      : `<span class="pill ${chg >= 0 ? 'pill-gain' : 'pill-loss'}">${chg >= 0 ? '▲' : '▼'} ${fmtPct(chg)}</span>`;
    return `<div class="row" data-holding="${h.id}" style="cursor:pointer">
      <div class="grow"><span class="sym">${escapeHtml(h.symbol)}</span>
        <span class="sub">${escapeHtml(h.name || '')} · ${h.units} units · <span class="bucket-tag bucket-${h.bucket}">${BUCKET_META[h.bucket].label}</span></span></div>
      ${pill}
      <div class="right"><span class="val">${fmtMoney(val, base)}</span></div>
    </div>`;
  }).join('') || '<p class="note">No holdings yet — tap “+ Holding”.</p>';
}

/* ---------- movers ---------- */

function wireMovers() {
  $('#market-tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    activeMarket = tab.dataset.market;
    $$('#market-tabs .tab').forEach((t) => t.classList.toggle('active', t === tab));
    renderMovers();
  });
}

function moverRow(q) {
  const up = (q.changePct ?? 0) >= 0;
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `<div class="grow"><span class="sym">${escapeHtml(q.symbol)}</span>
      <span class="sub">${escapeHtml(q.name)} · ${escapeHtml(q.market)}</span></div>
    <span class="spark-slot"></span>
    <div class="right">
      <span class="pill ${up ? 'pill-gain' : 'pill-loss'}">${up ? '▲' : '▼'} ${fmtPct(q.changePct)}</span>
      <span class="sub">${q.price != null ? fmtMoney(q.price, q.currency) : '—'}</span>
    </div>`;
  row.querySelector('.spark-slot').replaceWith(sparkline(q.series, q.changePct));
  return row;
}

function renderMovers() {
  const pool = activeMarket === 'ALL' ? latestQuotes : (byMarket(latestQuotes).get(activeMarket) || []);
  const { gainers, losers } = rankMovers(pool);
  const spikes = volumeSpikes(pool);

  const g = $('#gainers'); g.replaceChildren();
  gainers.forEach((q) => g.appendChild(moverRow(q)));
  if (!gainers.length) g.innerHTML = '<p class="note">No gainers right now.</p>';

  const l = $('#losers'); l.replaceChildren();
  losers.forEach((q) => l.appendChild(moverRow(q)));
  if (!losers.length) l.innerHTML = '<p class="note">No losers right now.</p>';

  $('#spikes').innerHTML = spikes.length
    ? spikes.slice(0, 6).map((s) => `<div class="row">
        <div class="grow"><span class="sym">${escapeHtml(s.symbol)}</span><span class="sub">${escapeHtml(s.name)}</span></div>
        <span class="pill pill-flat">${s.volumeRatio.toFixed(1)}× avg volume</span>
      </div>`).join('')
    : '<p class="note">No unusual volume in the current universe.</p>';

  const sources = [...new Set(pool.map((q) => q.source))];
  $('#movers-note').textContent = sources.includes('sim')
    ? `Sources: ${sources.join(', ')}. “sim” prices are simulated on-device — connect the PC hub or add a Finnhub key in Settings for live data.`
    : `Sources: ${sources.join(', ')}. Updated ${new Date().toLocaleTimeString()}.`;
}

/* ---------- allocation ---------- */

function wireAllocation() {
  $('#profile-tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    store.update((s) => { s.settings.riskProfile = tab.dataset.profile; });
  });
}

function renderAllocation(report) {
  const base = report.base;
  const profileKey = store.get().settings.riskProfile;
  $$('#profile-tabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.profile === profileKey));

  allocationDonut($('#alloc-donut'), report.allocation.totals, { formatValue: (v) => fmtMoney(v, base, { compact: true }) });
  driftBars($('#alloc-drift'), report.rebalance.rows, { formatValue: (v) => fmtMoney(v, base, { compact: true }) });

  $('#rebalance-table tbody').innerHTML = report.rebalance.rows.map((r) => `
    <tr>
      <td><span class="swatch" style="background:${CHART_COLORS.categorical[r.bucket]};display:inline-block;margin-right:.4rem"></span>${BUCKET_META[r.bucket].label}</td>
      <td>${fmtPct(r.actual, { signed: false })}</td>
      <td>${fmtPct(r.target, { signed: false })}</td>
      <td class="right">${fmtMoney(r.actualValue, base)}</td>
      <td class="right" style="color:${r.move >= 0 ? 'var(--gain)' : 'var(--loss)'}">${fmtMoney(r.move, base, { signed: true })}</td>
    </tr>`).join('');
}

/* ---------- advisor ---------- */

function wireAdvisor() {
  const res = $('#tax-residency');
  res.innerHTML = RESIDENCIES.map((r) => `<option value="${r.code}">${r.label}</option>`).join('');
  res.addEventListener('change', () => store.update((s) => { s.settings.taxResidency = res.value; }));

  $('#annual-income').addEventListener('change', (e) => {
    const v = Math.max(0, Number(e.target.value) || 0);
    store.update((s) => { s.settings.annualIncome = v; });
  });

  $('#tax-extra-fields').addEventListener('change', (e) => {
    const key = e.target.dataset.set;
    if (!key) return;
    const v = e.target.tagName === 'SELECT' ? e.target.value : Math.max(0, Number(e.target.value) || 0);
    store.update((s) => { s.settings[key] = v; });
  });

  $('#obsidian-write').addEventListener('click', async () => {
    try {
      if (!supportsDirectoryPicker()) { toast('Folder writing needs Chrome/Edge on desktop — use Download instead.'); return; }
      const { written, vaultName } = await writeVault(store.get(), currentReport());
      $('#obsidian-status').textContent = `Wrote ${written} notes into “${vaultName}”.`;
      $('#obsidian-status').className = 'note ok';
    } catch (err) {
      $('#obsidian-status').textContent = err.message || String(err);
      $('#obsidian-status').className = 'note err';
    }
  });
  $('#obsidian-download').addEventListener('click', () => {
    const { written } = downloadVault(store.get(), currentReport());
    toast(`Downloaded ${written} Markdown notes`);
  });
  $('#obsidian-forget').addEventListener('click', async () => {
    await forgetVault();
    $('#obsidian-status').textContent = 'Saved vault folder forgotten.';
    $('#obsidian-status').className = 'note';
  });
}

function renderAdvisor(report) {
  const s = store.get().settings;
  setValue($('#annual-income'), s.annualIncome || '');
  const res = $('#tax-residency');
  if (document.activeElement !== res) res.value = s.taxResidency;

  // residency-specific inputs
  const extra = $('#tax-extra-fields');
  const focusedId = document.activeElement?.id;
  let html = '';
  if (s.taxResidency === 'ZA') {
    html = `
      <div class="field-row">
        <div class="field"><label for="f-age">Age</label>
          <input id="f-age" data-set="age" type="number" min="0" max="120" value="${s.age || 40}"></div>
        <div class="field"><label for="f-tfsa-y">TFSA this year (R)</label>
          <input id="f-tfsa-y" data-set="tfsaContributedYear" type="number" min="0" value="${s.tfsaContributedYear || 0}"></div>
      </div>
      <div class="field"><label for="f-tfsa-l">TFSA lifetime (R)</label>
        <input id="f-tfsa-l" data-set="tfsaContributedLife" type="number" min="0" value="${s.tfsaContributedLife || 0}"></div>`;
  } else if (s.taxResidency === 'UK') {
    html = `
      <div class="field"><label for="f-isa">ISA contributions this tax year (£)</label>
        <input id="f-isa" data-set="isaContributed" type="number" min="0" value="${s.isaContributed || 0}"></div>`;
  } else {
    html = `
      <div class="field"><label for="f-filing">Filing status</label>
        <select id="f-filing" data-set="filingStatus">
          <option value="single" ${s.filingStatus === 'single' ? 'selected' : ''}>Single</option>
          <option value="married_joint" ${s.filingStatus === 'married_joint' ? 'selected' : ''}>Married filing jointly</option>
        </select></div>`;
  }
  if (!focusedId || !extra.querySelector(`#${focusedId}`)) extra.innerHTML = html;

  // recommendations
  const icon = { rebalance: '⚖️', tax: '🧾', market: '📈', ok: '✅' };
  $('#recs').innerHTML = report.recommendations
    .map((r) => `<div class="rec"><span class="ico">${icon[r.kind] || '•'}</span><span>${escapeHtml(r.text)}</span></div>`).join('');

  // tax detail
  const t = report.tax;
  let detail = '';
  if (t.residency === 'ZA') {
    const d = t.detail;
    detail = `
      <div class="stat-row">
        <div class="stat"><small>Marginal rate</small><b>${fmtPct(d.income.marginalRate, { signed: false, digits: 0 })}</b></div>
        <div class="stat"><small>CGT if realised</small><b>${fmtMoney(d.cgt.tax, 'ZAR')}</b></div>
        <div class="stat"><small>TFSA room</small><b>${fmtMoney(d.tfsa.room, 'ZAR')}</b></div>
      </div>
      <p class="note" style="margin-top:.7rem">SARS ${d.year}: gains above the R40,000 annual exclusion are 40% included and taxed
      at your marginal rate — effective ${fmtPct(d.cgt.effectiveRate, { signed: false })} on current unrealised gains of ${fmtMoney(t.gain, 'ZAR')}.
      ${d.tfsa.excess > 0 ? `<b style="color:var(--loss)">TFSA over-contribution penalty exposure: ${fmtMoney(d.tfsa.penalty, 'ZAR')}.</b>` : ''}</p>`;
  } else if (t.residency === 'UK') {
    const d = t.detail;
    detail = `
      <div class="stat-row">
        <div class="stat"><small>Band</small><b>${d.income.band}</b></div>
        <div class="stat"><small>CGT if realised</small><b>${fmtMoney(d.cgt.tax, 'GBP')}</b></div>
        <div class="stat"><small>ISA room</small><b>${fmtMoney(d.isa.room, 'GBP')}</b></div>
      </div>
      <p class="note" style="margin-top:.7rem">HMRC ${d.year}: after the £3,000 exempt amount, gains are taxed 18% (basic band) / 24% (above).
      Personal savings allowance: ${fmtMoney(d.psa, 'GBP')}.
      ${d.isa.overContribution > 0 ? `<b style="color:var(--loss)">ISA over-contribution: ${fmtMoney(d.isa.overContribution, 'GBP')} — contact your provider.</b>` : ''}</p>`;
  } else {
    const d = t.detail;
    detail = `
      <div class="stat-row">
        <div class="stat"><small>Short-term tax</small><b>${fmtMoney(d.shortTerm.tax, 'USD')}</b></div>
        <div class="stat"><small>Long-term tax</small><b>${fmtMoney(d.longTerm.tax, 'USD')}</b></div>
        <div class="stat"><small>Hold-long saving</small><b>${fmtMoney(d.holdLongSaving, 'USD')}</b></div>
      </div>
      <p class="note" style="margin-top:.7rem">IRS ${d.year} (${d.filingStatus === 'single' ? 'single' : 'married filing jointly'}):
      short-term gains use ordinary brackets; long-term the 0/15/20% schedule. NIIT exposure ${fmtMoney(d.niit.tax, 'USD')} at 3.8% above
      $${d.niit.threshold.toLocaleString('en-US')} MAGI.</p>`;
  }
  $('#tax-detail').innerHTML = detail;
}

/* ---------- settings ---------- */

function wireSettings() {
  $('#set-base').addEventListener('change', (e) => store.update((s) => { s.settings.baseCurrency = e.target.value; }));
  $('#set-profile').addEventListener('change', (e) => store.update((s) => { s.settings.riskProfile = e.target.value; }));
  $('#set-finnhub').addEventListener('change', (e) => {
    store.update((s) => { s.settings.finnhubKey = e.target.value.trim(); });
    toast(e.target.value.trim() ? 'Finnhub key saved (stays on this device)' : 'Finnhub key removed');
  });
  $('#sync-connect').addEventListener('click', () => {
    const input = $('#set-sync').value.trim();
    if (!normaliseSyncUrl(input)) { toast('Enter the PC address, e.g. 192.168.1.20:8765'); return; }
    store.update((s) => { s.settings.syncUrl = input; });
    sync.connect(input);
  });
  $('#sync-disconnect').addEventListener('click', () => {
    sync.disconnect();
    store.update((s) => { s.settings.syncUrl = ''; });
  });

  $('#backup-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(store.get(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `eucharisteo-advisor-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });
  $('#backup-import').addEventListener('click', () => $('#backup-file').click());
  $('#backup-file').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      if (!store.replaceAll(raw)) throw new Error('not a valid backup');
      toast('Backup restored');
    } catch {
      toast('That file is not a valid advisor backup.');
    }
    e.target.value = '';
  });
}

function renderSettings() {
  const s = store.get().settings;
  const base = $('#set-base'); if (document.activeElement !== base) base.value = s.baseCurrency;
  const prof = $('#set-profile'); if (document.activeElement !== prof) prof.value = s.riskProfile;
  setValue($('#set-finnhub'), s.finnhubKey || '');
  setValue($('#set-sync'), s.syncUrl || '');
}

function renderSyncNote() {
  const el = $('#sync-status-note');
  if (!el) return;
  const map = {
    off: 'Not connected.',
    connected: `Connected to ${syncStatus.url} — state and live quotes are syncing.`,
    connecting: `Connecting to ${syncStatus.url}…`,
    retrying: `Connection lost — retrying (attempt ${syncStatus.attempts})…`,
    disconnected: 'Disconnected.',
    'invalid-url': 'That address does not look right — use e.g. 192.168.1.20:8765.',
    error: 'Could not open the connection.',
  };
  el.textContent = map[syncStatus.state] || syncStatus.state;
  el.className = `note ${syncStatus.state === 'connected' ? 'ok' : ''}`;
}

/* ---------- modals ---------- */

function openModal(title, bodyBuilder) {
  $('#modal-title').textContent = title;
  const body = $('#modal-body');
  body.replaceChildren();
  bodyBuilder(body);
  $('#modal-backdrop').classList.remove('hidden');
}
function closeModal() { $('#modal-backdrop').classList.add('hidden'); }
$('#modal-backdrop')?.addEventListener('click', (e) => { if (e.target.id === 'modal-backdrop') closeModal(); });

function bucketOptions(selected) {
  return BUCKETS.map((b) => `<option value="${b}" ${b === selected ? 'selected' : ''}>${BUCKET_META[b].label}</option>`).join('');
}

function walletModal(wallet = null) {
  openModal(wallet ? 'Edit wallet' : 'New wallet', (body) => {
    body.innerHTML = `
      <div class="field"><label>Name</label><input id="m-name" value="${escapeHtml(wallet?.name || '')}" placeholder="e.g. FNB cheque"></div>
      <div class="field-row">
        <div class="field"><label>Currency</label>
          <select id="m-ccy">${CURRENCIES.map((c) => `<option ${c === (wallet?.currency || 'USD') ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
        <div class="field"><label>Balance</label><input id="m-bal" type="number" step="0.01" value="${wallet?.balance ?? 0}"></div>
      </div>
      <div class="field"><label>Allocation bucket</label><select id="m-bucket">${bucketOptions(wallet?.bucket || 'LOW')}</select></div>
      <div class="form-actions">
        ${wallet ? '<button class="btn btn-danger" id="m-delete">Delete</button>' : ''}
        <button class="btn" id="m-cancel">Cancel</button>
        <button class="btn btn-primary" id="m-save">Save</button>
      </div>`;
    $('#m-cancel').addEventListener('click', closeModal);
    $('#m-save').addEventListener('click', () => {
      const name = $('#m-name').value.trim() || 'Wallet';
      const currency = $('#m-ccy').value;
      const balance = Number($('#m-bal').value) || 0;
      const bucket = $('#m-bucket').value;
      store.update((s) => {
        if (wallet) {
          const w = s.wallets.find((x) => x.id === wallet.id);
          if (w) Object.assign(w, { name, currency, balance, bucket });
        } else {
          s.wallets = [...s.wallets, { id: makeId('w'), name, currency, balance, bucket }];
        }
      });
      closeModal();
    });
    $('#m-delete')?.addEventListener('click', () => {
      store.update((s) => { s.wallets = s.wallets.filter((x) => x.id !== wallet.id); });
      closeModal();
    });
  });
}

function holdingModal(holding = null) {
  openModal(holding ? 'Edit holding' : 'New holding', (body) => {
    const dataList = UNIVERSE.map((u) => `<option value="${u.symbol}">${escapeHtml(u.name)} (${u.market})</option>`).join('');
    body.innerHTML = `
      <div class="field"><label>Symbol (watchlist symbols get live prices)</label>
        <input id="m-sym" list="m-symbols" value="${escapeHtml(holding?.symbol || '')}" placeholder="e.g. AAPL, NPN, SHEL" style="text-transform:uppercase">
        <datalist id="m-symbols">${dataList}</datalist></div>
      <div class="field"><label>Name (optional)</label><input id="m-hname" value="${escapeHtml(holding?.name || '')}"></div>
      <div class="field-row">
        <div class="field"><label>Units</label><input id="m-units" type="number" step="any" value="${holding?.units ?? ''}"></div>
        <div class="field"><label>Avg cost / unit</label><input id="m-cost" type="number" step="any" value="${holding?.avgCost ?? ''}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Currency of cost</label>
          <select id="m-hccy">${CURRENCIES.map((c) => `<option ${c === (holding?.currency || 'USD') ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
        <div class="field"><label>Bucket</label><select id="m-hbucket">${bucketOptions(holding?.bucket || 'MEDIUM')}</select></div>
      </div>
      <div class="form-actions">
        ${holding ? '<button class="btn btn-danger" id="m-hdelete">Delete</button>' : ''}
        <button class="btn" id="m-hcancel">Cancel</button>
        <button class="btn btn-primary" id="m-hsave">Save</button>
      </div>`;
    $('#m-hcancel').addEventListener('click', closeModal);
    $('#m-hsave').addEventListener('click', () => {
      const symbol = $('#m-sym').value.trim().toUpperCase();
      if (!symbol) { toast('Symbol is required'); return; }
      const patch = {
        symbol,
        name: $('#m-hname').value.trim(),
        units: Number($('#m-units').value) || 0,
        avgCost: Number($('#m-cost').value) || 0,
        currency: $('#m-hccy').value,
        bucket: $('#m-hbucket').value,
      };
      store.update((s) => {
        if (holding) {
          const h = s.holdings.find((x) => x.id === holding.id);
          if (h) Object.assign(h, patch);
        } else {
          s.holdings = [...s.holdings, { id: makeId('h'), acquiredAt: new Date().toISOString().slice(0, 10), ...patch }];
        }
      });
      closeModal();
    });
    $('#m-hdelete')?.addEventListener('click', () => {
      store.update((s) => { s.holdings = s.holdings.filter((x) => x.id !== holding.id); });
      closeModal();
    });
  });
}

/* ---------- master render ---------- */

function renderAll(report = currentReport()) {
  const base = report.base;
  $$('#ccy-switch button').forEach((b) => b.classList.toggle('active', b.dataset.ccy === base));
  renderBadges();

  if (!$('#screen-dashboard').classList.contains('hidden')) renderDashboard(report);
  if (!$('#screen-movers').classList.contains('hidden')) renderMovers();
  if (!$('#screen-allocation').classList.contains('hidden')) renderAllocation(report);
  if (!$('#screen-advisor').classList.contains('hidden')) renderAdvisor(report);
  if (!$('#screen-settings').classList.contains('hidden')) { renderSettings(); renderSyncNote(); }
}

boot();
