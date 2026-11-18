import React from 'react';
import { Topbar } from './product-ui.js';
import { sessionVi as m } from './flow/messages.vi.js';
import type { Session, SessionEvent } from './flow/types.js';
import type { PhotoStore } from './flow/store.js';
import type { Readers } from './flow/reading.js';
import { ProblemFlowScreen } from './ProblemFlowScreen.js';
import { SolutionScreen } from './SolutionScreen.js';
import { solutionVi } from './solution.vi.js';

/** Stage-driven resume surface. Detailed capture/review/result screens belong to batches 4.2–4.5. */
export function SessionScreen({ session: s, busy, onEvent, onBack, ...reading }: {
  session: Session; busy: boolean; onEvent: (event: SessionEvent) => void | Promise<void>; onBack: () => void;
  photoStore?: PhotoStore; readers?: Readers; readerReady?: boolean; preview?: boolean; onSettings?: () => void;
}) {
  if (['problem_capture', 'problem_reading', 'problem_confirm'].includes(s.stage)) return <ProblemFlowScreen
    session={s} busy={busy} onEvent={onEvent} onBack={onBack} {...reading}/>;
  if (s.stage === 'solution') return <SolutionScreen session={s} busy={busy} onBack={onBack}
    onWork={(source) => { void Promise.resolve(onEvent({ type: 'work_capture', source })).catch(() => {}); }}/>;
  return <div className="screen" data-stage={s.stage}><Topbar title={m.stages[s.stage]} onBack={onBack}/>
    <div className="content"><div className="card">
      <h2 className="section-title">{s.spec ? m.tasks[s.spec.task.type] : m.untitled}</h2>
      <p>{m.saved}</p>
      {s.stage === 'work_capture' && <p>{s.workSource === 'manual' ? solutionVi.manualDestination : solutionVi.photoDestination}</p>}
      <p>{m.photos(s.problemPhotos.length + s.workPhotos.length)}</p>
      {s.workLines.map((line) => <p className="math" key={line.index}>{line.text}</p>)}
    </div>
    <button className="btn btn-outline btn-block" disabled={busy} onClick={() => onEvent({ type: 'retake', target: 'problem' })}>{m.retakeProblem}</button>
    {s.specConfirmed && <button className="btn btn-outline btn-block" disabled={busy} onClick={() => onEvent({ type: 'retake', target: 'work' })}>{m.retakeWork}</button>}
    </div></div>;
}
