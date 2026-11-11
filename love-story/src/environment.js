/**
 * environment.js — the room the film is shot in.
 *
 * - Desk: a 40 × 40 dark-walnut top at y = 0. Its colour and roughness maps are painted
 *   procedurally on canvas (tileable flowing grain, glued-up boards, pores, colour drift) under a
 *   thin varnish clearcoat. The desk fades radially into the room colour — a wide, soft pool,
 *   because the open album is 7.2 across — and the room colour is also the fog colour and the
 *   backdrop's horizon colour, so no edge or horizon line ever shows.
 * - Room: an inverted sphere with a gradient shader: a very dark warm wall, a faint warm spill of
 *   the lamp high on the far wall, and an out-of-focus window to the back right. No night scene.
 * - Lights: a warm SpotLight "desk lamp" high on the left, moved toward the reader (z = 4) so
 *   upright pieces facing +Z are lit and shadows fall back-right (the ONLY shadow caster, 2048
 *   map; the shadow frustum covers the landscape spread, 7.2 × 3.0, pop-ups to ~2.4); a hemisphere
 *   fill; a front-right directional fill; a low directional from the right that stays at intensity
 *   0 (kept so the light count never changes). Only intensities and colours change.
 * - Dust motes: a few hundred soft additive points drifting in the lamp beam. The drift is a pure
 *   function of t in the vertex shader, and each mote only glows while it is inside the cone.
 *
 * Light, from the timeline (no hard-coded film times): the lamp ignites BEATS.lampOn → ~2.8 s
 * with a small flicker; warm level 1 until the proposal spread, which eases to a dimmer rosier
 * 0.85 across its opening turn, with a soft swell at BEATS.yes; the wedding spread eases to a
 * bright gold 1.15 across its opening turn; the room fades to near black across the end card.
 *
 * Everything in update(t) is a pure function of film time and allocates nothing. Physical light
 * units (decay 2), tuned for ACESFilmic at exposure 1.
 */
import * as THREE from 'three';
import { BEATS, END_CARD, SPREADS, seg, smoothstep, ease } from './timeline.js';
import { makeRng } from './util/rng.js';

// Moved toward the reader (z 1.5 → 4) so upright cards that face the reader are lit by the lamp
// instead of grazed by it (a +Z face had N·L ≈ 0.07 at the old spot; here it is about 0.2–0.5).
const LAMP_POS = new THREE.Vector3(-5, 9, 4);
const LAMP_AIM = new THREE.Vector3(0.3, 0.4, -0.3);
const LAMP_CANDELA = 400; // ≈ 3 lux on the pages at warm level 1
const LAMP_ANGLE = 0.82; // cone half-angle (rad); the open album sits well inside it
const LAMP_PENUMBRA = 0.75;
// The farthest album corner (pop-up ~2.4 at a page corner) is ~0.41 rad off this lamp's axis.
const SHADOW_HALF_ANGLE = 0.56;
const LAMP_ON = BEATS.lampOn;
const LAMP_FULL = BEATS.lampOn + 2.4; // filament fully warm 2.4 s after lampOn
// Fade to ~0 across the end card: fadeStart − 3 → end − 0.5 (the last few seconds).
const FADE_OUT = [END_CARD.fadeStart - 3, END_CARD.end - 0.5];
const PROPOSAL_LEVEL = 0.85;
const WEDDING_LEVEL = 1.15;
const YES_SWELL = 0.18; // added to the proposal level at BEATS.yes, then let go

const PROPOSAL = SPREADS.find((s) => s.id === 'proposal');
const WEDDING = SPREADS.find((s) => s.id === 'wedding');

const DESK_SIZE = 40;
const TILE_X = 12; // world units covered by one wood texture tile (grain runs along X)
const TILE_Z = 6;
// Inner radius clears the 7.2 × 3 album; the outer radius finishes before the plane's edge.
const FADE_RADII = [6.2, 13.2];

/** Room/fill "looks" blended by the schedule. Colours are display (sRGB) hex values. No night look. */
const LOOKS = {
  off: {
    top: '#070605', horizon: '#0a0807', spill: '#000000', window: '#1a1614', windowAmt: 0.12,
    hemiSky: '#c4b4a4', hemiGround: '#14100e', hemi: 0.06, fillColor: '#d8c4b0', fill: 0.08, dawn: 0,
  },
  day: {
    top: '#050404', horizon: '#0c0908', spill: '#2e1d12', window: '#3a3028', windowAmt: 0.22,
    hemiSky: '#ffe3c2', hemiGround: '#3a2417', hemi: 0.55, fillColor: '#ffd8b0', fill: 0.7, dawn: 0,
  },
  proposal: {
    top: '#0c080a', horizon: '#120c0e', spill: '#5c2c34', window: '#4a3034', windowAmt: 0.26,
    hemiSky: '#ffd2c8', hemiGround: '#3a221c', hemi: 0.5, fillColor: '#ffc8b8', fill: 0.62, dawn: 0,
  },
  wedding: {
    top: '#0e0b08', horizon: '#14110c', spill: '#6a481c', window: '#4a3c28', windowAmt: 0.3,
    hemiSky: '#ffe6c2', hemiGround: '#463218', hemi: 0.68, fillColor: '#ffe2b6', fill: 0.82, dawn: 0,
  },
  end: {
    top: '#010101', horizon: '#020202', spill: '#000000', window: '#050505', windowAmt: 0,
    hemiSky: '#ffe3c2', hemiGround: '#100e0c', hemi: 0, fillColor: '#ffd8b0', fill: 0, dawn: 0,
  },
};
const LOOK_COLORS = ['top', 'horizon', 'spill', 'window', 'hemiSky', 'hemiGround', 'fillColor'];
const LOOK_SCALARS = ['windowAmt', 'hemi', 'fill', 'dawn'];

const LAMP_AMBER = new THREE.Color('#ff8a3c'); // filament still warming
const LAMP_WARM = new THREE.Color('#ffd3a3'); // warm incandescent until the proposal spread
const LAMP_ROSE = new THREE.Color('#ffb0a2'); // proposal: rosier party light
const LAMP_YES = new THREE.Color('#ffd2b4'); // the soft swell when she says yes
const LAMP_GOLD = new THREE.Color('#ffe0a6'); // wedding: bright gold

export function createEnvironment({ scene, renderer }) {
  const looks = Object.fromEntries(
    Object.entries(LOOKS).map(([name, look]) => {
      const out = { ...look };
      for (const key of LOOK_COLORS) out[key] = new THREE.Color(look[key]);
      return [name, out];
    }),
  );
  const cur = { ...looks.day };
  for (const key of LOOK_COLORS) cur[key] = new THREE.Color();

  // ---------------------------------------------------------------- room colour, fog, backdrop
  const roomColor = new THREE.Color(looks.day.horizon);
  scene.background = roomColor;
  scene.fog = new THREE.Fog(roomColor.clone(), 18, 42);

  const sky = makeBackdrop();
  scene.add(sky.mesh);

  // ---------------------------------------------------------------------------------- desk
  const desk = makeDesk(renderer);
  scene.add(desk.mesh);

  // -------------------------------------------------------------------------------- lights
  const keyLight = new THREE.SpotLight(LAMP_WARM, 0, 0, LAMP_ANGLE, LAMP_PENUMBRA, 2);
  keyLight.name = 'desk-lamp';
  keyLight.position.copy(LAMP_POS);
  keyLight.target.position.copy(LAMP_AIM);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.near = 4;
  keyLight.shadow.camera.far = 22;
  keyLight.shadow.bias = -0.0002;
  keyLight.shadow.normalBias = 0.012;
  keyLight.shadow.focus = SHADOW_HALF_ANGLE / LAMP_ANGLE;
  scene.add(keyLight, keyLight.target);

  const hemi = new THREE.HemisphereLight(looks.day.hemiSky, looks.day.hemiGround, 0);
  hemi.name = 'room-fill';
  scene.add(hemi);

  // Front-right fill: a soft warm bounce, so faces turned toward the reader are never left dark.
  const fill = new THREE.DirectionalLight('#ffd8b0', 0);
  fill.name = 'front-fill';
  fill.position.set(6, 7, 7);
  scene.add(fill, fill.target);

  // Kept at intensity 0 for the whole film (no night, no dawn). Present so the light count is fixed.
  const sideLight = new THREE.DirectionalLight('#ffd0b0', 0);
  sideLight.name = 'side-fill';
  sideLight.position.set(9, 3, 2.5);
  scene.add(sideLight, sideLight.target);

  // --------------------------------------------------------------------------------- motes
  const motes = makeMotes();
  scene.add(motes.points);

  const lampDir = new THREE.Vector3();

  function blendLooks(warm, proposal, wedding, fade) {
    const { off, day, proposal: rose, wedding: gold, end } = looks;
    for (const key of LOOK_COLORS) {
      cur[key].copy(day[key]).lerp(rose[key], proposal).lerp(gold[key], wedding);
      cur[key].lerp(off[key], 1 - warm).lerp(end[key], 1 - fade);
    }
    for (const key of LOOK_SCALARS) {
      let v = day[key] + (rose[key] - day[key]) * proposal;
      v += (gold[key] - v) * wedding;
      v = off[key] + (v - off[key]) * warm;
      cur[key] = end[key] + (v - end[key]) * fade;
    }
  }

  /** 0..1 bump centred on BEATS.yes, inside the proposal spread, flat at the peak. */
  function yesSwell(t) {
    const spanOpen = PROPOSAL.close - PROPOSAL.open;
    const rise = spanOpen * 0.16;
    const fall = (PROPOSAL.close - BEATS.yes) * 0.72;
    const a = BEATS.yes - rise;
    const b = BEATS.yes + fall;
    if (t <= a || t >= b) return 0;
    return t < BEATS.yes ? smoothstep(a, BEATS.yes, t) : 1 - smoothstep(BEATS.yes, b, t);
  }

  function update(t) {
    const warm = ease.inOutSine(seg(t, LAMP_ON, LAMP_FULL));
    const fade = 1 - ease.inOutSine(seg(t, FADE_OUT[0], FADE_OUT[1]));
    // Moods ease across the page turn that opens the spread, and hold while it is open.
    const proposalIn = ease.inOutSine(seg(t, PROPOSAL.start, PROPOSAL.open));
    const weddingIn = ease.inOutSine(seg(t, WEDDING.start, WEDDING.open));
    const proposalW = proposalIn * (1 - weddingIn);
    const weddingW = weddingIn;
    const swell = yesSwell(t) * (1 - weddingW);
    const ign = lampIgnition(t);
    const mood = 1 + (PROPOSAL_LEVEL - 1) * proposalW + (WEDDING_LEVEL - 1) * weddingW + YES_SWELL * swell;
    const level = ign * mood * fade;

    keyLight.intensity = LAMP_CANDELA * level;
    keyLight.color.copy(LAMP_AMBER).lerp(LAMP_WARM, Math.sqrt(ign));
    keyLight.color.lerp(LAMP_ROSE, 0.72 * proposalW);
    keyLight.color.lerp(LAMP_YES, 0.45 * swell);
    keyLight.color.lerp(LAMP_GOLD, 0.78 * weddingW);

    blendLooks(warm, proposalW, weddingW, fade);
    hemi.color.copy(cur.hemiSky);
    hemi.groundColor.copy(cur.hemiGround);
    hemi.intensity = cur.hemi * (1 + 0.12 * swell);
    fill.color.copy(cur.fillColor).lerp(LAMP_YES, 0.28 * swell);
    fill.intensity = cur.fill * (1 + 0.14 * swell);
    sideLight.intensity = cur.dawn;

    // Room: background clear colour, fog and desk falloff all share the horizon colour.
    roomColor.copy(cur.horizon);
    scene.fog.color.copy(cur.horizon);
    sky.set(cur, level / WEDDING_LEVEL);
    desk.setEdge(cur.horizon);

    lampDir.subVectors(keyLight.target.position, keyLight.position).normalize();
    motes.set(t, level, keyLight, lampDir);
  }

  update(0);
  return { update, keyLight };
}

/**
 * Lamp level 0..1 over the ignition window LAMP_ON–LAMP_FULL: a first weak flash, a
 * short dip, then the filament warms up with a small decaying flutter. Exactly 0 before and 1 after.
 */
function lampIgnition(t) {
  const t0 = LAMP_ON;
  if (t <= t0) return 0;
  if (t >= LAMP_FULL) return 1;
  const u = seg(t, t0, LAMP_FULL);
  const ramp = ease.inOutSine(seg(t, t0 + 0.25, LAMP_FULL));
  const flash = 0.32 * smoothstep(t0, t0 + 0.06, t) * (1 - smoothstep(t0 + 0.12, t0 + 0.25, t));
  const flutter = 1 - 0.22 * (1 - u) * (0.5 + 0.5 * Math.sin(t * 41.0) * Math.sin(t * 17.3 + 1.1));
  return Math.min(1, Math.max(ramp, flash) * flutter);
}

// ------------------------------------------------------------------------------------ backdrop

function makeBackdrop() {
  const uniforms = {
    uTop: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uSpill: { value: new THREE.Color() },
    uWindow: { value: new THREE.Color() },
    uSpillDir: { value: new THREE.Vector3(-0.6, 0.45, -0.65).normalize() },
    uWindowDir: { value: new THREE.Vector3(0.5, 0.2, -1).normalize() },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vDir = wp.xyz - cameraPosition;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    // Colours arrive already in display (sRGB) space; the shader writes them unchanged.
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uHorizon, uSpill, uWindow;
      uniform vec3 uSpillDir, uWindowDir;
      varying vec3 vDir;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float box(vec2 p, vec2 halfSize, float blur) {
        vec2 q = abs(p) - halfSize;
        float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
        return 1.0 - smoothstep(-blur, blur, d);
      }
      void main() {
        vec3 d = normalize(vDir);
        float up = max(d.y, 0.0);
        float above = smoothstep(0.0, 0.35, d.y);
        vec3 col = mix(uHorizon, uTop, smoothstep(0.0, 0.75, up));
        // warm lamp light spilling onto the far wall, up and to the left
        float s = max(dot(d, uSpillDir), 0.0);
        col += uSpill * pow(s, 3.0) * above;
        // out-of-focus window: gnomonic projection around its centre direction
        vec3 right = normalize(cross(uWindowDir, vec3(0.0, 1.0, 0.0)));
        vec3 wup = cross(right, uWindowDir);
        float facing = dot(d, uWindowDir);
        if (facing > 0.2) {
          vec2 p = vec2(dot(d, right), dot(d, wup)) / facing;
          float pane = box(p, vec2(0.13, 0.19), 0.1);
          float mullion = box(p, vec2(0.01, 0.25), 0.04) + box(p, vec2(0.25, 0.01), 0.04);
          float halo = exp(-dot(p, p) * 7.0);
          col += uWindow * (pane * (1.0 - 0.5 * clamp(mullion, 0.0, 1.0)) * 0.45 + halo * 0.2) * above;
        }
        col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(55, 48, 24), material);
  mesh.name = 'room';
  mesh.renderOrder = -100;
  mesh.frustumCulled = false;
  return {
    mesh,
    set(look, lampGlow) {
      uniforms.uTop.value.copy(look.top).convertLinearToSRGB();
      uniforms.uHorizon.value.copy(look.horizon).convertLinearToSRGB();
      uniforms.uSpill.value.copy(look.spill).convertLinearToSRGB().multiplyScalar(lampGlow);
      uniforms.uWindow.value.copy(look.window).convertLinearToSRGB().multiplyScalar(look.windowAmt);
    },
  };
}

// ---------------------------------------------------------------------------------------- desk

function makeDesk(renderer) {
  const { color, roughness } = paintWalnut(7);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const repeat = [DESK_SIZE / TILE_X, DESK_SIZE / TILE_Z];
  const textures = [color, roughness].map((canvas) => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
    tex.anisotropy = aniso;
    return tex;
  });
  textures[0].colorSpace = THREE.SRGBColorSpace;

  const edge = { value: new THREE.Color() };
  const material = new THREE.MeshPhysicalMaterial({
    map: textures[0],
    roughnessMap: textures[1],
    roughness: 1,
    metalness: 0,
    clearcoat: 0.25,
    clearcoatRoughness: 0.32,
    specularIntensity: 0.6,
    dithering: true,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDeskEdge = edge;
    shader.uniforms.uDeskFade = { value: new THREE.Vector2(...FADE_RADII) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vDeskXZ;')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\n\tvDeskXZ = (modelMatrix * vec4(transformed, 1.0)).xz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec2 vDeskXZ;\nuniform vec3 uDeskEdge;\nuniform vec2 uDeskFade;',
      )
      .replace(
        '#include <fog_fragment>',
        [
          'float deskR = length((vDeskXZ - vec2(0.15, -0.05)) * vec2(0.72, 1.12));',
          'gl_FragColor.rgb = mix(gl_FragColor.rgb, uDeskEdge, smoothstep(uDeskFade.x, uDeskFade.y, deskR));',
          '#include <fog_fragment>',
        ].join('\n\t'),
      );
  };

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(DESK_SIZE, DESK_SIZE), material);
  mesh.name = 'desk';
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  return {
    mesh,
    setEdge(c) {
      edge.value.copy(c).convertLinearToSRGB();
    },
  };
}

/** Integer hash of a lattice point -> 0..7 gradient index. */
function hash8(ix, iy, seed) {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ seed;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) & 7;
}

const GX = [1, -1, 0, 0, 0.7071, -0.7071, 0.7071, -0.7071];
const GY = [0, 0, 1, -1, 0.7071, 0.7071, -0.7071, -0.7071];

/** 2D gradient noise, periodic with (px, py) lattice cells; x, y ≥ 0. Range ≈ [−0.7, 0.7]. */
function pnoise(x, y, px, py, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const x0 = xi % px;
  const y0 = yi % py;
  const x1 = x0 + 1 === px ? 0 : x0 + 1;
  const y1 = y0 + 1 === py ? 0 : y0 + 1;
  const a = hash8(x0, y0, seed);
  const b = hash8(x1, y0, seed);
  const c = hash8(x0, y1, seed);
  const d = hash8(x1, y1, seed);
  const n00 = GX[a] * fx + GY[a] * fy;
  const n10 = GX[b] * (fx - 1) + GY[b] * fy;
  const n01 = GX[c] * fx + GY[c] * (fy - 1);
  const n11 = GX[d] * (fx - 1) + GY[d] * (fy - 1);
  const sx = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const sy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const top = n00 + (n10 - n00) * sx;
  const bot = n01 + (n11 - n01) * sx;
  return top + (bot - top) * sy;
}

function sstep(a, b, x) {
  const u = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return u * u * (3 - 2 * u);
}

/** Walnut palette (display sRGB, 0..255): very dark, dark, mid, light streak. */
const WALNUT = [
  [30, 22, 18],
  [50, 37, 30],
  [75, 56, 44],
  [104, 79, 61],
];

/**
 * Paint a tileable dark-walnut colour map and matching roughness map (grain along +u = world X).
 * One tile = TILE_X × TILE_Z world units, made of three glued-up boards along v.
 */
function paintWalnut(seed) {
  const W = 2048;
  const H = 1024;
  const BOARDS = 3;
  const rng = makeRng(seed);
  const boards = Array.from({ length: BOARDS }, () => ({
    tone: rng.range(-1, 1),
    freq: rng.range(5, 7.5), // growth rings per world unit across the board
    offset: rng.range(0, 10),
    warp: rng.range(0.25, 0.4),
    arch: rng.range(0.1, 0.28),
    archPhase: rng.next(),
    seed: rng.int(1, 1 << 30),
  }));
  const boardUnits = TILE_Z / BOARDS;
  const s1 = rng.int(1, 1 << 30);
  const s2 = rng.int(1, 1 << 30);
  const s3 = rng.int(1, 1 << 30);
  const s4 = rng.int(1, 1 << 30);

  const colorCanvas = document.createElement('canvas');
  const roughCanvas = document.createElement('canvas');
  colorCanvas.width = roughCanvas.width = W;
  colorCanvas.height = roughCanvas.height = H;
  const cctx = colorCanvas.getContext('2d');
  const rctx = roughCanvas.getContext('2d');
  const cimg = cctx.createImageData(W, H);
  const rimg = rctx.createImageData(W, H);
  const cd = cimg.data;
  const rd = rimg.data;
  const TAU = Math.PI * 2;

  // Fields that vary slowly along the grain are sampled every STRIDE px per row and interpolated.
  const STRIDE = 4;
  const SW = W / STRIDE;
  const fields = Array.from({ length: 5 }, () => new Float32Array(SW + 1));
  const [fWarp, fContrast, fStreak, fFine, fDrift] = fields;

  for (let y = 0; y < H; y++) {
    const v = y / H;
    const bv = v * BOARDS;
    const bi = Math.floor(bv);
    const zl = bv - bi; // 0..1 across this board
    const board = boards[bi];
    const seamPx = Math.min(zl, 1 - zl) * (H / BOARDS);
    const seam = 1 - 0.4 * Math.exp(-seamPx * seamPx * 0.6);
    const archAcross = board.arch * (0.6 + 0.4 * Math.cos(TAU * zl));
    for (let xs = 0; xs <= SW; xs++) {
      const u = xs / SW;
      // long, slowly meandering ring lines with gentle cathedral arches
      const warp =
        pnoise(u * 2, v * 6, 2, 6, board.seed) +
        0.4 * pnoise(u * 5, v * 15, 5, 15, board.seed + 1) +
        0.12 * pnoise(u * 16, v * 40, 16, 40, board.seed + 2);
      fWarp[xs] = board.warp * warp + archAcross * Math.cos(TAU * (u * 2 + board.archPhase));
      fContrast[xs] = 0.55 + 0.6 * pnoise(u * 5, v * 9, 5, 9, s1);
      // fibre streaks and fine figure, stretched along the grain
      fStreak[xs] = pnoise(u * 6, v * 220, 6, 220, s2);
      fFine[xs] = pnoise(u * 48, v * 640, 48, 640, s3);
      fDrift[xs] = pnoise(u * 2, v * 4, 2, 4, s1 + 7) + 0.5 * pnoise(u * 4, v * 8, 4, 8, s2 + 7);
    }
    for (let x = 0; x < W; x++) {
      const xs = (x / STRIDE) | 0;
      const m = (x - xs * STRIDE) / STRIDE;
      const warp = fWarp[xs] + (fWarp[xs + 1] - fWarp[xs]) * m;
      const contrast = fContrast[xs] + (fContrast[xs + 1] - fContrast[xs]) * m;
      const streak = fStreak[xs] + (fStreak[xs + 1] - fStreak[xs]) * m;
      const fine = fFine[xs] + (fFine[xs + 1] - fFine[xs]) * m;
      const drift = fDrift[xs] + (fDrift[xs + 1] - fDrift[xs]) * m;
      const ring = (zl * boardUnits + warp) * board.freq + board.offset;
      const f = ring - Math.floor(ring);
      const late = sstep(0.5, 0.95, f) * (1 - sstep(0.95, 1, f));
      // pores: short dark dashes along the grain
      const pore = sstep(0.32, 0.55, pnoise((x / W) * 170, v * 1000, 170, 1000, s4));

      let tone = 0.5 + 0.4 * drift + 0.1 * board.tone + 0.26 * streak + 0.1 * fine;
      tone = tone < 0 ? 0 : tone > 1 ? 1 : tone;
      const ti = tone * 2.999;
      const i0 = Math.floor(ti);
      const k = ti - i0;
      const ca = WALNUT[i0];
      const cb = WALNUT[i0 + 1];
      const shade = (1 - 0.32 * late * contrast) * (1 - 0.45 * pore) * seam;
      const o = (y * W + x) * 4;
      cd[o] = (ca[0] + (cb[0] - ca[0]) * k) * shade;
      cd[o + 1] = (ca[1] + (cb[1] - ca[1]) * k) * shade;
      cd[o + 2] = (ca[2] + (cb[2] - ca[2]) * k) * shade;
      cd[o + 3] = 255;
      const rough = 0.4 + 0.28 * pore + 0.1 * late + 0.08 * fine + 0.3 * (1 - seam);
      rd[o] = rd[o + 1] = rd[o + 2] = Math.min(255, rough * 255);
      rd[o + 3] = 255;
    }
  }
  cctx.putImageData(cimg, 0, 0);
  rctx.putImageData(rimg, 0, 0);
  return { color: colorCanvas, roughness: roughCanvas };
}

// --------------------------------------------------------------------------------------- motes

const MOTE_COUNT = 320;

function makeMotes() {
  const rng = makeRng(4242);
  const positions = new Float32Array(MOTE_COUNT * 3);
  const rand = new Float32Array(MOTE_COUNT * 4);
  const axis = new THREE.Vector3().subVectors(LAMP_AIM, LAMP_POS).normalize();
  const p = new THREE.Vector3();
  const dir = new THREE.Vector3();
  for (let i = 0; i < MOTE_COUNT; i++) {
    // rejection-sample the volume above the book, keeping points inside the beam cone
    do {
      p.set(rng.range(-4.6, 4.4), rng.range(0.28, 4.4), rng.range(-2.0, 2.3));
    } while (dir.subVectors(p, LAMP_POS).normalize().dot(axis) < Math.cos(0.5));
    p.toArray(positions, i * 3);
    for (let j = 0; j < 4; j++) rand[i * 4 + j] = rng.next();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aRand', new THREE.BufferAttribute(rand, 4));

  const uniforms = {
    uTime: { value: 0 },
    uLevel: { value: 0 },
    uHeight: { value: 720 },
    uLampPos: { value: new THREE.Vector3() },
    uLampDir: { value: new THREE.Vector3() },
    uCone: { value: new THREE.Vector2() },
    uColor: { value: new THREE.Color() },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    vertexShader: /* glsl */ `
      uniform float uTime, uLevel, uHeight;
      uniform vec3 uLampPos, uLampDir;
      uniform vec2 uCone;
      attribute vec4 aRand;
      varying float vAlpha;
      void main() {
        float t = uTime;
        vec4 r = aRand * 6.2831853;
        vec3 p = position;
        p.x += 0.42 * sin(t * (0.031 + 0.02 * aRand.x) + r.y) + 0.1 * sin(t * (0.17 + 0.1 * aRand.z) + r.w);
        p.y += 0.3 * sin(t * (0.022 + 0.015 * aRand.y) + r.z) + 0.07 * sin(t * (0.21 + 0.1 * aRand.x) + r.x);
        p.z += 0.42 * sin(t * (0.027 + 0.02 * aRand.w) + r.x) + 0.1 * sin(t * (0.19 + 0.1 * aRand.y) + r.z);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float dist = max(-mv.z, 0.01);
        float worldSize = 0.018 + 0.03 * aRand.x * aRand.x;
        float px = worldSize * projectionMatrix[1][1] * 0.5 * uHeight / dist;
        gl_PointSize = clamp(px, 2.2, 22.0);
        float beam = smoothstep(uCone.x, uCone.y, dot(normalize(p - uLampPos), uLampDir));
        float glint = 0.45 + 0.55 * pow(0.5 + 0.5 * sin(t * (0.6 + 1.6 * aRand.z) + r.w * 7.0), 3.0);
        float nearFade = smoothstep(0.8, 2.5, dist);
        // energy-conserving-ish: big out-of-focus discs are dimmer per pixel
        vAlpha = uLevel * beam * glint * nearFade * min(1.0, 9.0 / (px * px + 2.0)) * (0.25 + 0.45 * aRand.y);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float r2 = dot(c, c) * 4.0;
        if (r2 > 1.0) discard;
        float a = (exp(-r2 * 3.0) - 0.05) * vAlpha;
        gl_FragColor = vec4(uColor, a);
      }`,
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'dust-motes';
  points.frustumCulled = false;
  points.renderOrder = 10;
  const size = new THREE.Vector2();
  points.onBeforeRender = (renderer) => {
    uniforms.uHeight.value = renderer.getDrawingBufferSize(size).y;
  };
  return {
    points,
    set(t, level, lamp, dir) {
      uniforms.uTime.value = t;
      uniforms.uLevel.value = Math.min(1, level) * 0.9;
      uniforms.uLampPos.value.copy(lamp.position);
      uniforms.uLampDir.value.copy(dir);
      uniforms.uCone.value.set(Math.cos(lamp.angle * 0.65), Math.cos(lamp.angle * 0.2));
      uniforms.uColor.value.copy(lamp.color).convertLinearToSRGB();
    },
  };
}
