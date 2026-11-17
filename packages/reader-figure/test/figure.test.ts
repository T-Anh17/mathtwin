import { expect, it } from 'vitest';
import { FigureReader, OracleGlyphReader, CropGlyphReader, rankGlyphs } from '../src/index.js';
import type { PreparedImage, ReadDraft } from '@mathtwin/reader';
import { normalizeDraft, reconcile } from '@mathtwin/reader';
import { preprocess, skeletonize } from '../src/pixels.js';
import { findVertices, traceEdges } from '../src/geometry.js';
import { markerBranches, pairBranches } from '../src/strokes.js';

function canvas(w = 360, h = 300) {
  const image: PreparedImage = { width: w, height: h, pixels: new Uint8ClampedArray(w * h * 4).fill(255) };
  function dot(x: number, y: number, r = 1, gray = 0): void {
    for (let yy = Math.max(0, Math.floor(y - r)); yy <= Math.min(h - 1, Math.ceil(y + r)); yy++) for (let xx = Math.max(0, Math.floor(x - r)); xx <= Math.min(w - 1, Math.ceil(x + r)); xx++) {
      if (Math.hypot(xx - x, yy - y) > r) continue;
      const i = (yy * w + xx) * 4; image.pixels[i] = image.pixels[i + 1] = image.pixels[i + 2] = gray;
    }
  }
  function line(a: number[], b: number[], gray = 0): void {
    const length = Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!);
    for (let i = 0; i <= length * 2; i++) dot(a[0]! + (b[0]! - a[0]!) * i / (length * 2), a[1]! + (b[1]! - a[1]!) * i / (length * 2), 1.2, gray);
  }
  function ring(x: number, y: number, gap = 0): void {
    for (let a = gap * Math.PI * 2; a < 2 * Math.PI; a += 0.015) dot(x + 13 * Math.cos(a), y + 13 * Math.sin(a), 1.2);
  }
  function curve(points: number[][]): void { for (let i = 1; i < points.length; i++) line(points[i - 1]!, points[i]!); }
  return { image, dot, line, ring, curve };
}
const empty = { engine: 'test', readGlyph: async () => [] };
function structure(image: PreparedImage) {
  const b = preprocess(image), vertices = findVertices(b, skeletonize(b.ink, b.width));
  return { vertices, edges: traceEdges(b, vertices, []) };
}
it('crossing unmarked strokes follow tangents: four vertices, two physical edges', () => {
  const c = canvas(); for (const [x,y] of [[50,50],[310,250],[50,250],[310,50]]) c.ring(x!,y!);
  c.line([61,59],[299,241]); c.line([61,241],[299,59]);
  const s = structure(c.image); expect(s.vertices).toHaveLength(4); expect(s.edges).toHaveLength(2);
  for (const e of s.edges) expect(e.u).not.toBe(e.v);
});
it('a ring with a 30 percent opening still fits a vertex', () => {
  const c = canvas(); c.ring(100,100,.30); expect(structure(c.image).vertices).toHaveLength(1);
});
it('a teardrop returning to its vertex is a loop', () => {
  const c=canvas();c.ring(90,150); c.curve([[88,136],[60,95],[90,50],[125,95],[98,138]]);
  const s=structure(c.image);  expect(s.vertices).toHaveLength(1); expect(s.edges).toHaveLength(1);expect(s.edges[0]!.u).toBe(s.edges[0]!.v);
});
it('three separate arcs between the same vertices retain multiplicity', () => {
  const c=canvas();c.ring(60,150);c.ring(300,150);
  c.line([74,150],[286,150]); c.curve([[67,138],[130,80],[230,80],[293,138]]);c.curve([[67,162],[130,220],[230,220],[293,162]]);
  const s=structure(c.image);expect(s.vertices).toHaveLength(2);expect(s.edges).toHaveLength(3);
});
it('pale repeated grid lines do not create vertices or edges', () => {
  const c=canvas();for(let x=10;x<360;x+=20)c.line([x,0],[x,299],190);for(let y=10;y<300;y+=20)c.line([0,y],[359,y],190);
  c.ring(60,150);c.ring(300,150);c.line([74,150],[286,150]);
  const s=structure(c.image);expect(s.vertices).toHaveLength(2);expect(s.edges).toHaveLength(1);
});
it('glyph ranking rejects invalid vocabulary and missing/low probabilities', () => {
  expect(rankGlyphs([{text:'0',probability:.99},{text:'-2',probability:.99},{text:'17',probability:.8},{text:'2',probability:NaN}], 'weight')).toEqual([{text:'17',probability:.8}]);
  expect(rankGlyphs([{text:'v₁',probability:.9},{text:'Đ',probability:.8},{text:'edge',probability:.99}], 'label')).toHaveLength(2);
});
it('oracle only recognizes intersecting CV-proposed glyph crops; it never supplies geometry', async () => {
  const c=canvas(), oracle=new OracleGlyphReader([{box:[10,10,20,20],text:'A',role:'label'}]);
  expect(await oracle.readGlyph({image:c.image,box:[9,9,21,21],role:'label'})).toEqual([{text:'A',probability:1}]);
  expect(await oracle.readGlyph({image:c.image,box:[50,50,60,60],role:'label'})).toEqual([]);
  expect((await new FigureReader({glyphReader:oracle}).read([c.image],'edges')).draft.vertices).toEqual([]);
});
it('same pixels give identical drafts; cancellation propagates', async () => {
  const c=canvas();c.ring(60,150);c.ring(300,150);c.line([74,150],[286,150]);const r=new FigureReader({glyphReader:empty});
  expect((await r.read([c.image],'edges')).draft).toEqual((await r.read([c.image],'neighbors')).draft);
  const controller=new AbortController();controller.abort();await expect(r.read([c.image],'edges',controller.signal)).rejects.toThrow();
});
it('unconfident weights stay null and block a weighted task', async () => {
  const c=canvas();c.ring(60,150);c.ring(300,150);c.line([74,150],[286,150]);
  c.line([175,120],[185,120]);c.line([185,120],[178,137]);
  const glyph=new CropGlyphReader('low',async()=>[{text:'7',probability:.2}]);
  const {draft}=await new FigureReader({glyphReader:glyph,question:{rawText:'',format:'tu_luan',task:{type:'shortest_path',from:'unreadable1',to:'unreadable2'},options:[],conf:.9}}).read([c.image],'edges');
  expect(draft.edges).toHaveLength(1);expect(draft.edges[0]!.w).toBeNull();const result=normalizeDraft(draft);expect(result.spec).toBeNull();expect(result.issues).toContainEqual(expect.objectContaining({code:'missing_weight',severity:'blocking'}));
});
it('ambiguous weight evidence remains flagged through reconciliation', () => {
  const d:ReadDraft={representation:'figure',directed:false,vertices:[{label:'A',conf:.9},{label:'B',conf:.9}],edges:[1,2].map(()=>({u:'A',v:'B',w:7,wConf:.4,wAlternatives:[],name:null,conf:.4})),statedFacts:{vertexCount:null,edgeCount:null,weightUnit:null},question:null,unreadable:[]};
  const result=reconcile(d,d);expect(result.graphUncertain.map(f=>f.item)).toEqual(expect.arrayContaining(['e1','e2','e1.w','e2.w']));
});
it('a weight midway between parallel edges retains both assignments in the actual pixel pipeline', async () => {
  const c=canvas();c.ring(60,150);c.ring(300,150);
  c.curve([[72,144],[120,120],[240,120],[288,144]]);c.curve([[72,156],[120,180],[240,180],[288,156]]);
  c.line([175,140],[185,140]);c.line([185,140],[178,157]);
  const glyph={engine:'fixture',readGlyph:async(request:import('../src/types.js').GlyphRequest)=>request.role==='weight'&&request.box[0]<180&&request.box[2]>180&&request.box[1]>130&&request.box[3]<168?[{text:'7',probability:.98}]:[]};
  const {draft}=await new FigureReader({glyphReader:glyph}).read([c.image],'edges');
  expect(draft.edges).toHaveLength(2);expect(draft.edges.map(e=>e.w)).toEqual([7,7]);
  expect(reconcile(draft,draft).graphUncertain.map(f=>f.item)).toEqual(expect.arrayContaining(['e1','e2']));
});
it('the public reader preserves the crossing and parallel paths after glyph separation', async () => {
  const c=canvas();for(const [x,y] of [[50,50],[310,250],[50,250],[310,50]])c.ring(x!,y!);
  c.line([61,59],[299,241]);c.line([61,241],[299,59]);
  const {draft}=await new FigureReader({glyphReader:empty}).read([c.image],'edges');expect(draft.vertices).toHaveLength(4);expect(draft.edges).toHaveLength(2);
});

it('an isolated 40 percent open arc remains a vertex beside a disconnected graph', async () => {
  const c = canvas(); c.ring(60,70); c.ring(300,70); c.line([74,70],[286,70]); c.ring(90,250,.4);
  const result = await new FigureReader({ glyphReader: empty }).read([c.image], 'edges');
  expect(result.draft.vertices).toHaveLength(3);
});
it('an unassigned stand-alone label can represent an isolated vertex', async () => {
  const c = canvas(); c.ring(60,70); c.ring(300,70); c.line([74,70],[286,70]);
  c.line([85,235],[85,252]); c.line([85,235],[95,235]); c.line([95,235],[95,252]);
  const glyph = new OracleGlyphReader([{box:[83,233,98,255],text:'D',role:'label'}]);
  const result = await new FigureReader({ glyphReader: glyph }).read([c.image], 'edges');
  expect(result.draft.vertices.some(v => v.label === 'D')).toBe(true);
});
it('oracle tolerates partial/shifted glyph crops and returns empty away from annotations', async () => {
  const c=canvas(), oracle=new OracleGlyphReader([{box:[100,100,114,120],text:'B',role:'label'}]);
  expect(await oracle.readGlyph({image:c.image,box:[109,96,120,110],role:'label'})).toEqual([{text:'B',probability:1}]);
  expect(await oracle.readGlyph({image:c.image,box:[150,150,164,170],role:'label'})).toEqual([]);
  expect(await oracle.readGlyph({image:c.image,box:[70,50,135,120],role:'label'})).toEqual([]);
});

it('dense prose rows without graph strokes produce an empty graph and an unreadable-region issue', async () => {
  const c=canvas();
  for (let row=0;row<3;row++) for(let letter=0;letter<16;letter++) {
    const x=20+letter*18,y=40+row*45;
    c.line([x,y],[x,y+16]);c.line([x,y+16],[x+10,y+16]);c.line([x+10,y+16],[x+10,y]);
  }
  const {draft}=await new FigureReader({glyphReader:empty}).read([c.image],'edges');
  expect(draft.vertices).toEqual([]);expect(draft.edges).toEqual([]);
  expect(normalizeDraft(draft).issues.some(i=>i.code==='unreadable_region')).toBe(true);
});

it('a circled weight is removed as an annotation, preserving the graph endpoints', async () => {
  const c = canvas(); c.ring(60,150); c.ring(300,150); c.line([74,150],[286,150]);
  c.ring(180,110); c.line([176,105],[184,105]); c.line([184,105],[178,117]);
  const glyph = new OracleGlyphReader([{ box: [174,103,186,119], text:'7', role:'weight' }]);
  const { draft } = await new FigureReader({ glyphReader:glyph }).read([c.image], 'edges');
  expect(draft.vertices).toHaveLength(2); expect(draft.edges).toHaveLength(1);
  expect(draft.edges[0]!.w).toBe(7);
});
it('a circled edge name near a passing stroke is an annotation',async()=>{
  const c=canvas();c.ring(60,150);c.ring(300,150);c.line([74,150],[286,150]);c.ring(180,110);
  c.line([177,103],[177,117]);c.curve([[177,110],[184,110],[184,117],[177,117]]);
  const glyph=new OracleGlyphReader([{box:[175,101,186,119],text:'b',role:'name'}]);
  const {draft}=await new FigureReader({glyphReader:glyph}).read([c.image],'edges');
  expect(draft.vertices).toHaveLength(2);expect(draft.edges).toHaveLength(1);expect(draft.edges[0]!.name).toBe('b');
});
it('numeric text inside a marker does not erase a terminating vertex',async()=>{
  const c=canvas();c.ring(60,150);c.ring(300,150);c.line([74,150],[286,150]);
  c.line([56,145],[64,145]);c.line([64,145],[58,157]);
  const glyph=new OracleGlyphReader([{box:[54,143,66,159],text:'7',role:'weight'}]);
  const {draft}=await new FigureReader({glyphReader:glyph}).read([c.image],'edges');
  expect(draft.vertices).toHaveLength(2);expect(draft.edges).toHaveLength(1);
});

it('branch matching chooses a global angular optimum and leaves an unmatched termination', () => {
  const directions=[0,160,190,350].map(a=>[Math.cos(a*Math.PI/180),Math.sin(a*Math.PI/180)] as [number,number]);
  const paired=pairBranches(directions,Math.PI/9);
  expect([...paired]).toEqual([[0,2],[2,0],[1,3],[3,1]]);
  const tee=pairBranches([[1,0],[-1,0],[0,1]]);
  expect(tee.size).toBe(2);expect(tee.has(2)).toBe(false);
});
it('a marked crossing without a label has through branches, not a terminating vertex', async () => {
  const c=canvas();for(const [x,y] of [[50,50],[310,250],[50,250],[310,50]])c.ring(x!,y!);
  c.line([61,59],[299,241]);c.line([61,241],[299,59]);c.dot(180,150,5);
  const binary=preprocess(c.image),skeleton=skeletonize(binary.ink,binary.width);
  const profile=markerBranches(skeleton,binary.width,{center:[180,150],rx:6,ry:6,kind:'dot',score:.9});
  expect(profile.pairs).toBe(2);expect(profile.endings).toBe(0);
  const {draft}=await new FigureReader({glyphReader:empty}).read([c.image],'edges');
  expect(draft.vertices).toHaveLength(4);expect(draft.edges).toHaveLength(2);
});
it('an unlabelled dot terminating a stroke remains a vertex',async()=>{
  const c=canvas();c.dot(60,150,5);c.ring(300,150);c.line([65,150],[286,150]);
  const {draft}=await new FigureReader({glyphReader:empty}).read([c.image],'edges');
  expect(draft.vertices).toHaveLength(2);expect(draft.edges).toHaveLength(1);
});
it('a crossing near another vertex label cannot reserve that label',async()=>{
  const c=canvas();c.ring(100,100);c.ring(300,100);c.line([114,100],[286,100]);
  c.line([135,70],[135,190]);c.line([70,130],[210,130]);c.dot(135,130,5);
  c.line([122,118],[126,106]);c.line([126,106],[130,118]);c.line([123,114],[129,114]);
  const glyph=new OracleGlyphReader([{box:[120,104,133,121],text:'A',role:'label'}]);
  const {draft}=await new FigureReader({glyphReader:glyph}).read([c.image],'edges');
  const labelled=draft.vertices.filter(v=>v.label==='A');expect(labelled).toHaveLength(1);
  const box=labelled[0]!.box!;expect((box[0]+box[2])/2).toBeLessThan(320);
});
it('a teardrop whose contacts are only three pixels apart is one loop',()=>{
  const c=canvas();c.ring(100,180);c.curve([[99,166],[60,100],[90,70],[105,100],[102,166]]);
  const s=structure(c.image);expect(s.vertices).toHaveLength(1);expect(s.edges).toHaveLength(1);
  expect(s.edges[0]!.u).toBe(s.edges[0]!.v);
});
it('parallel strokes sharing a short stem next to a vertex remain separate edges',()=>{
  const c=canvas();c.ring(60,150);c.ring(300,150);c.line([74,150],[90,150]);c.line([270,150],[286,150]);
  c.line([90,150],[270,150]);c.curve([[90,150],[130,90],[230,90],[270,150]]);c.curve([[90,150],[130,210],[230,210],[270,150]]);
  const s=structure(c.image);expect(s.vertices).toHaveLength(2);expect(s.edges).toHaveLength(3);
});
