import React, { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { vocabularyOf, validWorkBox } from '@mathtwin/work';
import type { WorkBox } from '@mathtwin/work';
import { captureImage, fileDataUrl } from './capture.js';
import { decodeImage, rotateImageDataUrl } from './images.js';
import { Topbar } from './product-ui.js';
import { WorkScreen } from './WorkScreen.js';
import { ResultScreen } from './ResultScreen.js';
import { SolutionScreen } from './SolutionScreen.js';
import { resultView } from './flow/view.js';
import { sessionGraphLayout, solutionGraph } from './flow/graph.js';
import type { WorkQuestion } from '@mathtwin/work';
import type { ProductActions } from './product-types.js';
import type { WorkPage } from './work-session.js';
import { workVi as m } from './work.vi.js';
import { problemVi } from './problem.vi.js';
import { sessionVi } from './flow/messages.vi.js';
import { solutionVi } from './solution.vi.js';
import { readingError } from './flow/reading-error.vi.js';
import { settingsVi } from './settings.vi.js';
import { readWorkRegion, readWorkPages, ignoredWorkLines } from './flow/work-reading.js';
import type { Readers } from './flow/reading.js';
import type { PhotoStore } from './flow/store.js';
import type { Session, SessionEvent } from './flow/types.js';
import './work.css';

function blobOf(data: string): Blob {
  const [header, body] = data.split(',');
  return new Blob([Uint8Array.from(atob(body!), (v) => v.charCodeAt(0))], { type: header!.includes('png') ? 'image/png' : 'image/jpeg' });
}

export function WorkFlowScreen({ session: s, busy, photoStore, readers, readerReady = false, preview = false, onEvent, onBack, onSettings }: {
  session: Session; busy: boolean; photoStore?: PhotoStore; readers?: Readers; readerReady?: boolean; preview?: boolean;
  onEvent: (event: SessionEvent) => void | Promise<void>; onBack: () => void; onSettings?: () => void;
}) {
  const [photos, setPhotos] = useState<WorkPage[]>([]);
  const [manual, setManual] = useState(s.stage === 'work_capture' && s.workSource === 'manual');
  const [text, setText] = useState(s.workSource === 'manual' ? s.workLines.map((l) => l.text).join('\n') : '');
  const [working, setWorking] = useState(false), [error, setError] = useState('');
  const [page, setPage] = useState(0), [attempt, setAttempt] = useState(0);
  const [manualPage, setManualPage] = useState<number | null>(null);
  const [reviewing, setReviewing] = useState(false), [showSolution, setShowSolution] = useState(false);
  const [resultQuestion, setResultQuestion] = useState<WorkQuestion | undefined>();
  const controller = useRef<AbortController | null>(null), input = useRef<HTMLInputElement | null>(null);
  const current = useRef(s); current.current = s;
  const photoKey = s.workPhotos.map((p) => p.id).join(',');
  useEffect(() => {
    let live = true;
    if (photoStore) void Promise.all(s.workPhotos.map(async (p) => ({ image: await photoStore.url(p.id), width: p.width, height: p.height })))
      .then((values) => { if (live) setPhotos(values); }).catch(() => { if (live) setError(settingsVi.failures.image); });
    return () => { live = false; };
  }, [photoKey, photoStore]);
  const load = async (index: number) => {
    if (!photoStore) throw { code: 'image_invalid' };
    const blob = await (await fetch(await photoStore.url(s.workPhotos[index]!.id))).blob();
    return (await decodeImage(await fileDataUrl(new File([blob], 'work', { type: blob.type })))).original;
  };
  useEffect(() => {
    if (s.stage !== 'work_reading' || manual || manualPage !== null || !s.spec || !readers || !readerReady || !photoStore) return;
    const abort = new AbortController(); controller.current = abort; let live = true;
    setWorking(true); setError('');
    void (async () => {
      let acquired = false;
      try {
        await readers.activity?.(true); acquired = true;
        await readWorkPages({ count: s.workPhotos.length, reader: readers.text, vocab: vocabularyOf(s.spec!), signal: abort.signal,
          saved: current.current.workPages ?? [], load, progress: (p) => { if (live) setPage(p); },
          checkpoint: async (reading) => { if (live && !abort.signal.aborted) await onEvent({ type: 'work_page', reading }); } });
        if (live && !abort.signal.aborted) await onEvent({ type: 'work_read', lines: [], ms: 0 });
      } catch (e) { if (live) setError(readingError(e)); }
      finally {
        try { if (acquired) await readers.activity?.(false); }
        catch (e) { if (live) setError(readingError(e)); }
        if (live) setWorking(false);
      }
    })();
    return () => { live = false; abort.abort(); };
  }, [s.id, s.stage, readers, readerReady, photoStore, manual, manualPage, attempt]);
  const action = async (fn: () => Promise<void>) => {
    if (working || busy) return;
    setWorking(true); setError('');
    try { await fn(); } catch (e) { setError(readingError(e)); } finally { setWorking(false); }
  };
  const back = () => { controller.current?.abort(); onBack(); };
  const switchManual = () => { controller.current?.abort(); setWorking(false); setManual(true); };
  const add = async (data: string, refs = s.workPhotos) => {
    if (!photoStore) throw { code: 'image_invalid' };
    const image = (await decodeImage(data)).original;
    const ref = await photoStore.put(blobOf(data), { width: image.width, height: image.height, page: refs.length });
    const next = [...refs, ref];
    try { await onEvent({ type: 'work_capture_photos', photos: next }); }
    catch (e) { await photoStore.remove(ref.id); throw e; }
    return next;
  };
  const editPages = (from: number, to?: number) => void action(async () => {
    const photos = [...s.workPhotos], [item] = photos.splice(from, 1);
    if (to !== undefined && item) photos.splice(to, 0, item);
    await onEvent({ type: 'work_capture_photos', photos });
  });
  const rotate = async (index: number) => {
    if (!photoStore) throw { code: 'image_invalid' };
    const old = s.workPhotos[index]; if (!old) throw { code: 'image_invalid' };
    const blob = await (await fetch(await photoStore.url(old.id))).blob();
    const data = await rotateImageDataUrl(await fileDataUrl(new File([blob], 'work', { type: blob.type })));
    const image = (await decodeImage(data)).original;
    const ref = await photoStore.put(blobOf(data), { width: image.width, height: image.height, page: index });
    const photos = s.workPhotos.map((item, page) => page === index ? ref : item);
    try { await onEvent({ type: 'work_capture_photos', photos }); }
    catch (error) { await photoStore.remove(ref.id); throw error; }
  };
  const banner = <><p className="text-xs muted">{sessionVi.stages[s.stage]}</p>{preview && <p className="banner" role="status">{problemVi.preview}</p>}</>;
  const alert = error && <p className="banner banner-error" role="alert">{error}</p>;
  if (showSolution) return <SolutionScreen session={s} busy={busy || working} onBack={() => setShowSolution(false)} onWork={(source) => {
    setShowSolution(false);
    if (source === 'manual') switchManual();
    else void action(async () => { await onEvent({ type: 'work_capture_photos', photos: s.workPhotos }); });
  }}/>;
  if (manual || manualPage !== null) return <div className="screen" data-stage={s.stage}><Topbar title={solutionVi.manualDestination} onBack={back}/><div className="content">{banner}
    {manualPage !== null && <p>{m.page(manualPage)}</p>}
    <label className="work-field">{m.manualHint}<textarea rows={12} value={text} onChange={(e) => setText(e.target.value)}/></label>
    <button className="btn btn-primary btn-block" disabled={busy || !text.trim()} onClick={() => void action(async () => {
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (manualPage !== null) { await onEvent({ type: 'work_manual_page', page: manualPage, lines }); setManualPage(null); }
      else { await onEvent({ type: 'manual_work', lines }); setManual(false); setReviewing(false); }
    })}>{m.submit}</button>{alert}</div></div>;
  if (s.stage === 'result' && s.spec && s.solution && !reviewing) {
    const data = resultView(s);
    const edit = () => { setResultQuestion(data.verdict === 'sai' ? data.readingCheck : data.verdict === 'can_xac_nhan' ? data.question : undefined); setReviewing(true); };
    const addPage = () => void action(async () => { await onEvent({ type: 'work_capture_photos', photos: s.workPhotos }); });
    const actions: ProductActions = { onEdit: edit, onSolution: () => setShowSolution(true), onManualInput: switchManual,
      onRetake: () => void action(async () => { await onEvent({ type: 'retake', target: 'work' }); }), onAddPage: addPage,
      onCapture: addPage, onRegrade: edit, onDownloadReader: () => onSettings?.(), onChooseOption: () => {}, onOtherNumber: edit,
      onSkip: edit, onConfirm: edit, onHint: () => {}, onViewPage: edit, onCancel: back };
    const layout = sessionGraphLayout(s);
    const common = { actions, onBack: back, pages: photos, busy: busy || working, graph: solutionGraph(s.spec, s.solution),
      ...(layout ? { layout } : {}) };
    return <div data-stage={s.stage}>{banner}{alert}{data.verdict === 'dung' ? <ResultScreen {...common} state="rong" data={data}/>
      : data.verdict === 'khong_du_can_cu' ? <ResultScreen {...common} state="loi" data={data}/>
        : <ResultScreen {...common} state="du-lieu" data={data}/>}</div>;
  }
  if (s.spec && s.workGrade && ['work_review', 'result'].includes(s.stage)) return <div data-stage={s.stage}>{banner}{alert}
    <WorkScreen spec={s.spec} initialLines={s.workLines} grade={s.workGrade} pages={photos} busy={busy || working}
      onBack={reviewing && s.stage === 'result' ? () => setReviewing(false) : back}
      {...(resultQuestion ? { initialQuestion: resultQuestion } : {})}
      onResult={() => { setResultQuestion(undefined); setReviewing(false); }}
      uncheckedPages={s.workPages?.filter((p) => p.missingLineCheckUnavailable) ?? []}
      ignoredLines={ignoredWorkLines(s.workLines, s.workPages ?? [])}
      onRestore={(line) => void action(async () => { await onEvent({ type: 'work_restore', line }); })}
      {...(s.workSource === 'photo' ? { onAcknowledge: () => void action(async () => { await onEvent({ type: 'review_ack' }); }) } : {})}
      onAnswers={(answers) => void action(async () => { for (const answer of answers) await onEvent({ type: 'work_answer', answer }); })}/>
    <div className="work-tools"><button className="btn btn-outline" disabled={busy || working} onClick={() => void action(async () => {
      await onEvent({ type: 'work_capture_photos', photos: s.workPhotos });
    })}>{m.add}</button><button className="btn btn-outline" onClick={switchManual}>{m.manual}</button></div>
  </div>;
  const unresolved = s.workPages?.find((p) => p.needsRegion && p.inspected);
  const failed = s.workPages?.find((p) => p.failed);
  return <div className="screen" data-stage={s.stage}><Topbar title={solutionVi.photoDestination} onBack={back}/><div className="content">{banner}
    {!readerReady && <div className="card"><p>{m.missingReader}</p><button className="btn btn-outline" onClick={onSettings}>{problemVi.settings}</button></div>}
    {s.stage === 'work_reading' ? <div className="card">
      {working ? <><p role="status">{m.progress(page, s.workPhotos.length)}</p>
        <progress aria-label={m.read} max={s.workPhotos.length} value={s.workPages?.length ?? 0}/>
        <button className="btn btn-outline" onClick={() => { controller.current?.abort(); setError(settingsVi.cancelled); setWorking(false); }}>{m.cancel}</button></>
        : failed ? <WorkPageFailure page={failed.page} busy={busy} onRetry={() => setAttempt((v) => v + 1)} onManual={() => { setText(''); setManualPage(failed.page); }}/>
        : unresolved && photos[unresolved.page] ? <RegionPicker key={unresolved.page} photo={photos[unresolved.page]!} {...(unresolved.suggestedRegion ? { suggestedRegion: unresolved.suggestedRegion } : {})} busy={busy} onDone={(region) => void action(async () => {
          if (!readers || !s.spec) return;
          const abort = new AbortController(); controller.current = abort;
          const reading = await readWorkRegion(await load(unresolved.page), unresolved, region, readers.text, vocabularyOf(s.spec), abort.signal);
          await onEvent({ type: 'work_page', reading });
          if (s.workPages?.length === s.workPhotos.length && !s.workPages.some((p) => p.page !== reading.page && p.needsRegion))
            await onEvent({ type: 'work_read', lines: [], ms: 0 });
        })}/>
        : <button className="btn btn-primary" disabled={!readerReady || busy} onClick={() => setAttempt((v) => v + 1)}>{m.resume}</button>}
    </div> : <>
      {photos.map((photo, index) => <div className="card" key={s.workPhotos[index]?.id ?? index}>
        <img src={photo.image} alt={m.page(index)} style={{ width: '100%' }}/><div className="work-buttons">
          <button className="btn btn-outline" disabled={busy || working} onClick={() => void action(() => rotate(index))}>{m.rotate}</button>
          <button className="btn btn-outline" disabled={busy || working} onClick={() => editPages(index)}>{m.remove}</button>
          <button className="btn btn-outline" aria-label={m.up} disabled={!index || busy || working} onClick={() => editPages(index, index - 1)}>↑</button>
          <button className="btn btn-outline" aria-label={m.down} disabled={index === photos.length - 1 || busy || working} onClick={() => editPages(index, index + 1)}>↓</button>
        </div></div>)}
      <input ref={input} type="file" accept="image/png,image/jpeg" multiple hidden onChange={(e) => {
        const files = [...(e.target.files ?? [])]; e.target.value = '';
        void action(async () => { let refs = s.workPhotos; for (const file of files) refs = await add(await fileDataUrl(file), refs); });
      }}/>
      {Capacitor.isNativePlatform() && <button className="btn btn-outline btn-block" disabled={busy || working} onClick={() => void action(async () => { await add(await captureImage()); })}>{m.add}</button>}
      <button className="btn btn-outline btn-block" disabled={busy || working} onClick={() => input.current?.click()}>{m.choose}</button>
      <button className="btn btn-primary btn-block" disabled={!s.workPhotos.length || !readerReady || busy || working} onClick={() => void action(async () => {
        await onEvent({ type: 'work_photos', photos: s.workPhotos });
      })}>{m.read}</button>
    </>}{alert}<button className="btn btn-outline btn-block" disabled={busy} onClick={switchManual}>{m.manual}</button>
  </div></div>;
}

export function WorkPageFailure({ page, busy, onRetry, onManual }: { page: number; busy: boolean; onRetry: () => void; onManual: () => void }) {
  return <div><p role="alert">{m.failedPage(page)}</p><div className="work-buttons">
    <button className="btn btn-primary" disabled={busy} onClick={onRetry}>{m.retryPage}</button>
    <button className="btn btn-outline" disabled={busy} onClick={onManual}>{m.manualPage}</button>
  </div></div>;
}

export function RegionPicker({ photo, busy, suggestedRegion, onDone }: { photo: WorkPage; busy: boolean; suggestedRegion?: WorkBox; onDone: (region: WorkBox) => void }) {
  const [box, setBox] = useState<WorkBox | null>(suggestedRegion ?? null), start = useRef<[number, number] | null>(null);
  const point = (event: React.PointerEvent<SVGSVGElement>): [number, number] => {
    const r = event.currentTarget.getBoundingClientRect();
    return [Math.max(0, Math.min(1000, (event.clientX - r.left) / r.width * 1000)), Math.max(0, Math.min(1000, (event.clientY - r.top) / r.height * 1000))];
  };
  return <div><p>{suggestedRegion ? m.suggestedRegion : m.region}</p><svg className="work-region" role="img" aria-label={m.regionLabel} viewBox="0 0 1000 1000" preserveAspectRatio="none"
    style={{ aspectRatio: `${photo.width}/${photo.height}` }} onPointerDown={(e) => { start.current = point(e); e.currentTarget.setPointerCapture(e.pointerId); setBox(null); }}
    onPointerMove={(e) => { if (!start.current) return; const p = point(e), a = start.current; setBox([Math.min(a[0], p[0]), Math.min(a[1], p[1]), Math.max(a[0], p[0]), Math.max(a[1], p[1])]); }}
    onPointerUp={() => { start.current = null; }} onPointerCancel={() => { start.current = null; }}>
    <image href={photo.image} width="1000" height="1000" preserveAspectRatio="none"/>
    {box && <rect x={box[0]} y={box[1]} width={box[2] - box[0]} height={box[3] - box[1]} fill="#297b6b33" stroke="#297b6b" strokeWidth="5"/>}
  </svg><div className="work-bounds">{[m.left, m.top, m.right, m.bottom].map((label, i) => <label key={label}>{label}
    <input type="number" min="0" max="100" value={box ? Math.round(box[i]! / 10) : ''} onChange={(e) => { const next: WorkBox = [...(box ?? [0, 0, 1000, 1000])]; next[i] = Number(e.target.value) * 10; setBox(next); }}/></label>)}</div>
    <button className="btn btn-primary btn-block" disabled={busy || !box || !validWorkBox(box)} onClick={() => { if (box) onDone(box); }}>{suggestedRegion ? m.confirmRegion : m.applyRegion}</button>
  </div>;
}
