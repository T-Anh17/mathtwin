import type { BinaryImage, Box, Component, FigureVertex, Point } from './types.js';
import { components, pointDistance } from './pixels.js';

/** Circles vote independently of topology, then a local ellipse fit measures angular coverage. */
export function findVertices(binary: BinaryImage, skeleton: Uint8Array): FigureVertex[] {
  const { width: w, height: h, ink } = binary;
  const tangent = new Float32Array(ink.length);
  for (let i = 0; i < skeleton.length; i++) if (skeleton[i]) {
    let xx = 0, yy = 0, xy = 0;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const j = i + dy * w + dx;
      if (j >= 0 && j < skeleton.length && Math.abs(j % w - i % w) <= 4 && skeleton[j]) { xx += dx * dx; yy += dy * dy; xy += dx * dy; }
    }
    tangent[i] = Math.atan2(2 * xy, xx - yy) / 2;
  }
  const tx = new Float32Array(ink.length), ty = new Float32Array(ink.length);
  for (let i = 0; i < skeleton.length; i++) if (skeleton[i]) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const j = i + dy * w + dx;
    if (j >= 0 && j < ink.length && Math.abs(j % w - i % w) <= 1) { tx[j] = Math.cos(tangent[i]!); ty[j] = Math.sin(tangent[i]!); }
  }
  const stride = Math.ceil(w / 3), votes = new Uint16Array(stride * Math.ceil(h / 3));
  const angles = Array.from({ length: 24 }, (_, i) => [Math.cos(i * Math.PI / 12), Math.sin(i * Math.PI / 12)] as Point);
  for (let i = 0; i < skeleton.length; i++) if (skeleton[i]) {
    const x = i % w, y = Math.floor(i / w);
    for (let r = 8; r <= 25; r += 2) for (const [dx, dy] of angles) {
      const cx = Math.round((x - r * dx) / 3), cy = Math.round((y - r * dy) / 3);
      if (cx >= 0 && cx < stride && cy >= 0 && cy < Math.ceil(h / 3)) votes[cy * stride + cx]!++;
    }
  }
  const peaks = Array.from(votes, (v, i) => ({ v, i })).filter(p => p.v >= 24).sort((a, b) => b.v - a.v || a.i - b.i);
  const tried: Point[] = [], candidates: FigureVertex[] = [];
  for (const peak of peaks) {
    const peakCenter: Point = [(peak.i % stride) * 3, Math.floor(peak.i / stride) * 3];
    let center = peakCenter;
    if (tried.some(p => pointDistance(p, center) < 9)) continue;
    tried.push(center);
    let best: FigureVertex | undefined;
    for (const ox of [-3, 0, 3]) for (const oy of [-3, 0, 3]) for (let r = 8; r <= 25; r++) for (const aspect of [0.8, 1, 1.2]) {
      center = [peakCenter[0] + ox, peakCenter[1] + oy];
      let supported = 0, residual = 0; const bins: boolean[] = [];
      for (let a = 0; a < 40; a++) {
        const angle = a * Math.PI / 20; let error = Infinity;
        for (let dr = -2; dr <= 2; dr++) {
          const x = Math.round(center[0] + (r + dr) * Math.cos(angle)), y = Math.round(center[1] + (r * aspect + dr) * Math.sin(angle));
          if (x >= 1 && x < w - 1 && y >= 1 && y < h - 1 && ink[y * w + x]) {
            const j = y * w + x;
            if ((tx[j] || ty[j]) && Math.abs(tx[j]! * Math.cos(angle) + ty[j]! * Math.sin(angle)) < 0.5) error = Math.min(error, Math.abs(dr));
          }
        }
        bins.push(Number.isFinite(error));
        if (Number.isFinite(error)) { supported++; residual += error; }
      }
      const coverage = supported / 40, fit = 1 - residual / Math.max(1, supported) / 3;
      let run = 0, longest = 0;
      const filled = bins.map((value, a) => value || (bins[(a + 39) % 40] && bins[(a + 1) % 40]));
      for (let a = 0; a < 80; a++) { run = filled[a % 40] ? run + 1 : 0; longest = Math.max(longest, run); }
      const score = coverage * (0.75 + 0.25 * fit);
      if (coverage < 0.60 || longest < 22 || (best && score <= best.score)) continue;
      let inner = 0, area = 0;
      for (let dy = -Math.floor(r * aspect / 2); dy <= r * aspect / 2; dy++) for (let dx = -Math.floor(r / 2); dx <= r / 2; dx++) {
        const x = center[0] + dx, y = center[1] + dy;
        if (x >= 0 && x < w && y >= 0 && y < h) { inner += ink[y * w + x]!; area++; }
      }
      if (coverage >= 0.60 && inner / area < 0.48 && (!best || score > best.score)) best = { center, rx: r, ry: r * aspect, score, kind: 'ring' };
    }
    if (best) candidates.push(best);
  }
  const out: FigureVertex[] = [];
  for (const v of candidates.sort((a, b) => b.score - a.score || a.center[1] - b.center[1] || a.center[0] - b.center[0])) {
    if (!out.some(p => pointDistance(p.center, v.center) < (Math.max(p.rx, p.ry) + Math.max(v.rx, v.ry)) * 0.95)) out.push(v);
  }
  // Compact filled components and locally thick junctions are dots, including a marked crossing.
  const connected = components(ink, w), compactMask = new Uint8Array(ink.length);
  for (const c of connected) if (Math.max(c.box[2] - c.box[0], c.box[3] - c.box[1]) <= 48) for (const i of c.pixels) compactMask[i] = 1;
  const dotCandidates: {center:Point;strength:number}[] = connected.filter(c => {
    const dx = c.box[2] - c.box[0], dy = c.box[3] - c.box[1];
    return dx >= 5 && dy >= 5 && dx <= 18 && dy <= 18 && dx / dy >= 0.75 && dx / dy <= 1.33 && c.pixels.length / (dx * dy) > 0.62;
  }).map(c => ({center:[(c.box[0] + c.box[2]) / 2, (c.box[1] + c.box[3]) / 2] as Point,strength:30}));
  for (let y = 5; y < h - 5; y++) for (let x = 5; x < w - 5; x++) if (skeleton[y * w + x] && !compactMask[y * w + x]) {
    let fill = 0; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (dx * dx + dy * dy <= 9) fill += ink[(y + dy) * w + x + dx]!;
    if (fill >= 27) dotCandidates.push({center:[x,y],strength:fill});
  }
  for (const {center} of dotCandidates.sort((a,b)=>b.strength-a.strength||a.center[1]-b.center[1]||a.center[0]-b.center[0])) if (!out.some(v => pointDistance(v.center, center) < v.rx + 9)) out.push({ center, rx: 6, ry: 6, score: 0.9, kind: 'dot' });
  return out.sort((a, b) => a.center[1] - b.center[1] || a.center[0] - b.center[0]);
}
export function inside(p: Point, v: FigureVertex, margin = 0): boolean {
  return ((p[0] - v.center[0]) / (v.rx + margin)) ** 2 + ((p[1] - v.center[1]) / (v.ry + margin)) ** 2 <= 1;
}

/** Dense horizontal runs of glyph-sized components are prose, not graph geometry. */
export function removeTextRows(binary: BinaryImage): void {
  const original = components(binary.ink, binary.width);
  const small = original.filter(c => {
    const h = c.box[3] - c.box[1], w = c.box[2] - c.box[0];
    return h >= 5 && h <= 36 && w <= h * 8 && w >= 2;
  });
  const erased = new Uint8Array(binary.ink.length);
  for (let degrees = -8; degrees <= 8; degrees += 2) {
    const slope = Math.tan(degrees * Math.PI / 180);
    const projection = (c: Component): number => (c.box[1] + c.box[3]) / 2 - slope * (c.box[0] + c.box[2]) / 2;
    const rows: Component[][] = [];
    for (const c of [...small].sort((a, b) => projection(a) - projection(b))) {
      const h = c.box[3] - c.box[1];
      const row = rows.find(r => Math.abs(projection(c) - projection(r[0]!)) <= Math.max(h, r[0]!.box[3] - r[0]!.box[1]) * 0.6);
      if (row) row.push(c); else rows.push([c]);
    }
    for (const row of rows) {
      row.sort((a, b) => a.box[0] - b.box[0]);
      let run: Component[] = [];
      const erase = (): void => {
        if (run.length < 4) return;
        const height = run.map(c => c.box[3] - c.box[1]).sort((a, b) => a - b)[Math.floor(run.length / 2)]!;
        const left = Math.min(...run.map(c => c.box[0])), right = Math.max(...run.map(c => c.box[2]));
        if (right - left < height * 6) return;
        const top = Math.max(0, Math.floor(Math.min(...run.map(c => c.box[1])) - height * 0.7));
        const bottom = Math.min(binary.height, Math.ceil(Math.max(...run.map(c => c.box[3])) + height * 0.7));
        if (original.some(c => c.box[3] - c.box[1] > height * 5 && c.box[0] < right && c.box[2] > left && c.box[1] < bottom && c.box[3] > top)) return;
        for (let y = top; y < bottom; y++) erased.fill(1, y * binary.width + Math.max(0, left - 2), y * binary.width + Math.min(binary.width, right + 2));
      };
      for (const c of row) {
        const previous = run.at(-1);
        if (previous && c.box[0] - previous.box[2] > Math.max(c.box[3] - c.box[1], previous.box[3] - previous.box[1]) * 2.2) { erase(); run = []; }
        run.push(c);
      }
      erase();
    }
  }
  for (let i=0; i<erased.length; i++) if (erased[i]) binary.ink[i]=0;
}
/** Include disconnected rings/components after suppressing prose. Empty box means no figure evidence. */
export function locateFigure(binary: BinaryImage): Box {
  removeTextRows(binary);
  const { width: w, height: h } = binary, all = components(binary.ink, w);
  const evidence = all.filter(c => {
    const dx = c.box[2] - c.box[0], dy = c.box[3] - c.box[1];
    return Math.max(dx, dy) > 65 || (dx >= 16 && dy >= 16 && dx / dy > 0.55 && dx / dy < 1.8 && c.pixels.length / (dx * dy) < 0.5);
  });
  if (!evidence.length) return [0, 0, 0, 0];
  const relevant = all.filter(c => c.pixels.length >= 9 && Math.max(c.box[2] - c.box[0], c.box[3] - c.box[1]) >= 8);
  return [Math.max(0, Math.min(...relevant.map(c => c.box[0])) - 15), Math.max(0, Math.min(...relevant.map(c => c.box[1])) - 15),
    Math.min(w, Math.max(...relevant.map(c => c.box[2])) + 15), Math.min(h, Math.max(...relevant.map(c => c.box[3])) + 15)];
}
/** Small compact components; remove long straight strokes first to recover attached characters. */
export function glyphComponents(binary: BinaryImage, vertices: FigureVertex[]): Component[] {
  const { width: w, ink } = binary;
  const detached = ink.slice();
  for (let i = 0; i < detached.length; i++) if (detached[i]) {
    const p: Point = [i % w, Math.floor(i / w)];
    if (vertices.some(v => v.kind === 'ring' && inside(p, v, 3) && !inside(p, v, -4))) detached[i] = 0;
  }
  // Directional opening separates a long edge from a character attached to it.
  const stripped = detached.slice();
  for (const angle of Array.from({ length: 12 }, (_, i) => i * Math.PI / 12)) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    for (let i = 0; i < detached.length; i++) if (detached[i]) {
      const x = i % w, y = Math.floor(i / w); let supported = 0;
      for (let t = -24; t <= 24; t += 3) {
        const xx = Math.round(x + dx * t), yy = Math.round(y + dy * t);
        if (xx >= 1 && xx < w-1 && yy >= 1 && yy < binary.height-1 && [-1,0,1].some(offset=>{
          const px=Math.round(xx-offset*dy),py=Math.round(yy+offset*dx);
          return detached[py*w+px];
        })) supported++;
      }
      if (supported >= 15) stripped[i] = 0;
    }
  }
  const compact = (c: Component): boolean => {
    const dx = c.box[2] - c.box[0], dy = c.box[3] - c.box[1];
    if (dy < 5 || dy > 48 || dx < 2 || dx > 70 || dx / dy > 3 || dy / dx > 9 || c.pixels.length < 9) return false;
    const center: Point = [(c.box[0] + c.box[2]) / 2, (c.box[1] + c.box[3]) / 2];
    return !vertices.some(v => v.kind === 'ring' && Math.abs(dx - 2 * v.rx) < 8 && Math.abs(dy - 2 * v.ry) < 8 && pointDistance(v.center, center) < 7);
  };
  const result = components(detached, w).filter(compact);
  for (const c of components(stripped, w).filter(compact)) if (!result.some(p => p.box.every((n,i)=>n===c.box[i]))) result.push({ ...c, attached: true });
  // Group adjacent characters (v1, 17), retaining accent/subscript components.
  result.sort((a, b) => a.box[1] - b.box[1] || a.box[0] - b.box[0]);
  for (let i = 0; i < result.length; i++) for (let j = i + 1; j < result.length; j++) {
    const a = result[i]!, b = result[j]!, gap = Math.max(a.box[0] - b.box[2], b.box[0] - a.box[2]);
    const overlap = Math.min(a.box[3], b.box[3]) - Math.max(a.box[1], b.box[1]);
    if (gap <= 6 && gap >= -2 && overlap > Math.min(a.box[3] - a.box[1], b.box[3] - b.box[1]) * 0.4 && Math.max(a.box[2], b.box[2]) - Math.min(a.box[0], b.box[0]) < 65) {
      a.pixels.push(...b.pixels); a.box = [Math.min(a.box[0], b.box[0]), Math.min(a.box[1], b.box[1]), Math.max(a.box[2], b.box[2]), Math.max(a.box[3], b.box[3])]; result.splice(j--, 1);
    }
  }
  return result;
}

export { traceStrokeEdges as traceEdges } from './stroke-network.js';
