// STUB (T0) — replaced by T-book
/**
 * book.js — the pop-up book: five hinged boards and the four spread anchors (minimal stub).
 * Leaves are plain boxes pivoting about the spine (Z axis at x = 0); anchor k follows leaf k.
 */
import * as THREE from 'three';

export const BOOK = { PAGE_W: 3, PAGE_D: 4, BOARD_T: 0.035, LEAVES: 5 };

export function createBook({ title = 'The Little Paper Boat', coverColor = '#7a2e2a' } = {}) {
  const { PAGE_W: W, PAGE_D: D, BOARD_T: T, LEAVES } = BOOK;
  const group = new THREE.Group();
  group.name = title;
  const pivotY = (LEAVES / 2) * T;
  const edge = new THREE.MeshStandardMaterial({ color: '#efe6d2', roughness: 0.95 });
  const cover = new THREE.MeshStandardMaterial({ color: coverColor, roughness: 0.8 });
  const geo = new THREE.BoxGeometry(W, T, D);

  const leaves = [];
  for (let i = 0; i < LEAVES; i++) {
    const pivot = new THREE.Group();
    pivot.position.y = pivotY;
    const top = i === 0 ? cover : new THREE.MeshStandardMaterial({ color: '#f3ead8', roughness: 0.92 });
    const bottom = i === LEAVES - 1 ? cover : new THREE.MeshStandardMaterial({ color: '#f3ead8', roughness: 0.92 });
    const mesh = new THREE.Mesh(geo, [edge, edge, top, bottom, edge, edge]);
    mesh.position.set(W / 2, (LEAVES / 2 - 0.5 - i) * T, 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    pivot.add(mesh);
    group.add(pivot);
    leaves.push({ pivot, top, bottom });
  }

  const anchors = [];
  for (let k = 1; k < LEAVES; k++) {
    const anchor = new THREE.Object3D();
    anchor.userData.surfaceY = (LEAVES / 2 - k) * T;
    group.add(anchor);
    anchors.push(anchor);
  }

  function setLeafAngles(phis) {
    for (let i = 0; i < LEAVES - 1; i++) leaves[i].pivot.rotation.z = phis[i];
    anchors.forEach((anchor, idx) => {
      const phi = phis[idx + 1] ?? 0;
      const ys = anchor.userData.surfaceY;
      anchor.position.set(-Math.sin(phi) * ys, pivotY + Math.cos(phi) * ys, 0);
      anchor.rotation.z = phi;
    });
  }

  function artTexture(canvas, flip) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    if (flip) {
      tex.center.set(0.5, 0.5);
      tex.rotation = Math.PI;
    }
    return tex;
  }

  function setPageArt(k, { left, right }) {
    if (left) {
      const mat = leaves[k - 1].bottom;
      mat.map = artTexture(left, true);
      mat.color.set('#ffffff');
      mat.needsUpdate = true;
    }
    if (right) {
      const mat = leaves[k].top;
      mat.map = artTexture(right, false);
      mat.color.set('#ffffff');
      mat.needsUpdate = true;
    }
  }

  setLeafAngles([0, 0, 0, 0, 0]);
  return { group, setLeafAngles, getSpreadAnchor: (k) => anchors[k - 1], setPageArt, update() {} };
}
