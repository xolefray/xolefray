// STUB scene "forest": plain coloured placeholders standing on the left page,
// the right page and in the center group. Replaced by a later task.
import * as THREE from 'three';

const COLORS = [0x2f7a4f, 0x1f6f6a, 0xe07a2e];

export function createScene(ctx) {
  const left = new THREE.Group();
  const right = new THREE.Group();
  const center = new THREE.Group();
  const mats = COLORS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
  const hinged = []; // pieces that stand up (rotate about their base) as the spread opens

  function card(parent, mat, w, h, x, z) {
    const hinge = new THREE.Group(); // base line on the page, rotates about local X
    hinge.position.set(x, 0, z);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), mat);
    mesh.position.y = h / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    hinge.add(mesh);
    parent.add(hinge);
    hinged.push(hinge);
  }

  card(left, mats[0], 1.2, 1.6, -1.6, -0.6);
  card(left, mats[1], 0.8, 0.9, -0.8, 0.8);
  card(right, mats[1], 1.0, 1.3, 1.5, -0.4);
  card(right, mats[0], 0.7, 0.8, 0.9, 1.0);

  // Center piece: a slim post standing along the bisector at the spine.
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1, 0.5), mats[2]);
  post.castShadow = true;
  const postPivot = new THREE.Group();
  postPivot.add(post);
  center.add(postPivot);

  function update(state, spread) {
    const lie = (1 - spread.open) * (Math.PI / 2);
    for (const h of hinged) h.rotation.x = -lie; // lies flat toward -Z when closed
    const s = Math.max(0.001, spread.open);
    postPivot.scale.set(1, s * 1.4, 1);
    post.position.y = 0.5;
  }

  return { left, right, center, update };
}
