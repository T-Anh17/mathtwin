import React from 'react';
import { BookOpen, Camera, CircleCheckBig, CircleX, FileQuestion, Image, Lightbulb } from 'lucide-react';
import { ConfirmScreen } from './ConfirmScreen.js';
import { productVi as m } from './product-messages.vi.js';
import { Actions, Crop, LoadingScreen, Topbar } from './product-ui.js';
import type { CorrectResult, InsufficientResult, PendingResult, ProductActions, ResultData, WrongResult } from './product-types.js';
import { WorkCrop } from './WorkCrop.js';
import type { WorkPage, WorkReview } from './work-session.js';
import type { WorkQuestion } from '@mathtwin/work';

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

// Wireframe states: data = SAI, empty = ĐÚNG, error = KHÔNG ĐỦ CĂN CỨ.
// Require matching data at the boundary so UI never fabricates a verdict or a number.
export type ResultProps = { actions: ProductActions; onBack: () => void } & (
  | { state: 'du-lieu'; data: WrongResult | PendingResult }
  | { state: 'rong'; data: CorrectResult }
  | { state: 'loi'; data: InsufficientResult }
  | { state: 'dang-tai'; data: ResultData }
);
export function ResultScreen({ state, data, actions, onBack }: ResultProps) {
  if (state === 'dang-tai') return <LoadingScreen title={data.title} onCancel={actions.onCancel}/>;
  if (data.verdict === 'can_xac_nhan') return <ConfirmScreen state={state} data={data.confirmation} actions={actions} onBack={onBack}/>;
  const top = <Topbar title={data.title} onBack={onBack} onRegrade={actions.onRegrade}/>;
  if (data.verdict === 'khong_du_can_cu') return <div className="screen">{top}<div className="content">
    <div className="verdict v-none"><div className="verdict-icon"><FileQuestion/></div><div><h2>{m.insufficient}</h2><p>{data.reason}</p></div></div>
    <div className="photo" style={{ maxHeight: 260 }}><img src={data.image} alt="" style={{ marginTop: '-58%' }}/></div></div>
    <Actions><button className="btn btn-outline" style={{ flex: 1 }} onClick={actions.onManualInput}>{m.manual}</button><button className="btn btn-primary" style={{ flex: 1 }} onClick={actions.onAddPage}><Camera/>{m.addPage}</button></Actions></div>;
  if (data.verdict === 'dung') return <div className="screen">{top}<div className="content">
    <div className="verdict v-ok"><div className="verdict-icon"><CircleCheckBig/></div><div><h2>{m.correct}</h2><p>{m.correctPrefix}<b className="math">{data.length}</b>{m.period}</p></div></div>
    <div className="card"><div className="section-title" style={{ marginBottom: 8 }}>{m.problemNote}</div><p className="text-sm" style={{ margin: 0 }}>{data.note}</p></div></div>
    <Actions><button className="btn btn-outline btn-block" onClick={actions.onSolution}>{m.standardSolution}</button></Actions></div>;
  return <div className="screen">{top}<div className="content">
    <div className="verdict v-wrong"><div className="verdict-icon"><CircleX/></div><div><h2>{m.wrongStep(data.firstErrorStep)}</h2><p>{data.summary}</p></div></div>
    <div><Crop image={data.image} crop={data.crop}/><button className="btn btn-ghost" style={{ marginTop: 4, padding: 0 }} onClick={actions.onViewPage}><Image/>{m.viewPage}</button></div>
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}><div className="text-xs muted">{m.written}</div>
      <div className="math" style={{ fontSize: 20, fontWeight: 600 }}>{data.calculation}<span className="strike-num">{data.studentValue}</span>{' '}<span className="fix-num">{m.correction(data.correctValue)}</span></div>
      <dl className="kv"><dt>{m.errorType}</dt><dd>{data.errorType}</dd><dt>{m.why}</dt><dd style={{ fontWeight: 400 }}>{data.reason}</dd></dl></div>
    <div className="card"><div className="section-title" style={{ marginBottom: 4 }}>{m.previousCorrect}</div><p className="text-sm muted" style={{ margin: 0 }}>{data.previousSteps}</p></div></div>
    <Actions><button className="btn btn-outline" style={{ flex: 1 }} onClick={actions.onHint}><Lightbulb/>{m.hint}</button><button className="btn btn-primary" style={{ flex: 2 }} onClick={actions.onSolution}><BookOpen/>{m.solution}</button></Actions></div>;
}
