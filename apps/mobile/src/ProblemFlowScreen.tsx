import React, { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { captureImage, fileDataUrl } from './capture.js';
import { decodeImage } from './images.js';
import { workerRunner } from './figure-suggest.js';
import { ProblemConfirmScreen } from './ProblemConfirmScreen.js';
import type { ProblemPhoto } from './ProblemConfirmScreen.js';
import { Topbar } from './product-ui.js';
import { problemVi as m } from './problem.vi.js';
import { sessionVi } from './flow/messages.vi.js';
import { readProblemPages, shouldReadProblem } from './flow/reading.js';
import type { Readers, ReadingProgress } from './flow/reading.js';
import type { Session, SessionEvent } from './flow/types.js';
import type { PhotoStore } from './flow/store.js';
import { readingError } from './flow/reading-error.vi.js';
import { settingsVi } from './settings.vi.js';
import './problem.css';

function blobOf(data: string): Blob {
  const parts = data.split(','), bytes = atob(parts[1]!);
  return new Blob([Uint8Array.from(bytes, (v) => v.charCodeAt(0))], { type: parts[0]!.includes('image/png') ? 'image/png' : 'image/jpeg' });
}
export function ProblemFlowScreen({ session: s, busy, photoStore, readers, readerReady = false, preview = false, onEvent, onBack, onSettings }: {
  session: Session; busy: boolean; photoStore?: PhotoStore; readers?: Readers; readerReady?: boolean; preview?: boolean;
  onEvent: (event: SessionEvent) => void | Promise<void>; onBack: () => void; onSettings?: () => void;
}) {
  const [photos, setPhotos] = useState<ProblemPhoto[]>([]);
  const [manual, setManual] = useState(s.specSource === 'manual');
  const [progress, setProgress] = useState<ReadingProgress | null>(null);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const abort = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const current = useRef(s); current.current = s;
  const photoKey = s.problemPhotos.map((p) => p.id).join(',');
  useEffect(() => {
    let live = true;
    if (photoStore) Promise.all(s.problemPhotos.map(async (p) => ({ image: await photoStore.url(p.id), width: p.width, height: p.height })))
      .then((values) => { if (live) setPhotos(values); }).catch(() => { if (live) setError(settingsVi.failures.image); });
    return () => { live = false; };
  }, [photoKey, photoStore]);
  useEffect(() => {
    if (!readers || !photoStore || !shouldReadProblem(s.stage, { manual, readerReady, available: true })) return;
    const controller = new AbortController(); abort.current = controller;
    let live = true;
    setWorking(true); setError('');
    const run = async () => {
      let acquired = false;
      try {
        await readers.activity?.(true); acquired = true;
        const outcome = await readProblemPages({ count: s.problemPhotos.length, readers, signal: controller.signal,
          saved: current.current.problemPages ?? [],
          load: async (page) => {
            const url = await photoStore.url(s.problemPhotos[page]!.id);
            // Blob URLs are local PhotoStore resources; FileReader preserves the existing decoder contract.
            const blob = await (await fetch(url)).blob();
            return (await decodeImage(await fileDataUrl(new File([blob], 'photo', { type: blob.type })))).original;
          }, progress: (value) => { if (live) setProgress(value); },
          checkpoint: async (reading) => { if (live && !controller.signal.aborted) await onEvent({ type: 'problem_page', reading }); },
        });
        if (live && !controller.signal.aborted) await onEvent({ type: 'problem_read', outcome,
          ms: current.current.timings.problemRead ?? outcome.usage.latencyMs });
      } catch (e) {
        // A user cancel already sent problem_read_cancel; only reader failures return here.
        if (live && !controller.signal.aborted) {
          try { await onEvent({ type: 'problem_read_cancel' }); setError(readingError(e)); }
          catch { setError(m.failed); }
        }
      }
      finally {
        try { if (acquired) await readers.activity?.(false); }
        catch (e) { if (live) setError(readingError(e)); }
        if (live) setWorking(false);
      }
    };
    void run();
    return () => { live = false; controller.abort(); };
  }, [s.id, s.stage, manual, readers, photoStore, readerReady, attempt]);
  const action = async (work: () => Promise<void>) => {
    if (working || busy) return;
    setWorking(true); setError('');
    try { await work(); } catch (e) { setError(readingError(e)); } finally { setWorking(false); }
  };
  const add = async (data: string) => {
    if (!photoStore) return;
    const decoded = await decodeImage(data);
    const ref = await photoStore.put(blobOf(data), { width: decoded.original.width, height: decoded.original.height, page: s.problemPhotos.length });
    try { await onEvent({ type: 'problem_capture', photos: [...s.problemPhotos, ref] }); }
    catch (e) { await photoStore.remove(ref.id); throw e; }
  };
  const back = () => { abort.current?.abort(); onBack(); };
  const switchManual = () => { abort.current?.abort(); setWorking(false); setManual(true); };
  const banner = preview && <p className="banner" role="status">{m.preview}</p>;
  const retainedOutcome = s.problemRead;
  const manualEntry = manual || !retainedOutcome;
  const cancelReading = () => {
    abort.current?.abort(); setWorking(false);
    void Promise.resolve(onEvent({ type: 'problem_read_cancel' })).then(() => setError(settingsVi.cancelled)).catch(() => setError(m.failed));
  };
  if (manual || s.stage === 'problem_confirm') return <div data-stage={s.stage}>{banner}<ProblemConfirmScreen
    {...(retainedOutcome ? { outcome: retainedOutcome } : {})} pages={retainedOutcome ? s.problemPages ?? [] : []} photos={photos} manual={manualEntry} busy={busy}
    readerReady={readerReady} {...(onSettings ? { onSettings } : {})}
    {...(s.stage === 'problem_confirm' && !retainedOutcome ? { onReadRequest: () => void Promise.resolve(onEvent({ type: 'problem_read_request' })).catch(() => setError(m.failed)) } : {})}
    runner={readers?.figure ?? workerRunner} onBack={back} onDone={(spec, graphLayout) => {
      void Promise.resolve(onEvent({ type: manualEntry ? 'manual_spec' : 'spec_confirmed', spec, ...(graphLayout ? { graphLayout } : {}) })).catch(() => setError(m.failed));
    }}/>{error && <p role="alert">{error}</p>}</div>;
  return <div className="screen" data-stage={s.stage}><Topbar title={sessionVi.stages[s.stage]} onBack={back}/><div className="content">
    {banner}
    {!readerReady && <div className="card"><p>{m.missing}</p><button className="btn btn-outline" onClick={onSettings}>{m.settings}</button></div>}
    {s.stage === 'problem_reading' ? <div className="card">
      <p role="status">{progress ? m.progress(progress.page, progress.total, progress.phase === 'figure') : sessionVi.stages.problem_reading}</p>
      <progress max={s.problemPhotos.length} value={s.problemPages?.length ?? 0} aria-label={m.read}/>
      {!working && <button className="btn btn-primary" disabled={!readerReady || busy} onClick={() => setAttempt((v) => v + 1)}>{m.resume}</button>}
      <button className="btn btn-outline" disabled={busy} onClick={cancelReading}>{m.cancel}</button>
    </div> : <>
      {photos.map((photo, page) => <div className="card" key={s.problemPhotos[page]?.id ?? page}>
        <img src={photo.image} alt={m.page(page)} style={{ width: '100%' }}/>
        <button className="btn btn-outline" disabled={working || busy} onClick={() => void action(async () => {
          await onEvent({ type: 'problem_capture', photos: s.problemPhotos.filter((_, i) => i !== page).map((p, i) => ({ ...p, page: i })) });
        })}>{m.remove}</button></div>)}
      <input ref={input} type="file" accept="image/png,image/jpeg" multiple hidden onChange={(e) => {
        const files = [...(e.target.files ?? [])]; e.target.value = '';
        void action(async () => { let refs = s.problemPhotos; for (const file of files) {
          // Read current refs after every durable event rather than closing over the first page list.
          const data = await fileDataUrl(file), decoded = await decodeImage(data);
          if (!photoStore) return;
          const ref = await photoStore.put(blobOf(data), { width: decoded.original.width, height: decoded.original.height, page: refs.length });
          refs = [...refs, ref];
          try { await onEvent({ type: 'problem_capture', photos: refs }); }
          catch (err) { await photoStore.remove(ref.id); throw err; }
        } });
      }}/>
      {Capacitor.isNativePlatform() && <button className="btn btn-outline btn-block" disabled={working || busy} onClick={() => void action(async () => add(await captureImage()))}>{m.add}</button>}
      <button className="btn btn-outline btn-block" disabled={working || busy} onClick={() => input.current?.click()}>{m.choose}</button>
      <button className="btn btn-primary btn-block" disabled={!s.problemPhotos.length || working || busy}
        onClick={() => void action(async () => { await onEvent({ type: 'problem_photos', photos: s.problemPhotos }); })}>{m.continueEntry}</button>
    </>}
    {error && <p role="alert" className="banner banner-error">{error}</p>}
    <button className="btn btn-outline btn-block" disabled={busy} onClick={switchManual}>{m.manual}</button>
  </div></div>;
}
