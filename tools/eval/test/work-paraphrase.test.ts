import { describe, expect, it } from 'vitest';
import { grade } from '@mathtwin/core';
import type { Claim, ClaimBody, ProblemSpec } from '@mathtwin/core';
import { claimKey, parseWork, vocabularyOf } from '@mathtwin/work';
import { cartesianDevFamilies, devFamilies, rotatingDevGroups, sampleWordingFamily } from '../src/work-wording-dev.js';
import { renderClaims, wording } from '../src/work-wording.js';
const spec: ProblemSpec = { graph: { directed: false, vertices: ['A','B','C'].map(id => ({id,label:id})), edges: [] }, task: { type: 'path', from: 'A', to: 'C' }, questionFormat: 'tu_luan' };
const claims: ClaimBody[] = [
 {type:'vertex_count',value:3}, {type:'edge_count',value:17}, {type:'loop_count',value:1},
 {type:'odd_count',value:2}, {type:'component_count',value:2}, {type:'degree_sum',value:6},
 {type:'degree',v:'A',value:2}, {type:'vertex_list',vertices:['A','B']},
 {type:'odd_vertices',vertices:['A','C']}, {type:'odd_vertices',vertices:[]},
 {type:'edge_list',edges:[{u:'A',v:'B'},{u:'B',v:'C'}]},
 {type:'walk',kind:'path',vertices:['A','B','C']}, {type:'connected',value:false},
 {type:'choice',option:'A'}, {type:'statement',id:'a',value:true},
 {type:'euler_exists',kind:'circuit',value:true}, {type:'theorem',name:'dirac',holds:false},
];
const memoryFamilies = [...devFamilies, ...cartesianDevFamilies];
describe('independent Cartesian dev wording', () => {
 it('rotates four disk families deterministically and covers every slot value across 60 source IDs', () => {
  expect(cartesianDevFamilies).toHaveLength(15 + 36 + 6 + 168);
  for (const group of rotatingDevGroups) {
   const family = devFamilies.find(f => f.id === `dev-paraphrase-${group}`)!;
   const choices = cartesianDevFamilies.filter(f => f.id.startsWith(`${family.id}-`));
   const selected = Array.from({length:60}, (_, i) => {
    const id = `${String(i + 1).padStart(2,'0')}-source-${family.id}`;
    const sample = sampleWordingFamily(family,id);
    expect(sample).toEqual(sampleWordingFamily(family,id));
    expect(sample.id).toBe(family.id);
    return choices.find(f => f.count === sample.count && f.select === sample.select && f.label === sample.label && f.answer === sample.answer)!.id.split('-').at(-1)!;
   });
   const codes = choices.map(f => f.id.split('-').at(-1)!);
   for (let slot = 0; slot < codes[0]!.length; slot++)
    expect(new Set(selected.map(code => code[slot]))).toEqual(new Set(codes.map(code => code[slot])));
  }
 });
 it.each(cartesianDevFamilies.filter(f => !f.id.startsWith('dev-paraphrase-label-')))('$id renders algorithm slots in memory', family => {
  const shortest: ProblemSpec = {...spec,task:{type:'shortest_path',from:'A',to:'C'}};
  for (const v of ['A','B','C']) for (const body of [
   {type:'dijkstra_select',v}, {type:'dijkstra_label',v,value:2,via:'C'},
  ] as ClaimBody[]) {
   const source: Claim[] = [{...body,step:1,raw:'source',conf:1}];
   const rendered = renderClaims(source,shortest,family);
   const parsed = parseWork(rendered.lines,vocabularyOf(shortest));
   expect(parsed.steps.map(s => claimKey(s.claim))).toEqual(rendered.claims.map(claimKey));
   expect(parsed.unchecked).toEqual([]);
  }
 });
 it('covers every label preposition × noun × connector × via combination with matching truth', () => {
  const families = cartesianDevFamilies.filter(f => f.id.startsWith('dev-paraphrase-label-'));
  expect(families).toHaveLength(7 * 3 * 4 * 2);
  expect(new Set(families.map(f => f.label('B','2','C'))).size).toBe(families.length);
  const shortest: ProblemSpec = {...spec,task:{type:'shortest_path',from:'A',to:'C'}};
  for (const family of families) for (const via of [undefined, 'C']) {
   const source: Claim[] = [{type:'dijkstra_label',v:'B',value:2,...(via ? {via} : {}),step:1,raw:'original',conf:1}];
   const rendered = renderClaims(source,shortest,family);
   const expected: ClaimBody = {type:'dijkstra_label',v:'B',value:2,...(!family.omitLabelVia && via ? {via} : {})};
   expect(claimKey(rendered.claims[0]!)).toBe(claimKey(expected));
   expect(rendered.lineOf).toEqual({'1':[0]});
   const parsed = parseWork(rendered.lines,vocabularyOf(shortest));
   expect(parsed.steps.map(s=>claimKey(s.claim)),rendered.lines[0]!.text).toEqual([claimKey(expected)]);
   expect(parsed.unchecked).toEqual([]);
   expect(source[0]).toMatchObject(via ? {via} : {value:2});
  }
 });
 it.each(memoryFamilies.filter(f=>f.id.startsWith('dev-paraphrase')))('$id preserves explicit claims', family => {
  for (const claim of claims) {
   const text = wording(claim,spec,family);
   const parsed = parseWork([{text,index:0,page:0,conf:1,alternatives:[]}], {...vocabularyOf(spec), statementIds: ['a'], questionFormat: claim.type === 'choice' ? 'trac_nghiem' : claim.type === 'statement' ? 'dung_sai' : 'tu_luan'});
   expect(parsed.steps.map(s=>claimKey(s.claim)),text).toEqual([claimKey(claim)]);
   expect(parsed.unchecked,text).toEqual([]);
  }
 });
 it('renders only endpoint labels', () => {
  for(const family of memoryFamilies) expect(wording({type:'walk',kind:'path',vertices:['A','B'],edgeIds:['secret-edge-id']},spec,family)).not.toContain('secret-edge-id');
 });
 it('drops unwritten walk IDs from truth and regrades the visible claim', () => {
  const parallel: ProblemSpec = { ...spec, task: {type:'path',from:'A',to:'B'}, graph: { ...spec.graph, edges: [
   {id:'e1',u:'A',v:'B'}, {id:'e2',u:'A',v:'B'},
  ] } };
  const source: Claim[] = [{type:'walk',kind:'path',vertices:['A','B'],edgeIds:['e1','e2'],step:1,raw:'original',conf:1}];
  for(const family of memoryFamilies) {
   const rendered = renderClaims(source,parallel,family);
   expect(rendered.claims[0]).not.toHaveProperty('edgeIds');
   expect(rendered.claims[0]!.raw).toBe(rendered.lines[0]!.text);
   expect(grade(parallel,source).verdict).toBe('CAN_XAC_NHAN');
   expect(grade(parallel,rendered.claims).verdict).toBe('DUNG');
  }
  expect(source[0]).toHaveProperty('edgeIds',['e1','e2']);
 });
 it.each(memoryFamilies.filter(f=>f.id.startsWith('dev-paraphrase')))('$id renders one explicit numeric final answer', family => {
  const degreeSpec: ProblemSpec = {...spec,task:{type:'degree',vertices:['A']}};
  const text = wording({type:'final_answer',value:17},degreeSpec,family);
  const parsed = parseWork([{text,index:0,page:0,conf:1,alternatives:[]}],vocabularyOf(degreeSpec));
  expect(parsed.steps.map(s=>claimKey(s.claim)),text).toEqual([claimKey({type:'final_answer',value:17})]);
 });
});
