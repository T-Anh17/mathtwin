import type { PhotoRef, Session } from '../flow/types.js';
import type { PhotoStore, SessionStore } from '../flow/store.js';
import { newestFirst, photoIds, summarize } from '../flow/store.js';

export interface MemoryData { sessions: Map<string, Session>; photos: Map<string, Blob>; nextPhoto: number }
export function createMemoryData(): MemoryData { return { sessions: new Map(), photos: new Map(), nextPhoto: 0 }; }

/** Keep data across instances to simulate an app restart; URLs are instance-local resources. */
export function createMemoryStorage(data = createMemoryData()) {
  const urls = new Map<string, string>();
  const removePhoto = (id: string) => {
    data.photos.delete(id);
    const url = urls.get(id); if (url) URL.revokeObjectURL(url);
    urls.delete(id);
  };
  const photos: PhotoStore = {
    async put(blob, meta) {
      const id = `photo-${++data.nextPhoto}`;
      data.photos.set(id, blob);
      return { ...structuredClone(meta), id } satisfies PhotoRef;
    },
    async url(id) {
      const blob = data.photos.get(id); if (!blob) throw new Error('Photo not found');
      let url = urls.get(id);
      if (!url) { url = URL.createObjectURL(blob); urls.set(id, url); }
      return url;
    },
    async remove(id) { removePhoto(id); },
  };
  const sessions: SessionStore = {
    async usage() { return { sessions: data.sessions.size,
      historyBytes: [...data.sessions.values()].reduce((n, s) => n + new Blob([JSON.stringify(s)]).size, 0),
      photoBytes: [...data.photos.values()].reduce((n, b) => n + b.size, 0) }; },
    async clear() { data.sessions.clear(); for (const id of data.photos.keys()) removePhoto(id); },
    async list() { return [...data.sessions.values()].map(summarize).sort(newestFirst); },
    async get(id) { return structuredClone(data.sessions.get(id) ?? null); },
    async put(s) {
      const old = data.sessions.get(s.id), next = new Set(photoIds(s));
      data.sessions.set(s.id, structuredClone(s));
      if (old) for (const id of photoIds(old)) if (!next.has(id)) removePhoto(id);
    },
    async remove(id) {
      const s = data.sessions.get(id);
      if (s) for (const photo of photoIds(s)) removePhoto(photo);
      data.sessions.delete(id);
    },
  };
  return { sessions, photos, async close() { for (const url of urls.values()) URL.revokeObjectURL(url); urls.clear(); } };
}
