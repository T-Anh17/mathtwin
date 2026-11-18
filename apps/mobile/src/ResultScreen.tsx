import React from 'react';
import { BookOpen } from 'lucide-react';
import { productVi as m } from './product-messages.vi.js';
import { Actions, LoadingScreen, Topbar } from './product-ui.js';
import type { CorrectResult, InsufficientResult, PendingResult, ProductActions, ResultData, WrongResult } from './product-types.js';
import { WorkCrop } from './WorkCrop.js';
import type { WorkPage, WorkReview } from './work-session.js';
import type { WorkQuestion } from '@mathtwin/work';
import type { Graph, Highlight } from '@mathtwin/core';
import type { GraphLayout } from './flow/types.js';
import { SolutionGraph } from './SolutionScreen.js';
import { resultVi as r } from './result.vi.js';

/** Real pure-function grading of sample work; no UI-1 numeric assumptions. */
export function WorkResultScreen({ review, pages, onBack, onQuestion }: {
  review: WorkReview; pages: WorkPage[]; onBack: () => void; onQuestion: (question: WorkQuestion) => void;
}) {
  const [confirmed, setConfirmed] = React.useState<string | null>(null);
  const { result, readingCheck, questions } = review.grade;
  const verdict = result.verdict.toLowerCase() as keyof typeof m.verdictNames;
  const style = { dung: 'v-ok', sai: 'v-wrong', can_xac_nhan: 'v-confirm', khong_du_can_cu: 'v-none' }[verdict];
  const signature = JSON.stringify(readingCheck);
  return <div className="screen work-screen"><Topbar title={m.work.result} onBack={onBack}/><div className="content">
    <div className={`verdict ${style}`} role="status"><div><h2>{result.verdict === 'SAI' && result.firstErrorStep ? m.wrongStep(result.firstErrorStep) : m.verdictNames[verdict]}</h2><p>{result.message}</p></div></div>
    {result.verdict === 'SAI' && readingCheck && <div className="card question-card">
      <WorkCrop pages={pages} page={readingCheck.page} box={readingCheck.box}/>
      <h2 className="section-title">{m.work.readingCheck}</h2><p className="work-text math">{readingCheck.shownText}</p>
      {confirmed === signature ? <p role="status">{m.work.confirmed}</p> : <button className="btn btn-primary" onClick={() => setConfirmed(signature)}>{m.work.yes}</button>}
      <button className="btn btn-outline" onClick={() => onQuestion(readingCheck)}>{m.work.edit}</button>
    </div>}
    {questions.map((question, index) => <button className="card work-step" key={index} onClick={() => onQuestion(question)}>
      <b>{m.work.question}</b><span className="work-text">{question.shownText}</span></button>)}
  </div><Actions><button className="btn btn-outline btn-block" onClick={onBack}>{m.work.review}</button></Actions></div>;
}

// Keep wireframe loading states available for demo/test callers; real data comes from resultView.
export type ResultProps = { actions: ProductActions; onBack: () => void; pages?: WorkPage[];
  graph?: Graph; layout?: GraphLayout; busy?: boolean } & (
  | { state: 'du-lieu'; data: WrongResult | PendingResult }
  | { state: 'rong'; data: CorrectResult }
  | { state: 'loi'; data: InsufficientResult }
  | { state: 'dang-tai'; data: ResultData }
);
export function ResultScreen({ state, data, actions, onBack, pages = [], graph, layout, busy = false }: ResultProps) {
  const [confirmed, setConfirmed] = React.useState<string | null>(null);
  if (state === 'dang-tai') return <LoadingScreen title={data.title} onCancel={actions.onCancel}/>;
  const style = { dung: 'v-ok', sai: 'v-wrong', can_xac_nhan: 'v-confirm', khong_du_can_cu: 'v-none' }[data.verdict];
  const showPhotos = data.workSource !== 'manual';
  const check = showPhotos && data.verdict === 'sai' ? data.readingCheck : undefined;
  const signature = JSON.stringify(check);
  const highlight: Highlight = 'graphHighlight' in data ? data.graphHighlight : {};
  return <div className="screen work-screen result-screen"><Topbar title={data.title} onBack={onBack}/><div className="content">
    <div className={`verdict ${style}`} role="status"><div><h2>{data.verdict === 'sai' ? r.wrongStep(data.firstErrorStep) : r.correctNames[data.verdict]}</h2>
      <p className="work-text">{data.message}</p></div></div>
    {data.verdict === 'sai' && <>
      {showPhotos && data.errorMarks.map((mark, i) => <WorkCrop key={i} pages={pages} page={mark.page} box={mark.box} marked/>)}
      <section className="card"><h3 className="section-title">{data.errorType}</h3><dl className="kv">
        <dt>{r.reason}</dt><dd className="work-text">{data.reason}</dd>
        {data.correction && <><dt>{r.correction}</dt><dd className="work-text">{data.correction}</dd></>}
        <dt>{r.next}</dt><dd className="work-text">{data.nextStep}</dd></dl></section>
      <section className="card"><h3 className="section-title">{r.previous}</h3><p>{data.previousSteps}</p></section>
    </>}
    {check && <section className="card question-card"><WorkCrop pages={pages} page={check.page} box={check.box}/>
      <h3 className="section-title">{r.readingCheck(check.shownText)}</h3>
      {confirmed === signature ? <p role="status">{m.work.confirmed}</p>
        : <button className="btn btn-primary" disabled={busy} onClick={() => setConfirmed(signature)}>{m.work.yes}</button>}
      <button className="btn btn-outline" disabled={busy} onClick={actions.onEdit}>{m.work.edit}</button>
    </section>}
    {data.verdict === 'can_xac_nhan' && <section className="card">
      {data.question && <>{showPhotos && <WorkCrop pages={pages} page={data.question.page} box={data.question.box}/>}<p className="work-text">{data.question.shownText}</p></>}
      <button className="btn btn-primary btn-block" disabled={busy} onClick={actions.onEdit}>{data.question ? r.question : r.review}</button>
    </section>}
    {data.verdict === 'khong_du_can_cu' && <section className="card"><ul>{data.issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul>
      <div className="work-buttons"><button className="btn btn-outline" disabled={busy} onClick={actions.onRetake}>{r.retake}</button>
        <button className="btn btn-outline" disabled={busy} onClick={actions.onAddPage}>{r.addPage}</button>
        <button className="btn btn-outline" disabled={busy} onClick={actions.onManualInput}>{r.manual}</button></div>
    </section>}
    {graph && (data.verdict === 'sai' || data.verdict === 'dung') && <div className="card"><SolutionGraph graph={graph} highlight={highlight} {...(layout ? { layout } : {})}/></div>}
    {!!data.notes.length && <section className="card"><h3 className="section-title">{r.notes}</h3><ul>{data.notes.map((note, i) => <li key={i}>{note}</li>)}</ul></section>}
  </div><Actions><div className="work-buttons">
    <button className="btn btn-outline" disabled={busy} onClick={actions.onEdit}>{showPhotos ? r.review : r.manualReview}</button>
    <button className="btn btn-primary" disabled={busy} onClick={actions.onSolution}><BookOpen/>{r.solution}</button>
  </div></Actions></div>;
}
