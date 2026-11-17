import { expect, it } from 'vitest';
import { classifyFigureErrors, summarizeFigureErrors } from '../src/figure-errors.js';
import type { FigureAnnotation } from '../src/figure-geometry.js';
import type { FigureObservation } from '@mathtwin/reader-figure';
it('error audit assigns each false vertex once, counts missed styles and edge multiplicity',()=>{
  const f:FigureAnnotation={version:1,width:200,height:200,box:[0,0,200,200],vertices:[
    {id:'a',label:'A',center:[20,20],contours:[[[15,20],[25,20]]],labelBox:[18,18,22,22],style:'open',gap:.3},
    {id:'b',label:'B',center:[180,20],contours:[],labelBox:[176,16,184,24],style:'label-only',gap:0}],
    edges:[{id:'e1',u:'a',v:'b',polyline:[[25,20],[176,20]],w:8,name:null,weightBox:[90,30,100,45]},
      {id:'e2',u:'a',v:'b',polyline:[[25,25],[176,25]],w:null,name:null}],
    crossings:[{point:[100,100],edges:['e1','e2'],notVertex:true,dot:true}]};
  const o:FigureObservation={box:f.box,vertices:[{center:[20,20],rx:5,ry:5,kind:'ring',score:1},
    {center:[100,100],rx:5,ry:5,kind:'dot',score:1},{center:[95,38],rx:5,ry:5,kind:'ring',score:1}],labels:['A','noise','noise2'],paths:[],edges:[]};
  const errors=classifyFigureErrors(f,o),sum=summarizeFigureErrors([errors]);
  expect(errors.falseVertices).toHaveLength(2);expect(sum.sources).toMatchObject({crossing:1,glyph:1,other:0});
  expect(sum.missedByStyle['label-only']).toBe(1);expect(sum.edges).toMatchObject({missing:2,missingParallel:2,extra:0});
});
