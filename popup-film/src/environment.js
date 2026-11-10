// STUB (T0) — replaced by T-env
/**
 * environment.js — desk, room and lighting (minimal stub).
 * A flat desk plane, one shadow-casting directional "lamp" and a hemisphere fill.
 */
import * as THREE from 'three';

export function createEnvironment({ scene, renderer }) {
  scene.background = new THREE.Color('#1a1512');

  const desk = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({ color: '#4a3324', roughness: 0.7 }),
  );
  desk.rotation.x = -Math.PI / 2;
  desk.receiveShadow = true;
  scene.add(desk);

  const keyLight = new THREE.DirectionalLight('#ffe2b8', 2.5);
  keyLight.position.set(-4, 9, 5);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  Object.assign(keyLight.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
  keyLight.shadow.bias = -0.0005;
  scene.add(keyLight);

  scene.add(new THREE.HemisphereLight('#fff4e0', '#3a2a20', 0.8));

  return { update() {}, keyLight };
}
