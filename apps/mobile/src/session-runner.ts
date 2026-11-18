import { solve } from '@mathtwin/core';
import { gradeWork } from '@mathtwin/work';
import { sessionReducer } from './flow/sessionReducer.js';
import type { Session, SessionEvent } from './flow/types.js';

/** The platform caller owns the clock; the reducer and algorithms stay deterministic. */
export function runSessionEvent(s: Session, e: SessionEvent, now = () => performance.now()): Session {
  const measured: Session['timings'] = {};
  const next = sessionReducer(s, e, {
    solve: (spec) => { const start = now(); const result = solve(spec); measured.solve = now() - start; return result; },
    gradeWork: (spec, work) => { const start = now(); const result = gradeWork(spec, work); measured.grade = now() - start; return result; },
  });
  return Object.keys(measured).length ? { ...next, timings: { ...next.timings, ...measured } } : next;
}
