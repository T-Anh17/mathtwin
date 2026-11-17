import { expect,it } from 'vitest';
import { readOptions } from '../src/cli.js';
it('figure CLI requires glyph and dataset; fixes one deterministic pass with graph mode',()=>{
  for(const glyph of ['oracle','c','b'])expect(readOptions(['--engine','offline:figure-cv','--glyph',glyph,'--set','synthetic-fig','--split','test'])).toMatchObject({passes:1,mode:'graph',glyph,split:'test'});
  for(const args of [[],['--glyph','c'],['--set','synthetic-fig'],['--glyph','bad','--set','synthetic-fig'],['--glyph','oracle','--set','synthetic-fig','--passes','2'],['--glyph','c','--set','synthetic-fig','--mode','both']])expect(()=>readOptions(['--engine','offline:figure-cv',...args])).toThrow();
  expect(()=>readOptions(['--engine','fake','--glyph','oracle'])).toThrow();
  expect(()=>readOptions(['--from-device','file.json','--glyph','oracle'])).toThrow();
});
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { evaluateFigure } from '../src/figure-eval.js';
import { loadCases } from '../src/dataset.js';
import { packDataset } from '../src/pack.js';
import { repositoryRoot } from '../src/cli.js';
it('Node figure evaluation measures model output without forwarding truth geometry and always closes C',async()=>{
  const root=await mkdtemp(join(tmpdir(),'mathtwin-figure-eval-'));
  try {
    const sample=(await loadCases(join(repositoryRoot,'testdata/images-synthetic-fig'))).find(c => c.meta.split === 'dev' && c.meta.hasFigure !== false)!;
    const folder=join(root,'testdata/images-synthetic-fig',sample.id);await mkdir(folder,{recursive:true});
    for(const name of ['meta.json','figure.json','truth.json','lines.json',...sample.files])await writeFile(join(folder,name),await readFile(join(sample.directory,name)));
    const negative=(await loadCases(join(repositoryRoot,'testdata/images-synthetic-fig'))).find(c=>c.meta.hasFigure===false)!;
    const negativeFolder=join(root,'testdata/images-synthetic-fig',negative.id);await mkdir(negativeFolder,{recursive:true});
    for(const name of ['meta.json','figure.json','truth.json','lines.json',...negative.files])await writeFile(join(negativeFolder,name),await readFile(join(negative.directory,name)));
    let closed=false,count=0;
    const {report}=await evaluateFigure(root,'2026-11-17',{glyph:'c',split:'dev'}, {createGlyph:async()=>({reader:{engine:'c',readGlyph:async request=>{
      expect(Object.keys(request).sort()).toEqual(['box','image','role']);expect(request.image.pixels).toBeInstanceOf(Uint8ClampedArray);count++;return [];
    }},close:async()=>{closed=true;}})});
    expect(report.rows).toHaveLength(1);expect(report.negatives).toEqual([expect.objectContaining({id:negative.id,vertices:0,edges:0})]);
    const packed=await packDataset('synthetic-fig',root,'dev');
    expect(JSON.parse(await readFile(join(packed,'ids.json'),'utf8'))).toEqual([expect.objectContaining({id:sample.id})]);
    expect(closed).toBe(true);expect(count).toBeGreaterThan(0);expect(report.fixtureOnly).toBe(false);expect(report.summary.evaluatedImages).toBe(1);expect(report.summary.graphCorrect).toBe(0);expect(report.configuration).toMatchObject({oracleGeometry:false,externalFigureBox:false,glyph:'c'});
  } finally {
    if(!resolve(root).startsWith(resolve(tmpdir(),'mathtwin-figure-eval-')))throw new Error('Unsafe cleanup.');
    await rm(root,{recursive:true,force:true});
  }
}, 20000);

it('geometry oracle is limited to dev diagnostics with oracle glyphs', () => {
  const base=['--engine','offline:figure-cv','--set','synthetic-fig','--glyph','oracle','--geometry','oracle'];
  expect(readOptions([...base,'--split','dev']).geometry).toBe('oracle');
  expect(()=>readOptions([...base,'--split','test'])).toThrow();
  expect(()=>readOptions(base)).toThrow();
  expect(()=>readOptions([...base,'--split','dev','--glyph','c'])).toThrow();
});
