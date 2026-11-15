import type { ImageResult } from './contracts.js';
export interface Overlay { box: [number, number, number, number]; label: string }
/** Coordinates in results are in the original EXIF-corrected image coordinate space. */
export function flagOverlays(result: ImageResult): Overlay[] {
  const marks: Overlay[] = [];
  for (const pass of result.linePasses ?? []) for (const line of pass.lines) {
    if (line.box && (line.conf < 0.85 || line.alternatives.length)) marks.push({ box: line.box, label: line.text });
  }
  const outcome = result.outcome;
  if (outcome) {
    const uncertain = outcome.spec?.uncertain ?? outcome.graphUncertain;
    for (const draft of outcome.drafts) for (const vertex of draft.vertices) {
      if (vertex.box && (vertex.conf < 0.85 || vertex.alternatives?.length || uncertain.some((u) => u.item === vertex.label || u.item === 'graph')))
        marks.push({ box: vertex.box, label: vertex.label });
    }
    // The schema has no weight/edge boxes. Show a coarse region between measured endpoint boxes;
    // never invent a weight location or fabricate an edge trace.
    const draft = outcome.drafts[0];
    if (draft) draft.edges.forEach((edge, i) => {
      const id = `e${i + 1}`;
      if (!uncertain.some((u) => u.item === id || u.item.startsWith(`${id}.`))) return;
      const a = draft.vertices.find((v) => v.label === edge.u)?.box;
      const b = draft.vertices.find((v) => v.label === edge.v)?.box;
      if (a && b) marks.push({ box: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])], label: id });
    });
  }
  return marks;
}
