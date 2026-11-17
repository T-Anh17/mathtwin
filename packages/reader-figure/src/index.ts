import { normalizeLabel, resizeImage } from '@mathtwin/reader';
import type { PreparedImage, ReadDraft, ReadUsage, VisionReader } from '@mathtwin/reader';
import { checkedBox, components, crop, lineDistance, neighbors, pointDistance, preprocess, skeletonize, validateImage } from './pixels.js';
import { findVertices, glyphComponents, inside, locateFigure, traceEdges } from './geometry.js';
import { rankGlyphs } from './glyphs.js';
import { figureMessages } from './messages.vi.js';
import { markerBranches } from './strokes.js';
import type { BinaryImage, Box, Component, FigureObservation, FigureOptions, FigureVertex, GlyphCandidate, GlyphRole, Point } from './types.js';
export type * from './types.js';
export { CropGlyphReader, VietOcrGlyphReader, LlamaGlyphReader, NoGlyphReader, OracleGlyphReader, allowedGlyph, rankGlyphs } from './glyphs.js';
export type { OracleGlyph } from './glyphs.js';
export { crop, preprocess, skeletonize } from './pixels.js';
export { locateFigure } from './geometry.js';

export class FigureReader implements VisionReader {
  readonly engine = 'offline:figure-cv';
  readonly glyphEngine: string;
  private readonly threshold: number;
  protected detectVertices(binary: BinaryImage, skeleton: Uint8Array): FigureVertex[] { return findVertices(binary, skeleton); }
  protected get allowLabelVertices(): boolean { return true; }
  protected get refineVertices(): boolean { return true; }
  protected observe(_observation: FigureObservation): void {}
  constructor(private readonly options: FigureOptions) {
    this.glyphEngine = options.glyphReader.engine; this.threshold = options.glyphThreshold ?? 0.85;
    if (!Number.isFinite(this.threshold) || this.threshold < 0 || this.threshold > 1) throw new Error('Invalid glyph threshold.');
  }
  async read(images: PreparedImage[], _pass: 'edges' | 'neighbors', signal?: AbortSignal): Promise<{ draft: ReadDraft; usage: ReadUsage }> {
    if (!images.length) throw new Error('Empty input.');
    const start = performance.now(); let recognitionMs = 0;
    const draft: ReadDraft = { representation: 'figure', directed: false, vertices: [], edges: [],
      statedFacts: { vertexCount: null, edgeCount: null, weightUnit: null }, question: this.options.question ?? null, unreadable: [] };
    for (const input of images) {
      signal?.throwIfAborted(); validateImage(input);
      const image = resizeImage(input, 1000), sx = input.width / image.width, sy = input.height / image.height;
      const binary = preprocess(image);
      const box = this.options.figureBox ? checkedBox(this.options.figureBox, input.width, input.height).map((v, i) => v / (i % 2 ? sy : sx)) as Box : locateFigure(binary);
      if (box[2] <= box[0] || box[3] <= box[1]) {
        draft.unreadable.push({ what: 'figure', note: figureMessages.noFigure });
        this.observe({ box: [0, 0, 0, 0], vertices: [], labels: [], paths: [], edges: [] });
        continue;
      }
      for (let i = 0; i < binary.ink.length; i++) if (i % image.width < box[0] || i % image.width >= box[2] || Math.floor(i / image.width) < box[1] || Math.floor(i / image.width) >= box[3]) binary.ink[i] = 0;
      const skeleton = skeletonize(binary.ink, image.width), vertices = this.detectVertices(binary, skeleton);
      const branches = new Map(vertices.map(v => [v, markerBranches(skeleton, image.width, v)]));
      const physicalBranches = new Map(branches);
      const glyphs = glyphComponents(binary, vertices);
      const read = async (component: Component, role: GlyphRole): Promise<GlyphCandidate[]> => {
        signal?.throwIfAborted(); const b = component.box;
        const original: Box = [Math.max(0, Math.floor((b[0] - 3) * sx)), Math.max(0, Math.floor((b[1] - 4) * sy)), Math.min(input.width, Math.ceil((b[2] + 3) * sx)), Math.min(input.height, Math.ceil((b[3] + 4) * sy))];
        const t = performance.now();
        const result = rankGlyphs(await this.options.glyphReader.readGlyph({ image: crop(input, original), box: original, role }, signal), role);
        recognitionMs += performance.now() - t; signal?.throwIfAborted(); return result;
      };
      const centers = glyphs.map(g => [(g.box[0] + g.box[2]) / 2, (g.box[1] + g.box[3]) / 2] as Point);
      const labels = new Map<number, { glyph: number; choices: GlyphCandidate[]; assignment: number; targets: number[] }>(), consumed = new Set<number>();
      const readings = new Map<number, GlyphCandidate[]>();
      const strokeMask = binary.ink.slice();
      for (const g of glyphs) for (const index of g.pixels) strokeMask[index] = 0;
      const strokeSkeleton = skeletonize(strokeMask, image.width), endpoints: Point[] = [];
      for (let i = 0; i < strokeSkeleton.length; i++) if (strokeSkeleton[i] && neighbors(i, strokeSkeleton, image.width).length === 1) endpoints.push([i % image.width, Math.floor(i / image.width)]);
      for (let i = 0; i < glyphs.length; i++) readings.set(i, await read(glyphs[i]!, 'label'));
      // A label touching an incident edge may not form a compact component.
      // Query the interior of each pixel-detected marker as an additional crop;
      // these crops carry no stroke pixels, so they cannot erase an entire edge.
      for (const v of vertices) {
        if (v.kind !== 'ring' && (v.kind!=='dot'||branches.get(v)!.endings===0)) continue;
        const factor = v.kind === 'ring' ? 0.65 : 1;
        const box: Box = [Math.max(0, Math.floor(v.center[0] - v.rx * factor)), Math.max(0, Math.floor(v.center[1] - v.ry * factor)),
          Math.min(image.width, Math.ceil(v.center[0] + v.rx * factor)), Math.min(image.height, Math.ceil(v.center[1] + v.ry * factor))];
        const component: Component = { box, pixels: [] }, choices = await read(component, 'label');
        if ((choices[0]?.probability ?? 0) < this.threshold) continue;
        const index = glyphs.length; glyphs.push(component); centers.push(v.center); readings.set(index, choices);
      }
      const weights = new Map<number, GlyphCandidate[]>(), names = new Map<number, GlyphCandidate[]>();
      for (let i = 0; i < glyphs.length; i++) weights.set(i, await read(glyphs[i]!, 'weight'));
      const heights = glyphs.filter((_g,i)=>(readings.get(i)?.[0]?.probability??0)>=this.threshold || (weights.get(i)?.[0]?.probability??0)>=this.threshold)
        .map(g=>g.box[3]-g.box[1]).sort((a,b)=>a-b);
      const textHeight = heights[Math.floor(heights.length/2)] ?? 16;
      const longStrokes = components(skeleton,image.width).filter(c=>Math.max(c.box[2]-c.box[0],c.box[3]-c.box[1])>textHeight*4);
      if (this.refineVertices) for (let i = vertices.length - 1; i >= 0; i--) {
        const v = vertices[i]!;
        if (v.kind === 'ring' && 2*Math.max(v.rx,v.ry)<=1.3*textHeight && !branches.get(v)!.directions.length
          && !glyphs.some((_g,j)=>inside(centers[j]!,v,-3) && (readings.get(j)?.[0]?.probability??0)>=this.threshold)) {
          // Return a character-sized empty contour to glyph recognition.
          const b: Box=[Math.max(0,Math.floor(v.center[0]-v.rx-2)),Math.max(0,Math.floor(v.center[1]-v.ry-2)),Math.min(image.width,Math.ceil(v.center[0]+v.rx+3)),Math.min(image.height,Math.ceil(v.center[1]+v.ry+3))];
          const pixels:number[]=[];
          for(let y=b[1];y<b[3];y++)for(let x=b[0];x<b[2];x++)if(binary.ink[y*image.width+x])pixels.push(y*image.width+x);
          const g={box:b,pixels}, j=glyphs.length; glyphs.push(g);centers.push(v.center);
          readings.set(j,await read(g,'label'));weights.set(j,await read(g,'weight'));
          vertices.splice(i,1);continue;
        }
        // Circled numbers are edge annotations. Require positive OCR evidence,
        // and keep a marker if a competing label is present inside it.
        if (v.kind !== 'ring' || glyphs.some((_g, j) => inside(centers[j]!, v) && (readings.get(j)?.[0]?.probability ?? 0) >= this.threshold)) continue;
        let annotationIndex = glyphs.findIndex((_g, j) => inside(centers[j]!, v) && (weights.get(j)?.[0]?.probability ?? 0) >= this.threshold);
        if(annotationIndex<0)for(let j=0;j<glyphs.length;j++)if(inside(centers[j]!,v)) {
          if(!names.has(j))names.set(j,await read(glyphs[j]!,'name'));
          if((names.get(j)?.[0]?.probability??0)>=this.threshold){annotationIndex=j;break;}
        }
        const closeToEdge=longStrokes.some(c=>c.pixels.some(p=>pointDistance([p%image.width,Math.floor(p/image.width)],v.center)<=Math.max(v.rx,v.ry)+2.5*textHeight));
        if (annotationIndex < 0 || branches.get(v)!.endings>0 || !closeToEdge) continue;
        const pixels = glyphs[annotationIndex]!.pixels;
        for (let y = Math.max(0, Math.floor(v.center[1] - v.ry - 3)); y < Math.min(image.height, v.center[1] + v.ry + 3); y++) {
          for (let x = Math.max(0, Math.floor(v.center[0] - v.rx - 3)); x < Math.min(image.width, v.center[0] + v.rx + 3); x++) {
            if (inside([x, y], v, 3) && !inside([x, y], v, -4) && binary.ink[y * image.width + x]) pixels.push(y * image.width + x);
          }
        }
        vertices.splice(i, 1);
      }
      const originalEndpoints:Point[]=[];
      for(let i=0;i<skeleton.length;i++)if(skeleton[i]&&neighbors(i,skeleton,image.width).length===1)originalEndpoints.push([i%image.width,Math.floor(i/image.width)]);
      if(this.allowLabelVertices) {
        const proposed:Point[]=[];
        for(const p of originalEndpoints) {
          if(vertices.some(v=>inside(p,v,textHeight*1.5))||proposed.some(q=>pointDistance(p,q)<textHeight*.6))continue;
          proposed.push(p);
          // Local crop at an actual ink endpoint recovers letters that were
          // swallowed by an incident edge during component separation.
          const radius=textHeight*.65;
          const box:Box=[Math.max(0,Math.floor(p[0]-radius)),Math.max(0,Math.floor(p[1]-radius)),Math.min(image.width,Math.ceil(p[0]+radius)),Math.min(image.height,Math.ceil(p[1]+radius))];
          const g:Component={box,pixels:[],attached:true},choices=await read(g,'label');
          if((choices[0]?.probability??0)<this.threshold)continue;
          const i=glyphs.length;glyphs.push(g);centers.push([(box[0]+box[2])/2,(box[1]+box[3])/2]);
          readings.set(i,choices);weights.set(i,await read(g,'weight'));
        }
      }
      const knownStrokes=binary.ink.slice();
      for(let i=0;i<glyphs.length;i++) {
        if((readings.get(i)?.[0]?.probability??0)<this.threshold && (weights.get(i)?.[0]?.probability??0)<this.threshold && !names.has(i))names.set(i,await read(glyphs[i]!,'name'));
        if((readings.get(i)?.[0]?.probability??0)>=this.threshold || (weights.get(i)?.[0]?.probability??0)>=this.threshold || (names.get(i)?.[0]?.probability??0)>=this.threshold)
          for(const p of glyphs[i]!.pixels)knownStrokes[p]=0;
      }
      const knownSkeleton=skeletonize(knownStrokes,image.width);
      // Candidate glyphs may contain unrecognized pieces of real edges. Only
      // recognized text may cut the skeleton used to look for terminating ends.
      endpoints.length=0;
      for(let i=0;i<knownSkeleton.length;i++) {
        if(knownSkeleton[i]&&neighbors(i,knownSkeleton,image.width).length===1)endpoints.push([i%image.width,Math.floor(i/image.width)]);
      }
      for(const v of vertices)branches.set(v,markerBranches(knownSkeleton,image.width,v));
      const glyphQuality=(i:number):number=>{
        const g=glyphs[i]!,area=(g.box[2]-g.box[0])*(g.box[3]-g.box[1]);
        return g.pixels.length===0?.9:Math.min(1,g.pixels.length/(area*.35))*(g.attached?.8:1);
      };
      const valid = [...readings].filter(([, choices]) => choices[0] && choices[0].probability >= this.threshold)
        .sort((a,b)=>b[1][0]!.probability-a[1][0]!.probability || glyphQuality(b[0])-glyphQuality(a[0]) || a[0]-b[0]);
      const pairs = valid.flatMap(([glyph, choices]) => vertices.map((v, vertex) => {
        const p = centers[glyph]!, height = glyphs[glyph]!.box[3] - glyphs[glyph]!.box[1];
        const distance = pointDistance(p, v.center), radius = Math.max(v.rx, v.ry);
        const distanceCost=Math.max(0,distance-radius)/height,profile=branches.get(v)!;
        // Through-stroke dots need stronger label evidence than a marker where
        // a stroke terminates. A nearby crossing must not reserve another
        // vertex's single label before global assignment has considered it.
        const physical=physicalBranches.get(v)!;
        const through=(profile.endings===0&&profile.pairs>0)||(physical.endings===0&&physical.pairs>0);
        const penalty=v.kind==='dot'&&through?.75:0;
        return { glyph, choices, vertex, distanceCost, cost:distanceCost+penalty };
      })).filter(p => p.distanceCost <= 2.5).sort((a, b) => a.cost - b.cost || glyphQuality(b.glyph)-glyphQuality(a.glyph) || a.glyph - b.glyph || a.vertex - b.vertex);
      const assignedTexts = new Set<string>();
      // One-to-one global distance-ordered pairing; no scan-order vertex reservation.
      for (const pair of pairs) {
        const text = normalizeLabel(pair.choices[0]!.text);
        if (labels.has(pair.vertex) || consumed.has(pair.glyph) || assignedTexts.has(text)) continue;
        const candidates = pairs.filter(p => p.glyph === pair.glyph && (p.cost === 0 || pair.cost / p.cost >= 0.8));
        labels.set(pair.vertex, { glyph: pair.glyph, choices: pair.choices, targets: candidates.map(p => p.vertex),
          assignment: 1 / (1 + pair.cost) / candidates.length });
        consumed.add(pair.glyph); assignedTexts.add(text);
      }
      if (this.refineVertices) for(let i=vertices.length-1;i>=0;i--) {
        const v=vertices[i]!;
        const profile=branches.get(v)!;
        const physical=physicalBranches.get(v)!;
        const crossingRing=v.kind==='ring'&&v.score<=.75&&((profile.pairs>=2&&profile.endings===0)||(physical.pairs>=2&&physical.endings===0));
        if(labels.has(i)||(!crossingRing&&(v.kind!=='dot'||(profile.endings>0&&physical.endings>0))))continue;
        vertices.splice(i,1);
        const shifted=[...labels].map(([j,label])=>[j>i?j-1:j,{...label,targets:label.targets.filter(t=>t!==i).map(t=>t>i?t-1:t)}] as const);
        labels.clear();for(const [j,label] of shifted)labels.set(j,label);
      }
      for (const [i, choices] of valid) {
        if (!this.allowLabelVertices || consumed.has(i) || assignedTexts.has(normalizeLabel(choices[0]!.text))) continue;
        const p = centers[i]!, height = glyphs[i]!.box[3] - glyphs[i]!.box[1];
        if (vertices.some(v => inside(p, v, height * 0.5))) continue;
        const weight = weights.get(i)!;
        if ((weight[0]?.probability ?? 0) >= this.threshold) continue;
        // Lower-case edge names beside a stroke are not isolated vertex labels.
        const name = await read(glyphs[i]!, 'name');
        const nearEndpoint = endpoints.some(q => pointDistance(q, p) <= height * 2);
        const nearStroke = longStrokes.some(c=>p[0]>=c.box[0]-height*2 && p[0]<=c.box[2]+height*2 && p[1]>=c.box[1]-height*2 && p[1]<=c.box[3]+height*2
          && c.pixels.some(j=>pointDistance([j%image.width,Math.floor(j/image.width)],p)<=height*2));
        if (!nearEndpoint && (nearStroke || (name[0]?.probability ?? 0) >= this.threshold)) continue;
        const profile=markerBranches(knownSkeleton,image.width,{center:p,rx:(glyphs[i]!.box[2]-glyphs[i]!.box[0])/2,ry:height/2,kind:'label',score:1});
        if(profile.pairs>0&&profile.endings===0&&!originalEndpoints.some(q=>pointDistance(q,p)<=height))continue;
        vertices.push({ center: p, rx: Math.max(2, (glyphs[i]!.box[2] - glyphs[i]!.box[0]) / 2), ry: height / 2, score: nearEndpoint ? 0.8 : 0.65, kind: 'label' });
        const vertex = vertices.length - 1;
        labels.set(vertex, { glyph: i, choices, assignment: nearEndpoint ? 0.9 : 0.75, targets: [vertex] });
        consumed.add(i); assignedTexts.add(normalizeLabel(choices[0]!.text));
      }
      const usedLabels = new Set(draft.vertices.map(v => normalizeLabel(v.label)));
      const local = vertices.map((v, i) => {
        const recognized = labels.get(i), top = recognized?.choices[0]; let label = top?.text ?? `unreadable${draft.vertices.length + i + 1}`;
        if (usedLabels.has(normalizeLabel(label))) label = `unreadable${draft.vertices.length + i + 1}`;
        usedLabels.add(normalizeLabel(label));
        if (!top || label.startsWith('unreadable')) draft.unreadable.push({ what: label, note: figureMessages.unreadableLabel });
        return { label, conf: v.score * (top?.probability ?? 0) * (recognized?.assignment ?? 0), alternatives: recognized?.choices.slice(1).map(c => c.text) ?? [],
          box: [v.center[0] - v.rx, v.center[1] - v.ry, v.center[0] + v.rx, v.center[1] + v.ry].map((n, j) => Math.max(0, Math.min(1000, n / (j % 2 ? image.height : image.width) * 1000))) as Box };
      });
      for (let i = 0; i < glyphs.length; i++) if (!consumed.has(i)) {
        const weight = weights.get(i)!;
        if ((!weight[0] || weight[0].probability < this.threshold) && !names.has(i)) names.set(i, await read(glyphs[i]!, 'name'));
      }
      const isRecognized = (i: number): boolean => (weights.get(i)?.[0]?.probability ?? 0) >= this.threshold || (readings.get(i)?.[0]?.probability ?? 0) >= this.threshold || (names.get(i)?.[0]?.probability ?? 0) >= this.threshold;
      const paths = traceEdges(binary, vertices, glyphs.filter((_g, i) => isRecognized(i)));
      const edges: ReadDraft['edges'] = paths.map(p => ({ u: local[p.u]!.label, v: local[p.v]!.label, w: null, wAlternatives: [], name: null,
        conf: p.score * p.uScore * p.vScore, uConf: p.uScore / (labels.get(p.u)?.targets.length ?? 1), vConf: p.vScore / (labels.get(p.v)?.targets.length ?? 1),
        uAlternatives: [...new Set([...p.uAlternatives, ...(labels.get(p.u)?.targets.filter(v => v !== p.u) ?? [])])].map(v => local[v]!.label),
        vAlternatives: [...new Set([...p.vAlternatives, ...(labels.get(p.v)?.targets.filter(v => v !== p.v) ?? [])])].map(v => local[v]!.label) }));
      for (let i = 0; i < glyphs.length; i++) if (!consumed.has(i)) {
        const weight = weights.get(i) ?? [];
        const name = names.get(i) ?? (readings.get(i) ?? []).filter(c => /^[abm]$/.test(c.text));
        const reading = weight[0]?.probability !== undefined && weight[0].probability >= this.threshold ? weight : name;
        const top = reading[0]; if (!top || top.probability < this.threshold) continue;
        const ranking = paths.map((p, j) => ({ j, d: lineDistance(centers[i]!, p.points) })).filter(p => p.d <= 45).sort((a, b) => a.d - b.d || a.j - b.j);
        if (!ranking[0]) continue;
        const candidates = ranking.filter(p => (p.d === 0 || ranking[0]!.d / p.d >= 0.8));
        for (const candidate of candidates) {
          const edge = edges[candidate.j]!, assignment = (1 / (1 + candidate.d / 45)) / candidates.length;
          if (/^\d+$/.test(top.text)) {
            if (edge.w !== null && edge.w !== Number(top.text)) { edge.wAlternatives.push(Number(top.text)); edge.wConf = Math.min(edge.wConf ?? 0, assignment * top.probability); }
            else { edge.w = Number(top.text); edge.wConf = top.probability * assignment; edge.wAlternatives.push(...reading.slice(1).map(c => Number(c.text))); }
          } else edge.name = top.text;
          if (candidates.length > 1) edge.conf = Math.min(edge.conf, assignment);
        }
      }
      this.observe({ box: box.map((n, i) => n * (i % 2 ? sy : sx)) as Box,
        vertices: vertices.map(v => ({ ...v, center: [v.center[0] * sx, v.center[1] * sy], rx: v.rx * sx, ry: v.ry * sy })),
        labels: local.map(v => v.label), paths: paths.map(p => ({ ...p, points: p.points.map(q => [q[0] * sx, q[1] * sy]) })), edges });
      draft.vertices.push(...local); draft.edges.push(...edges);
    }
    return { draft, usage: { engine: this.engine, passes: 1, latencyMs: performance.now() - start, recognitionMs,
      detectionMs: performance.now() - start - recognitionMs } };
  }
}
