/* Generated from the inspected city renderer; original assets remain unchanged. */
_0x225ae3 = null;
(() => {
  function navigation() {
    const heading = _0x19f1a8(_0x301107.yaw);
    const result = {
      district: null, cityPos: null, elevation: null, sector: null,
      street: null, cross: null, landmark: null, phone: null,
      bearing: String(Math.round(heading.degrees)).padStart(3, '0') + ' DEG / ' + heading.compass
    };
    // Interior coordinates are local to that room, not an exterior city address.
    if (_0x8a08fd !== 'city') return result;
    const place = _0x3f4fb4();
    const worldX = _0x3a0b95(_0x301107.x), worldZ = _0x157ebb(_0x301107.z);
    const terrain = _0x2c5164(), eye = _0x1415b0();
    Object.assign(result, {
      district: place.district.name, cityPos: place.position.label,
      elevation: _0x228e7a?.active || _0x23a0d8?.active
        ? eye.toFixed(1) + 'M / ' + Math.max(0, eye - terrain).toFixed(1) + ' AGL'
        : terrain.toFixed(1) + 'M TERRAIN',
      sector: place.sector.name + ' / ' + place.gridRef.label,
      street: place.street.name, cross: place.cross.name
    });
    function nearest(items, position) {
      let best = null;
      for (const item of items) {
        const [x, z] = position(item), dx = x - worldX, dz = z - worldZ;
        const distance = Math.hypot(dx, dz);
        if (!best || distance < best.distance) best = {
          item, distance,
          direction: _0x5d7a2d(_0x19f1a8(Math.atan2(dx, -dz)).compass)
        };
      }
      return best;
    }
    const landmark = nearest(_0x1e4a17, item => [item.x, item.z]);
    const phone = nearest(_0x121152.filter(item => item.kind === _0x54aff9), item => [
      Number.isFinite(item.relayWorldX) ? item.relayWorldX : _0x3a0b95(item.x),
      Number.isFinite(item.relayWorldZ) ? item.relayWorldZ : _0x157ebb(item.z)
    ]);
    const range = target => Math.round(target.distance) + 'M ' + target.direction;
    if (landmark) result.landmark = landmark.item.shortName + ' / ' + range(landmark);
    if (phone) result.phone = range(phone);
    return result;
  }
  window.__cityCapture.attach((includeNavigation = false) => ({
    cols: _0x5a556a, rows: _0x2adf1f, cellWidth: _0x379289, lineHeight: 9,
    font: _0x8bebc3.font, phase: _0x4f8c9c, live: _0x4f8c9c === _0x28a9db.LIVE && document.body.dataset.bootState === 'ready',
    release: {"name": "ASCII CITY PROTOTYPE 4.5", "version": "0.4.5-dn.14"},
    camera: {..._0x301107}, area: _0x8a08fd,
    ...(includeNavigation ? {navigation: navigation()} : {})
  }), {frameName: "_0x49bd23"});
})();
