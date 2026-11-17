import type { BinaryImage, Component, FigurePath, FigureVertex, Point } from './types.js';
import { pointDistance, skeletonize } from './pixels.js';
import { pairBranches, strokeNeighbors } from './strokes.js';

interface Port { edge: number; side: 0 | 1 }
interface Node { pixels: number[]; center: Point; ports: Port[] }
interface Segment { ends: [number, number]; points: Point[]; gap: number }
const portKey = (p: Port): string => `${p.edge}:${p.side}`;
const otherSide = (side: 0 | 1): 0 | 1 => side === 0 ? 1 : 0;

/** Contract the raster into independent stroke segments. Junction pairing is
 * computed once for all paths, never greedily according to the entering path.
 */
export function traceStrokeEdges(binary: BinaryImage, vertices: FigureVertex[], glyphs: Component[]): FigurePath[] {
  const width=binary.width, cleaned=binary.ink.slice();
  for(const g of glyphs)for(const i of g.pixels)cleaned[i]=0;
  const skeleton=skeletonize(cleaned,width);
  const inside=(p:Point,v:FigureVertex,margin:number):boolean=>((p[0]-v.center[0])/(v.rx+margin))**2+((p[1]-v.center[1])/(v.ry+margin))**2<=1;
  const point=(i:number):Point=>[i%width,Math.floor(i/width)];
  for(let i=0;i<skeleton.length;i++)if(skeleton[i]&&vertices.some(v=>inside(point(i),v,3)))skeleton[i]=0;
  const adjacency=(i:number):number[]=>strokeNeighbors(i,skeleton,width);
  const degree=new Uint8Array(skeleton.length), junction=new Uint8Array(skeleton.length);
  for(let i=0;i<skeleton.length;i++)if(skeleton[i]) {
    degree[i]=adjacency(i).length;
    // A degree-two hairpin can touch a vertex without a raster junction (two
    // parallel strokes merge just outside the erased contour). Such contacts
    // must be graph nodes too, otherwise the two edges become a false loop.
    if(vertices.some(v=>inside(point(i),v,5)))junction[i]=1;
  }
  for(let i=0;i<skeleton.length;i++)if(degree[i]!>=3) {
    junction[i]=1;
    // Contract the small multi-pixel junction left by thinning, not long arms.
    for(const n of adjacency(i)){junction[n]=1;for(const q of adjacency(n))junction[q]=1;}
  }
  const owner=new Int32Array(skeleton.length).fill(-1), nodes:Node[]=[], segments:Segment[]=[];
  for(let i=0;i<skeleton.length;i++)if(junction[i]&&owner[i]===-1) {
    const id=nodes.length,pixels=[i];owner[i]=id;
    for(let j=0;j<pixels.length;j++)for(const n of adjacency(pixels[j]!))if(junction[n]&&owner[n]===-1){owner[n]=id;pixels.push(n);}
    nodes.push({pixels,center:[pixels.reduce((s,p)=>s+p%width,0)/pixels.length,pixels.reduce((s,p)=>s+Math.floor(p/width),0)/pixels.length],ports:[]});
  }
  for(let i=0;i<skeleton.length;i++)if(skeleton[i]&&degree[i]!<=1&&owner[i]===-1){owner[i]=nodes.length;nodes.push({pixels:[i],center:point(i),ports:[]});}
  const addSegment=(a:number,b:number,points:Point[],gap=0):void=>{
    const edge=segments.length;segments.push({ends:[a,b],points,gap});nodes[a]!.ports.push({edge,side:0});nodes[b]!.ports.push({edge,side:1});
  };
  const visited=new Set<string>(), pixelKey=(a:number,b:number):string=>a<b?`${a}:${b}`:`${b}:${a}`;
  for(let a=0;a<nodes.length;a++)for(const first of nodes[a]!.pixels)for(const second of adjacency(first)) {
    if(owner[second]===a||visited.has(pixelKey(first,second)))continue;
    const chain=[first,second];visited.add(pixelKey(first,second));let previous=first,current=second;
    while(owner[current]===-1) {
      const next=adjacency(current).find(n=>n!==previous);
      if(next===undefined||visited.has(pixelKey(current,next)))break;
      visited.add(pixelKey(current,next));chain.push(next);previous=current;current=next;
    }
    const b=owner[current]!;if(b>=0)addSegment(a,b,chain.map(point));
  }
  const direction=(port:Port):Point=>{
    const points=segments[port.edge]!.points, start=port.side===0?points[0]!:points.at(-1)!;
    const q=port.side===0?points[Math.min(8,points.length-1)]!:points[Math.max(0,points.length-9)]!;
    return [q[0]-start[0],q[1]-start[1]];
  };
  const boundaryDistance=(p:Point,v:FigureVertex):number=>{
    const dx=p[0]-v.center[0],dy=p[1]-v.center[1],norm=Math.hypot(dx/(v.rx+3),dy/(v.ry+3));
    return norm<=1?0:Math.hypot(dx,dy)*(1-1/norm);
  };
  const attach=(p:Point,limit:number)=>vertices.map((v,i)=>({i,d:boundaryDistance(p,v)})).filter(v=>v.d<=limit).sort((a,b)=>a.d-b.d||a.i-b.i);
  const attachments=nodes.map(n=>vertices.map((v,i)=>({i,d:Math.min(...n.pixels.map(p=>boundaryDistance(point(p),v)))}))
    .filter(v=>v.d<=(n.ports.length===1?20:2.5)).sort((a,b)=>a.d-b.d||a.i-b.i));
  const absorbed=new Set<number>();
  // A shared short stem near a vertex is part of its boundary. Expose every
  // branch at that junction, including the two sides of a teardrop loop.
  for(let pass=0;pass<2;pass++)for(let e=0;e<segments.length;e++) {
    const s=segments[e]!;
    for(const side of [0,1] as const) {
      const a=s.ends[side],b=s.ends[otherSide(side)];
      if(!attachments[a]!.length||attachments[b]!.length||nodes[b]!.ports.length<3||s.points.length>20)continue;
      const linked=attach(nodes[b]!.center,20).filter(v=>v.i===attachments[a]![0]!.i);
      if(linked.length){attachments[b]=linked;absorbed.add(e);}
    }
  }
  const ends=nodes.map((n,i)=>({n,i})).filter(({n,i})=>n.ports.length===1&&!attachments[i]!.length);
  const cosine=(a:Point,b:Point):number=>(a[0]*b[0]+a[1]*b[1])/(Math.hypot(...a)*Math.hypot(...b)||1);
  const gaps=ends.flatMap(({n:a,i},ai)=>ends.slice(ai+1).flatMap(({n:b,i:j})=>{
    const delta:Point=[b.center[0]-a.center[0],b.center[1]-a.center[1]],d=Math.hypot(...delta);
    if(d>24||d<1||cosine(direction(a.ports[0]!),delta)>-.8||cosine(direction(b.ports[0]!),delta)<.8)return [];
    const middle:Point=[(a.center[0]+b.center[0])/2,(a.center[1]+b.center[1])/2];
    if(d>5&&!glyphs.some(g=>middle[0]>=g.box[0]-3&&middle[0]<=g.box[2]+3&&middle[1]>=g.box[1]-3&&middle[1]<=g.box[3]+3&&d<=g.box[3]-g.box[1]+8))return [];
    return [{i,j,d}];
  })).sort((a,b)=>a.d-b.d||a.i-b.i||a.j-b.j);
  const linkedEnds=new Set<number>();
  for(const gap of gaps)if(!linkedEnds.has(gap.i)&&!linkedEnds.has(gap.j)) {
    addSegment(gap.i,gap.j,[nodes[gap.i]!.center,nodes[gap.j]!.center],gap.d);linkedEnds.add(gap.i);linkedEnds.add(gap.j);
  }
  const routing=new Map<string,Port>();
  for(let i=0;i<nodes.length;i++)if(!attachments[i]!.length) {
    const ports=nodes[i]!.ports.filter(p=>!absorbed.has(p.edge));
    const paired=ports.length===2?new Map([[0,1],[1,0]]):pairBranches(ports.map(direction),Math.PI/3);
    for(const [a,b]of paired)routing.set(portKey(ports[a]!),ports[b]!);
  }
  const result:FigurePath[]=[],usedPaths=new Set<string>();
  for(let i=0;i<nodes.length;i++)if(attachments[i]!.length)for(const start of nodes[i]!.ports) {
    if(absorbed.has(start.edge))continue;
    let port=start,target=-1,gap=0;const walked=new Set<number>(),points:Point[]=[];
    while(!walked.has(port.edge)) {
      walked.add(port.edge);const s=segments[port.edge]!;gap+=s.gap;
      points.push(...(port.side===0?s.points:[...s.points].reverse()));
      const side=otherSide(port.side),node=s.ends[side];
      if(attachments[node]!.length){target=node;break;}
      const next=routing.get(portKey({edge:port.edge,side}));if(!next)break;port=next;
    }
    const key=[...walked].sort((a,b)=>a-b).join(',');
    if(target<0||points.length<8||usedPaths.has(key))continue;
    usedPaths.add(key);const initial=attachments[i]!,destination=attachments[target]!,u=initial[0]!,v=destination[0]!;
    if(u.i===v.i) {
      const marker=vertices[u.i]!,radius=Math.max(marker.rx,marker.ry);
      const length=points.slice(1).reduce((sum,p,j)=>sum+pointDistance(points[j]!,p),0);
      // A short remnant just outside the marker is not a teardrop loop. Test
      // excursion as well as arc length; two contacts need not be separated.
      if(length<Math.max(24,Math.PI*radius*1.2)||!points.some(p=>pointDistance(p,marker.center)>radius+12))continue;
    }
    result.push({points,u:u.i,v:v.i,score:Math.max(0,1-gap/Math.max(1,points.length)),uScore:1/(1+u.d/20),vScore:1/(1+v.d/20),
      uAlternatives:initial.filter(c=>c.i!==u.i&&(c.d===0||u.d/c.d>=.8)).map(c=>c.i),vAlternatives:destination.filter(c=>c.i!==v.i&&(c.d===0||v.d/c.d>=.8)).map(c=>c.i)});
  }
  return result;
}
