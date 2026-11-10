/**
 * popup.js — the paper engineering of "Our Love Story" (engine of "The Little Paper Boat", with
 * the landscape album page 3.6 × 3.0 from dims.js): pop-up mechanisms posed in the
 * SPREAD FRAME (contract 3.1) as a pure function of the opening angle α. Pure math + Object3Ds;
 * it creates no meshes. Spread artists add artwork (paper.card, paper.splitCard …) to the mounts.
 *
 * ── Spread frame ─────────────────────────────────────────────────────────────────────────────
 *   gutter      = the Z axis; reader at +Z; α ∈ [0, π] (0 = closed, π = open flat).
 *   right page  = y = 0, x ∈ [0, PAGE_W = 3.6], z ∈ [−1.5, 1.5]; printed normal +Y. It never moves.
 *   left page   = half-plane through the Z axis in direction L(α) = (cos α, sin α, 0), printed
 *                 normal N(α) = (sin α, −cos α, 0). It is the open-flat left page (x ≤ 0, y = 0)
 *                 rotated about +Z by α − π, so "open-flat coordinates" fold rigidly with it.
 *   bisector    = the plane through the gutter at angle α/2: u(α) = (cos α/2, sin α/2, 0).
 *   `x` options = distance from the gutter measured ALONG that page (always ≥ 0, both sides).
 *
 * ── Mechanisms ── every factory returns { object, update(alpha), …mounts }.
 *   Add `object` to the spread group and call update(α) every frame (or wrap them in
 *   collection()). Mounts are Object3Ds whose position + quaternion are rewritten in spread-frame
 *   coordinates by update(); nothing allocates per frame; every pose is a pure function of α
 *   (slider: of α and u). Mount axes: +X reader's right, +Y up along the piece, +Z the printed
 *   face (toward the reader when erect). Surface mounts (onPage, slider, layer halves): +X/+Z
 *   along the surface (as seen open flat from above), +Y = surface normal.
 *
 *   vFold          gutter-straddling 90° V-fold facade (valley γ < π/2 or mountain γ > π/2)
 *   standUp        flat on one page, hinged perpendicular to the gutter, folds back or front
 *   onPage         flat on a page surface
 *   slider         flat on a page, travelling along a path by u ∈ [0, 1] (pull-tab / boat)
 *   floatingLayer  raised platform parallel to the pages on two parallelogram walls; its `frame`
 *                  is a whole sub-spread you can nest any mechanism on (raised facades etc.)
 *   vFoldLimits / standUpLimits   size budgets; rise(); collection()
 *
 * ── Folding rules (zero-thickness paper; respect R1–R3 and nothing ever collides) ───────────
 *   R1 Closed fit: at α = 0 everything lies flat; its closed FOOTPRINT must stay inside the page
 *      rectangle. Use vFoldLimits / standUpLimits / the floatingLayer rule (width/2 + height ≤ 3.6).
 *   R2 Own half: a piece that stays between its page and the bisector plane can never touch the
 *      other page or anything on it. vFold halves, floatingLayer (+ everything nested on it
 *      that obeys R2 there) and slider/onPage do this automatically; a standUp does when
 *      height ≤ x − width/2 (the distance of its gutter-side edge from the gutter).
 *   R3 Disjoint footprints: for every mechanism, its shadow on its own page at any α lies inside
 *      its closed footprint. So if, on each page, closed footprints of different mechanisms do
 *      not overlap, no two pieces ever intersect. (A vFold has one footprint on each page.)
 *   Thick props (boats, 3-D models) on onPage/slider mounts are outside this guarantee: shrink
 *   or hide them with rise() before the pages close on them.
 */
import * as THREE from 'three';
import { PAGE_D, PAGE_W } from './dims.js';

const PI = Math.PI;
/** The book page (BOOK.PAGE_W × PAGE_D = 3.6 × 3.0) as a rectangle x ∈ [0, w], z ∈ [z − d/2, z + d/2]. */
export const PAGE = Object.freeze({ w: PAGE_W, d: PAGE_D, z: 0 });
const EPS = 1e-9;

// Shared temporaries: update() never allocates.
const _p = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();

const clampAlpha = (a) => (a > 0 ? (a < PI ? a : PI) : 0); // NaN → 0

function mountGroup(name) {
  const g = new THREE.Group();
  g.name = name;
  return g;
}

function isLeft(side, who) {
  if (side !== 'left' && side !== 'right') throw new RangeError(`${who}: side must be 'left' or 'right'`);
  return side === 'left';
}

function warnFit(who, ok, detail) {
  if (!ok) console.warn(`popup.${who}: breaks the folding rules — ${detail}`);
}

/** Writes position p and orthonormal right-handed basis (X, Y, Z) to obj. */
function setPose(obj, p, X, Y, Z) {
  obj.position.copy(p);
  obj.quaternion.setFromRotationMatrix(_m.makeBasis(X, Y, Z));
}

/** Rotates v in place from open-flat coordinates onto the left page at α (about +Z by α − π). */
function foldLeft(v, ca, sa) {
  const { x, y } = v;
  v.x = -x * ca + y * sa;
  v.y = -x * sa - y * ca;
  return v;
}

/** Poses obj from the open-flat pose in _p/_x/_y/_z, folding it with the left page if `left`. */
function setPagePose(obj, left, alpha) {
  if (left) {
    const ca = Math.cos(alpha);
    const sa = Math.sin(alpha);
    foldLeft(_p, ca, sa);
    foldLeft(_x, ca, sa);
    foldLeft(_y, ca, sa);
    foldLeft(_z, ca, sa);
  }
  setPose(obj, _p, _x, _y, _z);
}

/**
 * Smooth 0..1 progress of α/π between a0 and a1 (smoothstep). Use it to grow/fade things that
 * are not paper mechanisms (props, glows) so they are gone before the pages close on them.
 * @param {number} alpha opening angle
 * @param {number} [a0=0.15] α/π where progress starts
 * @param {number} [a1=0.95] α/π where progress reaches 1
 */
export function rise(alpha, a0 = 0.15, a1 = 0.95) {
  const u = Math.min(1, Math.max(0, (alpha / PI - a0) / (a1 - a0)));
  return u * u * (3 - 2 * u);
}

/**
 * Size budget of a vFold so that, folded flat at α = 0, it stays inside a page rectangle (R1).
 * The closed footprint is the rectangle spanned from the crease foot (0, z0) by the glue line
 * (half-width w/2 along (sin γ, cos γ)) and the crease (height h along (|cos γ|, ∓sin γ)); it is
 * also the largest the shadow ever gets, so the budget holds for every α.
 *   valley (γ < π/2): crease folds toward −Z → height limited by the FAR edge (z0 − h sin γ ≥ −1.5)
 *   mountain (γ > π/2): crease folds toward +Z → height limited by the NEAR edge (z0 + h sin γ ≤ 1.5)
 *   both: glue end z0 + (w/2) cos γ inside [−1.5, 1.5] and outer reach (w/2) sin γ + h |cos γ| ≤ 3.6.
 * Width and height share the x budget, so pass the one you have fixed to get the other's maximum.
 * @param {object} o
 * @param {number} [o.z0=0] crease foot on the gutter
 * @param {number} [o.gamma=1.35] glue-line angle from +Z
 * @param {number} [o.width=0] total card width (both halves), if already chosen
 * @param {number} [o.height=0] card height, if already chosen
 * @param {number} [o.margin=0] keep this far inside the page edges
 * @param {{w:number,d:number,z:number}} [o.page] rectangle to fit (default: the book page;
 *   pass floatingLayer(...).page for a vFold nested on a layer)
 * @returns {{maxHeight:number, maxHalfWidth:number, fits:boolean}} maxHeight given `width`,
 *   maxHalfWidth given `height`, and whether (width, height) fits.
 */
export function vFoldLimits({ z0 = 0, gamma = 1.35, width = 0, height = 0, margin = 0, page = PAGE } = {}) {
  const sg = Math.sin(gamma);
  const cg = Math.cos(gamma);
  const acg = Math.abs(cg);
  const W = page.w - margin;
  const zLo = page.z - page.d / 2 + margin;
  const zHi = page.z + page.d / 2 - margin;
  const hw = width / 2;
  const zRoomH = (cg > 0 ? z0 - zLo : zHi - z0) / sg;
  const zRoomW = (cg > 0 ? zHi - z0 : zLo - z0) / cg;
  const maxHeight = Math.max(0, Math.min(zRoomH, (W - hw * sg) / acg));
  const maxHalfWidth = Math.max(0, Math.min(zRoomW, (W - height * acg) / sg));
  const fits = z0 >= zLo - EPS && z0 <= zHi + EPS && hw <= maxHalfWidth + EPS && height <= maxHeight + EPS;
  return { maxHeight, maxHalfWidth, fits };
}

/**
 * Gutter-straddling V-fold with a 90° card: a card folded along its vertical centre line
 * (the crease) whose two halves are glued to the pages along their bottom edges. The crease foot
 * is on the gutter at z = z0; the glue lines leave it at angle γ from +Z, one on each page:
 *   dR = sin γ·(1,0,0) + cos γ·(0,0,1)        dL = sin γ·L(α) + cos γ·(0,0,1)
 * Paper is rigid and the card angle between crease and bottom edge is 90°, so the crease is
 * perpendicular to both glue lines: c = normalize(dL × dR) (flipped for γ > π/2 so it points
 * up between the pages). Closed form, regular for every α ∈ [0, π] (no 0/0 at α = 0):
 *   c(α) = ( |cos γ| cos(α/2), |cos γ| sin(α/2), −sgn(cos γ) sin γ cos(α/2) ) / √(cos²γ + sin²γ cos²(α/2))
 * The crease always lies in the bisector plane, at α = π it is vertical (0, 1, 0).
 *   VALLEY  γ ∈ (0, π/2): glue lines angle toward the reader; open, the facade is a V opening
 *     toward the reader. Closing, the crease falls BACK (toward −Z), ending on the page along
 *     (cos γ, 0, −sin γ); halves end printed faces together (right half face-up on the right
 *     page, left half face-down on top of it). Use near the reader / middle.
 *   MOUNTAIN γ ∈ (π/2, π): glue lines angle away from the reader; open, the V's vertex points at
 *     the reader. Closing, the crease falls FORWARD (toward +Z) along (|cos γ|, 0, sin γ); halves
 *     end printed face down on their pages. Use for tall facades near the FAR edge.
 *   γ ≈ π/2 (|cos γ| < 0.05) is degenerate (a flat 180° facade cannot be a V-fold) and throws.
 * Timing: the crease's elevation over the right page is asin(|cos γ| sin(α/2)/n): γ near π/2 stays
 * low and snaps up at the end; γ ≈ π/4 or 3π/4 rises early and steadily (~35° at α = π/2).
 * Fit: see vFoldLimits (R1). Each half stays in its own half of the book (R2).
 * Mounts: origin at the crease foot, +Y along the crease, +Z = printed face (toward the reader
 * when erect). `right`: +X = dR, content at x ≥ 0. `left`: +X = −dL, content at x ≤ 0. Built for
 * paper.splitCard({ width, height }).right / .left (each half width/2 wide, bottom on y = 0).
 * @param {object} o
 * @param {number} [o.z0=0] crease foot z on the gutter
 * @param {number} [o.gamma=1.35] glue-line angle from +Z, in (0, π) away from π/2
 * @param {number} [o.width] total card width (optional; only checked against vFoldLimits)
 * @param {number} [o.height] card height (optional; only checked against vFoldLimits)
 * @param {{w:number,d:number,z:number}} [o.page] rectangle it sits on, for that check (default:
 *   the book page; pass layer.page when nesting on a floatingLayer)
 * @returns {{object:THREE.Group, left:THREE.Group, right:THREE.Group, crease:THREE.Vector3,
 *   update(alpha:number):void}} `crease` is the current unit crease direction.
 */
export function vFold({ z0 = 0, gamma = 1.35, width, height, page = PAGE } = {}) {
  const sg = Math.sin(gamma);
  const cg = Math.cos(gamma);
  if (!(gamma > 0.05 && gamma < PI - 0.05) || Math.abs(cg) < 0.05) {
    throw new RangeError(`popup.vFold: gamma ${gamma} must be in (0.05, π − 0.05) and |cos gamma| ≥ 0.05`);
  }
  if (width !== undefined && height !== undefined) {
    const lim = vFoldLimits({ z0, gamma, width, height, page });
    warnFit('vFold', lim.fits, `z0 ${z0}, gamma ${gamma}: ${width}×${height} does not fit closed ` +
      `(maxHeight ${lim.maxHeight.toFixed(2)}, maxHalfWidth ${lim.maxHalfWidth.toFixed(2)})`);
  }
  const acg = Math.abs(cg);
  const sgn = Math.sign(cg);
  const object = mountGroup('vFold');
  const left = mountGroup('vFold.left');
  const right = mountGroup('vFold.right');
  object.add(left, right);
  const crease = new THREE.Vector3(0, 1, 0);

  const mech = {
    object,
    left,
    right,
    crease,
    update(alpha) {
      const a = clampAlpha(alpha);
      const ch = Math.cos(a / 2);
      const n = Math.sqrt(cg * cg + sg * sg * ch * ch);
      crease.set((acg * ch) / n, (acg * Math.sin(a / 2)) / n, (-sgn * sg * ch) / n);
      _p.set(0, 0, z0);
      _x.set(sg, 0, cg); // dR
      setPose(right, _p, _x, crease, _z.crossVectors(_x, crease));
      _x.set(-sg * Math.cos(a), -sg * Math.sin(a), -cg); // −dL
      setPose(left, _p, _x, crease, _z.crossVectors(_x, crease));
    },
  };
  mech.update(PI);
  return mech;
}

/**
 * Size budget of a standUp (R1 + R2).
 * @param {object} o
 * @param {number} o.x hinge centre distance from the gutter (along its page)
 * @param {number} [o.z=0] hinge z
 * @param {number} [o.width=0] card width (centred on the hinge)
 * @param {'back'|'front'} [o.fold='back'] which way it lies when closed
 * @param {number} [o.margin=0] keep this far inside the page edges
 * @param {{w:number,d:number,z:number}} [o.page] rectangle (default book page; or layer.page)
 * @returns {{maxHeight:number, maxHeightLoose:number, maxWidth:number}}
 *   maxHeight: R1 + R2 (stays in its own half: never touches the other page or its pieces);
 *   maxHeightLoose: R1 + "never pierces the opposite page" only (may cross the bisector, so the
 *   facing page must be bare in that region); maxWidth: widest base that stays on the page.
 */
export function standUpLimits({ x, z = 0, width = 0, fold = 'back', margin = 0, page = PAGE }) {
  const edge = x - width / 2;
  const zRoom = fold === 'front' ? page.z + page.d / 2 - margin - z : z - (page.z - page.d / 2 + margin);
  return {
    maxHeight: Math.max(0, Math.min(zRoom, edge)),
    maxHeightLoose: Math.max(0, Math.min(zRoom, 2 * edge)),
    maxWidth: 2 * Math.max(0, Math.min(x, page.w - margin - x)),
  };
}

/**
 * A flat standing on ONE page, hinged along a line perpendicular to the gutter (its bottom edge),
 * centred at distance x from the gutter at gutter coordinate z. Stand angle β = α/2 (a
 * kinematic idealisation of a strap-driven flap): flat at α = 0, 45° at α = π/2, vertical
 * facing the reader at α = π.
 *   fold 'back'  (default): lies toward −Z when closed, printed face up. Closed footprint
 *                x ± width/2, z − height … z.
 *   fold 'front': lies toward +Z when closed, printed face down. Footprint z … z + height.
 *                Use it near the far edge for tall pieces.
 * Why β = α/2 never pierces: in the cross-section (the hinge is ⟂ the gutter, so z drops out)
 * the piece is the box [e, e + width] × [0, h·sin β], e = x − width/2. Its worst point
 * (e, h sin(α/2)) has polar angle θ with tan θ = h sin(α/2)/e. Inside the book means θ ≤ α:
 * for α ≥ π/2 always; for α < π/2 it needs h cos α ≤ 2e cos(α/2), true for all α iff h ≤ 2e.
 * Staying in its own half (θ ≤ α/2, rule R2) needs h sin(α/2)/e ≤ tan(α/2), true iff h ≤ e.
 *   RULE: height ≤ x − width/2  (and the R1 z room) — see standUpLimits. Up to 2·(x − width/2)
 *   is allowed only where the facing page is bare. width/height are optional and only used to
 *   warn at build time when even the loose limit is broken.
 * Mount: origin = hinge centre on the page, +X along the hinge (reader's right), +Y up the piece,
 * +Z printed face. Built for paper.card({ anchor: 'bottom-center' }).
 * @param {object} o
 * @param {'left'|'right'} [o.side='right']
 * @param {number} [o.x=1] hinge centre distance from the gutter
 * @param {number} [o.z=0] hinge z
 * @param {'back'|'front'} [o.fold='back']
 * @param {number} [o.width] card width (optional check)
 * @param {number} [o.height] card height (optional check)
 * @param {{w:number,d:number,z:number}} [o.page] rectangle it sits on, for that check
 * @returns {{object:THREE.Group, mount:THREE.Group, update(alpha:number):void}}
 */
export function standUp({ side = 'right', x = 1, z = 0, fold = 'back', width, height, page = PAGE } = {}) {
  const left = isLeft(side, 'standUp');
  if (fold !== 'back' && fold !== 'front') throw new RangeError("popup.standUp: fold must be 'back' or 'front'");
  if (height !== undefined) {
    const lim = standUpLimits({ x, z, width: width ?? 0, fold, page });
    warnFit('standUp', height <= lim.maxHeightLoose + EPS && (width ?? 0) <= lim.maxWidth + EPS,
      `${side} x ${x} z ${z} fold ${fold}: ${width ?? 0}×${height} exceeds maxHeightLoose ` +
      `${lim.maxHeightLoose.toFixed(2)} / maxWidth ${lim.maxWidth.toFixed(2)} (pierces or leaves the page)`);
  }
  const f = fold === 'front' ? 1 : -1; // z direction the piece lies in when flat
  const px = left ? -x : x;
  const object = mountGroup('standUp');
  const mount = mountGroup('standUp.mount');
  object.add(mount);
  const mech = {
    object,
    mount,
    update(alpha) {
      const a = clampAlpha(alpha);
      const cb = Math.cos(a / 2);
      const sb = Math.sin(a / 2);
      _p.set(px, 0, z);
      _x.set(1, 0, 0);
      _y.set(0, sb, f * cb);
      _z.set(0, -f * cb, sb);
      setPagePose(mount, left, a);
    },
  };
  mech.update(PI);
  return mech;
}

/**
 * A mount lying on a page surface (follows the left page as it turns). Mount: +X/+Z along the
 * page as seen open flat from above (+X = reader's right, +Z = toward the reader), +Y = page
 * normal, origin `lift` above the page at distance x from the gutter. For printed overlays,
 * slots, tracks: lay paper.card in it rotated −π/2 about X (printed face up, top toward −Z).
 * @param {object} o
 * @param {'left'|'right'} [o.side='right']
 * @param {number} [o.x=1] distance from the gutter
 * @param {number} [o.z=0]
 * @param {number} [o.lift=0.002] height above the page (avoids z-fighting)
 * @returns {{object:THREE.Group, mount:THREE.Group, update(alpha:number):void}}
 */
export function onPage({ side = 'right', x = 1, z = 0, lift = 0.002 } = {}) {
  const left = isLeft(side, 'onPage');
  const px = left ? -x : x;
  const object = mountGroup('onPage');
  const mount = mountGroup('onPage.mount');
  object.add(mount);
  const mech = {
    object,
    mount,
    update(alpha) {
      _p.set(px, lift, z);
      _x.set(1, 0, 0);
      _y.set(0, 1, 0);
      _z.set(0, 0, 1);
      setPagePose(mount, left, clampAlpha(alpha));
    },
  };
  mech.update(PI);
  return mech;
}

const SLIDER_SAMPLES = 256;

/**
 * Pull-tab helper: a surface mount that travels along a path on the page(s) by an arc-length
 * parameter u ∈ [0, 1] (constant speed for linear u). Mount: origin on the path `lift` above
 * the page, +X = direction of travel (paper.boat's bow), +Y = page normal, +Z = X × Y.
 *   side 'right' | 'left': path points [x, z] with x = distance from the gutter on that page.
 *   side 'spread': points [X, z] in open-flat spread coordinates (X < 0 = left page); the path
 *     may cross the gutter — the mount rides whichever page it is on (with α < π its heading
 *     kinks at the gutter, so cross it while the spread is open).
 * The path is a centripetal Catmull-Rom curve through the points (`smooth: false` = polyline
 * with a constant heading on each segment).
 * @param {object} o
 * @param {'left'|'right'|'spread'} [o.side='right']
 * @param {Array<[number, number]>} o.path at least two points
 * @param {number} [o.lift=0.002]
 * @param {boolean} [o.smooth=true]
 * @param {number} [o.u=0] initial parameter
 * @returns {{object:THREE.Group, mount:THREE.Group, u:number, length:number,
 *   setU(u:number):void, update(alpha:number, u?:number):void}} pose = f(α, u); setU re-poses
 *   at the last α; `length` = path length in spread units (speed = length · du/dt).
 */
export function slider({ side = 'right', path, lift = 0.002, smooth = true, u = 0 } = {}) {
  if (!Array.isArray(path) || path.length < 2) throw new RangeError('popup.slider: path needs at least two [x, z] points');
  const spread = side === 'spread';
  const leftPage = !spread && isLeft(side, 'slider');
  const pts = path.map(([x, z]) => new THREE.Vector3(leftPage ? -x : x, 0, z));
  const curved = smooth && pts.length > 2;
  const samples = curved ? new THREE.CatmullRomCurve3(pts, false, 'centripetal').getPoints(SLIDER_SAMPLES) : pts;
  const n = samples.length;
  const X = new Float64Array(n);
  const Z = new Float64Array(n);
  const cum = new Float64Array(n);
  const SX = new Float64Array(n); // segment i → i+1 direction (last entry repeats)
  const SZ = new Float64Array(n);
  const TX = new Float64Array(n); // vertex tangents (average of adjacent segments)
  const TZ = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    X[i] = samples[i].x;
    Z[i] = samples[i].z;
  }
  for (let i = 0; i < n - 1; i++) {
    const dx = X[i + 1] - X[i];
    const dz = Z[i + 1] - Z[i];
    const len = Math.hypot(dx, dz);
    cum[i + 1] = cum[i] + len;
    SX[i] = len > EPS ? dx / len : i > 0 ? SX[i - 1] : 1;
    SZ[i] = len > EPS ? dz / len : i > 0 ? SZ[i - 1] : 0;
  }
  SX[n - 1] = SX[n - 2];
  SZ[n - 1] = SZ[n - 2];
  for (let i = 0; i < n; i++) {
    const j = i > 0 ? i - 1 : 0;
    const tx = SX[j] + SX[i];
    const tz = SZ[j] + SZ[i];
    const len = Math.hypot(tx, tz);
    TX[i] = len > EPS ? tx / len : SX[i];
    TZ[i] = len > EPS ? tz / len : SZ[i];
  }
  const total = cum[n - 1];
  const object = mountGroup('slider');
  const mount = mountGroup('slider.mount');
  object.add(mount);
  let lastAlpha = PI;

  const mech = {
    object,
    mount,
    u: Math.min(1, Math.max(0, u)),
    length: total,
    setU(v) {
      mech.u = v > 0 ? (v < 1 ? v : 1) : 0;
      mech.update(lastAlpha);
    },
    update(alpha, v) {
      if (v !== undefined) mech.u = v > 0 ? (v < 1 ? v : 1) : 0;
      const a = clampAlpha(alpha);
      lastAlpha = a;
      const s = mech.u * total;
      let lo = 0;
      let hi = n - 2;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (cum[mid] <= s) lo = mid;
        else hi = mid - 1;
      }
      const seg = cum[lo + 1] - cum[lo];
      const f = seg > EPS ? Math.min(1, (s - cum[lo]) / seg) : 0;
      const px = X[lo] + (X[lo + 1] - X[lo]) * f;
      const pz = Z[lo] + (Z[lo + 1] - Z[lo]) * f;
      let tx = SX[lo];
      let tz = SZ[lo];
      if (curved) {
        tx = TX[lo] + (TX[lo + 1] - TX[lo]) * f;
        tz = TZ[lo] + (TZ[lo + 1] - TZ[lo]) * f;
        const len = Math.hypot(tx, tz);
        tx = len > EPS ? tx / len : SX[lo];
        tz = len > EPS ? tz / len : SZ[lo];
      }
      _p.set(px, lift, pz);
      _x.set(tx, 0, tz);
      _y.set(0, 1, 0);
      _z.set(-tz, 0, tx);
      setPagePose(mount, spread ? px < 0 : leftPage, a);
    },
  };
  mech.update(PI);
  return mech;
}

/**
 * Floating layer (classic 180° "floating plane"): a platform parallel to the pages, raised
 * `height` above them when open, with a centre fold over the gutter. Each half rests on a support
 * wall glued to its page along a line parallel to the gutter at distance width/2, and attached to
 * the layer's outer edge. Page, wall, layer half and the (virtual) gutter→fold segment form a
 * parallelogram, so the walls stay parallel to the bisector u(α) and the layer halves stay
 * parallel to their pages: the layer is exactly the spread translated by F(α) = height·u(α).
 * (Like the real thing, the hinge chain itself has slack — it could rack sideways — so this is its
 * symmetric design pose, the one both pages pull it into; every piece keeps its true shape.)
 *   open (α = π): walls vertical, layer flat at y = height, x ∈ [−width/2, width/2].
 *   closed (α = 0): walls fall outward (outer face on the page), everything lies in
 *     x ∈ [0, width/2 + height] on each page.  RULE (R1): width/2 + height ≤ 3.6 and
 *     |z| + depth/2 ≤ 1.5; the closed footprint for R3 is x ∈ [0, width/2 + height] ×
 *     z ± depth/2 on BOTH pages. Everything stays in its own half (R2).
 * Nesting: `frame` is an Object3D at F(α) with no rotation — a complete sub-spread whose pages are
 * the layer halves (`page` = its rectangle for the *Limits helpers). layer.add(mech) puts any
 * mechanism on it (e.g. a vFold → a facade facing the reader that floats above the gutter);
 * layer.update(α) updates them too. Nested pieces follow R1–R3 relative to the layer.
 * Mounts: `right`/`left` = surface mounts on the layer halves (origin at the centre fold, at z;
 * axes like onPage). `supports.right`/`.left` = the walls: origin at the glue line centre, +Y up
 * the wall (= u), +Z the wall's OUTER face (away from the gutter when open), +X along the gutter
 * (reader's right when facing that face); wall content spans x ± depth/2, y ∈ [0, height].
 * @param {object} o
 * @param {number} [o.z=0] centre of the layer along the gutter
 * @param {number} o.width total layer width (each half and each wall offset = width/2)
 * @param {number} o.height float height when open (= wall height)
 * @param {number} o.depth layer and wall extent along the gutter
 * @param {{w:number,d:number,z:number}} [o.page] rectangle it sits on, for the build-time check
 * @returns {{object:THREE.Group, frame:THREE.Group, left:THREE.Group, right:THREE.Group,
 *   supports:{left:THREE.Group, right:THREE.Group}, page:{w:number,d:number,z:number},
 *   add(...mechs):object, update(alpha:number):void}}
 */
export function floatingLayer({ z = 0, width, height, depth, page = PAGE } = {}) {
  if (!(width > 0 && height > 0 && depth > 0)) throw new RangeError('popup.floatingLayer: width, height, depth must be > 0');
  const b = width / 2;
  const H = height;
  const zOff = Math.abs(z - page.z) + depth / 2;
  warnFit('floatingLayer', b + H <= page.w + EPS && zOff <= page.d / 2 + EPS,
    `width/2 + height = ${(b + H).toFixed(2)} (≤ ${page.w}), |z| + depth/2 = ${zOff.toFixed(2)} (≤ ${page.d / 2})`);
  const object = mountGroup('floatingLayer');
  const frame = mountGroup('floatingLayer.frame');
  const right = mountGroup('floatingLayer.right');
  const left = mountGroup('floatingLayer.left');
  const supports = { right: mountGroup('floatingLayer.support.right'), left: mountGroup('floatingLayer.support.left') };
  object.add(frame, right, left, supports.right, supports.left);
  const nested = [];
  let lastAlpha = PI;

  const mech = {
    object,
    frame,
    left,
    right,
    supports,
    page: Object.freeze({ w: b, d: depth, z }),
    add(...mechs) {
      for (const m of mechs) {
        frame.add(m.object);
        nested.push(m);
        m.update(lastAlpha);
      }
      return mech;
    },
    update(alpha) {
      const a = clampAlpha(alpha);
      lastAlpha = a;
      const ch = Math.cos(a / 2);
      const sh = Math.sin(a / 2);
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      frame.position.set(H * ch, H * sh, 0);
      // Layer halves: origin at the centre fold F, parallel to their pages.
      _p.set(H * ch, H * sh, z);
      _x.set(1, 0, 0);
      _y.set(0, 1, 0);
      _z.set(0, 0, 1);
      setPose(right, _p, _x, _y, _z);
      setPose(left, _p, foldLeft(_x, ca, sa), foldLeft(_y, ca, sa), foldLeft(_z, ca, sa));
      // Support walls: along u from their glue lines.
      _y.set(ch, sh, 0);
      _p.set(b, 0, z);
      _x.set(0, 0, -1);
      _z.set(sh, -ch, 0);
      setPose(supports.right, _p, _x, _y, _z);
      _p.set(b * ca, b * sa, z);
      _x.set(0, 0, 1);
      _z.set(-sh, ch, 0);
      setPose(supports.left, _p, _x, _y, _z);
      for (let i = 0; i < nested.length; i++) nested[i].update(a);
    },
  };
  mech.update(PI);
  return mech;
}

/**
 * Groups mechanisms: adopts each mech.object that has no parent yet (objects already nested,
 * e.g. on a floatingLayer frame, stay where they are) and updates all of them.
 * @param {Array<{object:THREE.Object3D, update(alpha:number):void}>} mechs
 * @returns {{object:THREE.Group, update(alpha:number):void}}
 */
export function collection(mechs) {
  const object = mountGroup('popup.collection');
  for (const m of mechs) if (!m.object.parent) object.add(m.object);
  return {
    object,
    update(alpha) {
      for (let i = 0; i < mechs.length; i++) mechs[i].update(alpha);
    },
  };
}
