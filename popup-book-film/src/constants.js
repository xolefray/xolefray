// World and book geometry. Pure data + tiny pure helpers; no three.js import.
//
// World: desk top is the plane y = 0. The book spine lies along world Z at
// x = 0, centred on z = 0. The camera sits on the +Z side looking toward -Z
// and down. 1 unit ~ 7 cm.

export const PAGE_W = 3.0;          // x extent of one page
export const PAGE_H = 4.0;          // z extent of one page
export const LEAF_T = 0.03;         // inner card leaf thickness
export const COVER_T = 0.07;        // cover board thickness
export const COVER_OVERHANG = 0.1;  // cover board extends past the pages (outer edge, top, bottom)
export const NUM_SPREADS = 5;
export const NUM_LEAVES = 6;        // 0 = front cover, 1..4 inner leaves, 5 = back cover (never moves)

/** Thickness of leaf j. */
export function leafThickness(j) {
  return j === 0 || j === NUM_LEAVES - 1 ? COVER_T : LEAF_T;
}

/** Width (x extent, measured from the spine) of leaf j. */
export function leafWidth(j) {
  return j === 0 || j === NUM_LEAVES - 1 ? PAGE_W + COVER_OVERHANG : PAGE_W;
}

/** Depth (z extent) of leaf j. */
export function leafDepth(j) {
  return j === 0 || j === NUM_LEAVES - 1 ? PAGE_H + 2 * COVER_OVERHANG : PAGE_H;
}

/** Bottom height of leaf j while it lies unturned on the right stack. */
export function leafBottomUnturned(j) {
  if (j === NUM_LEAVES - 1) return 0;                        // back cover on the desk
  if (j === 0) return COVER_T + (NUM_LEAVES - 2) * LEAF_T;  // closed front cover on top of the 4 inner leaves
  return COVER_T + (4 - j) * LEAF_T;
}

/** Bottom height of leaf j once turned onto the left stack. */
export function leafBottomTurned(j) {
  if (j === 0) return 0;
  return COVER_T + (j - 1) * LEAF_T;
}

// All leaves rotate about one fixed hinge line: x = 0, y = HINGE_Y, parallel to Z.
// Each leaf's slab sits at a fixed offset from that hinge, along its own local +Y,
// chosen so both rest positions (unturned / turned) match the stacking above
// exactly. Solving  hinge + off = bottomUnturned  and  hinge - off - T = bottomTurned
// gives the same hinge height for every leaf (0.13), so the stack turns like a
// rigid bound book and leaves never interpenetrate, even when all of them swing
// together during bookClose. The leaf's bottom/spine edge therefore moves smoothly
// with the turn from (0, bottomUnturned) to (0, bottomTurned + T).
export const HINGE_Y = (leafBottomUnturned(1) + leafBottomTurned(1) + LEAF_T) / 2;

/** Offset of leaf j's bottom face from the hinge, along the leaf's local +Y. */
export function leafOffset(j) {
  return leafBottomUnturned(j) - HINGE_Y;
}
