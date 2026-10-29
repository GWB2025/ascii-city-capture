/* Capture the selected city's direct drawing path, leaving its game logic intact. */
(() => {
  'use strict';
  const nativeRAF = window.requestAnimationFrame.bind(window);
  const nativeContext = HTMLCanvasElement.prototype.getContext;
  const contexts = new WeakMap();
  const session = new URL(location.href).searchParams.get('capture-session') || '';
  let frameName = '';
  let readInfo, requested = false, recording = false, paused = false;
  let heldFrame = null, records = [], lastStatus = 0, timeout;
  const send = (type, extra = {}) => parent.postMessage({cityCapture: true, type, session, ...extra}, location.origin);
  const fail = message => send('error', {message: String(message)});
  window.__cityCapture = {attach(fn, options) { readInfo = fn; frameName = options?.frameName || ''; }, fail};

  HTMLCanvasElement.prototype.getContext = function(kind, ...options) {
    if (kind === 'webgl' || kind === 'webgl2' || kind === 'experimental-webgl') return null;
    const context = nativeContext.call(this, kind, ...options);
    if (!context || kind !== '2d') return context;
    if (contexts.has(context)) return contexts.get(context);
    const canvas = this;
    const methods = new Map();
    const proxy = new Proxy(context, {
      get(target, key) {
        const value = Reflect.get(target, key, target);
        if (typeof value !== 'function') return value;
        if (!methods.has(key)) methods.set(key, (...args) => {
          if (recording && canvas.id === 'cv' && ['fillText', 'fillRect', 'clearRect', 'drawImage', 'strokeText', 'fill', 'stroke', 'clip'].includes(key)) {
            const m = target.getTransform();
            records.push({op: key, args: args.map(a => typeof a === 'object' ? null : a),
              fill: target.fillStyle, font: target.font, alpha: target.globalAlpha,
              composite: target.globalCompositeOperation, transform: [m.a,m.b,m.c,m.d,m.e,m.f],
              baseline: target.textBaseline, align: target.textAlign});
          }
          return value.apply(target, args);
        });
        return methods.get(key);
      },
      set(target, key, value) {
        if (key === 'font' && /Consolas|Courier New/.test(value)) value = value.replace(/Consolas.*$/, 'CityCapture');
        return Reflect.set(target, key, value, target);
      }
    });
    contexts.set(context, proxy);
    return proxy;
  };

  async function run(callback, now) {
    if (paused) { heldFrame = callback; return; }
    const capture = requested && readInfo?.().live;
    if (capture) { requested = false; recording = true; records = []; }
    try {
      await callback(now);
      if (capture) {
        recording = false;
        clearTimeout(timeout);
        const info = readInfo(true);
        const canvas = document.getElementById('cv');
        if (!records.some(r => r.op === 'fillText')) throw Error('This frame contained no characters. Please try again.');
        if (records.some(r => r.op === 'fillText' && !r.font.includes('CityCapture'))) throw Error('This city uses a different font. Capture support needs updating.');
        paused = true;
        const snapshot = document.createElement('canvas');
        snapshot.width = canvas.width; snapshot.height = canvas.height;
        const ink = snapshot.getContext('2d');
        ink.fillStyle = '#050907'; ink.fillRect(0, 0, snapshot.width, snapshot.height);
        ink.drawImage(canvas, 0, 0);
        send('frame', {frame: {schema: 1, source: info.release.name, capturedAt: new Date().toISOString(),
          info: {...info, width: canvas.width, height: canvas.height}, records}, preview: snapshot.toDataURL('image/png')});
      } else if (now - lastStatus > 700 && readInfo) {
        lastStatus = now;
        send('status', {info: readInfo()});
      }
    } catch (error) { recording = false; requested = false; clearTimeout(timeout); fail(error.message); }
  }
  window.requestAnimationFrame = callback => frameName && callback.name === frameName
    ? nativeRAF(now => run(callback, now)) : nativeRAF(callback);

  function releaseKeys() {
    for (const code of ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight','Space']) {
      const key = code.startsWith('Key') ? code.slice(3).toLowerCase() : code.startsWith('Shift') ? 'Shift' : code === 'Space' ? ' ' : code;
      document.dispatchEvent(new KeyboardEvent('keyup', {key, code, bubbles: true}));
      window.dispatchEvent(new KeyboardEvent('keyup', {key, code}));
    }
  }
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== parent || !event.data?.cityCapture || (event.data.session || '') !== session) return;
    if (event.data.type === 'release-controls') { releaseKeys(); document.exitPointerLock?.(); }
    else if (event.data.type === 'capture') {
      if (!readInfo?.().live) { fail('Enter the city before capturing a view.'); return; }
      if (paused || requested) return;
      releaseKeys();
      document.exitPointerLock?.();
      requested = true;
      timeout = setTimeout(() => { requested = false; fail('Capture took too long. Return to the city and try again.'); }, 20000);
    } else if (event.data.type === 'resume') {
      releaseKeys();
      paused = false;
      if (heldFrame) { const callback = heldFrame; heldFrame = null; window.requestAnimationFrame(callback); }
      window.focus();
    }
  });
  for (const type of ['keydown','mousedown','mousemove','wheel']) {
    window.addEventListener(type, event => {
      if(type==='keydown'&&event.altKey&&event.code==='KeyC'&&!paused){event.stopImmediatePropagation();event.preventDefault();send('capture-request');return;}
      if (paused || requested || recording) { event.stopImmediatePropagation(); event.preventDefault(); }
    }, {capture: true, passive: false});
  }
  window.addEventListener('error', event => fail(event.message));
  window.addEventListener('unhandledrejection', event => fail(event.reason?.message || event.reason));
})();
