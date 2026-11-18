import React, { useState } from 'react';
import type { ProblemSpec } from '@mathtwin/core';
import type { WorkAnswer, WorkLine, WorkQuestion } from '@mathtwin/work';
import { Actions, Topbar } from './product-ui.js';
import { productVi as m } from './product-messages.vi.js';
import { WorkResultScreen } from './ResultScreen.js';
import { reviewWork, textAnswers } from './work-session.js';
import type { WorkPage, WorkReview } from './work-session.js';
import { WorkCrop } from './WorkCrop.js';
import './work.css';


export function WorkQuestionScreen({ question, lines, pages, onAnswer, onBack }: {
  question: WorkQuestion; lines: WorkLine[]; pages: WorkPage[]; onAnswer: (answers: WorkAnswer[]) => void; onBack: () => void;
}) {
  const sources = question.lines.flatMap((index) => lines.filter((line) => line.index === index));
  const [texts, setTexts] = useState<Record<number, string>>(() => {
    const shown = question.shownText.split('\n');
    return Object.fromEntries(sources.map((line, index) => [line.index, shown.length === sources.length ? shown[index] ?? line.text : line.text]));
  });
  const [selected, setSelected] = useState<string | null>(null);
  const choose = (option: string) => {
    const values = option.split('\n');
    if (values.length !== question.lines.length) return;
    setSelected(option); setTexts(Object.fromEntries(question.lines.map((line, i) => [line, values[i] ?? ''])));
  };
  return <div className="screen work-screen"><Topbar title={m.work.question} onBack={onBack}/><div className="content">
    <div className="card question-card"><WorkCrop pages={pages} page={question.page} box={question.box}/>
      <div className="text-xs muted">{m.work.shown}</div><p className="work-text math">{question.shownText}</p>
      {question.kind === 'struck' ? <div className="work-buttons">
        {[true, false].map((struck) => <button className="btn btn-outline" key={String(struck)} onClick={() => onAnswer(question.lines.map((line) => ({ line, struck })))}>{struck ? m.work.struckYes : m.work.struckNo}</button>)}
      </div> : <div className="options">{question.options.filter((option) => option !== m.work.skip && option.split('\n').length === question.lines.length).map((option) =>
        <button className="option math work-text" key={option} aria-pressed={selected === option} onClick={() => choose(option)}>{option}</button>)}</div>}
      <div className="section-title">{m.work.retype}</div>
      {sources.map((line) => <label className="work-field" key={line.index}>{m.work.line(line.index, line.page)}
        {(line.page !== question.page || sources.length > 1) && <WorkCrop pages={pages} page={line.page} box={line.box}/>}
        <textarea value={texts[line.index] ?? ''} onChange={(event) => { setSelected(null); setTexts({ ...texts, [line.index]: event.target.value }); }}/></label>)}
    </div></div><Actions><div className="work-buttons">
      <button className="btn btn-outline" onClick={() => onAnswer(question.lines.map((line) => ({ line, skip: true })))}>{m.work.skip}</button>
      <button className="btn btn-primary" disabled={question.lines.some((line) => !texts[line]?.trim())} onClick={() => onAnswer(textAnswers(question, texts))}>{m.work.apply}</button>
    </div></Actions></div>;
}

export function WorkScreen({ spec, initialLines, pages, onBack }: { spec: ProblemSpec; initialLines: WorkLine[]; pages: WorkPage[]; onBack: () => void }) {
  const [review, setReview] = useState<WorkReview>(() => reviewWork(spec, initialLines));
  const [selected, setSelected] = useState<number[]>([]);
  const [view, setView] = useState<'lines' | 'result'>('lines');
  const [question, setQuestion] = useState<WorkQuestion | null>(null);
  const answer = (answers: WorkAnswer[]) => { setReview((old) => reviewWork(spec, old.lines, answers)); };
  if (question) return <WorkQuestionScreen key={JSON.stringify(question)} question={question} lines={review.lines} pages={pages}
    onBack={() => setQuestion(null)} onAnswer={(answers) => { answer(answers); setQuestion(null); }}/>;
  if (view === 'result') return <WorkResultScreen review={review} pages={pages} onBack={() => setView('lines')} onQuestion={setQuestion}/>;
  const label = m.verdictNames[review.grade.result.verdict.toLowerCase() as keyof typeof m.verdictNames];
  return <div className="screen work-screen"><Topbar title={m.work.title} onBack={onBack}/><div className="content">
    <p className="text-xs muted">{m.work.sampleNote}</p><p role="status" aria-live="polite">{label}</p>
    <div className="card"><h2 className="section-title">{m.work.steps}</h2><div className="work-buttons">
      {review.parsed.steps.length === 0 && <p>{m.work.noSteps}</p>}
      {review.parsed.steps.map((step) => <button className="work-step" key={step.claim.step} aria-pressed={step.lines.join() === selected.join()}
        onClick={() => setSelected(step.lines)}><b>{m.work.step(step.claim.step)}</b><span className="math">{step.claim.raw}</span></button>)}
    </div></div>
    <h2 className="section-title">{m.work.lines}</h2>
    {review.lines.map((line) => {
      const struck = review.parsed.ignored.some((item) => item.line === line.index && item.reason === 'struck');
      const unknown = review.parsed.unchecked.includes(line.index);
      return <div className={`card work-line${struck ? ' work-struck' : unknown ? ' work-unknown' : ''}`} key={line.index}>
        <button className="work-step" aria-expanded={selected.includes(line.index)} onClick={() => setSelected([line.index])}>
          <span className="text-xs muted">{m.work.line(line.index, line.page)}{struck ? ` · ${m.work.struck}` : line.skipped ? ` · ${m.work.skipped}` : unknown ? ` · ${m.work.unknown}` : ''}</span>
          <span className={`math${struck ? ' work-deleted' : ''}`}>{line.text}</span></button>
        {selected.includes(line.index) && <div className="work-editor"><WorkCrop pages={pages} page={line.page} box={line.box}/>
          <label className="work-field">{m.work.edit}<textarea value={line.text} onChange={(event) => answer([{ line: line.index, text: event.target.value }])}/></label>
          {line.struck && <button className="btn btn-outline" onClick={() => answer([{ line: line.index, struck: false }])}>{m.work.struckNo}</button>}
        </div>}</div>;
    })}
    {review.parsed.issues.map((issue, index) => <p className="text-sm muted" key={index}>{issue.message}</p>)}
  </div><Actions><button className="btn btn-primary btn-block" onClick={() => setView('result')}>{m.work.result}</button></Actions></div>;
}
