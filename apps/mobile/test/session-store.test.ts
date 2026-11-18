import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryData, createMemoryStorage } from '../src/storage/memory.js';
import { createSession, sessionReducer } from '../src/flow/sessionReducer.js';
import { historyItem } from '../src/flow/history.js';
import { HomeScreen } from '../src/HomeScreen.js';
import { HistoryScreen } from '../src/SecondaryScreens.js';
import { emptyProductActions } from '../src/sample-data.js';
import type { Stage } from '../src/flow/types.js';

describe('4.1 local session/photo lifecycle', () => {
  it('continues a real partially read session after app restart and grades only the completed reading', async () => {
    const data = createMemoryData(), first = createMemoryStorage(data);
    const page0 = await first.photos.put(new Blob(['page0']), { width: 100, height: 200, page: 0 });
    const page1 = await first.photos.put(new Blob(['page1']), { width: 100, height: 200, page: 1 });
    let s = sessionReducer(createSession('partial', '2026-11-18T00:00:00Z'), { type: 'manual_spec', spec: {
      graph: { directed: false, vertices: [{ id: 'A', label: 'A' }, { id: 'B', label: 'B' }], edges: [{ id: 'e1', u: 'A', v: 'B' }] },
      task: { type: 'elements' }, questionFormat: 'tu_luan',
    } });
    s = sessionReducer(s, { type: 'work_photos', photos: [page0, page1] });
    s = sessionReducer(s, { type: 'work_read', lines: [{ text: 'Đồ thị có 2 đỉnh.', index: 0, page: 0, conf: 1, alternatives: [], region: 'solution' }], ms: 10, complete: false });
    await first.sessions.put(s); await first.close();
    const reopened = createMemoryStorage(data), restored = (await reopened.sessions.get(s.id))!;
    expect(restored.stage).toBe('work_reading'); expect(restored.workGrade).toBeUndefined();
    const completed = sessionReducer(restored, { type: 'work_read', lines: [{ text: 'Đồ thị có 1 cạnh.', index: 1, page: 1, conf: 1, alternatives: [], region: 'solution' }], ms: 20 });
    expect(completed.workLines).toHaveLength(2); expect(completed.workLines[0]).toEqual(s.workLines[0]);
    expect(completed.timings.workRead).toBe(30); expect(completed.stage).toBe('work_review');
    expect(sessionReducer(completed, { type: 'review_ack' }).workGrade?.result.verdict).toBe('DUNG');
    await reopened.close();
  });
  it('lists newest first, replaces one session, returns detached copies and removes idempotently', async () => {
    const store = createMemoryStorage();
    const old = createSession('old', '2026-11-17T00:00:00Z'), recent = createSession('recent', '2026-11-18T00:00:00Z');
    await store.sessions.put(old); await store.sessions.put(recent);
    expect((await store.sessions.list()).map((s) => s.id)).toEqual(['recent', 'old']);
    const read = (await store.sessions.get('old'))!; read.stage = 'problem_confirm';
    expect((await store.sessions.get('old'))?.stage).toBe('problem_capture');
    await store.sessions.put(read); read.stage = 'result';
    expect((await store.sessions.get('old'))?.stage).toBe('problem_confirm');
    expect(await store.sessions.list()).toHaveLength(2);
    await store.sessions.remove('old'); await store.sessions.remove('old');
    expect(await store.sessions.get('old')).toBeNull();
    expect((await store.sessions.list()).map((s) => s.id)).toEqual(['recent']);
  });
  for (const stage of ['problem_capture', 'problem_reading', 'problem_confirm', 'solution', 'work_capture', 'work_reading', 'work_review', 'result'] as Stage[]) {
    it(`restores ${stage} and all saved lines after app death`, async () => {
      const data = createMemoryData(), app = createMemoryStorage(data);
      const photo = await app.photos.put(new Blob(['image']), { width: 100, height: 200, page: 0 });
      const s = { ...createSession('saved', '2026-11-18T00:00:00Z'), stage, workPhotos: [photo],
        workLines: [{ text: 'Đồ thị có 2 đỉnh.', page: 0, index: 0, conf: 0.7, alternatives: ['Đồ thị có 3 đỉnh.'] }] };
      await app.sessions.put(s); await app.close();
      const reopened = createMemoryStorage(data);
      expect(await reopened.sessions.get(s.id)).toEqual(s);
      const url = await reopened.photos.url(photo.id); expect((await (await fetch(url)).blob()).size).toBe(5);
      await reopened.close();
    });
  }
  it('deletes both problem and work photos, revokes URLs, and keeps other sessions', async () => {
    const data = createMemoryData(), store = createMemoryStorage(data);
    const p = await store.photos.put(new Blob(['problem']), { width: 10, height: 20, page: 0 });
    const w = await store.photos.put(new Blob(['work']), { width: 10, height: 20, page: 0 });
    const other = await store.photos.put(new Blob(['other']), { width: 10, height: 20, page: 0 });
    await store.sessions.put({ ...createSession('one', '2026-11-18'), problemPhotos: [p], workPhotos: [w] });
    await store.sessions.put({ ...createSession('two', '2026-11-18'), problemPhotos: [other] });
    const pUrl = await store.photos.url(p.id), wUrl = await store.photos.url(w.id);
    expect(await store.photos.url(p.id)).toBe(pUrl);
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    try {
      await store.sessions.remove('one');
      expect(revoke).toHaveBeenCalledWith(pUrl); expect(revoke).toHaveBeenCalledWith(wUrl);
      await expect(store.photos.url(p.id)).rejects.toThrow(); await expect(store.photos.url(w.id)).rejects.toThrow();
      expect(data.photos.size).toBe(1); expect(await store.sessions.get('two')).not.toBeNull();
    } finally { revoke.mockRestore(); await store.close(); }
  });
  it('retake drops orphaned photos on save; manual photo removal and close release URLs', async () => {
    const data = createMemoryData(), store = createMemoryStorage(data);
    const p = await store.photos.put(new Blob(['image']), { width: 10, height: 20, page: 0 });
    const s = { ...createSession('one', '2026-11-18'), problemPhotos: [p] };
    await store.sessions.put(s);
    await store.sessions.put(sessionReducer(s, { type: 'retake', target: 'problem' }));
    expect(data.photos.size).toBe(0);
    const next = await store.photos.put(new Blob(['image']), { width: 10, height: 20, page: 0 });
    const url = await store.photos.url(next.id), revoke = vi.spyOn(URL, 'revokeObjectURL');
    try {
      await store.close(); expect(revoke).toHaveBeenCalledWith(url);
      await store.photos.remove(next.id); await store.photos.remove(next.id);
      await expect(store.photos.url(next.id)).rejects.toThrow();
    } finally { revoke.mockRestore(); }
  });
  it('renders real summaries in History/Recent with task, status, timestamp and delete controls', async () => {
    const store = createMemoryStorage();
    const s = createSession('actual-id', '2026-11-18T00:00:00Z');
    await store.sessions.put(s);
    const rows = (await store.sessions.list()).map(historyItem);
    expect(rows[0]?.title).toBe('Đề mới · Chờ nhập đề'); expect(rows[0]?.meta).toContain('18/11/26');
    const home = renderToStaticMarkup(createElement(HomeScreen, { state: 'du-lieu', reader: { ready: false, size: 'B' }, history: rows,
      actions: emptyProductActions, onNavigate: () => {}, onOpenHistory: () => {} }));
    const history = renderToStaticMarkup(createElement(HistoryScreen, { history: rows, onNavigate: () => {}, onOpenHistory: () => {}, onRemove: () => {} }));
    expect(home).toContain(rows[0]!.title); expect(history).toContain(rows[0]!.meta);
    expect(history).toContain('aria-label="Xóa phiên: Đề mới');
    await store.sessions.remove(s.id); expect(await store.sessions.list()).toEqual([]);
    const item = historyItem({ id: 'graded', createdAt: s.createdAt, stage: 'result', task: 'euler', verdict: 'SAI' });
    expect(item.title).toBe('Euler · SAI'); expect(item.verdict).toBe('sai');
  });
});
