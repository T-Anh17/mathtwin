import React from 'react';
import type { Session, SessionEvent } from './flow/types.js';
import type { PhotoStore } from './flow/store.js';
import type { Readers } from './flow/reading.js';
import { ProblemFlowScreen } from './ProblemFlowScreen.js';
import { SolutionScreen } from './SolutionScreen.js';
import { WorkFlowScreen } from './WorkFlowScreen.js';
import { SessionTimings } from './SessionTimings.js';
import { settingsVi } from './settings.vi.js';

/** Stage-driven resume surface for persisted problem and work flows. */
export function SessionScreen({ session: s, busy, onEvent, onBack, resumed = false, ...reading }: {
  session: Session; busy: boolean; onEvent: (event: SessionEvent) => void | Promise<void>; onBack: () => void;
  photoStore?: PhotoStore; readers?: Readers; readerReady?: boolean; preview?: boolean; onSettings?: () => void;
  resumed?: boolean;
}) {
  const screen = ['problem_capture', 'problem_reading', 'problem_confirm'].includes(s.stage) ? <ProblemFlowScreen
    session={s} busy={busy} onEvent={onEvent} onBack={onBack} {...reading}/>
    : s.stage === 'solution' ? <SolutionScreen session={s} busy={busy} onBack={onBack}
      onWork={(source) => { void Promise.resolve(onEvent({ type: 'work_capture', source })).catch(() => {}); }}/>
    : <WorkFlowScreen session={s} busy={busy} onEvent={onEvent} onBack={onBack} {...reading}/>;
  return <>{resumed && <p className="banner" role="status">{settingsVi.resumed}</p>}{screen}<SessionTimings timings={s.timings}/></>;
}
