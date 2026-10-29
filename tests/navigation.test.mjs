import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {printSvg,plotSvg} from '../web/geometry.mjs';

const navigation={district:'Old Works',cityPos:'X 1,712 / Z 3,404',elevation:'24.8M TERRAIN',sector:'West / AV 12 ST 09',street:'Boiler Way',cross:'Foundry Street',landmark:'BOILER STACKS / 82M NE',phone:'15M S',bearing:'270 DEG / WEST'};
const scene={width:10,height:10,capturedAt:'2026-10-28T18:00:00.000Z',info:{area:'city',navigation},templates:[],items:[]};
const comments=svg=>[...svg.matchAll(/<!--([\s\S]*?)-->/g)].map(m=>m[1]).join('\n');
const labels=['District','City Pos','Elevation','Sector','Street','Cross','Landmark','Phone','Bearing'];

test('print export contains readable navigation comments and structured metadata',()=>{
  const svg=printSvg(scene).svg;
  for(const [index,value] of Object.values(navigation).entries())assert.ok(comments(svg).includes(labels[index]+': '+value));
  assert.ok(comments(svg).includes('Captured at (UTC): '+scene.capturedAt));
  assert.match(svg,/&quot;navigation&quot;/);
});

test('every plotter part keeps the same capture navigation without adding strokes',()=>{
  const geometry={visibleGlyphs:120,paths:Array.from({length:120},()=>({colour:'#000000',points:[[0,0],[10,10]]}))};
  const result=plotSvg(scene,geometry);
  assert.ok(result.parts.length>1);
  for(const part of result.parts)assert.equal(comments(part.svg),comments(result.svg));
  assert.ok(comments(result.svg).includes('District: Old Works'));
  assert.equal((result.svg.match(/<path /g)||[]).length,120);
  assert.doesNotMatch(result.svg,/<text\b/);
});

test('unavailable navigation is explicit, and comment delimiters/control characters cannot break SVG',()=>{
  const legacy=printSvg({...scene,info:{area:'interior'}}).svg;
  for(const label of labels)assert.ok(comments(legacy).includes(label+': Not available'));
  const hostile=printSvg({...scene,info:{...scene.info,navigation:{...navigation,district:'A--->B\u0000\ud800\nPhone: fake & <district>'}}}).svg;
  const comment=comments(hostile);
  assert.doesNotMatch(comment,/--|\u0000|\ud800/);
  assert.ok(comment.includes('A- - ->B'));
  assert.equal((hostile.match(/<!--/g)||[]).length,1);
  assert.equal((hostile.match(/-->/g)||[]).length,1);
});

function adapter(){
  let read;
  const context={document:{body:{dataset:{bootState:'ready'}}},window:{__cityCapture:{attach(fn){read=fn;}}},_0x225ae3:{},
    _0x5a556a:180,_0x2adf1f:80,_0x379289:6,_0x8bebc3:{font:'10px CityCapture'},
    _0x4f8c9c:1,_0x28a9db:{LIVE:1},_0x301107:{x:10,z:20,yaw:0},_0x8a08fd:'city',
    _0x3a0b95:x=>x+1000,_0x157ebb:z=>z+2000,
    _0x19f1a8:()=>({degrees:0,compass:'NORTH'}),_0x5d7a2d:()=> 'N',
    _0x3f4fb4:()=>({district:{name:'Old Works'},position:{label:'X 1,010 / Z 2,020'},sector:{name:'West'},gridRef:{label:'12/09'},street:{name:'Boiler Way'},cross:{name:'Foundry Street'}}),
    _0x2c5164:()=>24.8,_0x1415b0:()=>60,_0x228e7a:null,_0x23a0d8:null,
    _0x1e4a17:[{shortName:'Far tower',x:1100,z:2020},{shortName:'Near tower',x:1010,z:2010}],
    _0x54aff9:9,_0x121152:[{kind:9,x:10,z:23},{kind:9,x:0,z:0,relayWorldX:1010,relayWorldZ:2022},{kind:2,x:10,z:20}]};
  vm.runInNewContext(fs.readFileSync(new URL('../web/city-adapter.js',import.meta.url),'utf8'),context);
  return {context,read:(...args)=>read(...args)};
}

test('capture resolves nearest landmark and phone in world coordinates, and snapshots values',()=>{
  const {context,read}=adapter();
  assert.equal(read().navigation,undefined,'status reads should not scan navigation');
  const first=read(true);
  assert.equal(first.navigation.cityPos,'X 1,010 / Z 2,020');
  assert.equal(first.navigation.landmark,'Near tower / 10M N');
  assert.equal(first.navigation.phone,'2M N');
  assert.equal(first.navigation.elevation,'24.8M TERRAIN');
  context._0x228e7a={active:true};
  context._0x301107.x=42;
  assert.equal(read(true).navigation.elevation,'60.0M / 35.2 AGL');
  assert.equal(first.navigation.elevation,'24.8M TERRAIN');
  assert.equal(first.camera.x,10);
});

test('missing landmarks and interior areas cannot reuse an earlier city location',()=>{
  const {context,read}=adapter();
  read(true);
  context._0x1e4a17=[];context._0x121152=[];
  assert.equal(read(true).navigation.landmark,null);
  assert.equal(read(true).navigation.phone,null);
  context._0x8a08fd='interior';
  const nav=read(true).navigation;
  for(const key of Object.keys(navigation).filter(k=>k!=='bearing'))assert.equal(nav[key],null,key);
  assert.equal(nav.bearing,'000 DEG / NORTH');
});
