import React, { useState } from 'react';
import type { ProblemSpec } from '@mathtwin/core';
import type { WorkAnswer, WorkGrade, WorkLine, WorkQuestion } from '@mathtwin/work';
import { Actions, Topbar } from './product-ui.js';
import { productVi as m } from './product-messages.vi.js';
import { WorkResultScreen } from './ResultScreen.js';
import { reviewWork, textAnswers } from './work-session.js';
import type { WorkPage, WorkReview } from './work-session.js';
import { WorkCrop } from './WorkCrop.js';
import './work.css';
import { workVi } from './work.vi.js';
import { graphLabels } from './graph-labels.vi.js';


export function WorkQuestionScreen({ question, lines, pages, onAnswer, onBack, busy = false }: {
  question: WorkQuestion; lines: WorkLine[]; pages: WorkPage[]; onAnswer: (answers: WorkAnswer[]) => void; onBack: () => void;
  busy?: boolean;
}) {
  const sources = question.lines.flatMap((index) => lines.filter((line) => line.index === index));
  const [texts, setTexts] = useState<Record<number, string>>(() => {
    const shown = question.shownText.split('\n');
    return Object.fromEntries(sources.map((line, index) => [line.index, question.reason === 'missing' ? '' : shown.length === sources.length ? shown[index] ?? line.text : line.text]));
  });
  const [selected, setSelected] = useState<string | null>(null);
  const choose = (option: string) => {
    const values = option.split('\n');
    if (values.length !== question.lines.length) return;
    setSelected(option); setTexts(Object.fromEntries(question.lines.map((line, i) => [line, values[i] ?? ''])));
  };
  return <div className="screen work-screen"><Topbar title={m.work.question} onBack={onBack}/><div className="content">
    <div className="card question-card"><p role="status">{workVi.status(question)}</p><WorkCrop pages={pages} page={question.page} box={question.box}/>
      <div className="text-xs muted">{m.work.shown}</div><p className="work-text math">{question.shownText}</p>
      {question.kind === 'region' ? <div className="work-buttons">
        <button className="btn btn-outline" disabled={busy} onClick={() => onAnswer(question.lines.map((line) => ({ line, region: 'solution' })))}>{workVi.solution}</button>
        <button className="btn btn-outline" disabled={busy} onClick={() => onAnswer(question.lines.map((line) => ({ line, region: 'question' })))}>{workVi.questionOrFigure}</button>
      </div> : question.kind === 'struck' ? <div className="work-buttons">
        {[true, false].map((struck) => <button className="btn btn-outline" disabled={busy} key={String(struck)} onClick={() => onAnswer(question.lines.map((line) => ({ line, struck })))}>{struck ? m.work.struckYes : m.work.struckNo}</button>)}
      </div> : <div className="options">{question.options.filter((option) => option !== m.work.skip && option.split('\n').length === question.lines.length).map((option) =>
        <button className="option math work-text" key={option} aria-pressed={selected === option} onClick={() => choose(option)}>{option}</button>)}</div>}
      {question.kind !== 'region' && <><div className="section-title">{m.work.retype}</div>
      {sources.map((line) => <label className="work-field" key={line.index}>{m.work.line(line.index, line.page)}
        {(line.page !== question.page || sources.length > 1) && <WorkCrop pages={pages} page={line.page} box={line.box}/>}
        <textarea value={texts[line.index] ?? ''} onChange={(event) => { setSelected(null); setTexts({ ...texts, [line.index]: event.target.value }); }}/></label>)}</>}
    </div></div><Actions><div className="work-buttons">
      {question.kind !== 'region' && <><button className="btn btn-outline" disabled={busy} onClick={() => onAnswer(question.lines.map((line) => ({ line, skip: true })))}>{question.reason === 'missing' ? workVi.nothing : m.work.skip}</button>
      <button className="btn btn-primary" disabled={busy || question.lines.some((line) => !texts[line]?.trim())} onClick={() => onAnswer(textAnswers(question, texts))}>{m.work.apply}</button></>}
    </div></Actions></div>;
}

export function WorkScreen({ spec, initialLines, pages, onBack, grade, onAnswers, onAcknowledge, onResult, initialQuestion, uncheckedPages = [], ignoredLines = [], onRestore, busy = false }: {
  spec: ProblemSpec; initialLines: WorkLine[]; pages: WorkPage[]; onBack: () => void;
  grade?: WorkGrade; onAnswers?: (answers: WorkAnswer[]) => void; onAcknowledge?: () => void; busy?: boolean;
  uncheckedPages?: { page: number; region?: [number, number, number, number] }[];
  ignoredLines?: WorkLine[]; onRestore?: (line: number) => void;
  onResult?: () => void; initialQuestion?: WorkQuestion;
}) {
  const [localReview, setReview] = useState<WorkReview>(() => reviewWork(spec, initialLines));
  const base = onAnswers ? reviewWork(spec, initialLines) : localReview;
  const labels = graphLabels(spec.graph);
  const currentGrade = grade ?? base.grade;
  const displayQuestion = (q: WorkQuestion): WorkQuestion => ({ ...q, shownText: labels.text(q.shownText), options: q.options.map(labels.text) });
  const review = { ...base, grade: { ...currentGrade, questions: currentGrade.questions.map(displayQuestion),
    ...(currentGrade.readingCheck ? { readingCheck: displayQuestion(currentGrade.readingCheck) } : {}),
    result: { ...currentGrade.result, message: currentGrade.questions[0] ? workVi.status(currentGrade.questions[0]) : labels.text(currentGrade.result.message), notes: currentGrade.result.notes.map(labels.text) } } };
  const [asking, setAsking] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [view, setView] = useState<'lines' | 'result'>('lines');
  const [question, setQuestion] = useState<WorkQuestion | null>(initialQuestion ?? null);
  const needsReview = !!onAcknowledge && review.grade.result.verdict === 'CAN_XAC_NHAN' && !review.grade.questions.length;
  const answer = (answers: WorkAnswer[]) => { if (onAnswers) onAnswers(answers); else setReview((old) => reviewWork(spec, old.lines, answers)); };
  const activeQuestion = asking ? review.grade.questions[0] : question;
  if (activeQuestion) return <WorkQuestionScreen key={JSON.stringify(activeQuestion)} question={activeQuestion} lines={review.lines} pages={pages} busy={busy}
    onBack={() => { setQuestion(null); setAsking(false); }} onAnswer={(answers) => { answer(answers); setQuestion(null); }}/>;
  if (view === 'result') return <WorkResultScreen review={review} pages={pages} onBack={() => setView('lines')} onQuestion={(q) => { setAsking(false); setQuestion(q); }}/>;
  const label = m.verdictNames[review.grade.result.verdict.toLowerCase() as keyof typeof m.verdictNames];
  return <div className="screen work-screen"><Topbar title={m.work.title} onBack={onBack}/><div className="content">
    <p className="text-xs muted">{onAnswers ? workVi.review : m.work.sampleNote}</p><p role="status" aria-live="polite">{review.grade.questions[0] ? workVi.status(review.grade.questions[0]) : label}</p>
    {uncheckedPages.map((p) => <div className="card" key={p.page}><p className="text-xs muted">{workVi.page(p.page)}</p>
      <p role="alert">{workVi.missingLineCheckUnavailable}</p><WorkCrop pages={pages} page={p.page} box={p.region}/></div>)}
    {!!ignoredLines.length && <details className="card"><summary>{workVi.ignored}</summary>{ignoredLines.map((line) => <div key={line.index}>
      <p className="text-xs muted">{workVi.page(line.page)}</p><p className="work-text math">{labels.text(line.text)}</p>
      <WorkCrop pages={pages} page={line.page} box={line.box}/>
      <button className="btn btn-outline" disabled={busy || !onRestore} onClick={() => onRestore?.(line.index)}>{workVi.restore}</button>
    </div>)}</details>}
    <div className="card"><h2 className="section-title">{m.work.steps}</h2><div className="work-buttons">
      {review.parsed.steps.length === 0 && <p>{m.work.noSteps}</p>}
      {review.parsed.steps.map((step) => <button className="work-step" key={step.claim.step} aria-pressed={step.lines.join() === selected.join()}
        onClick={() => setSelected(step.lines)}><b>{m.work.step(step.claim.step)}</b><span className="math">{labels.text(step.claim.raw)}</span></button>)}
    </div></div>
    <h2 className="section-title">{m.work.lines}</h2>
    {review.lines.filter((line) => !ignoredLines.some((l) => l.index === line.index)).map((line) => {
      const struck = review.parsed.ignored.some((item) => item.line === line.index && item.reason === 'struck');
      const unknown = review.parsed.unchecked.includes(line.index);
      const uncertain = line.conf < .85 || line.charConf?.some((c) => c < .85);
      const issues = review.parsed.issues.filter((issue) => issue.lines?.includes(line.index));
      return <div className={`card work-line${struck ? ' work-struck' : unknown ? ' work-unknown' : ''}`} key={line.index}>
        <button className="work-step" aria-expanded={selected.includes(line.index)} onClick={() => setSelected([line.index])}>
          <span className="text-xs muted">{m.work.line(line.index, line.page)}{struck ? ` · ${m.work.struck}` : line.skipped ? ` · ${m.work.skipped}` : unknown ? ` · ${m.work.unknown}` : ''}{uncertain ? ` · ${workVi.uncertain}` : ''}</span>
          <span className={`math${struck ? ' work-deleted' : ''}`}>{line.missing ? workVi.status({ kind: 'reading', reason: 'missing', lines: [line.index], page: line.page, shownText: '', options: [] }) : labels.text(line.text)}</span></button>
        {needsReview && <WorkCrop pages={pages} page={line.page} box={line.box}/>}
        {issues.map((issue, i) => <p className="text-sm muted" key={i}>{labels.text(issue.message)}</p>)}
        {selected.includes(line.index) && <div className="work-editor">{!needsReview && <WorkCrop pages={pages} page={line.page} box={line.box}/>}
          <LineEditor key={`${line.index}:${line.text}`} line={line} onAnswer={answer} busy={busy}/>
          {line.struck && <button className="btn btn-outline" onClick={() => answer([{ line: line.index, struck: false }])}>{m.work.struckNo}</button>}
        </div>}</div>;
    })}
    {review.parsed.issues.filter((issue) => !issue.lines?.length).map((issue, index) => <p className="text-sm muted" key={index}>{labels.text(issue.message)}</p>)}
  </div><Actions>{review.grade.questions.length ? <button className="btn btn-primary btn-block" disabled={busy} onClick={() => setAsking(true)}>{workVi.ask}</button>
    : onAcknowledge && review.grade.result.verdict === 'CAN_XAC_NHAN' ? <button className="btn btn-primary btn-block" disabled={busy} onClick={onAcknowledge}>{workVi.ack}</button>
    : <button className="btn btn-primary btn-block" onClick={() => onResult ? onResult() : setView('result')}>{m.work.result}</button>}</Actions></div>;
}

function LineEditor({ line, onAnswer, busy }: { line: WorkLine; onAnswer: (answers: WorkAnswer[]) => void; busy: boolean }) {
  const [text, setText] = useState(line.text);
  return <div><label className="work-field">{m.work.edit}<textarea value={text} onChange={(e) => setText(e.target.value)}/></label>
    <button className="btn btn-outline" disabled={busy || !text.trim()} onClick={() => onAnswer([{ line: line.index, text }])}>{m.work.apply}</button></div>;
}
