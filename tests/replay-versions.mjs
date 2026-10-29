/* Integration test: real pinned city + capture bridge in an isolated DOM. */
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {createCanvas,GlobalFonts} from '@napi-rs/canvas';
import assert from 'node:assert/strict';
const root=process.env.CAPTURE_TEST_ROOT||'/tmp/ascii-city-capture-test45';
const basePath='/city/test-release/';
const sourceRoot=process.env.CITY_TEST_ROOT||'/tmp/ascii-city-45';
const manifest=JSON.parse(fs.readFileSync(sourceRoot+'/release-manifest.json','utf8'));
const html=fs.readFileSync(sourceRoot+'/index.html','utf8');
const dom=new JSDOM(html,{url:'http://127.0.0.1:8774'+basePath+'?capture-session=replay-session',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window, queue=[],messages=[],canvases=new Map();
GlobalFonts.registerFromPath('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf','CityCapture');
w.TextDecoder=TextDecoder;w.TextEncoder=TextEncoder;w.WebAssembly=WebAssembly;
w.fetch=async(url,opts)=>{
  if(opts?.method==='HEAD')return new Response(null,{headers:{Date:new Date().toUTCString()}});
  const file=sourceRoot+'/'+new URL(url,w.location.href).pathname.replace(basePath,'');
  return fs.existsSync(file)?new Response(fs.readFileSync(file),{headers:{'Content-Type':file.endsWith('.wasm')?'application/wasm':'application/json'}}):new Response('',{status:404});
};
w.visualViewport={width:1200,height:800,offsetTop:0,offsetLeft:0,scale:1,addEventListener(){},removeEventListener(){}};
w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
w.ResizeObserver=class{observe(){}disconnect(){}};
w.document.fonts={ready:Promise.resolve(),check:()=>true};
w.requestAnimationFrame=f=>(queue.push(f),queue.length);w.cancelAnimationFrame=()=>{};
w.postMessage=data=>messages.push(data);
w.focus=()=>{};
w.HTMLElement.prototype.getBoundingClientRect=()=>({x:0,y:0,left:0,top:0,right:1200,bottom:800,width:1200,height:800});
Object.defineProperty(w.HTMLElement.prototype,'clientHeight',{get(){return 800;}});
Object.defineProperty(w.HTMLElement.prototype,'clientWidth',{get(){return this.id==='interface-scroll'?420:1200;}});
w.HTMLCanvasElement.prototype.getContext=function(kind){
  if(kind!=='2d')return null;
  if(canvases.has(this))return canvases.get(this).context;
  const native=createCanvas(this.width||300,this.height||150),ctx=native.getContext('2d'),el=this;
  const context=new Proxy(ctx,{get(target,key){if(key==='canvas')return el;const value=target[key];return typeof value==='function'?(...args)=>{if(key==='drawImage'&&canvases.has(args[0]))args[0]=canvases.get(args[0]).native;return value.apply(target,args);}:value;},set(target,key,value){target[key]=value;return true;}});
  canvases.set(this,{native,context});return context;
};
w.HTMLCanvasElement.prototype.toDataURL=function(){return canvases.get(this).native.toDataURL('image/png');};
for(const key of ['width','height']){
  const descriptor=Object.getOwnPropertyDescriptor(w.HTMLCanvasElement.prototype,key);
  Object.defineProperty(w.HTMLCanvasElement.prototype,key,{...descriptor,set(value){descriptor.set.call(this,value);if(canvases.has(this))canvases.get(this).native[key]=Math.max(1,Number(value));}});
}
w.eval(fs.readFileSync(root+'/bridge.js','utf8'));
const profile=JSON.parse(fs.readFileSync(root+'/profile.json','utf8'));
const injection=profile.adapter;
w.navigationRows={};
let src=fs.readFileSync(sourceRoot+'/'+manifest.assets.javascript.file,'utf8');
if(process.env.RENAMED){
  const names=[...new Set(src.match(/_0x[0-9a-f]+/g))];
  const mapping=Object.fromEntries(names.map((name,index)=>[name,'_0x'+(index+0xabcdef00).toString(16)]));
  src=src.replace(/_0x[0-9a-f]+/g,name=>mapping[name]);
}
const district=src.match(/([\w$]+)\('DISTRICT',/)[1];
const rowPattern=new RegExp(district+'=\\(([_\\w$]+),([_\\w$]+),([_\\w$]+)=([_\\w$]+)\\)=>\\{');
const row=src.match(rowPattern);assert.ok(row,'navigation observer');
src=src.replace(row[0],row[0]+`window.navigationRows[${row[1]}]=String(${row[2]});`);
src=src.replace(profile.hook,injection+profile.hook);
w.loadCity=()=>w.eval(src);
if(manifest.assets.bootstrap){
  let boot=fs.readFileSync(sourceRoot+'/'+manifest.assets.bootstrap.file,'utf8');
  const importHook='import(new URL("'+manifest.assets.javascript.file.split('/').at(-1)+'",import.meta.url).href)';
  assert.equal(boot.split(importHook).length,2);
  boot=boot.replace(importHook,'window.loadCity()').replaceAll('import.meta.url',JSON.stringify(w.location.origin+basePath+manifest.assets.bootstrap.file));
  await w.eval(boot);
}else await w.loadCity();
console.log('City initialised',profile.frame);
let tick=0;
async function step(){assert.ok(queue.length);await queue.shift()(w.performance.now()+2000*(++tick));if(tick%10===0)console.log('frame',tick);}
function command(type,session='replay-session'){w.dispatchEvent(new w.MessageEvent('message',{source:w,origin:w.location.origin,data:{cityCapture:true,type,session}}));}
for(let i=0;i<120&&!messages.some(m=>m.type==='status'&&m.info.live);i++)await step();
assert.ok(messages.some(m=>m.type==='status'&&m.info.live),'city must reach LIVE');
command('capture','obsolete-session');await step();assert.equal(messages.filter(m=>m.type==='frame').length,0);
command('capture');await step();
const first=messages.find(m=>m.type==='frame');assert.ok(first,JSON.stringify(messages.filter(m=>m.type==='error')));
assert.equal(first.session,'replay-session');
function checkNavigation(frame){
  for(const [key,label] of Object.entries({district:'DISTRICT',cityPos:'CITY POS',elevation:'ELEVATION',sector:'SECTOR',street:'STREET',cross:'CROSS',landmark:'LANDMARK',phone:'PHONE',bearing:'BEARING'})){
    assert.ok(w.navigationRows[label],label);assert.equal(frame.info.navigation[key],w.navigationRows[label],label);
  }
}
checkNavigation(first.frame);
assert.ok(first.frame.records.filter(r=>r.op==='fillText').length>1000);
assert.ok(first.frame.records.filter(r=>r.op==='fillText').every(r=>r.font.includes('CityCapture')));
assert.ok(new Set(first.frame.records.map(r=>r.fill)).size>10);
await step();assert.equal(queue.length,0);
command('resume');assert.equal(queue.length,1);
w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowLeft',code:'ArrowLeft',bubbles:true}));
for(let i=0;i<3;i++)await step();
w.document.dispatchEvent(new w.KeyboardEvent('keyup',{key:'ArrowLeft',code:'ArrowLeft',bubbles:true}));
w.document.getElementById('cv').dispatchEvent(new w.MouseEvent('mousedown',{bubbles:true}));
const mouse=new w.MouseEvent('mousemove',{bubbles:true});Object.defineProperty(mouse,'movementX',{value:120});Object.defineProperty(mouse,'movementY',{value:0});
w.document.dispatchEvent(mouse);w.dispatchEvent(new w.MouseEvent('mouseup'));
for(let i=0;i<3;i++)await step();
command('capture');await step();
const second=messages.filter(m=>m.type==='frame').at(-1);
checkNavigation(second.frame);
assert.notEqual(first.frame.info.camera.yaw,second.frame.info.camera.yaw);
assert.notEqual(first.frame.info.navigation.bearing,second.frame.info.navigation.bearing);
assert.equal(messages.filter(m=>m.type==='error').length,0);
fs.writeFileSync(root+'/frame.json',JSON.stringify(second.frame));
console.log(JSON.stringify({passed:true,release:second.frame.info.release,frameName:profile.frame,glyphs:second.frame.records.filter(r=>r.op==='fillText').length,colours:new Set(second.frame.records.map(r=>r.fill)).size,navigationMatchesUI:true,pauseResume:true,staleCommandsIgnored:true}));
w.close();
