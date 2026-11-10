// STUB (T0) — replaced by T-paper
/**
 * paper.js — paper materials, canvas helpers and printed cards (minimal stub).
 * Exports the exact API of contract section 4 with simple flat-colour implementations.
 */
import * as THREE from 'three';

export const PAPER = { white: '#fbf7ee', cream: '#f3ead8', ink: '#2b2622' };

export const PALETTES = {
  forest: { deep: '#2f4a32', leaf: '#5d8a4e', moss: '#9bb86a', bark: '#6b4a2f', water: '#6fa3b8' },
  sea: { deep: '#1d3f5e', wave: '#3f7ea6', foam: '#e8f1f2', sand: '#e3cf9f', light: '#f2c14e' },
  city: { night: '#1b1f3a', roof: '#3a3560', wall: '#5a4e7c', lantern: '#f4a640', window: '#ffd98a' },
  sky: { dawn: '#f6c6a8', pink: '#ec9aa4', blue: '#9cc3e0', sun: '#f7d36b', cloud: '#fdf6ee' },
};

export function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return { canvas, ctx: canvas.getContext('2d') };
}

export function addGrain(ctx, w, h, { amount = 0.06, seed = 1 } = {}) {}

export function dieCut(canvas, { margin = 8, color = PAPER.white, edge = true } = {}) {
  const { canvas: out, ctx } = makeCanvas(canvas.width, canvas.height);
  ctx.drawImage(canvas, 0, 0);
  return out;
}

export function texture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function paperMaterial({ color, map, roughness = 0.92 } = {}) {
  return new THREE.MeshStandardMaterial({ color: color ?? '#ffffff', map: map ?? null, roughness });
}

const ANCHORS = {
  'bottom-center': (w, h) => [0, h / 2],
  'bottom-left': (w, h) => [w / 2, h / 2],
  'bottom-right': (w, h) => [-w / 2, h / 2],
  center: () => [0, 0],
};

export function card({ canvas, width, height, back = PAPER.cream, anchor = 'bottom-center', alphaTest = 0.5 }) {
  const group = new THREE.Group();
  const geo = new THREE.PlaneGeometry(width, height);
  const map = texture(canvas);
  const front = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map, alphaTest, roughness: 0.92 }));
  const rear = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color: back, alphaMap: map, alphaTest, roughness: 0.92, side: THREE.BackSide }),
  );
  const [ox, oy] = ANCHORS[anchor](width, height);
  for (const m of [front, rear]) {
    m.position.set(ox, oy, 0);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  return group;
}

export function splitCard({ canvas, width, height, back = PAPER.cream }) {
  const half = (u0) => {
    const { canvas: c, ctx } = makeCanvas(canvas.width / 2, canvas.height);
    ctx.drawImage(canvas, -u0 * canvas.width, 0);
    return card({ canvas: c, width: width / 2, height, back, anchor: u0 === 0 ? 'bottom-right' : 'bottom-left' });
  };
  return { left: half(0), right: half(0.5) };
}

export function boat({ color = PAPER.white, scale = 1 } = {}) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.22), mat);
  hull.position.y = 0.04;
  const sail = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.25, 4), mat);
  sail.position.y = 0.22;
  for (const m of [hull, sail]) {
    m.castShadow = true;
    group.add(m);
  }
  group.scale.setScalar(scale);
  return group;
}

export function crane({ color = PAPER.white, scale = 1 } = {}) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide });
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.4, 4), mat);
  body.rotation.z = -Math.PI / 2;
  const wings = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.8), mat);
  wings.rotation.x = -Math.PI / 2;
  for (const m of [body, wings]) {
    m.castShadow = true;
    group.add(m);
  }
  group.userData.setFlap = (v) => {};
  group.scale.setScalar(scale);
  return group;
}
