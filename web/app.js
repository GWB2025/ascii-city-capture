import {CityVersions, CitySession} from './versions.mjs';
import {zipFiles} from './zip.mjs';
const $=id=>document.getElementById(id);
const city=$('city'),dialog=$('preview-dialog'),form=$('settings');
let worker,requestId=0,currentFrame,currentImage,svgResult,svgParts=[],svgUrl,renderTimer,ready=false,currentMode='plot',captureGeneration=0,capturing=false;
const pending=new Map();
const session=new CitySession(city);
let activeRelease, identity;
function labelRelease(){if(!activeRelease)return;$('build-label').textContent=activeRelease.name.replace(/^ASCII City /,'')+' · Capture '+(identity?.version||'');$('font-note').textContent=activeRelease.name+' ('+activeRelease.version+'). Capture font: '+(identity?.font||'loading')+'. The same font is used for the city and its exported outlines.';}
function switchCity(entry){
  captureGeneration++;render.serial++;clearTimeout(renderTimer);
  worker?.terminate();worker=null;for(const p of pending.values())p.reject(Error('The city version changed.'));pending.clear();
  ready=false;capturing=false;currentFrame=null;currentImage=null;svgResult=null;svgParts=[];
  if(svgUrl)URL.revokeObjectURL(svgUrl);svgUrl=null;
  $('preview').removeAttribute('src');$('download').disabled=true;$('capture').disabled=true;
  dialog.close();hideNotice();activeRelease=entry;labelRelease();
  $('status').textContent='Opening '+entry.name.replace(/^ASCII City /,'')+'…';
  session.mount(entry.id);
}
const versions=new CityVersions({onSelect:switchCity,onOpen:()=>session.send('release-controls')});
function message(type){session.send(type);}
function notice(text){const element=$(dialog.open?'preview-error':'notice');element.textContent=text;element.hidden=false;}
function hideNotice(){$('notice').hidden=true;$('preview-error').hidden=true;}
function options(){const d=Object.fromEntries(new FormData(form));return {...d,background:form.elements.background.checked};}
function makeWorker(){
  worker?.terminate();for(const p of pending.values())p.reject(Error('A new capture replaced this one.'));pending.clear();
  worker=new Worker('/worker.js');
  worker.onmessage=({data})=>{
    if(data.type==='progress'){$('caption').textContent='Removing hidden strokes… '+Math.round(data.progress*100)+'%';return;}
    const promise=pending.get(data.id);if(!promise)return;pending.delete(data.id);
    if(data.type==='error')promise.reject(Error(data.message));else promise.resolve(data);
  };
  worker.onerror=event=>{for(const p of pending.values())p.reject(Error(event.message));pending.clear();};
}
function ask(type,extra={}){const id=++requestId;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});worker.postMessage({id,type,...extra});});}
function updateFields(){
  const d=options(),plot=d.mode==='plot';
  $('custom-size').hidden=d.paper!=='Custom';$('pen-field').hidden=!plot;$('background-field').hidden=plot;
  $('mode-description').textContent=plot?'Character contours on white paper. Hidden strokes are removed.':'Filled character shapes, with the original positions and colours.';
  $('download').textContent=plot?'Save plotter SVG':'Save print SVG';
  $('export-note').textContent=plot?(d.colour==='colour'?'Six pen colours. Open in SVG Plotter to assign pens. Translucent effects become solid outlines.':'Open the SVG in your SVG Plotter. Translucent effects become solid pen outlines.'):'Open the SVG in a browser or drawing app to print. The character shapes are included in the file.';
  form.elements.background.disabled=d.colour==='mono';
}
async function render(){
  if(!ready)return;
  hideNotice();updateFields();$('download').disabled=true;svgResult=null;
  const requested=++render.serial,d=options();
  $('caption').textContent=d.mode==='plot'?'Preparing visible character contours…':'Preparing print preview…';
  try{
    const result=await ask('render',{mode:d.mode,options:d});
    if(requested!==render.serial)return;
    if(svgUrl)URL.revokeObjectURL(svgUrl);
    svgUrl=URL.createObjectURL(new Blob([result.svg],{type:'image/svg+xml'}));
    $('preview').src=svgUrl;
    $('paper').style.aspectRatio=result.layout.width+'/'+result.layout.height;
    $('paper').style.setProperty('--paper-ratio',result.layout.width/result.layout.height);
    const size=`${result.layout.drawingWidth.toFixed(1)} × ${result.layout.drawingHeight.toFixed(1)} mm drawing`;
    $('caption').textContent=d.mode==='plot'?`${result.visibleGlyphs.toLocaleString()} visible characters · ${result.paths.toLocaleString()} strokes · ${size}`:size+' · original character outlines';
    svgParts=result.parts||[];
    if(d.mode==='plot'&&svgParts.length>1){
      $('download').textContent=`Save ${svgParts.length} plotter parts (.zip)`;
      $('export-note').textContent=`This detailed view uses ${svgParts.length} passes. In SVG Plotter choose “Keep original size and position” for every part. Instructions are included.`;
    }
    svgResult=result.svg;currentMode=d.mode;$('download').disabled=false;
  }catch(error){if(requested===render.serial){$('caption').textContent='The preview could not be prepared.';notice(error.message);}}
}
render.serial=0;
function capture(){if($('capture').disabled||dialog.open||versions.dialog.open)return;hideNotice();capturing=true;$('versions').disabled=true;$('capture').disabled=true;$('status').textContent='Capturing a complete frame…';message('capture');}
function resume(){$('versions').disabled=false;dialog.close();ready=false;captureGeneration++;render.serial++;clearTimeout(renderTimer);message('resume');$('capture').disabled=false;$('status').textContent='Explore the city · capture when ready';city.focus();}
function save(blob,name){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
const timestamp=()=>new Date(currentFrame.capturedAt).toISOString().replaceAll(':','-').slice(0,19);
$('capture').addEventListener('click',capture);$('resume').addEventListener('click',resume);
dialog.addEventListener('cancel',event=>{event.preventDefault();resume();});
$('help').addEventListener('click',()=>$('help-dialog').showModal());$('close-help').addEventListener('click',()=>$('help-dialog').close());
form.addEventListener('submit',event=>event.preventDefault());
form.addEventListener('input',()=>{render.serial++;svgResult=null;$('download').disabled=true;updateFields();clearTimeout(renderTimer);renderTimer=setTimeout(render,180);});
$('download').addEventListener('click',()=>{
  if(!svgResult)return;
  const name=`ASCII-City-${currentMode}-${timestamp()}`;
  if(currentMode==='plot'&&svgParts.length>1){
    const files=svgParts.map((part,i)=>({name:`${name}-part-${String(i+1).padStart(2,'0')}.svg`,text:part.svg}));
    files.push({name:'READ-ME-FIRST.txt',text:`ASCII City: ${svgParts.length} plotting passes\n\nKeep the paper fixed throughout. Load the numbered SVG files one at a time.\nFor every file, choose Page placement: Keep original size and position, then Apply placement.\nDo not automatically fit or centre individual parts: that would misalign them.\nAll parts use identical page coordinates and contain different visible strokes.\nComplete one pass before starting the next, using the same origin and pen setup.\nThe files use character contours. They do not include background strokes.\nTranslucent effects are represented by solid pen outlines.\n`});
    save(zipFiles(files),name+'.zip');
  }else save(new Blob([svgResult],{type:'image/svg+xml'}),name+'.svg');
});
$('download-png').addEventListener('click',async()=>{if(currentImage){const blob=await(await fetch(currentImage)).blob();save(blob,`ASCII-City-capture-${timestamp()}.png`);}});
document.addEventListener('keydown',event=>{if(event.altKey&&event.code==='KeyC'&&!dialog.open&&!$('help-dialog').open&&!['INPUT','SELECT'].includes(event.target.tagName)){event.preventDefault();capture();}});
window.addEventListener('message',async event=>{
  if(!session.accepts(event))return;
  const data=event.data;
  if(data.type==='capture-request')capture();
  else if(data.type==='status'&&!dialog.open&&!capturing){$('capture').disabled=!data.info.live;$('status').textContent=data.info.live?'Explore the city · capture when ready':'Enter the city to capture a view';}
  else if(data.type==='error'){capturing=false;$('versions').disabled=false;notice(data.message);$('capture').disabled=false;}
  else if(data.type==='frame'){
    capturing=false;const generation=++captureGeneration;
    currentFrame=data.frame;currentImage=data.preview;ready=false;svgResult=null;
    $('preview').src=currentImage;$('download').disabled=true;$('caption').textContent='Reading the original characters…';
    dialog.showModal();$('status').textContent='City paused · your view is preserved';
    makeWorker();
    try{await ask('prepare',{frame:currentFrame});if(generation!==captureGeneration)return;ready=true;await render();}catch(error){if(generation!==captureGeneration)return;notice(error.message);$('caption').textContent='Capture saved in memory; export could not be prepared.';}
  }
});
fetch('/api/identity').then(r=>r.json()).then(d=>{identity=d;labelRelease();}).catch(()=>{});
versions.initialise().catch(error=>notice(error.message));
updateFields();
