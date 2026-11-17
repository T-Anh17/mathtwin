import type { FigureVertex, Point } from './types.js';
import { neighbors, pointDistance } from './pixels.js';

export function strokeNeighbors(i: number, skeleton: Uint8Array, width: number): number[] {
  return neighbors(i, skeleton, width).filter(n => {
    const dx = n % width - i % width, dy = Math.floor(n / width) - Math.floor(i / width);
    return !dx || !dy || (!skeleton[i + dx] && !skeleton[i + dy * width]);
  });
}
/** Maximum cardinality, then minimum angular error; exact deterministic matching.
 * Directions point OUT of a junction, so straight continuation has dot product -1.
 */
export function pairBranches(directions: Point[], maxDeviation = Math.PI / 6): Map<number, number> {
  const cosine = -Math.cos(maxDeviation), memo = new Map<string, { pairs: [number, number][]; error: number }>();
  const solve = (remaining: number[]): { pairs: [number, number][]; error: number } => {
    if (remaining.length < 2) return { pairs: [], error: 0 };
    const key = remaining.join(','), cached = memo.get(key); if (cached) return cached;
    const [first, ...rest] = remaining;
    let best = solve(rest);
    for (const second of rest) {
      const a = directions[first!]!, b = directions[second]!;
      const dot = (a[0] * b[0] + a[1] * b[1]) / (Math.hypot(...a) * Math.hypot(...b) || 1);
      if (dot > cosine) continue;
      const tail = solve(rest.filter(i => i !== second));
      const next = { pairs: [[first!, second] as [number, number], ...tail.pairs], error: tail.error + 1 + dot };
      if (next.pairs.length > best.pairs.length || (next.pairs.length === best.pairs.length && next.error < best.error)) best = next;
    }
    memo.set(key, best); return best;
  };
  const result = new Map<number, number>();
  // Raster junction clusters have few physical arms. Cap pathological noise,
  // which remains unpaired and therefore cannot silently form arbitrary edges.
  for (const [a,b] of solve(directions.map((_d,i)=>i).slice(0,12)).pairs) { result.set(a,b); result.set(b,a); }
  return result;
}

/** Long branches leaving a marker ellipse. A paired arm passes through; an
 * unpaired arm terminates here. Short glyph/ring remnants are not incident edges.
 */
export function markerBranches(skeleton: Uint8Array, width: number, vertex: FigureVertex) {
  const radius = Math.max(vertex.rx, vertex.ry), reach = radius + 18;
  const left = Math.max(0, Math.floor(vertex.center[0] - reach)), top = Math.max(0, Math.floor(vertex.center[1] - reach));
  const right = Math.min(width, Math.ceil(vertex.center[0] + reach + 1)), bottom = Math.min(skeleton.length / width, Math.ceil(vertex.center[1] + reach + 1));
  const localWidth = right - left, local = new Uint8Array(localWidth * (bottom - top));
  const boundary = (p: Point): number => Math.hypot((p[0]-vertex.center[0])/(vertex.rx+3),(p[1]-vertex.center[1])/(vertex.ry+3));
  for (let y=top;y<bottom;y++) for(let x=left;x<right;x++) if(skeleton[y*width+x] && boundary([x,y])>1) local[(y-top)*localWidth+x-left]=1;
  const seen = new Uint8Array(local.length), directions: Point[]=[];
  for(let i=0;i<local.length;i++) if(local[i]&&!seen[i]) {
    const pixels=[i];seen[i]=1;
    for(let j=0;j<pixels.length;j++) for(const n of neighbors(pixels[j]!,local,localWidth)) if(!seen[n]) {seen[n]=1;pixels.push(n);}
    const points=pixels.map(n=>[n%localWidth+left,Math.floor(n/localWidth)+top] as Point);
    const near=points.some(p=>boundary(p)<=1.65);
    const far=points.sort((a,b)=>pointDistance(b,vertex.center)-pointDistance(a,vertex.center))[0]!;
    if(near && pointDistance(far,vertex.center)>=radius+12 && pixels.length>=9) directions.push([far[0]-vertex.center[0],far[1]-vertex.center[1]]);
  }
  const paired=pairBranches(directions);
  return { directions, pairs:paired.size/2, endings:directions.length-paired.size };
}
