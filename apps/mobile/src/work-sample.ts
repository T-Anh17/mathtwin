import type { ProblemSpec } from '@mathtwin/core';
import type { WorkLine } from '@mathtwin/work';
import { productVi as m } from './product-messages.vi.js';
import type { WorkPage } from './work-session.js';

// Synthetic local demonstration, never a result of reading a student's image.
export const sampleWorkSpec: ProblemSpec = {
  graph: { directed: false, vertices: ['A', 'B', 'C'].map((id) => ({ id, label: id })),
    edges: [{ id: 'ab', u: 'A', v: 'B', w: 1 }, { id: 'bc', u: 'B', v: 'C', w: 2 }] },
  task: { type: 'elements' }, questionFormat: 'tu_luan',
};
export const sampleWorkLines: WorkLine[] = m.work.sampleLines.map((text, index) => ({
  text, index, page: 0, box: [70, 140 + index * 100, 920, 195 + index * 100],
  conf: index === 1 ? 0.6 : 0.99, alternatives: index === 1 ? [m.work.sampleAlternative] : [],
  ...(index === 3 ? { struck: true } : {}), region: 'solution',
}));
const escapeXml = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
// Code-drawn sample matches the source boxes exactly; no external image request.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 1000 1000" preserveAspectRatio="none"><rect width="1000" height="1000" fill="#fffdf9"/>${sampleWorkLines.map((line) => `<text x="70" y="${line.box![1] + 40}" font-size="31" fill="#1f2d55">${escapeXml(line.text)}</text>${line.struck ? `<path d="M65 ${line.box![1] + 22} H920" stroke="#1f2d55" stroke-width="4"/>` : ''}`).join('')}</svg>`;
export const sampleWorkPages: WorkPage[] = [{ image: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, width: 800, height: 1000 }];
