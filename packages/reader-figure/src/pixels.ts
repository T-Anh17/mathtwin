import type { PreparedImage } from '@mathtwin/reader';
import type { BinaryImage, Box, Component, Point } from './types.js';
export function validateImage(image: PreparedImage): void {
  if (!(image.pixels instanceof Uint8ClampedArray) || !Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height)
    || image.width < 1 || image.height < 1 || image.pixels.length !== image.width * image.height * 4) throw new Error('Invalid RGBA image.');
}
export function checkedBox(box: Box, width: number, height: number): Box {
  if (box.length !== 4 || !box.every(Number.isFinite) || box[2] <= box[0] || box[3] <= box[1]
    || box[0] < 0 || box[1] < 0 || box[2] > width || box[3] > height) throw new Error('Invalid figure box.');
  return [Math.floor(box[0]), Math.floor(box[1]), Math.ceil(box[2]), Math.ceil(box[3])];
}
export function crop(image: PreparedImage, box: Box): PreparedImage {
  const [x,y,r,b] = checkedBox(box,image.width,image.height), width=r-x,height=b-y,pixels=new Uint8ClampedArray(width*height*4);
  for(let row=0;row<height;row++) pixels.set(image.pixels.subarray(((y+row)*image.width+x)*4,((y+row)*image.width+r)*4),row*width*4);
  return {width,height,pixels};
}
function integral(values: Float32Array,w:number,h:number,squared=false):Float64Array {
  const out=new Float64Array((w+1)*(h+1));
  for(let y=0;y<h;y++){let sum=0;for(let x=0;x<w;x++){const v=values[y*w+x]!;sum+=squared?v*v:v;out[(y+1)*(w+1)+x+1]=out[y*(w+1)+x+1]!+sum;}}
  return out;
}
function meanAt(table:Float64Array,w:number,h:number,x:number,y:number,radius:number):number {
  const l=Math.max(0,x-radius),t=Math.max(0,y-radius),r=Math.min(w,x+radius+1),b=Math.min(h,y+radius+1),s=w+1;
  return (table[b*s+r]!-table[t*s+r]!-table[b*s+l]!+table[t*s+l]!)/((r-l)*(b-t));
}
/** Broad background division, then Sauvola (window 31, k=.22). */
export function preprocess(image:PreparedImage):BinaryImage {
  validateImage(image);const {width:w,height:h}=image,gray=new Float32Array(w*h);
  for(let i=0;i<gray.length;i++){const p=i*4,a=image.pixels[p+3]!/255;gray[i]=255+((image.pixels[p]!*.2126+image.pixels[p+1]!*.7152+image.pixels[p+2]!*.0722)-255)*a;}
  const bg=integral(gray,w,h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)gray[y*w+x]=Math.min(255,gray[y*w+x]!*255/Math.max(32,meanAt(bg,w,h,x,y,45)));
  const mean=integral(gray,w,h),sq=integral(gray,w,h,true),ink=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const m=meanAt(mean,w,h,x,y,15),sd=Math.sqrt(Math.max(0,meanAt(sq,w,h,x,y,15)-m*m));ink[y*w+x]=Number(gray[y*w+x]!<m*(1+.22*(sd/128-1)));}
  removeRuling(ink,gray,w,h);return {width:w,height:h,gray,ink};
}
/** Repeated long projection peaks at a common skew; preserve darker ink at intersections. */
function removeRuling(ink:Uint8Array,gray:Float32Array,w:number,h:number):void {
  const hist=new Uint32Array(256);let count=0;
  for(let i=0;i<ink.length;i++)if(ink[i]){hist[Math.round(gray[i]!)]!++;count++;}
  let inkLevel=0,sum=0;while(inkLevel<255&&sum<count*.15)sum+=hist[inkLevel++]!;
  for(const vertical of [false,true])for(let deg=-8;deg<=8;deg+=2){
    const slope=Math.tan(deg*Math.PI/180),length=vertical?h:w,breadth=vertical?w:h,pad=Math.ceil(length*Math.abs(slope)),proj=new Uint32Array(breadth+2*pad);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(ink[y*w+x]){const p=(vertical?x:y)-Math.round(slope*(vertical?y:x))+pad;if(p>=0&&p<proj.length)proj[p]!++;}
    const peaks:number[]=[];
    for(let p=1;p<proj.length-1;p++)if(proj[p]!>length*.48&&proj[p]!>=proj[p-1]!&&proj[p]!>=proj[p+1]!&&(!peaks.length||p-peaks.at(-1)!>4))peaks.push(p);
    if(peaks.length<4||peaks.filter(p=>peaks.some(q=>q-p>=8&&peaks.some(r=>Math.abs(r-2*q+p)<=2))).length<2)continue;
    for(const p of peaks)for(let i=0;i<length;i++)for(let d=-2;d<=2;d++){
      const j=p-pad+Math.round(slope*i)+d;if(j<0||j>=breadth)continue;const index=vertical?i*w+j:j*w+i;if(gray[index]!>inkLevel+35)ink[index]=0;
    }
  }
}
export function neighbors(i:number,ink:Uint8Array,w:number):number[]{
  const out:number[]=[];for(const d of [-w-1,-w,-w+1,-1,1,w-1,w,w+1]){const n=i+d;if(n>=0&&n<ink.length&&Math.abs(n%w-i%w)<=1&&ink[n])out.push(n);}return out;
}
export function components(ink:Uint8Array,w:number):Component[]{
  const seen=new Uint8Array(ink.length),out:Component[]=[];
  for(let i=0;i<ink.length;i++){if(!ink[i]||seen[i])continue;const pixels=[i];seen[i]=1;let l=i%w,r=l,t=Math.floor(i/w),b=t;
    for(let j=0;j<pixels.length;j++){const p=pixels[j]!;l=Math.min(l,p%w);r=Math.max(r,p%w);t=Math.min(t,Math.floor(p/w));b=Math.max(b,Math.floor(p/w));for(const n of neighbors(p,ink,w))if(!seen[n]){seen[n]=1;pixels.push(n);}}
    if(pixels.length>=3)out.push({pixels,box:[l,t,r+1,b+1]});
  }return out;
}
/** Zhang-Suen; simultaneous subiterations and deterministic scan order. */
export function skeletonize(input:Uint8Array,w:number):Uint8Array {
  const ink=input.slice(),h=ink.length/w;let changed=true;
  while(changed){changed=false;for(const second of [false,true]){const remove:number[]=[];
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;if(!ink[i])continue;const p=[-w,-w+1,1,w+1,w,w-1,-1,-w-1].map(d=>ink[i+d]!);
      const count=p.reduce((a,b)=>a+b,0),trans=p.filter((v,j)=>!v&&p[(j+1)%8]).length;if(count<2||count>6||trans!==1)continue;
      if(second ? p[0]! * p[2]! * p[6]! === 0 && p[0]! * p[4]! * p[6]! === 0 : p[0]! * p[2]! * p[4]! === 0 && p[2]! * p[4]! * p[6]! === 0)remove.push(i);
    }for(const i of remove)ink[i]=0;changed ||=remove.length>0;
  }}return ink;
}
export function pointDistance(a:Point,b:Point):number{return Math.hypot(a[0]-b[0],a[1]-b[1]);}
export function lineDistance(p:Point,points:Point[]):number{
  let best=Infinity;for(let i=1;i<points.length;i++){const a=points[i-1]!,b=points[i]!,dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));best=Math.min(best,Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dy*t));}return best;
}
