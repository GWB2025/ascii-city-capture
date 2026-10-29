/* Real captured drawing: export size, preservation and plotting compatibility. */
import fs from 'node:fs';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {prepareFrame,plotGeometry,plotSvg,printSvg} from '../web/geometry.mjs';
import {zipFiles} from '../web/zip.mjs';
const root=new URL('../',import.meta.url);
const fixture=process.argv[2]||new URL('../../ascii-city-investigation/frame.json',import.meta.url);
const fontPath=process.argv[3]||'/System/Library/Fonts/Supplemental/Courier New.ttf';
const ot=createRequire(import.meta.url)('../web/vendor/opentype.min.js');
const buffer=fs.readFileSync(fontPath),font=ot.parse(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength));
const original=JSON.parse(fs.readFileSync(fixture)),scene=prepareFrame(original,font),geometry=plotGeometry(scene);
const printed=printSvg(scene,{paper:'A4',colour:'colour'}),plotted=plotSvg(scene,geometry,{paper:'A4',colour:'mono'});
assert.equal((printed.svg.match(/data-character=/g)||[]).length,original.records.filter(r=>r.op==='fillText'&&r.alpha>0).length);
assert.doesNotMatch(printed.svg,/<image\b/);
if(original.info.navigation){
  for(const value of Object.values(original.info.navigation).filter(v=>v!==null))assert.ok(printed.svg.includes(value));
  assert.ok(printed.svg.includes(original.info.release.version));
}
assert.ok(plotted.parts.length>0);
for(const part of plotted.parts){
  assert.ok(part.estimatedPoints<=210000);
  assert.ok(Buffer.byteLength(part.svg)<8*1024*1024);
  assert.doesNotMatch(part.svg,/<(?:use|text|image|clipPath|mask)\b/);
  assert.doesNotMatch(part.svg,/\bhref=|clip-path=|url\(/);
  assert.match(part.svg,/width="210mm" height="297mm" viewBox="0 0 210 297"/);
  assert.equal(part.svg.match(/<!--[\s\S]*?-->/)[0],printed.svg.match(/<!--[\s\S]*?-->/)[0]);
}
assert.equal(plotted.parts.reduce((n,p)=>n+(p.svg.match(/<path /g)||[]).length,0),(plotted.svg.match(/<path /g)||[]).length);
const output=new URL('test-output/',root);fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(new URL('sample-print.svg',output),printed.svg);
fs.writeFileSync(new URL('sample-plot.svg',output),plotted.svg);
const files=plotted.parts.map((p,i)=>({name:`part-${i+1}.svg`,text:p.svg}));
fs.writeFileSync(new URL('plot-parts.zip',output),Buffer.from(await zipFiles(files).arrayBuffer()));
for(const file of files)fs.writeFileSync(new URL(file.name,output),file.text);
const summary={source:'Previously captured real city drawing commands; font supplied explicitly for this test',glyphs:scene.items.filter(i=>i.kind==='glyph').length,visibleGlyphs:geometry.visibleGlyphs,strokes:geometry.paths.length,parts:plotted.parts.map(p=>({bytes:Buffer.byteLength(p.svg),estimatedPoints:p.estimatedPoints})),printBytes:Buffer.byteLength(printed.svg),drawingMm:plotted.layout};
fs.writeFileSync(new URL('validation.json',output),JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary));
