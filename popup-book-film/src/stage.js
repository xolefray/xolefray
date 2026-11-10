// STUB stage: plain desk plane + all lights. Lights dim with state.night.
import * as THREE from 'three';
import { lerp } from './util.js';

export function createStage(ctx) {
  const group = new THREE.Group();
  group.name = 'stage';

  const desk = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({ color: 0x6b4a32, roughness: 0.9 }),
  );
  desk.rotation.x = -Math.PI / 2;
  desk.receiveShadow = true;
  group.add(desk);

  const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x3a2a20, 0.9);
  group.add(hemi);

  const key = new THREE.DirectionalLight(0xffe2b8, 2.6); // warm, upper left
  key.position.set(-6, 10, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera;
  sc.left = -6; sc.right = 6; sc.top = 6; sc.bottom = -6; sc.near = 1; sc.far = 30;
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.02;
  group.add(key);
  group.add(key.target);

  const fill = new THREE.DirectionalLight(0xa8c0ff, 0.6); // cool fill, right
  fill.position.set(6, 5, 6);
  group.add(fill);

  const dayBg = new THREE.Color(0x2a2220);
  const nightBg = new THREE.Color(0x0c0d1c);
  ctx.scene.background = dayBg.clone();

  function update(state) {
    const n = state.night;
    key.intensity = lerp(2.6, 0.5, n);
    hemi.intensity = lerp(0.9, 0.25, n);
    fill.intensity = lerp(0.6, 0.35, n);
    ctx.scene.background.copy(dayBg).lerp(nightBg, n);
  }

  return { group, update };
}
