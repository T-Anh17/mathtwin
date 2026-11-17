import { expect, it } from 'vitest';
import { DevFigureReader, matchCenters, measureStages, summarizeStages } from '../src/figure-diagnostics.js';
import type { FigureAnnotation } from '../src/figure-geometry.js';
import type { FigureObservation } from '@mathtwin/reader-figure';
import { evaluateFigure } from '../src/figure-eval.js';

const figure: FigureAnnotation = { version:1,width:200,height:200,box:[10,10,170,100],
  vertices:[{id:'a',label:'A',center:[30,30],contours:[[[20,30],[40,30]]],labelBox:[25,25,35,35],style:'open',gap:.3},
    {id:'b',label:'B',center:[150,30],contours:[[[146,30],[154,30]]],labelBox:[145,25,155,35],style:'dot',gap:0}],
  edges:[{id:'e1',u:'a',v:'b',polyline:[[40,30],[146,30]],w:7,name:'a'},
    {id:'e2',u:'a',v:'b',polyline:[[40,50],[146,50]],w:9,name:null},
    {id:'e3',u:'a',v:'a',polyline:[[20,30],[10,70],[40,30]],w:null,name:null}],
  crossings:[{point:[100,30],edges:['e1','e2'],notVertex:true,dot:false}] };
const path=(points:[number,number][],u:number,v:number)=>({points,u,v,score:1,uScore:1,vScore:1,uAlternatives:[],vAlternatives:[]});
it('stage metrics count unmatched predictions, center tolerance, label errors, loops and multiplicity',()=>{
  const observation:FigureObservation={box:figure.box,vertices:[
    {center:[31,30],rx:10,ry:10,kind:'ring',score:.8},{center:[151,30],rx:4,ry:4,kind:'dot',score:.9},
    {center:[190,150],rx:4,ry:4,kind:'dot',score:.9}],labels:['A','X','noise'],
    paths:[path([[40,30],[146,30]],0,1),path([[40,50],[146,50]],0,1),path([[20,30],[10,70],[40,30]],0,0)],
    edges:[{u:'A',v:'X',w:7,name:'a',conf:.9,wAlternatives:[]},{u:'A',v:'X',w:1,name:null,conf:.9,wAlternatives:[]},{u:'A',v:'A',w:null,name:null,conf:.9,wAlternatives:[]}]};
  const result=summarizeStages([measureStages(figure,observation)]);
  expect(result.vertices).toMatchObject({correct:2,predicted:3,truth:2,f1:.8});
  expect(result.styles.dot).toMatchObject({correct:1,predicted:2,truth:1});
  expect(result.labels).toMatchObject({correct:1,total:2,accuracy:.5});
  expect(result.edges.f1).toBe(1);expect(result.loops.f1).toBe(1);
  expect(result.parallelGroups).toMatchObject({correct:1,total:1});
  expect(result.weights).toMatchObject({correct:2,total:3});expect(result.names.accuracy).toBe(1);
  expect(result.crossingNoDot.f1).toBe(1);expect(result.crossingDot.f1).toBeNull();
  expect(result.meanFigureIoU).toBe(1);
  const far=[{center:[171,30] as [number,number],rx:4,ry:4,kind:'dot' as const,score:.9}];
  expect(matchCenters(far,figure.vertices).size).toBe(0);
});
it('geometry oracle API rejects test split and model glyphs before opening files/models',async()=>{
  await expect(evaluateFigure('missing','date',{glyph:'oracle',split:'test',geometry:'oracle'})).rejects.toThrow('dev-only');
  await expect(evaluateFigure('missing','date',{glyph:'c',split:'dev',geometry:'oracle'})).rejects.toThrow('dev-only');
});
it('geometry oracle supplies only scaled centers/radii, independent of truth labels and styles',()=>{
  class Probe extends DevFigureReader {
    detect() { return this.detectVertices({width:100,height:100,ink:new Uint8Array(10000),gray:new Float32Array(10000)},new Uint8Array(10000)); }
  }
  const reader=new Probe({glyphReader:{engine:'oracle',readGlyph:async()=>[]}});
  reader.annotation=figure;
  const vertices=reader.detect();
  expect(vertices.map(v=>v.center)).toEqual([[15,15],[75,15]]);
  expect(vertices.map(v=>v.kind)).toEqual(['ring','ring']);
  reader.annotation={...figure,vertices:figure.vertices.map(v=>({...v,label:'secret',style:'label-only'}))};
  expect(reader.detect()).toEqual(vertices);
});
