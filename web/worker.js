importScripts('/vendor/opentype.min.js');
let scene, geometry;
const modules=import('/geometry.mjs');
const font=fetch('/font.ttf').then(r=>{if(!r.ok)throw Error('The capture font could not be loaded.');return r.arrayBuffer();}).then(b=>opentype.parse(b));
self.onmessage=async ({data})=>{
  const {id,type}=data;
  try{
    const engine=await modules;
    if(type==='prepare'){
      scene=engine.prepareFrame(data.frame,await font);geometry=null;
      postMessage({id,type:'prepared',glyphs:scene.items.filter(i=>i.kind==='glyph').length});
    }else if(type==='render'){
      if(!scene)throw Error('Capture a view first.');
      if(data.mode==='plot'&&!geometry)geometry=engine.plotGeometry(scene,p=>postMessage({id,type:'progress',progress:p}));
      const result=data.mode==='plot'?engine.plotSvg(scene,geometry,data.options):engine.printSvg(scene,data.options);
      postMessage({id,type:'rendered',...result});
    }
  }catch(error){postMessage({id,type:'error',message:error.message});}
};
