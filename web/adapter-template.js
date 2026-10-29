/* Generated from the inspected city renderer; original assets remain unchanged. */
__ATLAS__ = null;
(() => {
  function navigation() {
    const heading = __BEARING__(__CAMERA__.yaw);
    const result = {
      district: null, cityPos: null, elevation: null, sector: null,
      street: null, cross: null, landmark: null, phone: null,
      bearing: String(Math.round(heading.degrees)).padStart(3, '0') + ' DEG / ' + heading.compass
    };
    // Interior coordinates are local to that room, not an exterior city address.
    if (__AREA__ !== 'city') return result;
    const place = __PLACE__();
    const worldX = __WORLD_X__(__CAMERA__.x), worldZ = __WORLD_Z__(__CAMERA__.z);
    const terrain = __TERRAIN__(), eye = __EYE__();
    Object.assign(result, {
      district: place.district.name, cityPos: place.position.label,
      elevation: __SKY_TAXI__?.active || __AIRCRAFT__?.active
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
          direction: __SHORT_BEARING__(__BEARING__(Math.atan2(dx, -dz)).compass)
        };
      }
      return best;
    }
    const landmark = nearest(__LANDMARKS__, item => [item.x, item.z]);
    const phone = nearest(__PHONES__.filter(item => item.kind === __PHONE_KIND__), item => [
      Number.isFinite(item.relayWorldX) ? item.relayWorldX : __WORLD_X__(item.x),
      Number.isFinite(item.relayWorldZ) ? item.relayWorldZ : __WORLD_Z__(item.z)
    ]);
    const range = target => Math.round(target.distance) + 'M ' + target.direction;
    if (landmark) result.landmark = landmark.item.shortName + ' / ' + range(landmark);
    if (phone) result.phone = range(phone);
    return result;
  }
  window.__cityCapture.attach((includeNavigation = false) => ({
    cols: __COLS__, rows: __ROWS__, cellWidth: __CELL_WIDTH__, lineHeight: 9,
    font: __CONTEXT__.font, phase: __PHASE__, live: __PHASE__ === __PHASES__.LIVE__BOOT_GATE__,
    release: __RELEASE__,
    camera: {...__CAMERA__}, area: __AREA__,
    ...(includeNavigation ? {navigation: navigation()} : {})
  }), {frameName: __FRAME__});
})();
