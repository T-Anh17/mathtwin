import { describe, expect, it } from 'vitest';
import { grade, solveDijkstra } from '@mathtwin/core';
import { parseWork, vocabularyOf } from '@mathtwin/work';
import type { ProblemSpec } from '@mathtwin/core';
import { devTableFamilies } from '../src/work-table-dev.js';
import { renderTable } from '../src/work-table-render.js';
import { randomTableSpec, tableScenarios } from '../src/work-tables.js';
import { realWork, readWorkOptions } from '../src/work-eval.js';
describe('Dijkstra table corpus development checks', { timeout: 60000 }, () => {
  it('roundtrips every dev notation on seeded 4–8 vertex graphs with ties and deliberate errors', () => {
    const modes=new Set<string>(); const codes=new Set<string|null|undefined>();
    for(let n=4;n<=8;n++) {
      const spec=randomTableSpec(330100+n,n);
      expect(solveDijkstra(spec.graph,spec.task as Extract<ProblemSpec['task'],{type:'shortest_path'}>).trace.some((s)=>s.tied.length>1)).toBe(true);
      for(const scenario of tableScenarios(spec)) for(const family of devTableFamilies) {
        modes.add(scenario.mode);
        const {lines,work}=renderTable(spec,scenario.rows,family);codes.add(work.expected.errorCode);
        const errorCodes: Record<string, string> = { arithmetic: 'SAI_PHEP_TINH', stale: 'BO_SOT', selection: 'SAI_LUA_CHON', prim: 'NHAM_THUAT_TOAN' };
        const expectedCode = errorCodes[scenario.mode];
        expect(work.expected).toMatchObject(expectedCode ? {verdict:'SAI',errorCode:expectedCode} : {verdict:'DUNG',errorCode:null});
        expect(grade(spec,work.claims)).toMatchObject({verdict:work.expected.verdict});
        const parsed=parseWork(lines,vocabularyOf(spec));
        const id=new Map(spec.graph.vertices.map((v)=>[v.label,v.id]));
        const bodies=parsed.steps.map(({claim})=> {
          const {step,raw,conf,box,...body}=claim;
          if(body.type==='dijkstra_select') return {...body,v:id.get(body.v)};
          if(body.type==='dijkstra_label') return {...body,v:id.get(body.v),...(body.via?{via:id.get(body.via)}:{})};
          return body;
        });
        expect(bodies).toEqual(work.claims.map(({step,raw,conf,box,...body})=>body));
        expect(parsed.unchecked).toEqual([]);
        const selected=new Set<string>();
        for(const [i,row] of scenario.rows.entries()) {
          const cells=lines[i+1]!.text.split('|').map((s)=>s.trim()).slice(-n);
          cells.forEach((cell,c)=>{if(cell==='-') expect(selected.has(spec.graph.vertices[c]!.id)).toBe(true);});
          selected.add(row.selected);
        }
      }
    }
    expect(modes).toEqual(new Set(['correct','alternate-tie','arithmetic','stale','selection','prim']));
    expect(codes.has('SAI_PHEP_TINH')).toBe(true); expect(codes.has('BO_SOT')).toBe(true);
    expect(codes.has('SAI_LUA_CHON')).toBe(true);expect(codes.has('NHAM_THUAT_TOAN')).toBe(true);
  });
  it('maps algorithm labels to ids only at the grading boundary', () => {
    const spec=randomTableSpec(33,4);
    for(const family of devTableFamilies) {
      const written=renderTable(spec,tableScenarios(spec)[0]!.rows,family);
      expect(realWork(spec,written.lines).grade.result.verdict).toBe('DUNG');
    }
    expect(readWorkOptions(['--set','work-text-tables','--lines','truth','--split','dev','--variant','a'])).toMatchObject({set:'work-text-tables'});
  });
});
