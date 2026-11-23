// IndexedDB snapshot of dashboard data and the issuer DID document, so the
// portal renders and can verify QR signatures when the network drops.

const DB_NAME = 'trusttrace';
const STORE = 'snapshots';

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const result = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(result?.result ?? result);
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveSnapshot(key, value) {
  try {
    await withStore('readwrite', (store) => store.put({ value, savedAt: Date.now() }, key));
  } catch {
    // storage full or blocked; offline mode simply has less to show
  }
}

export async function loadSnapshot(key) {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function clearSnapshots() {
  try {
    await withStore('readwrite', (store) => store.clear());
  } catch {
    // ignore
  }
}
