/* LAN sync client — connects the app to the PC sync server (sync-server/)
   over WebSocket. Duties:
     - push local state changes, apply newer remote state (LWW via store)
     - request live quotes through the server's Yahoo proxy ("relay" provider)
   Reconnects with capped exponential backoff and reports status to the UI. */

const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 60_000;
const QUOTE_TIMEOUT_MS = 8_000;

/* Accepts "192.168.1.20", "192.168.1.20:8765", "ws://host:8765" or
   "wss://host". Returns a normalised ws URL or null. */
export function normaliseSyncUrl(input, defaultPort = 8765) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  if (/^wss?:\/\//i.test(raw)) return raw;
  if (/^[a-z0-9.-]+(:\d+)?$/i.test(raw)) {
    return `ws://${raw}${raw.includes(':') ? '' : `:${defaultPort}`}`;
  }
  return null;
}

export function createSyncClient(store, { onStatus = () => {}, WebSocketImpl = globalThis.WebSocket } = {}) {
  let ws = null;
  let url = null;
  let attempts = 0;
  let closedByUser = true;
  let reconnectTimer = null;
  let reqSeq = 0;
  const pending = new Map(); // reqId -> {resolve, reject, timer}

  function status(s, extra = {}) { onStatus({ state: s, url, attempts, ...extra }); }

  function send(msg) {
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }

  function handleMessage(ev) {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'state' && msg.state) {
      const applied = store.applyRemote(msg.state);
      if (applied) status('connected', { received: true });
    } else if (msg.type === 'quotes:res' && pending.has(msg.reqId)) {
      const p = pending.get(msg.reqId);
      pending.delete(msg.reqId);
      clearTimeout(p.timer);
      p.resolve(Array.isArray(msg.quotes) ? msg.quotes : []);
    } else if (msg.type === 'hello:ack') {
      status('connected', { server: msg.server });
    }
  }

  function open(target) {
    close(); // drop any previous socket
    url = target;
    closedByUser = false;
    status('connecting');
    try {
      ws = new WebSocketImpl(target);
    } catch (err) {
      status('error', { error: String(err) });
      scheduleReconnect();
      return;
    }
    ws.onopen = () => {
      attempts = 0;
      const s = store.get();
      send({ type: 'hello', deviceId: s.deviceId, rev: s.rev });
      send({ type: 'state', state: s });
      status('connected');
    };
    ws.onmessage = handleMessage;
    ws.onclose = () => {
      for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('sync socket closed')); }
      pending.clear();
      if (!closedByUser) { status('disconnected'); scheduleReconnect(); }
    };
    ws.onerror = () => { /* onclose follows and handles retry */ };
  }

  function scheduleReconnect() {
    if (closedByUser || !url) return;
    attempts += 1;
    const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** Math.min(attempts, 5));
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => open(url), delay);
    status('retrying', { nextInMs: delay });
  }

  function close() {
    closedByUser = true;
    clearTimeout(reconnectTimer);
    if (ws) {
      ws.onclose = null;
      try { ws.close(); } catch { /* already closed */ }
      ws = null;
    }
  }

  // push local changes (remote-origin changes must not echo back)
  store.subscribe((state, meta) => {
    if (meta.origin === 'local') send({ type: 'state', state });
  });

  return {
    connect(input) {
      const target = normaliseSyncUrl(input);
      if (!target) { status('invalid-url'); return false; }
      open(target);
      return true;
    },
    disconnect() { close(); status('off'); },
    isConnected: () => !!ws && ws.readyState === 1,

    /* Relay-provider interface consumed by market.js */
    requestQuotes(symbols) {
      return new Promise((resolve, reject) => {
        if (!this.isConnected()) { reject(new Error('sync not connected')); return; }
        const reqId = ++reqSeq;
        const timer = setTimeout(() => {
          pending.delete(reqId);
          reject(new Error('quote request timed out'));
        }, QUOTE_TIMEOUT_MS);
        pending.set(reqId, { resolve, reject, timer });
        send({ type: 'quotes:req', reqId, symbols });
      });
    },
  };
}
