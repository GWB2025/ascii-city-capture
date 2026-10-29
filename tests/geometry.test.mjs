import test from 'node:test';
import assert from 'node:assert/strict';
import {visibleSegments,pointInside,plotGeometry,pageLayout,paint,plotSvg,flatten,prepareFrame,printSvg} from '../web/geometry.mjs';
const box={kind:'rect',bbox:[4,-1,6,1]};
test('a background erases the middle of a contour without adding a cut edge',()=>{
  assert.deepEqual(visibleSegments([0,0],[10,0],[box],[-20,-20,20,20]),[[[0,0],[4,0]],[[6,0],[10,0]]]);
});
test('overlapping masks form one occlusion interval',()=>{
  assert.deepEqual(visibleSegments([0,0],[10,0],[box,{kind:'rect',bbox:[5,-1,8,1]}],[-20,-20,20,20]),[[[0,0],[4,0]],[[8,0],[10,0]]]);
});
test('glyph holes preserve the underlying contour',()=>{
  const shape={kind:'glyph',bbox:[1,-3,9,3],contours:[[[1,-3],[9,-3],[9,3],[1,3],[1,-3]],[[3,-1],[7,-1],[7,1],[3,1],[3,-1]]]};
  assert.equal(pointInside([5,0],shape),false);
  assert.deepEqual(visibleSegments([0,0],[10,0],[shape],[-20,-20,20,20]),[[[0,0],[1,0]],[[3,0],[7,0]],[[9,0],[10,0]]]);
});
test('segments on an opaque glyph boundary are removed',()=>{
  const shape={kind:'glyph',bbox:[0,0,10,10],contours:[[[0,0],[10,0],[10,10],[0,10],[0,0]]]};
  assert.deepEqual(visibleSegments([0,0],[10,0],[shape],[-20,-20,20,20]),[]);
});
test('canvas bounds clip spillover',()=>assert.deepEqual(visibleSegments([-5,3],[15,3],[],[0,0,10,10]),[[[0,3],[10,3]]]));
test('invalid layout is rejected and aspect ratio is preserved',()=>{
  assert.throws(()=>pageLayout(100,50,{margin:110}));
  const p=pageLayout(100,50,{paper:'A4',margin:10});assert.equal(p.drawingWidth,190);assert.equal(p.drawingHeight,95);
});
test('opacity combines fill alpha and context alpha',()=>assert.deepEqual(paint('rgba(255, 0, 0, 0.4)',.5),{colour:'#ff0000',alpha:.2}));
test('curves are flattened with endpoints intact',()=>{
  const p=flatten([{type:'M',x:0,y:0},{type:'Q',x1:5,y1:10,x:10,y:0}])[0];assert.deepEqual(p[0],[0,0]);assert.deepEqual(p.at(-1),[10,0]);assert.ok(p.length>5);
});
test('fully hidden glyph is omitted from pen paths',()=>{
  const glyph={key:'A',contours:[[[1,1],[9,1],[9,9],[1,9],[1,1]]]};
  const scene={width:10,height:10,items:[{kind:'glyph',glyph,x:0,y:0,bbox:[1,1,9,9],alpha:1,colour:'#000000'},{kind:'rect',bbox:[0,0,10,10],alpha:1}]};
  assert.equal(plotGeometry(scene).paths.length,0);
});
test('zero-length font segments never split a continuous contour',()=>{
  const glyph={key:'A',contours:[[[1,1],[9,1],[9,1],[9,9],[1,9],[1,1]]]};
  const scene={width:10,height:10,items:[{kind:'glyph',glyph,x:0,y:0,bbox:[1,1,9,9],alpha:1,colour:'#000000'}]};
  assert.equal(plotGeometry(scene).paths.length,1);
});
test('plot SVG contains plain paths and no font or clip dependencies',()=>{
  const scene={width:10,height:10,info:{area:'city'},templates:[{text:'&'}]};
  const result=plotSvg(scene,{visibleGlyphs:1,paths:[{colour:'#ff0000',points:[[0,0],[10,10]]}]});
  assert.match(result.svg,/<path stroke=/);assert.doesNotMatch(result.svg,/<(?:use|text|image|clipPath)\b/);assert.match(result.svg,/&amp;/);
});
test('unsupported drawing operations fail rather than silently disappear',()=>{
  assert.throws(()=>prepareFrame({info:{width:10,height:10},records:[{op:'drawImage',args:[],fill:'#000',alpha:1,composite:'source-over',transform:[1,0,0,1,0,0]}]},{}),/unsupported drawing/);
});
