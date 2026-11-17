import { describe, expect, it } from 'vitest';
import { grade } from '@mathtwin/core';
import type { Claim, ClaimBody, ProblemSpec } from '@mathtwin/core';
import { claimKey, parseWork, vocabularyOf } from '@mathtwin/work';
import { devFamilies } from '../src/work-wording-dev.js';
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
describe('independent Cartesian dev wording', () => {
 it.each(devFamilies.filter(f=>f.id.startsWith('dev-paraphrase')))('$id preserves explicit claims', family => {
  for (const claim of claims) {
   const text = wording(claim,spec,family);
   const parsed = parseWork([{text,index:0,page:0,conf:1,alternatives:[]}], {...vocabularyOf(spec), statementIds: ['a'], questionFormat: claim.type === 'choice' ? 'trac_nghiem' : claim.type === 'statement' ? 'dung_sai' : 'tu_luan'});
   expect(parsed.steps.map(s=>claimKey(s.claim)),text).toEqual([claimKey(claim)]);
   expect(parsed.unchecked,text).toEqual([]);
  }
 });
 it('renders only endpoint labels', () => {
  for(const family of devFamilies) expect(wording({type:'walk',kind:'path',vertices:['A','B'],edgeIds:['secret-edge-id']},spec,family)).not.toContain('secret-edge-id');
 });
 it('drops unwritten walk IDs from truth and regrades the visible claim', () => {
  const parallel: ProblemSpec = { ...spec, task: {type:'path',from:'A',to:'B'}, graph: { ...spec.graph, edges: [
   {id:'e1',u:'A',v:'B'}, {id:'e2',u:'A',v:'B'},
  ] } };
  const source: Claim[] = [{type:'walk',kind:'path',vertices:['A','B'],edgeIds:['e1','e2'],step:1,raw:'original',conf:1}];
  for(const family of devFamilies) {
   const rendered = renderClaims(source,parallel,family);
   expect(rendered.claims[0]).not.toHaveProperty('edgeIds');
   expect(rendered.claims[0]!.raw).toBe(rendered.lines[0]!.text);
   expect(grade(parallel,source).verdict).toBe('CAN_XAC_NHAN');
   expect(grade(parallel,rendered.claims).verdict).toBe('DUNG');
  }
  expect(source[0]).toHaveProperty('edgeIds',['e1','e2']);
 });
 it.each(devFamilies.filter(f=>f.id.startsWith('dev-paraphrase')))('$id renders one explicit numeric final answer', family => {
  const degreeSpec: ProblemSpec = {...spec,task:{type:'degree',vertices:['A']}};
  const text = wording({type:'final_answer',value:17},degreeSpec,family);
  const parsed = parseWork([{text,index:0,page:0,conf:1,alternatives:[]}],vocabularyOf(degreeSpec));
  expect(parsed.steps.map(s=>claimKey(s.claim)),text).toEqual([claimKey({type:'final_answer',value:17})]);
 });
});
