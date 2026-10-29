import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {CityVersions} from '../web/versions.mjs';
const entries = [
  {id:'prototype-4-5',name:'ASCII City Prototype 4.5',version:'0.4.5-dn.14',support:'verified',source:'https://prototype4-5-a5be.grownowgames.workers.dev/'},
  {id:'prototype-4',name:'ASCII City Prototype 4',version:'0.3.0-rc.27',support:'verified',source:'https://prototype4-1d81.grownowgames.workers.dev/'}
];
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 const dom=new JSDOM(fs.readFileSync(new URL('../web/index.html',import.meta.url),'utf8'),{url:'http://127.0.0.1:43123/'});
 const w=dom.window;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const catalog={selected:'prototype-4',versions:structuredClone(entries)}, selected=[], requests=[];
 let fail=false, outcome='detected';
 const request=async(path,options)=>{
   requests.push({path,options});
   if(path==='/api/cities')return {ok:true,json:async()=>structuredClone(catalog)};
   if(path==='/api/cities/select'){
     if(fail)return {ok:false,json:async()=>({error:'City files are damaged; your current session is still open.'})};
     catalog.selected=JSON.parse(options.body).id;
     return {ok:true,json:async()=>catalog.versions.find(e=>e.id===catalog.selected)};
   }
   if(path==='/api/cities/check'){
     const entry={...entries[0],id:'future',name:'ASCII City future',support:outcome};catalog.versions.push(entry);
     return {ok:true,json:async()=>({id:'job',status:'complete',entry})};
   }
   throw Error(path);
 };
 const panel=new CityVersions({onSelect:e=>selected.push(e),request,document:w.document});
 return {dom,w,catalog,selected,requests,panel,setFail:value=>fail=value,setOutcome:value=>outcome=value};
}

test('remembered release loads; switching through the visible button persists the selection',async()=>{
 const f=fixture();await f.panel.initialise();assert.equal(f.selected[0].id,'prototype-4');
 await f.panel.open();assert.ok(f.panel.dialog.open);
 f.w.document.querySelector('[data-city-id="prototype-4-5"]').click();await tick();
 assert.equal(f.catalog.selected,'prototype-4-5');assert.equal(f.selected.at(-1).id,'prototype-4-5');
 assert.equal(f.panel.dialog.open,false);assert.equal(f.panel.active,'prototype-4-5');f.dom.window.close();
});
test('failed switch leaves the old city in place and shows a useful message',async()=>{
 const f=fixture();await f.panel.initialise();await f.panel.open();f.setFail(true);
 await f.panel.select('prototype-4-5');assert.equal(f.selected.length,1);assert.equal(f.panel.active,'prototype-4');
 assert.ok(f.panel.dialog.open);assert.match(f.w.document.getElementById('version-status').textContent,/damaged/);f.dom.window.close();
});
test('checking a new URL adds a selectable copy without resetting the running city',async()=>{
 const f=fixture();await f.panel.initialise();await f.panel.check('https://prototype-next.grownowgames.workers.dev/');
 assert.equal(f.selected.length,1);assert.equal(f.panel.active,'prototype-4');
 assert.equal(f.w.document.querySelector('[data-city-id="future"]').disabled,false);
 await f.panel.select('future');assert.equal(f.selected.at(-1).id,'future');f.dom.window.close();
});
test('an unsupported release stays disabled and does not replace the working version',async()=>{
 const f=fixture();await f.panel.initialise();f.setOutcome('unsupported');await f.panel.check(entries[0].source);
 assert.equal(f.w.document.querySelector('[data-city-id="future"]').disabled,true);
 assert.equal(f.selected.length,1);assert.match(f.w.document.getElementById('version-status').textContent,/needs updated capture support/);f.dom.window.close();
});

test('app disables capture until the newly selected iframe reports live and rejects stale status',async()=>{
 const f=fixture(),w=f.w;
 Object.assign(globalThis,{document:w.document,window:w,location:w.location,FormData:w.FormData});
 globalThis.fetch=async function(path,opts){
   if(this!==undefined&&this!==globalThis)throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
   return path==='/api/identity'?{json:async()=>({version:'1.2.1',font:'Courier New'})}:f.panel.request(path,opts);
 };
 await import('../web/app.js?ui-test');await tick();
 const city=w.document.getElementById('city'),button=w.document.getElementById('capture');
 const session=()=>new URL(city.src).searchParams.get('capture-session');
 const old=session();assert.match(city.src,/prototype-4\//);assert.ok(button.disabled);
 function status(token){w.dispatchEvent(new w.MessageEvent('message',{origin:w.location.origin,source:city.contentWindow,data:{cityCapture:true,type:'status',session:token,info:{live:true}}}));}
 status(old);assert.equal(button.disabled,false);
 // Use the app's own panel; both fixtures share the same DOM but only this card is current.
 w.document.getElementById('versions').click();await tick();
 w.document.querySelector('[data-city-id="prototype-4-5"]').click();await tick();
 assert.match(city.src,/prototype-4-5\//);assert.ok(button.disabled);assert.notEqual(session(),old);
 status(old);assert.ok(button.disabled);status(session());assert.equal(button.disabled,false);
 assert.match(w.document.getElementById('build-label').textContent,/4.5.*1.2.1/);w.close();
});
