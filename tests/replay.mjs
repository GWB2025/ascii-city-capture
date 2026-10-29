/* Integration test: real pinned city + capture bridge in an isolated DOM. */
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {createCanvas,GlobalFonts} from '@napi-rs/canvas';
import assert from 'node:assert/strict';
const root=process.env.CAPTURE_TEST_ROOT||'/tmp/ascii-city-capture-test45';
const sourceRoot=process.env.CITY_TEST_ROOT||'/tmp/ascii-city-45';
const manifest=JSON.parse(fs.readFileSync(sourceRoot+'/release-manifest.json','utf8'));
const html=fs.readFileSync(sourceRoot+'/index.html','utf8');
const dom=new JSDOM(html,{url:'http://127.0.0.1:8774/city/',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window, queue=[],messages=[],canvases=new Map();
GlobalFonts.registerFromPath('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf','CityCapture');
w.TextDecoder=TextDecoder;w.TextEncoder=TextEncoder;w.WebAssembly=WebAssembly;
w.fetch=async(url,opts)=>{
  if(opts?.method==='HEAD')return new Response(null,{headers:{Date:new Date().toUTCString()}});
  const file=sourceRoot+'/'+new URL(url,w.location.href).pathname.replace(/^\/city\//,'');
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
const injection=fs.readFileSync(root+'/city-adapter.js','utf8');
// Observe full navigation rows before the UI truncates them to its panel width.
const rowHook="_0x53041b=(_0x24eb76,_0x198b8b,_0x25b0f9=_0x228a61)=>{";
w.navigationRows={};
let src=fs.readFileSync(sourceRoot+'/'+manifest.assets.javascript.file,'utf8');
assert.equal(src.split(rowHook).length,2,'navigation observer must match this pinned build');
src=src.replace(rowHook,rowHook+'window.navigationRows[_0x24eb76]=String(_0x198b8b);');
src=src.replace('requestAnimationFrame(async function _0x49bd23',injection+'window.captureTestClock=_0x1139f7;window.captureTestCamera=_0x301107;requestAnimationFrame(async function _0x49bd23');
w.loadCity=()=>w.eval(src);
let boot=fs.readFileSync(sourceRoot+'/'+manifest.assets.bootstrap.file,'utf8');
const importHook='import(new URL("main-876c7780ec66cb15.js",import.meta.url).href)';
assert.equal(boot.split(importHook).length,2);
boot=boot.replace(importHook,'window.loadCity()').replaceAll('import.meta.url',JSON.stringify(w.location.origin+'/city/'+manifest.assets.bootstrap.file));
process.stdout.write('Starting real Prototype 4.5 bootstrap\n');
await w.eval(boot);
process.stdout.write('City initialised; running startup frames\n');
assert.ok(w.captureTestClock,'real bootstrap must load the city');
w.captureTestClock.set({timestamp:Date.parse('2026-10-28T12:00:00Z'),mode:'manual'});
let tick=0;
async function step(){assert.ok(queue.length,'animation must remain scheduled');await queue.shift()(w.performance.now()+2000*(++tick));if(tick%10===0)process.stdout.write('frame '+tick+' boot '+w.document.body.dataset.bootState+'\n');}
function command(type){w.dispatchEvent(new w.MessageEvent('message',{source:w,origin:w.location.origin,data:{cityCapture:true,type}}));}
function key(type,key,code){w.document.dispatchEvent(new w.KeyboardEvent(type,{key,code,bubbles:true}));}
for(let i=0;i<110&&!messages.some(m=>m.type==='status'&&m.info.live);i++)await step();
assert.ok(messages.some(m=>m.type==='status'&&m.info.live),'city must reach LIVE');
assert.equal(w.document.body.dataset.bootState,'ready','capture must wait until the bootstrap completes');
command('capture');await step();
const first=messages.find(m=>m.type==='frame');assert.ok(first,'capture must return a frame');
function checkNavigation(frame){
  for(const [key,label] of Object.entries({district:'DISTRICT',cityPos:'CITY POS',elevation:'ELEVATION',sector:'SECTOR',street:'STREET',cross:'CROSS',landmark:'LANDMARK',phone:'PHONE',bearing:'BEARING'})){
    assert.ok(w.navigationRows[label],'city UI must supply '+label);
    assert.equal(frame.info.navigation[key],w.navigationRows[label],label+' must match the captured-frame UI');
  }
}
checkNavigation(first.frame);
assert.ok(first.frame.records.filter(r=>r.op==='fillText').length>1000);
assert.ok(first.frame.records.every(r=>['clearRect','fillText','fillRect'].includes(r.op)));
assert.ok(first.frame.records.filter(r=>r.op==='fillText').every(r=>r.font.includes('CityCapture')),'capture and export use the same explicit font');
await step();assert.equal(queue.length,0,'paused city must not keep scheduling frames');
command('resume');assert.equal(queue.length,1,'resume must restore one animation loop');
w.captureTestClock.set({timestamp:Date.parse('2026-10-28T00:00:00Z'),mode:'manual'});
key('keydown','ArrowLeft','ArrowLeft');for(let i=0;i<3;i++)await step();key('keyup','ArrowLeft','ArrowLeft');
w.document.getElementById('cv').dispatchEvent(new w.MouseEvent('mousedown',{bubbles:true}));
const mouse=new w.MouseEvent('mousemove',{bubbles:true});Object.defineProperty(mouse,'movementX',{value:120});Object.defineProperty(mouse,'movementY',{value:0});
w.document.dispatchEvent(mouse);w.dispatchEvent(new w.MouseEvent('mouseup'));
for(let i=0;i<3;i++)await step();
command('capture');await step();
const captures=messages.filter(m=>m.type==='frame');assert.equal(captures.length,2);
checkNavigation(captures[1].frame);
assert.notEqual(first.frame.info.navigation.bearing,captures[1].frame.info.navigation.bearing,'new captures must update the bearing');
assert.notEqual(captures[0].frame.info.camera.yaw,captures[1].frame.info.camera.yaw,'mouse look must work after resuming');
assert.equal(messages.filter(m=>m.type==='error').length,0,JSON.stringify(messages.filter(m=>m.type==='error')));
fs.writeFileSync(root+'/live-frame.json',JSON.stringify(captures[1].frame));
fs.writeFileSync(root+'/live-frame.png',Buffer.from(captures[1].preview.split(',')[1],'base64'));
fs.writeFileSync(root+'/day-frame.json',JSON.stringify(first.frame));
fs.writeFileSync(root+'/day-frame.png',Buffer.from(first.preview.split(',')[1],'base64'));
// Exercise 4.5's new RGB sky from an open position, at noon and midnight.
const skyCaptures=[];
for(const [name,hour] of [['sky-day',12],['sky-night',0]]){
  await step();assert.equal(queue.length,0);
  command('resume');
  Object.assign(w.captureTestCamera,{x:280,z:280,yaw:0,pitch:0.65});
  w.captureTestClock.set({timestamp:Date.parse('2026-10-28T'+String(hour).padStart(2,'0')+':00:00Z'),mode:'manual'});
  for(let i=0;i<2;i++)await step();
  command('capture');await step();
  const capture=messages.filter(m=>m.type==='frame').at(-1);
  checkNavigation(capture.frame);
  assert.ok(capture.frame.records.every(r=>['clearRect','fillText','fillRect'].includes(r.op)));
  fs.writeFileSync(root+'/'+name+'-frame.json',JSON.stringify(capture.frame));
  fs.writeFileSync(root+'/'+name+'-frame.png',Buffer.from(capture.preview.split(',')[1],'base64'));
  skyCaptures.push({name,sunElevation:w.captureTestClock.sun.elevation,colours:new Set(capture.frame.records.map(r=>r.fill)).size});
}
assert.ok(skyCaptures[0].sunElevation>0);
assert.ok(skyCaptures[1].sunElevation<0);
process.stdout.write(JSON.stringify({passed:true,cityRelease:manifest.release.version,bootState:w.document.body.dataset.bootState,captures:4,firstCamera:captures[0].frame.info.camera,secondCamera:captures[1].frame.info.camera,navigation:captures[1].frame.info.navigation,navigationMatchesUI:true,glyphs:captures.map(c=>c.frame.records.filter(r=>r.op==='fillText').length),skyCaptures,operations:[...new Set(first.frame.records.map(r=>r.op))],colours:captures.map(c=>new Set(c.frame.records.map(r=>r.fill)).size),paused:true,resumed:true}));
w.close();
