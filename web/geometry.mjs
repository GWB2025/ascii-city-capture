/* Plain vector geometry, shared by the worker and automated tests. */
const EPS = 1e-8;
export const escapeXml = s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const num = n => Number(n.toFixed(4));
const cross = (a,b) => a[0]*b[1]-a[1]*b[0];
const sub = (a,b) => [a[0]-b[0],a[1]-b[1]];
const mix = (a,b,t) => [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
const equal = (a,b) => Math.abs(a[0]-b[0])<EPS && Math.abs(a[1]-b[1])<EPS;
const overlaps = (a,b) => a[0]<=b[2]+EPS && a[2]>=b[0]-EPS && a[1]<=b[3]+EPS && a[3]>=b[1]-EPS;
const contains = (a,b) => a[0]<=b[0]+EPS && a[1]<=b[1]+EPS && a[2]>=b[2]-EPS && a[3]>=b[3]-EPS;
const bounds = points => points.reduce((b,p)=>[Math.min(b[0],p[0]),Math.min(b[1],p[1]),Math.max(b[2],p[0]),Math.max(b[3],p[1])],[Infinity,Infinity,-Infinity,-Infinity]);

export function paint(value, alpha=1) {
  let rgb, opacity=alpha;
  const hex=String(value).match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if(hex) {
    let h=hex[1]; if(h.length===3)h=[...h].map(x=>x+x).join('');
    rgb=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16));
    if(h.length===8)opacity*=parseInt(h.slice(6),16)/255;
  } else {
    const m=String(value).match(/^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/);
    if(!m)throw Error('Unsupported scene colour: '+value);
    rgb=m.slice(1,4).map(Number); opacity*=m[4]===undefined?1:Number(m[4]);
  }
  if(!rgb.every(n=>Number.isFinite(n)&&n>=0&&n<=255)||!Number.isFinite(opacity)||opacity<0||opacity>1)throw Error('Invalid paint');
  return {colour:'#'+rgb.map(n=>Math.round(n).toString(16).padStart(2,'0')).join(''),alpha:opacity};
}

export function pageLayout(width,height,options={}) {
  const sizes={A4:[210,297],A5:[148,210],A6:[105,148],Postcard:[100,150]};
  let [pw,ph]=options.paper==='Custom'?[Number(options.width),Number(options.height)]:(sizes[options.paper]||sizes.A4);
  if(options.orientation==='landscape')[pw,ph]=[ph,pw];
  const margin=Number(options.margin??10), percentage=Number(options.scale??100);
  if(![width,height,pw,ph,margin,percentage].every(Number.isFinite)||width<=0||height<=0||pw<20||ph<20||pw>1000||ph>1000||margin<0||2*margin>=Math.min(pw,ph)||percentage<10||percentage>100)throw Error('Check the paper size, margins and drawing scale.');
  const scale=Math.min((pw-2*margin)/width,(ph-2*margin)/height)*percentage/100;
  return {width:pw,height:ph,scale,x:(pw-width*scale)/2,y:(ph-height*scale)/2,drawingWidth:width*scale,drawingHeight:height*scale};
}

function curveFlat(points,tolerance,output,depth=0) {
  const a=points[0],b=points.at(-1),v=sub(b,a),length=Math.hypot(...v);
  const deviation=Math.max(...points.slice(1,-1).map(p=>length?Math.abs(cross(sub(p,a),v))/length:Math.hypot(...sub(p,a))));
  if(deviation<=tolerance||depth>=12){output.push(b);return;}
  const left=[a],right=[b];let row=points;
  while(row.length>1){row=row.slice(1).map((p,i)=>mix(row[i],p,.5));left.push(row[0]);right.unshift(row.at(-1));}
  curveFlat(left,tolerance,output,depth+1);curveFlat(right,tolerance,output,depth+1);
}

export function flatten(commands,tolerance=.045) {
  const contours=[];let points=[],at=[0,0];
  for(const c of commands){
    if(c.type==='M'){if(points.length)contours.push(points);points=[[c.x,c.y]];at=points[0];}
    else if(c.type==='L'){at=[c.x,c.y];points.push(at);}
    else if(c.type==='Q'){curveFlat([at,[c.x1,c.y1],[c.x,c.y]],tolerance,points);at=points.at(-1);}
    else if(c.type==='C'){curveFlat([at,[c.x1,c.y1],[c.x2,c.y2],[c.x,c.y]],tolerance,points);at=points.at(-1);}
    else if(c.type==='Z'){if(points.length&&!equal(points[0],points.at(-1)))points.push(points[0]);if(points.length)contours.push(points);points=[];}
    else throw Error('Unsupported glyph curve');
  }
  if(points.length)contours.push(points);
  return contours;
}

export function prepareFrame(frame,font) {
  const info=frame?.info, records=frame?.records;
  if(!info||!Array.isArray(records)||records.length>250000)throw Error('Invalid capture');
  const width=info.width||Math.ceil(info.cols*info.cellWidth),height=info.height||info.rows*info.lineHeight;
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1||width>5000||height>5000)throw Error('Invalid capture dimensions');
  const templates=new Map(),items=[];
  for(const [i,r] of records.entries()){
    if(r.composite!=='source-over'||r.transform?.join(',')!=='1,0,0,1,0,0')throw Error('This view uses an unsupported blend or transform.');
    if(r.op==='clearRect'){
      if(i===0&&r.args.join(',')===[0,0,width,height].join(','))continue;
      throw Error('Unexpected partial scene clear');
    }
    const style=paint(r.fill,r.alpha);
    if(r.op==='fillRect'){
      let [x,y,w,h]=r.args;
      if(![x,y,w,h].every(Number.isFinite))throw Error('Invalid rectangle');
      if(w<0){x+=w;w=-w;}if(h<0){y+=h;h=-h;}
      if(w&&h)items.push({kind:'rect',x,y,w,h,bbox:[x,y,x+w,y+h],...style});
    } else if(r.op==='fillText'){
      const [text,x,y,maxWidth]=r.args;
      if(typeof text!=='string'||text.length>80||![x,y].every(Number.isFinite)||maxWidth!==undefined)throw Error('Unsupported character positioning');
      if(r.baseline&&r.baseline!=='alphabetic'||r.align&&!['left','start'].includes(r.align))throw Error('Unsupported character alignment');
      const size=Number(r.font?.match(/([\d.]+)px/)?.[1]);
      if(!Number.isFinite(size)||size<=0||size>100)throw Error('Unsupported character size');
      const key=JSON.stringify([text,size]);
      if(!templates.has(key)){
        for(const ch of text)if(ch.trim()&&!font.charToGlyphIndex(ch))throw Error('The capture font lacks character '+ch);
        const path=font.getPath(text,0,0,size,{kerning:true});
        const contours=flatten(path.commands);
        templates.set(key,{key,id:'g'+templates.size,text,size,d:path.toPathData(4),contours,bbox:bounds(contours.flat())});
      }
      const glyph=templates.get(key);
      if(glyph.contours.length)items.push({kind:'glyph',glyph,x,y,bbox:[glyph.bbox[0]+x,glyph.bbox[1]+y,glyph.bbox[2]+x,glyph.bbox[3]+y],...style});
    } else throw Error('This view uses an unsupported drawing operation: '+r.op);
  }
  return {width,height,items,templates:[...templates.values()],info,capturedAt:frame.capturedAt};
}

export function pointInside(point,shape) {
  if(shape.kind==='rect')return point[0]>=shape.bbox[0]-EPS&&point[0]<=shape.bbox[2]+EPS&&point[1]>=shape.bbox[1]-EPS&&point[1]<=shape.bbox[3]+EPS;
  let inside=false;
  for(const ring of shape.contours)for(let i=1;i<ring.length;i++){
    const a=ring[i-1],b=ring[i],v=sub(b,a),p=sub(point,a);
    if(Math.abs(cross(v,p))<EPS&&point[0]>=Math.min(a[0],b[0])-EPS&&point[0]<=Math.max(a[0],b[0])+EPS&&point[1]>=Math.min(a[1],b[1])-EPS&&point[1]<=Math.max(a[1],b[1])+EPS)return true;
    if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}

function rectInterval(a,b,rect) {
  const v=sub(b,a);let lo=0,hi=1;
  for(let axis=0;axis<2;axis++){
    if(Math.abs(v[axis])<EPS){if(a[axis]<rect[axis]-EPS||a[axis]>rect[axis+2]+EPS)return null;}
    else {let l=(rect[axis]-a[axis])/v[axis],h=(rect[axis+2]-a[axis])/v[axis];if(l>h)[l,h]=[h,l];lo=Math.max(lo,l);hi=Math.min(hi,h);if(hi<lo+EPS)return null;}
  }
  return [lo,hi];
}

function hiddenIntervals(a,b,shape) {
  const box=rectInterval(a,b,shape.bbox);
  if(!box)return [];
  if(shape.kind==='rect')return [box];
  const v=sub(b,a),length2=v[0]*v[0]+v[1]*v[1],ts=[box[0],box[1]];
  for(const ring of shape.contours)for(let i=1;i<ring.length;i++){
    const c=ring[i-1],d=ring[i],edge=sub(d,c),offset=sub(c,a),denom=cross(v,edge);
    if(Math.abs(denom)>EPS){const t=cross(offset,edge)/denom,u=cross(offset,v)/denom;if(t>box[0]&&t<box[1]&&u>=-EPS&&u<=1+EPS)ts.push(t);}
    else if(Math.abs(cross(offset,v))<EPS&&length2>EPS){for(const p of [c,d]){const t=((p[0]-a[0])*v[0]+(p[1]-a[1])*v[1])/length2;if(t>box[0]&&t<box[1])ts.push(t);}}
  }
  ts.sort((a,b)=>a-b);const result=[];
  for(let i=1;i<ts.length;i++)if(ts[i]-ts[i-1]>EPS&&pointInside(mix(a,b,(ts[i]+ts[i-1])/2),shape))result.push([ts[i-1],ts[i]]);
  return result;
}

export function visibleSegments(a,b,occluders,viewport) {
  if(equal(a,b))return [];
  const allowed=rectInterval(a,b,viewport);if(!allowed)return [];
  const removed=occluders.flatMap(shape=>hiddenIntervals(a,b,shape)).sort((a,b)=>a[0]-b[0]);
  let at=allowed[0];const result=[];
  for(const [lo,hi] of removed){if(hi<=at)continue;if(lo>allowed[1])break;if(lo>at+EPS)result.push([mix(a,b,at),mix(a,b,Math.min(lo,allowed[1]))]);at=Math.max(at,hi);if(at>=allowed[1]-EPS)return result;}
  if(at<allowed[1]-EPS)result.push([mix(a,b,at),mix(a,b,allowed[1])]);
  return result;
}

class SpatialIndex {
  constructor(viewport){this.cells=new Map();this.viewport=viewport;}
  keys(bbox){
    const b=[Math.max(0,bbox[0]),Math.max(0,bbox[1]),Math.min(this.viewport[2],bbox[2]),Math.min(this.viewport[3],bbox[3])],keys=[];
    for(let x=Math.floor(b[0]/16);x<=Math.floor(b[2]/16);x++)for(let y=Math.floor(b[1]/16);y<=Math.floor(b[3]/16);y++)keys.push(x+','+y);
    return keys;
  }
  add(shape){for(const key of this.keys(shape.bbox)){if(!this.cells.has(key))this.cells.set(key,[]);this.cells.get(key).push(shape);}}
  query(bbox){return [...new Set(this.keys(bbox).flatMap(key=>this.cells.get(key)||[]))].filter(s=>overlaps(s.bbox,bbox));}
}

export function plotGeometry(scene,progress=()=>{}) {
  const viewport=[0,0,scene.width,scene.height],index=new SpatialIndex(viewport),paths=[],duplicates=new Set();
  let visibleGlyphs=0;
  for(let i=scene.items.length-1;i>=0;i--){
    const item=scene.items[i];
    if(i%2500===0)progress(1-i/scene.items.length);
    if(item.alpha<.01||!overlaps(item.bbox,viewport))continue;
    if(item.kind==='rect'){
      if(item.alpha>=.9999)index.add(item);
      continue;
    }
    const signature=item.glyph.key+':'+item.x+':'+item.y;
    if(duplicates.has(signature))continue;
    duplicates.add(signature);
    const occluders=index.query(item.bbox);
    if(occluders.some(s=>s.kind==='rect'&&contains(s.bbox,item.bbox)))continue;
    const contours=item.glyph.contours.map(r=>r.map(([x,y])=>[x+item.x,y+item.y]));
    let emitted=false;
    for(const contour of contours){
      let run=[];
      const flush=()=>{if(run.length>1){paths.push({points:run,colour:item.colour});emitted=true;}run=[];};
      for(let j=1;j<contour.length;j++){
        if(equal(contour[j-1],contour[j]))continue;
        const pieces=visibleSegments(contour[j-1],contour[j],occluders,viewport);
        if(!pieces.length){flush();continue;}
        for(const [a,b] of pieces){if(run.length&&!equal(run.at(-1),a))flush();if(!run.length)run.push(a);run.push(b);}
      }
      flush();
    }
    if(emitted)visibleGlyphs++;
    if(item.alpha>=.9999)index.add({kind:'glyph',bbox:item.bbox,contours});
  }
  return {paths,visibleGlyphs};
}

function navigationComment(scene){
  const navigation=scene.info.navigation||{};
  const fields=[['City release',scene.info.release?scene.info.release.name+' / '+scene.info.release.version:null],
    ['Captured at (UTC)',scene.capturedAt],['Area',scene.info.area],
    ['District',navigation.district],['City Pos',navigation.cityPos],
    ['Elevation',navigation.elevation],['Sector',navigation.sector],
    ['Street',navigation.street],['Cross',navigation.cross],
    ['Landmark',navigation.landmark],['Phone',navigation.phone],['Bearing',navigation.bearing]];
  // XML comments cannot contain double hyphens or invalid XML code points.
  const safe=value=>String(value??'Not available')
    .replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu,'\uFFFD')
    .replace(/\s+/g,' ').replace(/--+/g,run=>[...run].join(' ')).trim()||'Not available';
  return '\n<!--\nASCII City capture navigation\n'+fields.map(([label,value])=>label+': '+safe(value)).join('\n')+'\n-->\n';
}

function svgStart(scene,layout,description){
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${num(layout.width)}mm" height="${num(layout.height)}mm" viewBox="0 0 ${num(layout.width)} ${num(layout.height)}">${navigationComment(scene)}<title>ASCII City captured scene</title><desc>${escapeXml(description)}</desc><metadata>${escapeXml(JSON.stringify({cityRelease:scene.info.release,capturedAt:scene.capturedAt,area:scene.info.area,camera:scene.info.camera,navigation:scene.info.navigation,originalCharacters:scene.templates.map(t=>t.text),font:scene.info.font}))}</metadata>`;
}

export function printSvg(scene,options={}) {
  const layout=pageLayout(scene.width,scene.height,options),mono=options.colour==='mono',background=options.background!==false&&!mono;
  let svg=svgStart(scene,layout,'Original character outlines, colours and draw order. Fonts are converted to paths.');
  svg+='<defs><clipPath id="scene"><rect width="'+scene.width+'" height="'+scene.height+'"/></clipPath>';
  for(const glyph of scene.templates)svg+=`<path id="${glyph.id}" d="${glyph.d}"/>`;
  svg+='</defs><g transform="translate('+num(layout.x)+' '+num(layout.y)+') scale('+layout.scale+')" clip-path="url(#scene)">';
  svg+=`<rect width="${scene.width}" height="${scene.height}" fill="${background?'#050907':'#ffffff'}"/>`;
  for(const item of scene.items){
    if(!item.alpha)continue;
    if(item.kind==='rect')svg+=`<rect x="${num(item.x)}" y="${num(item.y)}" width="${num(item.w)}" height="${num(item.h)}" fill="${background?item.colour:'#ffffff'}" fill-opacity="${item.alpha}"/>`;
    else svg+=`<use href="#${item.glyph.id}" x="${num(item.x)}" y="${num(item.y)}" fill="${mono?'#000000':item.colour}" fill-opacity="${item.alpha}" data-character="${escapeXml(item.glyph.text)}"/>`;
  }
  return {svg:svg+'</g></svg>',layout};
}

const palette=['#111111','#b52222','#1a4ba0','#166d48','#75449b','#935c21'];
function penColour(colour){const rgb=[1,3,5].map(i=>parseInt(colour.slice(i,i+2),16));return palette.reduce((best,p)=>{const dist=[1,3,5].reduce((sum,i,j)=>sum+(parseInt(p.slice(i,i+2),16)-rgb[j])**2,0);return dist<best.dist?{colour:p,dist}:best;},{dist:Infinity}).colour;}

export function plotSvg(scene,geometry,options={}) {
  const layout=pageLayout(scene.width,scene.height,options),stroke=Number(options.penWidth??.2);
  if(!Number.isFinite(stroke)||stroke<.05||stroke>2)throw Error('Choose a pen width between 0.05 and 2 mm.');
  const start=svgStart(scene,layout,'Visible character contours, clipped to remove opaque overdraw. Translucent effects become solid pen outlines. No background strokes, text, clones or clipping masks.')+`<g fill="none" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">`;
  const end='</g></svg>',parts=[],all=[];
  let batch=[],batchPoints=0,batchBytes=0;
  let estimatedPoints=0,travelMm=0;
  for(const path of geometry.paths){
    const points=path.points.map(([x,y])=>[x*layout.scale+layout.x,y*layout.scale+layout.y]);
    let length=0;for(let i=1;i<points.length;i++)length+=Math.hypot(...sub(points[i],points[i-1]));
    if(length<.015)continue;
    const count=Math.max(1,Math.ceil(length*Math.SQRT2/.2))+1;
    estimatedPoints+=count;travelMm+=length;
    const element=`<path stroke="${options.colour==='colour'?penColour(path.colour):'#000000'}" d="${points.map((p,i)=>(i?'L':'M')+num(p[0])+','+num(p[1])).join('')}"/>`;
    if(batch.length&&(batchPoints+count>210000||batchBytes+element.length>6*1024*1024)){
      parts.push({svg:start+batch.join('')+end,estimatedPoints:batchPoints});batch=[];batchPoints=0;batchBytes=0;
    }
    batch.push(element);all.push(element);batchPoints+=count;batchBytes+=element.length;
  }
  if(batch.length)parts.push({svg:start+batch.join('')+end,estimatedPoints:batchPoints});
  return {svg:start+all.join('')+end,parts,layout,estimatedPoints,travelMm,paths:geometry.paths.length,visibleGlyphs:geometry.visibleGlyphs};
}
