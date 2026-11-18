import React from 'react';
import type { Session, SessionEvent } from './flow/types.js';
import type { PhotoStore } from './flow/store.js';
import type { Readers } from './flow/reading.js';
import { ProblemFlowScreen } from './ProblemFlowScreen.js';
import { SolutionScreen } from './SolutionScreen.js';
import { WorkFlowScreen } from './WorkFlowScreen.js';

/** Stage-driven resume surface for persisted problem and work flows. */
export function SessionScreen({ session: s, busy, onEvent, onBack, ...reading }: {
  session: Session; busy: boolean; onEvent: (event: SessionEvent) => void | Promise<void>; onBack: () => void;
  photoStore?: PhotoStore; readers?: Readers; readerReady?: boolean; preview?: boolean; onSettings?: () => void;
}) {
  if (['problem_capture', 'problem_reading', 'problem_confirm'].includes(s.stage)) return <ProblemFlowScreen
    session={s} busy={busy} onEvent={onEvent} onBack={onBack} {...reading}/>;
  if (s.stage === 'solution') return <SolutionScreen session={s} busy={busy} onBack={onBack}
    onWork={(source) => { void Promise.resolve(onEvent({ type: 'work_capture', source })).catch(() => {}); }}/>;
  return <WorkFlowScreen session={s} busy={busy} onEvent={onEvent} onBack={onBack} {...reading}/>;
}
