/* Eucharisteo Financial Advisor — PC sync hub.

   Run on the desktop that shares a Wi-Fi/LAN with your phone:

     cd advisor/sync-server
     npm install
     npm start                                   # port 8765
     EC_ADVISOR_VAULT="C:\Vault" npm start       # + auto-write Obsidian notes

   Duties:
     1. Real-time state sync between every connected device (phone APK,
        desktop browser, installed PWA) with last-write-wins on `rev`.
     2. Live quote relay: devices ask this hub for prices; the hub queries
        Yahoo Finance (S&P 500, JSE, FTSE) and normalises cents/pence.
     3. Obsidian mirroring: when EC_ADVISOR_VAULT is set, every state change
        rewrites the Markdown notes in that vault folder.
     4. State persistence to state.json so a restart keeps the latest data. */

import { WebSocketServer } from 'ws';
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

import { SYNC_PORT, UNIVERSE } from '../assets/js/config.js';
import { normalise, simulateQuote, universeEntry } from '../assets/js/market.js';
import { buildReport } from '../assets/js/advisor.js';
import { buildVaultFiles } from '../assets/js/vault-md.js';
import { sanitiseState } from '../assets/js/store.js';
import { fetchRates } from '../assets/js/fx.js';

const here = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(here, 'state.json');
const PORT = Number(process.env.EC_ADVISOR_PORT) || SYNC_PORT;
const VAULT_DIR = process.env.EC_ADVISOR_VAULT ? resolve(process.env.EC_ADVISOR_VAULT) : null;

const QUOTE_TTL_MS = 30_000;

/* ---------- state persistence ---------- */

let state = loadState();

function loadState() {
  try {
    const parsed = sanitiseState(JSON.parse(readFileSync(STATE_FILE, 'utf8')));
    if (parsed) { log(`restored state rev ${parsed.rev} from state.json`); return parsed; }
  } catch { /* first run */ }
  return null;
}

function saveState() {
  if (!state) return;
  try {
    const tmp = `${STATE_FILE}.tmp`;
    writeFileSync(tmp, JSON.stringify(state));
    renameSync(tmp, STATE_FILE);
  } catch (err) {
    log(`could not persist state: ${err.message}`);
  }
}

/* ---------- quotes (Yahoo Finance chart API, keyless) ---------- */

const quoteCache = new Map(); // symbol -> {quote, at}

async function yahooQuote(symbol) {
  const entry = universeEntry(symbol);
  const ySym = entry?.yahoo || symbol;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ySym)}?range=1d&interval=5m`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (EucharisteoAdvisor/1.0)', Accept: 'application/json' } });
  if (!res.ok) throw new Error(`yahoo HTTP ${res.status} for ${ySym}`);
  const body = await res.json();
  const result = body?.chart?.result?.[0];
  if (!result?.meta) throw new Error(`yahoo: empty chart for ${ySym}`);
  const meta = result.meta;

  // JSE quotes come in ZAc (cents), LSE in GBp (pence) — normalise to major units
  const divisor = meta.currency === 'ZAc' || meta.currency === 'GBp' ? 100 : 1;

  const ts = result.timestamp || [];
  const quoteBlock = result.indicators?.quote?.[0] || {};
  const closes = quoteBlock.close || [];
  const volumes = (quoteBlock.volume || []).filter((v) => Number.isFinite(v) && v > 0);
  const series = ts
    .map((t, i) => ({ t: i / Math.max(1, ts.length - 1), price: Number.isFinite(closes[i]) ? closes[i] / divisor : null }))
    .filter((p) => p.price !== null);

  const volume = volumes.reduce((s, v) => s + v, 0);
  const bars = volumes.length;
  // rough full-day average: mean bar volume × bars per 6.5h session at 5m intervals
  const avgVolume = bars > 0 ? Math.round((volume / bars) * 78) : null;

  return normalise({
    symbol,
    price: Number.isFinite(meta.regularMarketPrice) ? meta.regularMarketPrice / divisor : null,
    prevClose: Number.isFinite(meta.chartPreviousClose) ? meta.chartPreviousClose / divisor
      : Number.isFinite(meta.previousClose) ? meta.previousClose / divisor : null,
    volume: volume || null,
    avgVolume,
    series,
    source: 'yahoo',
    asOf: new Date((meta.regularMarketTime || Date.now() / 1000) * 1000).toISOString(),
  });
}

async function getQuotes(symbols) {
  const now = Date.now();
  const out = [];
  await Promise.all(symbols.map(async (symbol) => {
    const cached = quoteCache.get(symbol);
    if (cached && now - cached.at < QUOTE_TTL_MS) { out.push(cached.quote); return; }
    try {
      const q = await yahooQuote(symbol);
      if (q.price !== null) {
        quoteCache.set(symbol, { quote: q, at: now });
        out.push(q);
        return;
      }
      throw new Error('no price');
    } catch (err) {
      log(`quote fallback (sim) for ${symbol}: ${err.message}`);
      out.push(simulateQuote(symbol));
    }
  }));
  return out;
}

/* ---------- Obsidian vault mirroring ---------- */

let vaultTimer = null;

function scheduleVaultWrite() {
  if (!VAULT_DIR || !state) return;
  clearTimeout(vaultTimer);
  vaultTimer = setTimeout(writeVaultNow, 2_000);
}

async function writeVaultNow() {
  if (!VAULT_DIR || !state) return;
  try {
    const fx = state.fx?.rates?.ZAR ? state.fx : await fetchRates();
    const symbols = [...new Set([...UNIVERSE.map((u) => u.symbol), ...state.holdings.map((h) => h.symbol)])];
    const quotes = await getQuotes(symbols);
    const report = buildReport(state, quotes, fx);
    const files = buildVaultFiles(state, report);
    for (const f of files) {
      const target = join(VAULT_DIR, ...f.path.split('/'));
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, f.content, 'utf8');
    }
    log(`Obsidian vault updated (${files.length} notes) in ${VAULT_DIR}`);
  } catch (err) {
    log(`vault write failed: ${err.message}`);
  }
}

/* ---------- WebSocket hub ---------- */

const wss = new WebSocketServer({ port: PORT, host: '0.0.0.0' });
const clients = new Set();

wss.on('connection', (ws, req) => {
  clients.add(ws);
  const peer = req.socket.remoteAddress;
  log(`device connected from ${peer} (${clients.size} online)`);

  ws.on('message', async (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'hello') {
      send(ws, { type: 'hello:ack', server: `${os.hostname()}:${PORT}` });
      if (state && (!Number.isFinite(msg.rev) || state.rev > msg.rev)) {
        send(ws, { type: 'state', state });
      }
    } else if (msg.type === 'state') {
      const incoming = sanitiseState(msg.state);
      if (!incoming) return;
      const newer = !state || incoming.rev > state.rev
        || (incoming.rev === state.rev && String(incoming.updatedAt) > String(state.updatedAt));
      if (newer) {
        state = incoming;
        saveState();
        scheduleVaultWrite();
        for (const c of clients) if (c !== ws && c.readyState === 1) send(c, { type: 'state', state });
        log(`state rev ${state.rev} accepted and broadcast (${clients.size - 1} peers)`);
      }
    } else if (msg.type === 'quotes:req') {
      const symbols = Array.isArray(msg.symbols) ? msg.symbols.filter((s) => typeof s === 'string').slice(0, 100) : [];
      const quotes = await getQuotes(symbols);
      send(ws, { type: 'quotes:res', reqId: msg.reqId, quotes });
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    log(`device disconnected (${clients.size} online)`);
  });
  ws.on('error', () => { /* close follows */ });
});

function send(ws, msg) {
  try { ws.send(JSON.stringify(msg)); } catch { /* peer vanished */ }
}

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

/* ---------- banner ---------- */

const nets = os.networkInterfaces();
const lanIps = Object.values(nets).flat().filter((n) => n && n.family === 'IPv4' && !n.internal).map((n) => n.address);
log(`Eucharisteo Advisor sync hub listening on port ${PORT}`);
for (const ip of lanIps) log(`  connect from your phone/PC:  ${ip}:${PORT}`);
if (VAULT_DIR) log(`  Obsidian vault mirroring on: ${VAULT_DIR}`);
else log('  (set EC_ADVISOR_VAULT=/path/to/vault to auto-write Obsidian notes)');
if (state) scheduleVaultWrite();
