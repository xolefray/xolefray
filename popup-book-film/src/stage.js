// The stage: a warm wooden desk falling off into darkness, a few quiet props,
// dust in the light, and ALL the film's lights except the fox's lantern.
//
// Lights (see ARCHITECTURE.md "Stage lights"):
//   key   DirectionalLight, the ONLY shadow caster. Day: warm, from the upper
//         left-front. Night (state.night): cool moonlight from higher up.
//   sky   HemisphereLight: soft cool-from-above / warm-from-below fill.
//   fill  DirectionalLight, cool, from the right-front (no shadows).
// Everything is a pure function of `state` (determinism rule).
import * as THREE from 'three';
import { lerp, rng, smoothstep } from './util.js';

// Shadow-covered volume (world): the open book, its pop-ups and the desk props.
const SHADOW_BOX = { x0: -4.6, x1: 4.6, y0: 0, y1: 3.5, z0: -3.0, z1: 3.0 };

const DAY = {
  keyDir: [-5.5, 9.0, 3.5], keyColor: 0xffd7a3, key: 3.0,
  skyColor: 0xd3defa, groundColor: 0x5a3e2a, sky: 0.55,
  fillDir: [6, 3.5, 6], fillColor: 0xa9c1ff, fill: 0.5,
  bg: 0x150f0c, vigFloor: 0.05, vigR: 13.5, exposure: 1.0,
  dust: 1.0, dustColor: 0xffe2b0,
};
const NIGHT = {
  keyDir: [-3.0, 10, 3.5], keyColor: 0xb4c6dc, key: 1.0,
  skyColor: 0x5a72a0, groundColor: 0x1a1a2a, sky: 0.7,
  fillDir: [3, 2.2, 8], fillColor: 0xa6bad0, fill: 1.4,
  bg: 0x06080f, vigFloor: 0.03, vigR: 11.5, exposure: 1.0,
  dust: 0.35, dustColor: 0xb8c8ff,
};

// --- seeded value noise (for the wood) ---------------------------------------
function makeNoise(seed) {
  const r = rng(seed);
  const tbl = new Float32Array(512);
  for (let i = 0; i < 512; i++) tbl[i] = r();
  const perm = new Uint16Array(512);
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const h = (x, y) => tbl[perm[(x & 255) + perm[y & 255]]];
  return function noise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    let fx = x - ix, fy = y - iy;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1), d = h(ix + 1, iy + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

/** Tileable plank wood: PL long boards across v, each with one butt joint along u. */
function drawWood(size, seed) {
  const r = rng(seed);
  const noise = makeNoise(seed + 1);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const id = g.createImageData(size, size);
  const d = id.data;
  const PL = 5;
  const planks = [];
  for (let p = 0; p < PL; p++) {
    planks.push({
      joint: r(), tone: 0.9 + r() * 0.18, warm: (r() - 0.5) * 0.1,
      lines: 26 + r() * 14, off: r() * 100, off2: r() * 100,
    });
  }
  const light = [146, 98, 60], dark = [80, 49, 29];
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    const p = Math.min(PL - 1, Math.floor(v * PL));
    const pv = v * PL - p;
    const P = planks[p];
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      let uu = u - P.joint; if (uu < 0) uu += 1;            // 0..1 along the board, joint at 0
      const warp = 1.1 * noise(uu * 4 + P.off, pv * 1.4 + P.off) + 0.22 * noise(uu * 18 + P.off, pv * 5 + P.off);
      const arch = noise(uu * 1.6 + P.off2, pv * 0.9 + P.off) * 7;  // big cathedral meanders
      const gpos = pv * P.lines + warp * 3.0 + arch;
      const ring = 0.5 + 0.5 * Math.sin(gpos * Math.PI * 2);
      const late = ring * ring * ring * ring * ring * ring    // thin darker late-wood lines,
        * (0.3 + 1.1 * noise(uu * 6 + P.off, Math.floor(gpos) * 1.7)); // fading in and out along the board
      const fine = noise(uu * 700 + P.off2, pv * 90);        // pores
      const streak = noise(uu * 2.5 + P.off2, pv * 14 + P.off);   // long colour streaks along the board
      let k = 0.26 + 0.26 * late + 0.16 * noise(uu * 3 + P.off2, pv * 2) + 0.22 * streak + 0.1 * fine;
      k = Math.min(1, Math.max(0, k));
      const R = lerp(light[0], dark[0], k) * P.tone * (1 + P.warm);
      const G = lerp(light[1], dark[1], k) * P.tone;
      const B = lerp(light[2], dark[2], k) * P.tone * (1 - P.warm);
      // plank seams (long edges) and the butt joint
      const seam = Math.min(pv, 1 - pv) * size / PL;         // px to the long edge
      const jd = Math.min(uu, 1 - uu) * size;
      let m = 1;
      if (seam < 1.0 || jd < 0.8) m = 0.5;
      else if (seam < 2.0 || jd < 1.6) m = 0.86;
      const i = (y * size + x) * 4;
      d[i] = R * m; d[i + 1] = G * m; d[i + 2] = B * m; d[i + 3] = 255;
    }
  }
  g.putImageData(id, 0, 0);
  return c;
}

function dotSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 32, 32);
  return c;
}

// --- props --------------------------------------------------------------------

function makePencil() {
  const grp = new THREE.Group();
  grp.name = 'pencil';
  const R = 0.06, L = 2.3;
  const paint = new THREE.MeshStandardMaterial({ color: 0x2f5d50, roughness: 0.55 });
  const wood = new THREE.MeshStandardMaterial({ color: 0xd9b98c, roughness: 0.85 });
  const lead = new THREE.MeshStandardMaterial({ color: 0x2b2b2e, roughness: 0.45, metalness: 0.2 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc19a4c, roughness: 0.4, metalness: 0.35 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0xd88f84, roughness: 0.9 });
  const along = (geo) => { geo.rotateZ(Math.PI / 2); return geo; }; // axis along +x, a flat hex face down
  const body = new THREE.Mesh(along(new THREE.CylinderGeometry(R, R, L, 6)), paint);
  const tipL = 0.36;
  const cone = new THREE.Mesh(along(new THREE.CylinderGeometry(0.018, R * 0.98, tipL, 6)), wood);
  cone.position.x = L / 2 + tipL / 2;
  const leadTip = new THREE.Mesh(along(new THREE.CylinderGeometry(0.001, 0.018, 0.07, 8)), lead);
  leadTip.position.x = L / 2 + tipL + 0.035;
  const fer = new THREE.Mesh(along(new THREE.CylinderGeometry(R * 1.04, R * 1.04, 0.16, 12)), brass);
  fer.position.x = -L / 2 - 0.08;
  const er = new THREE.Mesh(along(new THREE.CylinderGeometry(R * 0.98, R * 0.98, 0.14, 12)), rubber);
  er.position.x = -L / 2 - 0.23;
  for (const m of [body, cone, leadTip, fer, er]) { m.castShadow = true; m.receiveShadow = true; grp.add(m); }
  grp.position.y = R * Math.cos(Math.PI / 6); // resting on a flat face
  return grp;
}

function makeScraps(seed) {
  const r = rng(seed);
  const grp = new THREE.Group();
  grp.name = 'paper-scraps';
  const cols = [0xe07a2e, 0x2f6f63, 0xf1e8d2];
  const spots = [[-4.35, -1.5, 0.4], [-4.1, -2.6, 0.32], [-4.5, -0.5, 0.28]];
  spots.forEach(([x, z, s], i) => {
    const sh = new THREE.Shape();
    const n = 5 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + r() * 0.5;
      const rr = s * (0.55 + r() * 0.5) * (k % 2 ? 1 : 0.7);
      const px = Math.cos(a) * rr * 1.4, py = Math.sin(a) * rr * 0.8;
      if (k === 0) sh.moveTo(px, py); else sh.lineTo(px, py);
    }
    sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, [
      new THREE.MeshStandardMaterial({ color: cols[i % cols.length], roughness: 0.95 }),
      new THREE.MeshStandardMaterial({ color: 0xf6efdf, roughness: 0.95 }),
    ]);
    mesh.position.set(x, 0.0015 + i * 0.013, z);
    mesh.rotation.y = r() * Math.PI * 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    grp.add(mesh);
  });
  return grp;
}

// --------------------------------------------------------------------------------

export function createStage(ctx) {
  const { scene, renderer } = ctx;
  const group = new THREE.Group();
  group.name = 'stage';

  // --- desk ---
  const TILE = 12;     // world units per wood texture tile
  const DESK = 120;
  const woodTex = new THREE.CanvasTexture(drawWood(1024, 515));
  woodTex.colorSpace = THREE.SRGBColorSpace;
  woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping;
  woodTex.repeat.set(DESK / TILE, DESK / TILE);
  // Software GL pays heavily for texture taps on this full-frame surface:
  // nearest-mip filtering and 2x anisotropy keep it affordable.
  woodTex.minFilter = THREE.LinearMipmapNearestFilter;
  woodTex.anisotropy = Math.min(2, renderer.capabilities.getMaxAnisotropy());
  // Lambert: the desk fills most of the frame, so it gets the cheapest lit shader.
  const deskMat = new THREE.MeshLambertMaterial({ map: woodTex });
  // Pool of light: darken the desk away from the book (before tone mapping).
  const uVig = { value: new THREE.Vector4(-0.4, 0.2, 1.25, DAY.vigR) }; // centre x,z; z-stretch; outer radius
  const uVigFloor = { value: DAY.vigFloor };
  deskMat.onBeforeCompile = (sh) => {
    sh.uniforms.uVig = uVig;
    sh.uniforms.uVigFloor = uVigFloor;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vDeskXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDeskXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vDeskXZ;\nuniform vec4 uVig;\nuniform float uVigFloor;')
      .replace('#include <opaque_fragment>',
        'float vigR = length((vDeskXZ - uVig.xy) * vec2(1.0, uVig.z));\n' +
        'outgoingLight *= mix(1.0, uVigFloor, smoothstep(uVig.w * 0.32, uVig.w, vigR));\n' +
        '#include <opaque_fragment>');
  };
  const desk = new THREE.Mesh(new THREE.PlaneGeometry(DESK, DESK), deskMat);
  desk.name = 'desk';
  desk.rotation.x = -Math.PI / 2;
  desk.receiveShadow = true;
  group.add(desk);

  // --- props (outside the open book's footprint) ---
  const pencil = makePencil();
  pencil.position.x = 4.05; pencil.position.z = 1.05;
  pencil.rotation.y = 1.78; // mostly along z, tip toward the back
  group.add(pencil);
  group.add(makeScraps(77));

  // --- lights ---
  const hemi = new THREE.HemisphereLight(DAY.skyColor, DAY.groundColor, DAY.sky);
  group.add(hemi);

  const key = new THREE.DirectionalLight(DAY.keyColor, DAY.key);
  key.name = 'key';
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0002;
  key.shadow.normalBias = 0.012;
  key.shadow.radius = 2.5;
  group.add(key);
  group.add(key.target); // target stays at the origin

  const fill = new THREE.DirectionalLight(DAY.fillColor, DAY.fill);
  fill.name = 'fill';
  group.add(fill);

  // --- dust motes (closed-form drift from state.t) ---
  const N_DUST = 36;
  const dr = rng(2024);
  const dust = [];
  for (let i = 0; i < N_DUST; i++) {
    dust.push({
      x: -4 + dr() * 7, y: dr() * 3.2, z: -2.6 + dr() * 5,
      ax: 0.15 + dr() * 0.25, fx: 0.03 + dr() * 0.05, px: dr() * 6.28,
      az: 0.1 + dr() * 0.2, fz: 0.02 + dr() * 0.05, pz: dr() * 6.28,
      fall: 0.02 + dr() * 0.04, tw: 0.2 + dr() * 0.4, pt: dr() * 6.28, b: 0.4 + dr() * 0.6,
    });
  }
  const dustPos = new Float32Array(N_DUST * 3);
  const dustCol = new Float32Array(N_DUST * 3);
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3).setUsage(THREE.DynamicDrawUsage));
  dustGeo.setAttribute('color', new THREE.BufferAttribute(dustCol, 3).setUsage(THREE.DynamicDrawUsage));
  dustGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(-0.5, 2, 0), 7);
  const dustMat = new THREE.PointsMaterial({
    size: 0.03, map: new THREE.CanvasTexture(dotSprite()), vertexColors: true,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55,
  });
  const motes = new THREE.Points(dustGeo, dustMat);
  motes.name = 'dust';
  motes.frustumCulled = false;
  group.add(motes);

  // --- background and a far fog that only hides the horizon ---
  scene.background = new THREE.Color(DAY.bg);
  scene.fog = new THREE.Fog(DAY.bg, 32, 60);

  // --- scratch (no per-frame allocation) ---
  const dayC = {}, nightC = {};
  for (const k of ['keyColor', 'skyColor', 'groundColor', 'fillColor', 'bg', 'dustColor']) {
    dayC[k] = new THREE.Color(DAY[k]); nightC[k] = new THREE.Color(NIGHT[k]);
  }
  const dustColor = new THREE.Color();
  const v0 = new THREE.Vector3(), v1 = new THREE.Vector3();
  const lx = new THREE.Vector3(), ly = new THREE.Vector3(), lz = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const corner = new THREE.Vector3();

  function setDir(light, a, b, n, dist) {
    v0.fromArray(a).normalize();
    v1.fromArray(b).normalize();
    v0.lerp(v1, n).normalize();
    light.position.copy(v0).multiplyScalar(dist);
  }

  /** Fit the key's orthographic shadow camera tightly around SHADOW_BOX (and where its shadows land on the desk). */
  function fitShadow() {
    const sc = key.shadow.camera;
    const eye = key.position; // target is the origin
    lz.copy(eye).normalize();
    lx.crossVectors(up, lz).normalize();
    ly.crossVectors(lz, lx);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    const B = SHADOW_BOX;
    for (let i = 0; i < 16; i++) {
      corner.set(i & 1 ? B.x1 : B.x0, i & 2 ? B.y1 : B.y0, i & 4 ? B.z1 : B.z0);
      if (i & 8) corner.addScaledVector(lz, -corner.y / lz.y); // slid down the light ray onto the desk
      corner.sub(eye);
      const x = corner.dot(lx), y = corner.dot(ly), z = corner.dot(lz);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    const m = 0.15;
    sc.left = minX - m; sc.right = maxX + m; sc.bottom = minY - m; sc.top = maxY + m;
    sc.near = Math.max(0.1, -maxZ - 0.5); sc.far = -minZ + 0.5;
    sc.updateProjectionMatrix();
  }

  function update(state) {
    const n = state.night, t = state.t;
    setDir(key, DAY.keyDir, NIGHT.keyDir, n, 14);
    setDir(fill, DAY.fillDir, NIGHT.fillDir, n, 10);
    key.color.copy(dayC.keyColor).lerp(nightC.keyColor, n);
    key.intensity = lerp(DAY.key, NIGHT.key, n);
    hemi.color.copy(dayC.skyColor).lerp(nightC.skyColor, n);
    hemi.groundColor.copy(dayC.groundColor).lerp(nightC.groundColor, n);
    hemi.intensity = lerp(DAY.sky, NIGHT.sky, n);
    fill.color.copy(dayC.fillColor).lerp(nightC.fillColor, n);
    fill.intensity = lerp(DAY.fill, NIGHT.fill, n);
    scene.background.copy(dayC.bg).lerp(nightC.bg, n);
    scene.fog.color.copy(scene.background);
    uVig.value.w = lerp(DAY.vigR, NIGHT.vigR, n);
    uVigFloor.value = lerp(DAY.vigFloor, NIGHT.vigFloor, n);
    renderer.toneMappingExposure = lerp(DAY.exposure, NIGHT.exposure, n);
    fitShadow();

    // dust
    dustColor.copy(dayC.dustColor).lerp(nightC.dustColor, n).multiplyScalar(lerp(DAY.dust, NIGHT.dust, n));
    for (let i = 0; i < N_DUST; i++) {
      const p = dust[i];
      let y = (p.y - p.fall * t) % 3.2; if (y < 0) y += 3.2;
      const fade = smoothstep(0, 0.5, y) * (1 - smoothstep(2.6, 3.2, y));
      dustPos[i * 3] = p.x + p.ax * Math.sin(t * p.fx * 6.283 + p.px);
      dustPos[i * 3 + 1] = 0.35 + y;
      dustPos[i * 3 + 2] = p.z + p.az * Math.sin(t * p.fz * 6.283 + p.pz);
      const b = p.b * fade * (0.55 + 0.45 * Math.sin(t * p.tw * 6.283 + p.pt));
      dustCol[i * 3] = dustColor.r * b; dustCol[i * 3 + 1] = dustColor.g * b; dustCol[i * 3 + 2] = dustColor.b * b;
    }
    dustGeo.attributes.position.needsUpdate = true;
    dustGeo.attributes.color.needsUpdate = true;
  }

  update({ t: 0, night: 0 });
  return { group, update };
}
