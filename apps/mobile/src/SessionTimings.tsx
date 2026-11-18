import React from 'react';
import type { Session } from './flow/types.js';
import { settingsVi as m } from './settings.vi.js';

export function SessionTimings({ timings }: { timings: Session['timings'] }) {
  return <details className="card session-timings"><summary>{m.timing}</summary><dl className="kv">
    {(Object.keys(m.timings) as (keyof Session['timings'])[]).map((key) => <React.Fragment key={key}>
      <dt>{m.timings[key]}</dt><dd>{timings[key] === undefined ? m.pending : m.milliseconds(timings[key])}</dd>
    </React.Fragment>)}
  </dl></details>;
}
