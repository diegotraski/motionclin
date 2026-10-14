/* MotionClin · almacenamiento local (IndexedDB). Los datos clínicos no salen del dispositivo. */
(function () {
  'use strict';
  const DB_NAME = 'motionclin', VERSION = 1, STORES = ['patients', 'analyses', 'settings'];
  let dbp = null; const mem = { patients: new Map(), analyses: new Map(), settings: new Map() };
  let persistent = true;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, VERSION);
        req.onupgradeneeded = () => { const db = req.result; for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' }); };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => { persistent = false; resolve(null); };
        req.onblocked = () => { persistent = false; resolve(null); };
      } catch (e) { persistent = false; resolve(null); }
    });
    return dbp;
  }
  async function tx(store, mode, fn) {
    const db = await open();
    if (!db) return fn(null);
    return new Promise((resolve, reject) => {
      try {
        const t = db.transaction(store, mode); const os = t.objectStore(store);
        const r = fn(os);
        t.oncomplete = () => resolve(r && r.result !== undefined ? r.result : r);
        t.onerror = () => reject(t.error);
      } catch (e) { reject(e); }
    });
  }
  const Store = {
    async all(store) {
      const db = await open();
      if (!db) return [...mem[store].values()];
      return new Promise((res, rej) => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    },
    async get(store, id) {
      const db = await open();
      if (!db) return mem[store].get(id);
      return new Promise((res, rej) => { const r = db.transaction(store).objectStore(store).get(id); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    },
    async put(store, obj) {
      const db = await open();
      if (!db) { mem[store].set(obj.id, obj); return obj; }
      await tx(store, 'readwrite', (os) => os.put(obj)); return obj;
    },
    async del(store, id) {
      const db = await open();
      if (!db) { mem[store].delete(id); return; }
      await tx(store, 'readwrite', (os) => os.delete(id));
    },
    async clear(store) {
      const db = await open();
      if (!db) { mem[store].clear(); return; }
      await tx(store, 'readwrite', (os) => os.clear());
    },
    async setting(key, fallback) { const r = await Store.get('settings', key); return r ? r.value : fallback; },
    async setSetting(key, value) { return Store.put('settings', { id: key, value }); },
    isPersistent: async () => { await open(); return persistent; },
  };
  window.MCStore = Store;
})();
