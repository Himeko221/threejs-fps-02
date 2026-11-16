// Vector Protocol — original map "Foundry Yard": a two-site industrial yard.
// All geometry is boxes; walls carry AABBs for movement and ray occlusion.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Box def: [cx, cy, cz, sx, sy, sz, colorKey]
const BOXES = [
  // perimeter walls
  [-30, 2, 0, 1.2, 4, 46, 'wallA'],
  [30, 2, 0, 1.2, 4, 46, 'wallA'],
  [0, 2, -23, 60, 4, 1.2, 'wallA'],
  [0, 2, 23, 60, 4, 1.2, 'wallA'],

  // mid divider with three gaps (lanes: left, mid, right)
  [-14, 2, 0, 12, 3.4, 1.1, 'wallB'],
  [8, 2, 0, 10, 3.4, 1.1, 'wallB'],
  [22, 2, 0, 8, 3.4, 1.1, 'wallB'],

  // site A structures (left side, x < 0)
  [-22, 1.25, -12, 7, 2.5, 5, 'wallA'],
  [-18, 0.9, -6.5, 2.2, 1.8, 2.2, 'crate'],
  [-24, 0.9, -4, 2.2, 1.8, 2.2, 'crate'],
  [-21, 0.45, -5.2, 2.0, 0.9, 2.0, 'crate'],
  [-26, 0.5, -14, 3.2, 1.0, 3.2, 'crate'],

  // site B structures (right side, x > 0)
  [22, 1.25, 12, 7, 2.5, 5, 'wallA'],
  [18, 0.9, 6.5, 2.2, 1.8, 2.2, 'crate'],
  [24, 0.9, 4, 2.2, 1.8, 2.2, 'crate'],
  [21, 0.45, 5.2, 2.0, 0.9, 2.0, 'crate'],
  [26, 0.5, 14, 3.2, 1.0, 3.2, 'crate'],

  // mid corridor cover
  [-4, 0.9, -10, 2.4, 1.8, 2.4, 'crate'],
  [4, 0.9, 10, 2.4, 1.8, 2.4, 'crate'],
  [0, 0.5, -16, 3.0, 1.0, 1.4, 'crate'],
  [0, 0.5, 16, 3.0, 1.0, 1.4, 'crate'],
  [-9, 0.9, 8, 2.0, 1.8, 2.0, 'crate'],
  [9, 0.9, -8, 2.0, 1.8, 2.0, 'crate'],

  // attacker spawn cover
  [-10, 0.9, 19, 2.2, 1.8, 2.2, 'crate'],
  [10, 0.9, 19, 2.2, 1.8, 2.2, 'crate'],

  // defender side cover
  [-10, 0.9, -19, 2.2, 1.8, 2.2, 'crate'],
  [10, 0.9, -19, 2.2, 1.8, 2.2, 'crate'],
];

export const SITES = {
  A: { x: -22, z: -9, r: 4.5 },
  B: { x: 22, z: 9, r: 4.5 },
};

// Player spawns (attacker = VOLT south, defender = HELIX north)
export const SPAWNS = {
  attack: [
    [-8, 20], [0, 20.5], [8, 20], [-4, 18], [4, 18],
  ],
  defend: [
    [-8, -20], [0, -20.5], [8, -20], [-4, -18], [4, -18],
  ],
};

export function buildMap(scene) {
  const group = new THREE.Group();
  const colliders = [];

  const matOf = {
    wallA: new THREE.MeshLambertMaterial({ color: PALETTE.wallA }),
    wallB: new THREE.MeshLambertMaterial({ color: PALETTE.wallB }),
    crate: new THREE.MeshLambertMaterial({ color: PALETTE.crate }),
  };

  // floor
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(62, 0.2, 48),
    new THREE.MeshLambertMaterial({ color: PALETTE.ground }),
  );
  floor.position.set(0, -0.1, 0);
  group.add(floor);

  // site pads
  const padMat = new THREE.MeshLambertMaterial({ color: PALETTE.site, transparent: true, opacity: 0.18 });
  for (const s of Object.values(SITES)) {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(s.r * 2, 0.06, s.r * 2), padMat);
    pad.position.set(s.x, 0.03, s.z);
    group.add(pad);
  }

  for (const [cx, cy, cz, sx, sy, sz, key] of BOXES) {
    const mat = matOf[key].clone();
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(sx, sy, sz)),
      new THREE.LineBasicMaterial({ color: PALETTE.crateEdge }),
    );
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    mesh.position.set(cx, cy, cz);
    edges.position.copy(mesh.position);
    group.add(mesh);
    if (key === 'crate') group.add(edges);
    colliders.push({ min: [-sx/2 + cx, -sy/2 + cy, -sz/2 + cz], max: [sx/2 + cx, sy/2 + cy, sz/2 + cz] });
  }

  scene.add(group);
  return colliders;
}
