// STUB camera rig: one fixed 3/4 shot that keeps the whole open book in frame.
import * as THREE from 'three';

export function createCameraRig(ctx) {
  const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 200);
  const target = new THREE.Vector3(0, 0.6, -0.2);
  const baseOffset = new THREE.Vector3(1.2, 7.2, 8.6);
  let distScale = 1;

  function place() {
    camera.position.copy(target).addScaledVector(baseOffset, distScale);
    camera.lookAt(target);
  }

  function resize(aspect) {
    camera.aspect = aspect;
    // Narrow screens: back off so the open book's width still fits.
    distScale = aspect < 1.5 ? 1.5 / aspect : 1;
    camera.updateProjectionMatrix();
    place();
  }

  function update(state) {
    place();
  }

  resize(16 / 9);
  return { camera, update, resize };
}
