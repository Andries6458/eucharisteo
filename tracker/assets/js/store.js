/* ==========================================================================
   EUCHARISTEO INVOICE TRACKER — Storage layer
   --------------------------------------------------------------------------
   One small API used by the whole app. It transparently uses either:
     • Firebase (Auth + Firestore) for shared, real-time, multi-device sync, OR
     • the browser's localStorage (LOCAL MODE) when Firebase isn't configured.
   ========================================================================== */

import { firebaseConfig, isFirebaseConfigured, WORKSPACE_ID } from './config.js';

const FB_VER = '10.12.2';
const LS_KEY = `eucharisteo:invoices:${WORKSPACE_ID}`;
const LS_META = `eucharisteo:meta:${WORKSPACE_ID}`;

let mode = 'local';
let fb = null;            // { app, auth, db, fns... }
let invoiceListeners = [];
let authListeners = [];
let cache = [];          // current invoice array
let currentUser = null;

export function getMode() { return mode; }
export function getUser() { return currentUser; }

/* ---------------- public API ---------------- */

export async function initStore() {
  if (isFirebaseConfigured()) {
    try {
      await initFirebase();
      mode = 'cloud';
      return { mode };
    } catch (err) {
      console.error('Firebase init failed, falling back to local mode:', err);
    }
  }
  mode = 'local';
  initLocal();
  return { mode };
}

export function onAuth(cb) {
  authListeners.push(cb);
  cb(currentUser);
  return () => { authListeners = authListeners.filter((f) => f !== cb); };
}

export function onInvoices(cb) {
  invoiceListeners.push(cb);
  cb(cache);
  return () => { invoiceListeners = invoiceListeners.filter((f) => f !== cb); };
}

export async function signIn(email, password) {
  if (mode === 'local') {
    currentUser = { email: email || 'local@eucharisteo', name: 'Local user', local: true };
    emitAuth();
    return currentUser;
  }
  const { signInWithEmailAndPassword } = fb;
  await signInWithEmailAndPassword(fb.auth, email.trim(), password);
  // auth observer fires and wires up the data listener
}

export async function signOutUser() {
  if (mode === 'local') {
    currentUser = null;
    emitAuth();
    return;
  }
  await fb.signOut(fb.auth);
}

export async function saveInvoice(inv) {
  const now = new Date().toISOString();
  const record = {
    ...inv,
    updatedAt: now,
    updatedBy: currentUser?.email || 'unknown',
  };
  if (!record.createdAt) record.createdAt = now;
  if (!record.createdBy) record.createdBy = currentUser?.email || 'unknown';
  if (!record.id) record.id = genId();

  if (mode === 'local') {
    const idx = cache.findIndex((i) => i.id === record.id);
    if (idx >= 0) cache[idx] = record; else cache.push(record);
    persistLocal();
    emitInvoices();
    return record.id;
  }

  const { doc, setDoc } = fb;
  await setDoc(doc(fb.db, 'workspaces', WORKSPACE_ID, 'invoices', record.id), record);
  return record.id;
}

export async function deleteInvoice(id) {
  if (mode === 'local') {
    cache = cache.filter((i) => i.id !== id);
    persistLocal();
    emitInvoices();
    return;
  }
  const { doc, deleteDoc } = fb;
  await deleteDoc(doc(fb.db, 'workspaces', WORKSPACE_ID, 'invoices', id));
}

/** Replace the entire dataset (used by Import). */
export async function replaceAll(invoices) {
  if (mode === 'local') {
    cache = invoices.map((i) => ({ ...i, id: i.id || genId() }));
    persistLocal();
    emitInvoices();
    return;
  }
  for (const inv of invoices) {
    await saveInvoice({ ...inv, id: inv.id || genId() });
  }
}

export function snapshot() { return cache.slice(); }

/* ---------------- local mode ---------------- */

function initLocal() {
  try {
    cache = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
  } catch { cache = []; }
  // auto sign-in a local identity so the app is usable immediately
  const saved = localStorage.getItem(LS_META);
  if (saved) {
    try { currentUser = JSON.parse(saved); } catch { /* ignore */ }
  }
  emitAuth();
  emitInvoices();
}

function persistLocal() {
  localStorage.setItem(LS_KEY, JSON.stringify(cache));
  if (currentUser) localStorage.setItem(LS_META, JSON.stringify(currentUser));
}

/* ---------------- firebase mode ---------------- */

async function initFirebase() {
  const [{ initializeApp }, authMod, fsMod] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-firestore.js`),
  ]);

  const app = initializeApp(firebaseConfig);
  const auth = authMod.getAuth(app);
  const db = fsMod.getFirestore(app);

  // keep working offline; Firestore reconciles when back online
  try { await fsMod.enableIndexedDbPersistence(db); } catch { /* multi-tab: ignore */ }

  fb = {
    app, auth, db,
    signInWithEmailAndPassword: authMod.signInWithEmailAndPassword,
    signOut: authMod.signOut,
    doc: fsMod.doc,
    setDoc: fsMod.setDoc,
    deleteDoc: fsMod.deleteDoc,
    collection: fsMod.collection,
    onSnapshot: fsMod.onSnapshot,
  };

  let unsubData = null;
  authMod.onAuthStateChanged(auth, (user) => {
    currentUser = user
      ? { email: user.email, name: user.displayName || user.email, uid: user.uid }
      : null;
    emitAuth();

    if (unsubData) { unsubData(); unsubData = null; }
    if (user) {
      const col = fsMod.collection(db, 'workspaces', WORKSPACE_ID, 'invoices');
      unsubData = fsMod.onSnapshot(col, (snap) => {
        cache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        emitInvoices();
      }, (err) => console.error('Firestore listen error:', err));
    } else {
      cache = [];
      emitInvoices();
    }
  });
}

/* ---------------- helpers ---------------- */

function emitInvoices() { invoiceListeners.forEach((f) => f(cache)); }
function emitAuth() { authListeners.forEach((f) => f(currentUser)); }

export function genId() {
  return 'inv_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}
