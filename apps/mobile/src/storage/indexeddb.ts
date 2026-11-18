import type { Session } from '../flow/types.js';
import type { PhotoStore, SessionStore } from '../flow/store.js';
import { newestFirst, photoIds, summarize } from '../flow/store.js';

/** Both stores share a database so replacing/deleting a session also deletes its photos atomically. */
export function createIndexedDBStorage(name = 'mathtwin-sessions') {
  let database: Promise<IDBDatabase> | undefined;
  const urls = new Map<string, string>();
  const revoke = (id: string) => {
    const url = urls.get(id); if (url) URL.revokeObjectURL(url); urls.delete(id);
  };
  const open = () => database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('sessions', { keyPath: 'id' });
      request.result.createObjectStore('photos', { keyPath: 'id' });
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); database = undefined; };
      resolve(request.result);
    };
    request.onerror = () => { database = undefined; reject(request.error); };
    request.onblocked = () => { database = undefined; reject(new Error('Database upgrade blocked')); };
  });
  async function transaction<T>(stores: string[], mode: IDBTransactionMode,
    schedule: (tx: IDBTransaction, result: (value: T) => void) => void): Promise<T> {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      let result!: T;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error ?? new Error('Storage transaction aborted'));
      tx.onerror = () => { /* The abort handler reports errors after rollback. */ };
      try { schedule(tx, (value) => { result = value; }); }
      catch (error) { tx.abort(); reject(error); }
    });
  }
  const photos: PhotoStore = {
    async put(blob, meta) {
      const ref = { ...meta, id: crypto.randomUUID() };
      await transaction<void>(['photos'], 'readwrite', (tx) => { tx.objectStore('photos').put({ ...ref, blob }); });
      return ref;
    },
    async url(id) {
      if (urls.has(id)) return urls.get(id)!;
      const record = await transaction<{ blob: Blob } | undefined>(['photos'], 'readonly', (tx, result) => {
        const request = tx.objectStore('photos').get(id);
        request.onsuccess = () => result(request.result as { blob: Blob } | undefined);
      });
      if (!record) throw new Error('Photo not found');
      // Another concurrent url request may have created it while this read was pending.
      if (!urls.has(id)) urls.set(id, URL.createObjectURL(record.blob));
      return urls.get(id)!;
    },
    async remove(id) {
      await transaction<void>(['photos'], 'readwrite', (tx) => { tx.objectStore('photos').delete(id); });
      revoke(id);
    },
  };
  const sessions: SessionStore = {
    async list() {
      const records = await transaction<Session[]>(['sessions'], 'readonly', (tx, result) => {
        const request = tx.objectStore('sessions').getAll();
        request.onsuccess = () => result(request.result as Session[]);
      });
      return records.map(summarize).sort(newestFirst);
    },
    async get(id) {
      return transaction<Session | null>(['sessions'], 'readonly', (tx, result) => {
        const request = tx.objectStore('sessions').get(id);
        request.onsuccess = () => result((request.result as Session | undefined) ?? null);
      });
    },
    async put(s) {
      // Own the snapshot before opening the database or waiting for an existing transaction.
      const snapshot = structuredClone(s);
      const removed: string[] = [], next = new Set(photoIds(snapshot));
      await transaction<void>(['sessions', 'photos'], 'readwrite', (tx) => {
        const store = tx.objectStore('sessions'), request = store.get(snapshot.id);
        request.onsuccess = () => {
          const old = request.result as Session | undefined;
          if (old) for (const id of photoIds(old)) if (!next.has(id)) {
            tx.objectStore('photos').delete(id); removed.push(id);
          }
          store.put(snapshot);
        };
      });
      removed.forEach(revoke);
    },
    async remove(id) {
      const removed: string[] = [];
      await transaction<void>(['sessions', 'photos'], 'readwrite', (tx) => {
        const store = tx.objectStore('sessions'), request = store.get(id);
        request.onsuccess = () => {
          const s = request.result as Session | undefined;
          if (s) for (const photo of photoIds(s)) { tx.objectStore('photos').delete(photo); removed.push(photo); }
          store.delete(id);
        };
      });
      removed.forEach(revoke);
    },
  };
  return { sessions, photos, async close() {
    for (const url of urls.values()) URL.revokeObjectURL(url); urls.clear();
    if (database) (await database).close(); database = undefined;
  } };
}
