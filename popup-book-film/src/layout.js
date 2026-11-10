// Per-spread staging shared by the camera and the scene authors. Pure data and
// tiny pure helpers; must NOT import three.js.
//
// Coordinates are in the SPREAD FRAME (see ARCHITECTURE.md): x to the right
// (right page x in [0, 3], left page x in [-3, 0]), z toward the viewer (page
// z in [-2, 2], top of the page is -z), y = height above the page surface.
//
//   fox    where the heroine stands (side = the page she stands on)
//   focus  the point the camera favours during the spread's hold
//   peak   the tallest any scenery may rise above the page. The camera's wide
//          framings keep [0, peak] in frame; scene authors must stay under it.
//
// When a spread lies flat open, world position ~= the same x and z with y
// raised by PAGE_SURFACE_Y (the page surface height); good enough for camera work.

export const SPREAD_LAYOUT = [
  { id: 'forest',   fox: { side: 'right', x:  1.15, z: 0.85 }, focus: [ 0.6, 0.7,  0.3], peak: 2.6 },
  { id: 'village',  fox: { side: 'left',  x: -1.2,  z: 0.95 }, focus: [-0.3, 0.8,  0.2], peak: 2.8 },
  { id: 'sea',      fox: { side: 'left',  x: -0.7,  z: 0.5  }, focus: [ 0.2, 0.7,  0.2], peak: 2.9 },
  { id: 'mountain', fox: { side: 'right', x:  0.7,  z: 0.7  }, focus: [ 0.3, 1.3, -0.2], peak: 3.2 },
  { id: 'night',    fox: { side: 'right', x:  0.9,  z: 0.9  }, focus: [ 0.4, 0.7,  0.4], peak: 2.6 },
];

/** Approximate world height of the page surface of a flat-open spread. */
export const PAGE_SURFACE_Y = 0.2;

/** Highest `peak` of any spread. */
export const MAX_PEAK = Math.max(...SPREAD_LAYOUT.map((s) => s.peak));

/** Approximate world position [x, y, z] of a spread-frame point on a flat-open spread. */
export function spreadToWorld(x, y, z) {
  return [x, y + PAGE_SURFACE_Y, z];
}

/** Approximate world position [x, y, z] of the fox's feet on spread k. */
export function foxWorld(k) {
  const f = SPREAD_LAYOUT[k].fox;
  return spreadToWorld(f.x, 0, f.z);
}

/** Approximate world position [x, y, z] of spread k's camera focus point. */
export function focusWorld(k) {
  const [x, y, z] = SPREAD_LAYOUT[k].focus;
  return spreadToWorld(x, y, z);
}
