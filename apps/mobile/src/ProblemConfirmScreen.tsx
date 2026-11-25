import React, { useState } from 'react';
import { applyConfirmation } from '@mathtwin/reader';
import type { ProblemSpec } from '@mathtwin/core';
import type { ReadOutcome } from '@mathtwin/reader';
import { GraphEditScreen } from './GraphEditScreen.js';
import { ProblemForm } from './ProblemForm.js';
import { Actions, Topbar } from './product-ui.js';
import { editorFromGraph, edgeShapes, fromDraft } from './graph-editor.js';
import type { EditorGraph } from './graph-editor.js';
import type { ProblemPageRead, FigureDraftRunner } from './flow/reading.js';
import { confirmationQuestions, confirmationValue, confirmProblem, initialProblem, replaceGraph, replaceSuggestedFields, taskSuggestion } from './flow/confirmation.js';
import { decodeImage } from './images.js';
import { problemVi as m, confirmationQuestionText, confirmationCandidateText, suggestionParameters } from './problem.vi.js';
import { sessionVi } from './flow/messages.vi.js';
import type { GraphLayout } from './flow/types.js';

export interface ProblemPhoto { image: string; width: number; height: number }
function hasBlankRequiredTaskParameter(task: ProblemSpec['task']): boolean {
  switch (task.type) {
    case 'path': case 'shortest_path': return !task.from.trim() || !task.to.trim();
    case 'postman': return !task.start.trim();
    default: return false;
  }
}
function GraphReadPreview({ spec }: { spec: ProblemSpec }) {
  const editor = editorFromGraph(spec.graph);
  return <svg viewBox="0 0 400 400" role="img" aria-label={m.graph} className="problem-graph">
    {edgeShapes(editor, 400, 400).map((e) => <g key={e.key}><path d={e.path}/><text x={e.labelX} y={e.labelY - 8}>{editor.edges.find((v) => v.key === e.key)?.w}</text></g>)}
    {editor.vertices.map((v) => <g key={v.key}><circle cx={v.x * 400} cy={v.y * 400} r="17"/><text x={v.x * 400} y={v.y * 400 + 5}>{v.label}</text></g>)}
  </svg>;
}
export function ProblemConfirmScreen({ outcome, pages = [], photos, manual, busy, runner, readerReady = false, onReadRequest, onSettings, onBack, onDone }: {
  outcome?: ReadOutcome; pages?: ProblemPageRead[]; photos: ProblemPhoto[]; manual: boolean; busy: boolean;
  runner: FigureDraftRunner; readerReady?: boolean; onReadRequest?: () => void; onSettings?: () => void;
  onBack: () => void; onDone: (spec: ProblemSpec, layout?: GraphLayout) => void;
}) {
  const [spec, setSpec] = useState(() => initialProblem(outcome));
  const [editing, setEditing] = useState<EditorGraph | null>(null);
  const [graphLayout, setGraphLayout] = useState<GraphLayout | undefined>();
  const [photoPage, setPhotoPage] = useState(0);
  const [taskReviewed, setTaskReviewed] = useState(manual || !!outcome?.spec);
  const [graphReviewed, setGraphReviewed] = useState(manual || !!outcome?.spec);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [edited, setEdited] = useState(false);
  const [confirmRead, setConfirmRead] = useState(false);
  const suggestion = outcome ? taskSuggestion(outcome) : null;
  const canAcceptSuggestion = Boolean(suggestion?.task) && !taskReviewed && !hasBlankRequiredTaskParameter(spec.task);
  const questions = confirmationQuestions({ ...(outcome ?? { graph: null, graphUncertain: [], drafts: [], issues: [], usage: { engine: '', passes: 0, latencyMs: 0 } }), spec });
  const answer = (item: string, value: unknown) => {
    try { setSpec(applyConfirmation(spec, { [item]: value })); setEdited(true); setError(''); } catch { setError(m.invalid); }
  };
  const acceptSuggestion = () => {
    if (!canAcceptSuggestion || !suggestion?.task) return;
    try {
      const answers = Object.fromEntries((spec.uncertain ?? []).filter((item) => item.item.startsWith('task.') || item.item === 'questionFormat')
        .map((item) => [item.item, item.candidates[0]]));
      setSpec(applyConfirmation(spec, answers)); setTaskReviewed(true); setError('');
    } catch { setError(m.invalid); }
  };
  if (editing) return <GraphEditScreen initial={editing} photo={photos[photoPage]?.image ?? null}
    {...(graphLayout ? { initialAspect: graphLayout.aspect } : {})}
    runner={runner} decode={async (data) => (await decodeImage(data)).original}
    onBack={() => setEditing(null)} onDone={(graph, layout) => { setSpec(replaceGraph(spec, graph)); setGraphLayout(layout); setGraphReviewed(true); setEdited(true); setEditing(null); }}/ >;
  const submit = () => {
    try {
      if (!taskReviewed || (!graphReviewed && spec.task.type !== 'degree_sequence')) throw new Error(m.noSpec);
      if (!spec.graph.vertices.length && spec.task.type !== 'degree_sequence') throw new Error(m.noGraph);
      onDone(confirmProblem(spec, {}), graphLayout); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : m.invalid); }
  };
  return <div className="screen"><Topbar title={manual ? m.manual : m.confirm} onBack={onBack}/><div className="content">
    {!manual && !outcome?.spec && <p role="status">{m.noSpec}</p>}
    {outcome?.issues.map((issue, i) => <p role="status" key={i}>{issue.message}</p>)}
    {outcome?.drafts.map((draft, i) => draft.question?.rawText && <p className="card" key={i}>{draft.question.rawText}</p>)}
    {suggestion?.task && <section className="card question-card"><h2 className="section-title">{m.suggested}: {sessionVi.tasks[suggestion.task.type]}{suggestionParameters(suggestion.task)}</h2>
      <p>{m.suggestedReason(suggestion.matched.join(', '))}</p>
      <button className="btn btn-outline" disabled={!canAcceptSuggestion} onClick={acceptSuggestion}>{m.acceptSuggestion}</button></section>}
    <div className="problem-comparison"><div>{photos.map((photo, page) => <button className="problem-photo" key={page} onClick={() => setPhotoPage(page)} aria-label={m.page(page)} aria-pressed={photoPage === page}>
      <img src={photo.image} alt={m.source}/><span>{m.page(page)}</span></button>)}</div>
      <div className="card"><GraphReadPreview spec={spec}/><button className="btn btn-outline btn-block" onClick={() => setEditing(editorFromGraph(spec.graph, graphLayout))}>{m.edit}</button></div></div>
    {pages.some((p) => p.figure?.vertices.length) && <div className="card"><p>{m.draftNote}</p>{pages.filter((p) => p.figure?.vertices.length).map((p) =>
      <button key={p.page} className="btn btn-outline btn-block" onClick={() => { setPhotoPage(p.page); setEditing(fromDraft(p.figure!)); }}>{m.draft} · {m.page(p.page)}</button>)}</div>}
    {questions.map((q) => <section className="card question-card" key={q.item}>
      <h2 className="section-title">{confirmationQuestionText(spec, q.item)}</h2>
      {photos[q.page] && <svg viewBox={q.box ? `${q.box[0]} ${q.box[1]} ${Math.max(1, q.box[2] - q.box[0])} ${Math.max(1, q.box[3] - q.box[1])}` : '0 0 1000 1000'} role="img" aria-label={m.source} className="problem-crop">
        <image href={photos[q.page]!.image} width="1000" height="1000" preserveAspectRatio="none"/></svg>}
      {!q.box && <p className="text-xs muted">{m.noBox}</p>}
      <div className="options">{q.candidates.map((value, i) => <button className="option" key={i} onClick={() => answer(q.item, value)}>
        {confirmationCandidateText(spec, q.item, value)}</button>)}</div>
      <label>{m.other}<input value={inputs[q.item] ?? ''} onChange={(e) => setInputs({ ...inputs, [q.item]: e.target.value })}/></label>
      <button className="btn btn-outline" disabled={!inputs[q.item]?.trim()} onClick={() => answer(q.item, confirmationValue(inputs[q.item] ?? ''))}>{m.answer}</button>
    </section>)}
    <ProblemForm spec={spec} taskReviewed={taskReviewed} onChange={(next) => { setSpec(replaceSuggestedFields(next)); setEdited(true); }} onTaskEdited={() => { setTaskReviewed(true); setEdited(true); }}/>
    {onReadRequest && photos.length > 0 && <section className="card">
      <button className="btn btn-outline btn-block" disabled={!readerReady || busy} onClick={() => {
        if (edited) setConfirmRead(true); else onReadRequest();
      }}>{m.machineRead}</button>
      {!readerReady && <><p className="text-xs muted">{m.missing}</p>{onSettings && <button className="btn btn-outline" onClick={onSettings}>{m.settings}</button>}</>}
      {readerReady && <p className="text-xs muted">{m.speed}</p>}
      {confirmRead && <div className="question-card"><p role="alert">{m.replaceRead}</p><div className="options">
        <button className="btn btn-primary" onClick={onReadRequest}>{m.replaceReadConfirm}</button>
        <button className="btn btn-outline" onClick={() => setConfirmRead(false)}>{m.replaceReadBack}</button>
      </div></div>}
    </section>}
    {error && <div role="alert" className="banner banner-error">{error}</div>}
    </div><Actions><button className="btn btn-primary btn-block" disabled={busy || questions.length > 0} onClick={submit}>{m.done}</button></Actions></div>;
}
