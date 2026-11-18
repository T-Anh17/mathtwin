import React, { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { BenchmarkScreen } from './BenchmarkScreen.js';
import { HomeScreen } from './HomeScreen.js';
import { HistoryScreen, SettingsScreen } from './SecondaryScreens.js';
import { SessionScreen } from './SessionScreen.js';
import { Topbar } from './product-ui.js';
import { productVi as m } from './product-messages.vi.js';
import { sessionVi } from './flow/messages.vi.js';
import { createSession, sessionReducer } from './flow/sessionReducer.js';
import { historyItem } from './flow/history.js';
import { createIndexedDBStorage } from './storage/indexeddb.js';
import { mobile } from './native.js';
import type { Session, SessionEvent } from './flow/types.js';
import type { SessionStore } from './flow/store.js';
import type { HistoryItem, ReaderStatus, Tab } from './product-types.js';

type Page = Tab | 'session' | 'benchmark';

export function App({ sessionStore }: { sessionStore?: SessionStore } = {}) {
  const [storage] = useState(() => createIndexedDBStorage());
  const store = sessionStore ?? storage.sessions;
  const [page, setPage] = useState<Page>('home');
  const [returnPage, setReturnPage] = useState<Tab>('home');
  const [session, setSession] = useState<Session | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [reader, setReader] = useState<ReaderStatus>({ ready: false, size: 'B' });
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const refresh = async () => setHistory((await store.list()).map(historyItem));
  useEffect(() => {
    let live = true;
    store.list().then((items) => { if (live) setHistory(items.map(historyItem)); }).catch(() => { if (live) setError(true); });
    if (Capacitor.isNativePlatform()) mobile.models().then(({ models }) => {
      const b = models.find((model) => model.model === 'b');
      if (live && b) setReader({ ready: b.ready, size: sessionVi.readerBytes(b.bytes) });
    }).catch(() => {});
    return () => { live = false; };
  }, [store]);
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
    setSession(next); setReturnPage('home'); setPage('session');
  });
  const dispatch = (event: SessionEvent) => void run(async () => {
    if (!session) return;
    const next = sessionReducer(session, event);
    await store.put(next); setSession(next); await refresh();
  });
  const openHistory = (item: HistoryItem) => void run(async () => {
    const saved = await store.get(item.id);
    if (!saved) { await refresh(); return; }
    setSession(saved); setReturnPage(page === 'history' ? 'history' : 'home'); setPage('session');
  });
  const remove = (item: HistoryItem) => void run(async () => {
    await store.remove(item.id);
    if (session?.id === item.id) setSession(null);
    await refresh();
  });
  const actions = {
    onCapture: () => start('photo'), onManualInput: () => start('manual'), onDownloadReader: () => setPage('settings'),
    onCancel: () => setPage('home'),
  };
  return <div className="product-app" aria-busy={busy}>
    {error && <div className="card" role="alert">{sessionVi.storageError}<button className="btn btn-outline" disabled={busy} onClick={() => void run(refresh)}>{sessionVi.retry}</button></div>}
    {page === 'home' && <HomeScreen state={history.length ? 'du-lieu' : 'rong'} reader={reader} history={history} actions={actions} onNavigate={setPage} onOpenHistory={openHistory} onRemove={remove}/>}
    {page === 'history' && <HistoryScreen history={history} onNavigate={setPage} onOpenHistory={openHistory} onRemove={remove}/>}
    {page === 'settings' && <SettingsScreen reader={reader} onNavigate={setPage} onBenchmark={() => setPage('benchmark')}/>}
    {page === 'session' && session && <SessionScreen session={session} busy={busy} onEvent={dispatch} onBack={() => setPage(returnPage)}/>}
    {page === 'benchmark' && <div><Topbar title={m.benchmark} onBack={() => setPage('settings')}/><BenchmarkScreen/></div>}
  </div>;
}
