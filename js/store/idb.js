// 아주 작은 IndexedDB 키-값 저장소. 열 수 없으면(사파리 개인 정보 보호 모드 등) 메모리로 대신한다.

export function openStore(dbName, storeName = 'kv') {
  let dbp = null;
  const mem = new Map();
  const open = () => {
    if (dbp) return dbp;
    dbp = new Promise((resolve) => {
      try {
        const req = indexedDB.open(dbName, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(storeName);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return dbp;
  };
  const tx = async (mode, fn) => {
    const db = await open();
    if (!db) return fn(null);
    return new Promise((resolve, reject) => {
      const t = db.transaction(storeName, mode);
      const s = t.objectStore(storeName);
      const r = fn(s);
      t.oncomplete = () => resolve(r?.result ?? r);
      t.onerror = () => reject(t.error);
    });
  };
  return {
    async get(key) {
      const db = await open();
      if (!db) return mem.get(key);
      return new Promise((resolve) => {
        const r = db.transaction(storeName).objectStore(storeName).get(key);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => resolve(undefined);
      });
    },
    set: (key, value) => tx('readwrite', (s) => (s ? s.put(value, key) : mem.set(key, value))),
    del: (key) => tx('readwrite', (s) => (s ? s.delete(key) : mem.delete(key))),
    async entries() {
      const db = await open();
      if (!db) return [...mem.entries()];
      return new Promise((resolve) => {
        const out = [];
        const r = db.transaction(storeName).objectStore(storeName).openCursor();
        r.onsuccess = () => {
          const c = r.result;
          if (!c) return resolve(out);
          out.push([c.key, c.value]);
          c.continue();
        };
        r.onerror = () => resolve(out);
      });
    },
    clear: () => tx('readwrite', (s) => (s ? s.clear() : mem.clear())),
  };
}
