import React from 'react';
import type { WorkQuestion } from '@mathtwin/work';
import { productVi as m } from './product-messages.vi.js';
import { cropBox } from './work-session.js';
import type { WorkPage } from './work-session.js';

export function WorkCrop({ pages, page, box, marked = false }: { pages: WorkPage[]; page: number; box?: WorkQuestion['box'] | undefined; marked?: boolean }) {
  const source = pages[page];
  if (!source) return <p className="muted">{m.work.noImage}</p>;
  const [x, y, width, height] = cropBox(box);
  return <div><svg className="work-crop" role="img" aria-label={m.work.source} viewBox={`${x} ${y} ${width} ${height}`}
    preserveAspectRatio="none" style={{ aspectRatio: `${width * source.width} / ${height * source.height}` }}>
    <image href={source.image} width="1000" height="1000" preserveAspectRatio="none"/>
    {marked && box && <rect x={box[0]} y={box[1]} width={box[2] - box[0]} height={box[3] - box[1]} fill="#b6403220" stroke="#b64032" strokeWidth="2"/>}
  </svg>{!box && <p className="text-xs muted">{m.work.noBox}</p>}</div>;
}

