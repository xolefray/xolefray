// STUB (T0) — replaced by T-camera
/**
 * camera.js — film camera rig (minimal stub): fixed high view of the book with a slow drift.
 */

export function createCameraRig(camera) {
  return {
    update(t) {
      camera.position.set(Math.sin(t * 0.05) * 0.4, 7, 9);
      camera.lookAt(0, 0, 0);
    },
  };
}
