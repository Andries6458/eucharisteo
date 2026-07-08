/* Obsidian vault writer (browser side).
   Preferred path: File System Access API — the user picks their vault folder
   once (Chrome/Edge on desktop), the handle persists in IndexedDB, and every
   export writes the .md files straight into the vault.
   Fallback path (Firefox/Safari/mobile): each note downloads as a .md file.
   Third path (hands-free): the PC sync server mirrors the vault automatically
   whenever state syncs — see sync-server/server.js. */

import { buildVaultFiles } from './vault-md.js';

const IDB_NAME = 'eucharisteo-advisor';
const IDB_STORE = 'handles';
const HANDLE_KEY = 'obsidian-vault';

export const supportsDirectoryPicker = () => typeof globalThis.showDirectoryPicker === 'function';

/* ---------- tiny IndexedDB k/v (directory handles can't go in localStorage) ---------- */

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
    tx.onsuccess = () => resolve(tx.result ?? null);
    tx.onerror = () => reject(tx.error);
  });
}

async function idbSet(key, value) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).put(value, key);
    tx.onsuccess = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDel(key) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).delete(key);
    tx.onsuccess = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ---------- vault handle lifecycle ---------- */

export async function pickVault() {
  if (!supportsDirectoryPicker()) throw new Error('This browser cannot write folders directly — use Download instead.');
  const handle = await showDirectoryPicker({ mode: 'readwrite', id: 'eucharisteo-vault' });
  await idbSet(HANDLE_KEY, handle);
  return handle;
}

export async function savedVault() {
  try { return await idbGet(HANDLE_KEY); } catch { return null; }
}

export async function forgetVault() {
  try { await idbDel(HANDLE_KEY); } catch { /* nothing saved */ }
}

async function ensurePermission(handle) {
  if (!handle) return false;
  const opts = { mode: 'readwrite' };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  return (await handle.requestPermission(opts)) === 'granted';
}

/* ---------- writing ---------- */

async function writeFileDeep(root, relPath, content) {
  const parts = relPath.split('/').filter(Boolean);
  const fileName = parts.pop();
  let dir = root;
  for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: true });
  const fh = await dir.getFileHandle(fileName, { create: true });
  const w = await fh.createWritable();
  await w.write(content);
  await w.close();
}

/* Write the full vault set into the saved (or newly picked) vault folder.
   Returns { written: n, vaultName }. */
export async function writeVault(state, report) {
  let handle = await savedVault();
  if (!handle || !(await ensurePermission(handle))) {
    handle = await pickVault();
    if (!(await ensurePermission(handle))) throw new Error('Write permission to the vault folder was declined.');
  }
  const files = buildVaultFiles(state, report);
  for (const f of files) await writeFileDeep(handle, f.path, f.content);
  return { written: files.length, vaultName: handle.name };
}

/* Fallback: trigger a download per note. */
export function downloadVault(state, report) {
  const files = buildVaultFiles(state, report);
  for (const f of files) {
    const blob = new Blob([f.content], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = f.path.split('/').pop();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5_000);
  }
  return { written: files.length, vaultName: null };
}
