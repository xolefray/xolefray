// STUB book: plain box slabs for the six leaves, pivoting and stacking exactly
// per the contract, with correct spread anchors. A later task replaces the looks;
// the anchor maths here is the contract and must be kept.
import * as THREE from 'three';
import {
  NUM_LEAVES, HINGE_Y, leafThickness, leafWidth, leafDepth, leafOffset,
} from './constants.js';

export function createBook(ctx) {
  const group = new THREE.Group();
  group.name = 'book';

  const front = new THREE.MeshStandardMaterial({ color: 0xf3ead4, roughness: 0.95 });
  const back = new THREE.MeshStandardMaterial({ color: 0xe6d6b4, roughness: 0.95 });
  const edge = new THREE.MeshStandardMaterial({ color: 0xfaf5e8, roughness: 0.95 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x7a2e2a, roughness: 0.9 });

  const pivots = [];
  for (let j = 0; j < NUM_LEAVES; j++) {
    const w = leafWidth(j), T = leafThickness(j), d = leafDepth(j);
    const pivot = new THREE.Group(); // rotates about the hinge (world Z through (0, HINGE_Y))
    pivot.name = `leaf${j}`;
    pivot.position.set(0, HINGE_Y, 0);
    // Box material order: +x, -x, +y (front face), -y (back face), +z, -z.
    const topMat = j === 0 ? cloth : front;     // front cover's outside is cloth
    const botMat = j === NUM_LEAVES - 1 ? cloth : back;
    const coverEdge = j === 0 || j === NUM_LEAVES - 1 ? cloth : edge;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, T, d), [coverEdge, coverEdge, topMat, botMat, coverEdge, coverEdge]);
    mesh.position.set(w / 2, leafOffset(j) + T / 2, 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    pivot.add(mesh);
    group.add(pivot);
    pivots.push(pivot);
  }

  // Spread anchors. left = back face of leaf k, right = front face of leaf k+1.
  const anchors = [];
  for (let k = 0; k < NUM_LEAVES - 1; k++) {
    const left = new THREE.Object3D();
    left.name = `spread${k}-left`;
    left.position.set(0, leafOffset(k), 0);
    left.rotation.z = Math.PI; // so that with the leaf turned by pi it matches world axes
    pivots[k].add(left);

    const right = new THREE.Object3D();
    right.name = `spread${k}-right`;
    right.position.set(0, leafOffset(k + 1) + leafThickness(k + 1), 0);
    pivots[k + 1].add(right);

    const center = new THREE.Object3D();
    center.name = `spread${k}-center`;
    group.add(center);
    anchors.push({ left, right, center });
  }

  const turns = new Array(NUM_LEAVES).fill(0);

  function update(state) {
    for (let j = 0; j < NUM_LEAVES; j++) {
      turns[j] = j < 5 ? state.leafTurn[j] : 0;
      pivots[j].rotation.z = Math.PI * turns[j];
    }
    // Center anchors: on the spine, midway between the two page surfaces,
    // +Y along the bisector of the two pages, +Z along the spine.
    for (let k = 0; k < anchors.length; k++) {
      const pl = Math.PI * turns[k], pr = Math.PI * turns[k + 1];
      const ol = leafOffset(k), or = leafOffset(k + 1) + leafThickness(k + 1);
      // A point at local (0, o) on a leaf rotated by phi about the hinge: (-o sin phi, H + o cos phi).
      const lx = -ol * Math.sin(pl), ly = HINGE_Y + ol * Math.cos(pl);
      const rx = -or * Math.sin(pr), ry = HINGE_Y + or * Math.cos(pr);
      const c = anchors[k].center;
      c.position.set((lx + rx) / 2, (ly + ry) / 2, 0);
      c.rotation.set(0, 0, (pl + pr) / 2 - Math.PI / 2);
    }
  }

  function getSpreadAnchors(k) {
    return anchors[k];
  }

  return { group, update, getSpreadAnchors };
}
