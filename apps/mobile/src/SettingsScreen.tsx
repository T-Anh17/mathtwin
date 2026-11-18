import React, { useEffect, useRef, useState } from 'react';
import manifest from '../../../tools/models/manifest.json';
import { BottomNav } from './product-ui.js';
import { productVi } from './product-messages.vi.js';
import { settingsVi as m } from './settings.vi.js';
import { messageFor } from './messages.vi.js';
import type { MobilePlugin, Model, ModelState } from './contracts.js';
import type { Tab } from './product-types.js';
import type { StorageUsage } from './flow/store.js';
import './settings.css';

export type ModelControls = Pick<MobilePlugin, 'models' | 'download' | 'cancelDownload' | 'deleteModel'>;
export function SettingsScreen({ onNavigate, onBenchmark, onDemo, modelApi, usage, onClear, busy = false }: {
  onNavigate: (tab: Tab) => void; onBenchmark: () => void; onDemo?: () => void;
  modelApi?: ModelControls; usage?: StorageUsage; onClear?: () => Promise<void>; busy?: boolean;
}) {
  const [models, setModels] = useState<ModelState[]>([]), [working, setWorking] = useState(false);
  const [downloading, setDownloading] = useState(false), [message, setMessage] = useState('');
  const locked = useRef(false), live = useRef(true);
  const refresh = async () => { if (modelApi) { const result = await modelApi.models(); if (live.current) setModels(result.models); } };
  useEffect(() => { live.current = true; void refresh().catch((e: unknown) => { if (live.current) setMessage(messageFor(e)); });
    return () => { live.current = false; }; }, [modelApi]);
  useEffect(() => {
    if (!downloading) return;
    const timer = setInterval(() => { void refresh().catch(() => {}); }, 1000);
    return () => clearInterval(timer);
  }, [downloading, modelApi]);
  const action = async (fn: () => Promise<void>) => {
    if (busy || locked.current) return;
    locked.current = true; setWorking(true); setMessage('');
    try { await fn(); } catch (e) { if (live.current) setMessage(messageFor(e)); }
    finally { locked.current = false; if (live.current) { setWorking(false); setDownloading(false); } }
  };
  const modelAction = (model: Model, remove: boolean) => void action(async () => {
    if (!modelApi) return;
    setDownloading(!remove);
    try { if (remove) await modelApi.deleteModel({ model }); else await modelApi.download({ model }); }
    finally { await refresh(); }
  });
  const disabled = busy || working;
  return <div className="screen settings-screen"><div className="topbar" style={{ paddingLeft: 16 }}><h1>{productVi.settings}</h1></div><div className="content">
    <h2 className="section-title">{m.models}</h2><p>{m.downloadNote}</p>
    {(['b', 'a'] as const).map((model) => {
      const files = manifest.files.filter((f) => f.model === model), bytes = files.reduce((n, f) => n + f.bytes, 0);
      const state = models.find((s) => s.model === model);
      const ready = state?.ready ?? false;
      return <section className="card" key={model}><h3>{m[model]}</h3><p>{ready ? m.downloaded : m.missing}</p>
        <p>{m.progress(state?.downloadedBytes ?? 0, bytes)}</p>
        <progress max={bytes} value={state?.downloadedBytes ?? 0} aria-label={m.download}/>
        <p>{m.cpu}: {state?.cpuVariant ?? m.unknownCpu}</p>
        <details><summary>{m.sha}</summary>{files.map((file) => <div key={file.filename}><p>{file.filename} · {m.bytes(file.bytes)}</p><code>{file.sha256}</code></div>)}</details>
        <div className="work-buttons"><button className="btn btn-primary" disabled={disabled || ready || !modelApi}
          onClick={() => modelAction(model, false)}>{m.download}</button>
          <button className="btn btn-outline" disabled={disabled || !modelApi || !(state?.downloadedBytes)} onClick={() => modelAction(model, true)}>{m.remove}</button></div>
      </section>;
    })}
    <p>{m.d}</p>
    {downloading && <button className="btn btn-outline" onClick={() => { void modelApi?.cancelDownload().catch((e: unknown) => setMessage(messageFor(e))); }}>{m.cancel}</button>}
    <section className="card"><h2 className="section-title">{m.storage}</h2>
      <p>{m.history}: {usage ? m.historySize(usage.sessions, usage.historyBytes) : m.pending}</p>
      <p>{m.photos}: {usage ? m.bytes(usage.photoBytes) : m.pending}</p><p>{m.clearNote}</p>
      <button className="btn btn-outline btn-block" disabled={disabled || !onClear} onClick={() => void action(async () => { await onClear?.(); setMessage(m.cleared); })}>{m.clear}</button>
    </section>
    <button className="btn btn-outline btn-block" disabled={disabled || !onDemo} onClick={onDemo}>{m.demo}</button>
    <button className="btn btn-outline btn-block" disabled={disabled} onClick={onBenchmark}>{productVi.benchmark}</button>
    {message && <p role="status" className="banner">{message}</p>}
  </div><BottomNav active="settings" onNavigate={(tab) => { if (!disabled) onNavigate(tab); }}/></div>;
}
