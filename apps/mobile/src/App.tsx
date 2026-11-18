import React, { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { BenchmarkScreen } from './BenchmarkScreen.js';
import { HomeScreen } from './HomeScreen.js';
import { HistoryScreen, SettingsScreen } from './SecondaryScreens.js';
import { SessionScreen } from './SessionScreen.js';
import { Topbar } from './product-ui.js';
import { productVi as m } from './product-messages.vi.js';
import { sessionVi } from './flow/messages.vi.js';
import { createSession } from './flow/sessionReducer.js';
import { runSessionEvent } from './session-runner.js';
import { DemoScreen } from './DemoScreen.js';
import { historyItem } from './flow/history.js';
import { createIndexedDBStorage } from './storage/indexeddb.js';
import { mobile } from './native.js';
import type { Session, SessionEvent } from './flow/types.js';
import type { SessionStore, PhotoStore, StorageUsage } from './flow/store.js';
import type { Readers } from './flow/reading.js';
import { nativeProblemReaders } from './problem-readers.js';
import { previewReaders } from './preview-readers.js';
import { problemVi } from './problem.vi.js';
import type { HistoryItem, ReaderStatus, Tab } from './product-types.js';

type Page = Tab | 'session' | 'benchmark' | 'demo';

export function App({ sessionStore, photoStore, readers: injectedReaders }: { sessionStore?: SessionStore; photoStore?: PhotoStore; readers?: Readers } = {}) {
  const [storage] = useState(() => createIndexedDBStorage());
  const store = sessionStore ?? storage.sessions;
  const photos = photoStore ?? storage.photos;
  const preview = !Capacitor.isNativePlatform();
  const [defaultReaders] = useState(() => preview ? previewReaders() : nativeProblemReaders());
  const readers = injectedReaders ?? defaultReaders;
  const [page, setPage] = useState<Page>('home');
  const [returnPage, setReturnPage] = useState<Tab>('home');
  const [session, setSession] = useState<Session | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [usage, setUsage] = useState<StorageUsage>();
  const [resumed, setResumed] = useState(false);
  const [reader, setReader] = useState<ReaderStatus>({ ready: preview || !!injectedReaders, size: 'B' });
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const activeSession = useRef<Session | null>(null);
  const refresh = async () => setHistory((await store.list()).map(historyItem));
  useEffect(() => {
    let live = true;
    if (page === 'settings') store.usage().then((value) => { if (live) setUsage(value); }).catch(() => { if (live) setError(true); });
    store.list().then((items) => { if (live) setHistory(items.map(historyItem)); }).catch(() => { if (live) setError(true); });
    if (Capacitor.isNativePlatform()) mobile.models().then(({ models }) => {
      const b = models.find((model) => model.model === 'b');
      if (live && b) setReader({ ready: b.ready, size: sessionVi.readerBytes(b.bytes) });
    }).catch(() => {});
    return () => { live = false; };
  }, [store, page]);
  useEffect(() => () => { void storage.close(); }, [storage]);

  const run = async (action: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(false);
    try { await action(); } catch { setError(true); }
    finally { locked.current = false; setBusy(false); }
  };
  const start = (source: Session['specSource']) => void run(async () => {
    const next = { ...createSession(crypto.randomUUID(), new Date().toISOString()), specSource: source };
    await store.put(next); await refresh();
    activeSession.current = next; setSession(next); setResumed(false); setReturnPage('home'); setPage('session');
  });
  const dispatch = async (event: SessionEvent): Promise<void> => {
    if (!activeSession.current || locked.current) throw new Error(sessionVi.storageError);
    locked.current = true; setBusy(true);
    try {
      const next = runSessionEvent(activeSession.current, event);
      await store.put(next); activeSession.current = next; setSession(next); await refresh();
    } catch (e) { setError(true); throw e; }
    finally { locked.current = false; setBusy(false); }
  };
  const openHistory = (item: HistoryItem) => void run(async () => {
    const saved = await store.get(item.id);
    if (!saved) { await refresh(); return; }
    activeSession.current = saved; setSession(saved); setResumed(true); setReturnPage(page === 'history' ? 'history' : 'home'); setPage('session');
  });
  const remove = (item: HistoryItem) => void run(async () => {
    await store.remove(item.id);
    if (session?.id === item.id) { activeSession.current = null; setSession(null); }
    await refresh();
  });
  const actions = {
    onCapture: () => start('photo'), onManualInput: () => start('manual'), onDownloadReader: () => setPage('settings'),
    onCancel: () => setPage('home'),
  };
  return <div className="product-app" aria-busy={busy}>
    {preview && page === 'home' && <p className="banner" role="status">{problemVi.preview}</p>}
    {error && <div className="card" role="alert">{sessionVi.storageError}<button className="btn btn-outline" disabled={busy} onClick={() => void run(refresh)}>{sessionVi.retry}</button></div>}
    {page === 'home' && <HomeScreen state={history.length ? 'du-lieu' : 'rong'} reader={reader} history={history} actions={actions} onNavigate={setPage} onOpenHistory={openHistory} onRemove={remove}/>}
    {page === 'history' && <HistoryScreen history={history} onNavigate={setPage} onOpenHistory={openHistory} onRemove={remove}/>}
    {page === 'settings' && <SettingsScreen onNavigate={setPage} onBenchmark={() => setPage('benchmark')} onDemo={() => setPage('demo')} busy={busy}
      {...(usage ? { usage } : {})} {...(!preview ? { modelApi: mobile } : {})}
      onClear={async () => {
        await store.clear(); activeSession.current = null; setSession(null); await refresh(); setUsage(await store.usage());
      }}/>}
    {page === 'session' && session && <SessionScreen key={session.id} session={session} resumed={resumed} busy={busy} onEvent={dispatch} onBack={() => setPage(returnPage)}
      photoStore={photos} readers={readers} readerReady={preview || !!injectedReaders || reader.ready} preview={preview} onSettings={() => setPage('settings')}/>}
    {page === 'benchmark' && <div><Topbar title={m.benchmark} onBack={() => setPage('settings')}/><BenchmarkScreen/></div>}
    {page === 'demo' && <DemoScreen onBack={() => setPage('settings')}/>}
  </div>;
}
