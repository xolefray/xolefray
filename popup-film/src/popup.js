// STUB (T0) — replaced by T-popup
/**
 * popup.js — paper pop-up mechanisms in spread-frame coordinates (minimal stub).
 * Pieces simply hinge/scale between flat (α = 0) and erect (α = π); no real fold geometry.
 */
import * as THREE from 'three';

/** smoothstep progress 0..1 of alpha/π between a0 and a1. */
export function rise(alpha, a0 = 0.15, a1 = 0.95) {
  const u = Math.min(1, Math.max(0, (alpha / Math.PI - a0) / (a1 - a0)));
  return u * u * (3 - 2 * u);
}

/** Group that follows the left page (identity at α = π) or stays on the right page. */
function pageCarrier(side) {
  const carrier = new THREE.Group();
  return {
    carrier,
    sign: side === 'left' ? -1 : 1,
    follow(alpha) {
      carrier.rotation.z = side === 'left' ? alpha - Math.PI : 0;
    },
  };
}

export function vFold({ z0 = 0, gamma = 1.35, width, height }) {
  const object = new THREE.Group();
  object.position.z = z0;
  const left = new THREE.Group();
  const right = new THREE.Group();
  const wing = Math.PI / 2 - gamma;
  left.rotation.y = wing;
  right.rotation.y = -wing;
  object.add(left, right);
  return {
    object,
    left,
    right,
    update(alpha) {
      object.rotation.z = alpha / 2 - Math.PI / 2;
      object.scale.setScalar(Math.max(1e-3, rise(alpha)));
    },
  };
}

export function standUp({ side = 'right', x = 1, z = 0 }) {
  const { carrier, sign, follow } = pageCarrier(side);
  const mount = new THREE.Group();
  mount.position.set(sign * x, 0, z);
  carrier.add(mount);
  return {
    object: carrier,
    mount,
    update(alpha) {
      follow(alpha);
      mount.rotation.x = -(Math.PI / 2) * (1 - rise(alpha));
    },
  };
}

export function onPage({ side = 'right', x = 1, z = 0, lift = 0.002 }) {
  const { carrier, sign, follow } = pageCarrier(side);
  const mount = new THREE.Group();
  mount.position.set(sign * x, lift, z);
  carrier.add(mount);
  return { object: carrier, mount, update: follow };
}

export function collection(mechs) {
  const object = new THREE.Group();
  for (const m of mechs) object.add(m.object);
  return {
    object,
    update(alpha) {
      for (const m of mechs) m.update(alpha);
    },
  };
}
