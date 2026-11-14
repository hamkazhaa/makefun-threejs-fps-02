// "Port Meridian": an original container dock at dusk. Two plant sites — Site A under
// the gantry crane in the north-west, Site B by the warehouse in the north-east —
// joined by three lanes: west yard, mid containers and east yard. Vanguard spawns
// south, Ember spawns north. Every box is a collider and a surface bullets stop on.
// Waypoints form the graph bots navigate; edges are built automatically where a
// straight walk at chest height is not blocked.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const MAP = {
  bounds: { minX: -26, maxX: 26, minZ: -18, maxZ: 18 },
  vanguardSpawn: [
    { x: -6, z: 15.5, yaw: 0 }, { x: -2, z: 16, yaw: 0 },
    { x: 2, z: 16, yaw: 0 }, { x: 6, z: 15.5, yaw: 0 },
  ],
  emberSpawn: [
    { x: -6, z: -15.5, yaw: Math.PI }, { x: -2, z: -16, yaw: Math.PI },
    { x: 2, z: -16, yaw: Math.PI }, { x: 6, z: -15.5, yaw: Math.PI },
  ],
  sites: {
    A: { x: -19, z: -11, radius: 4.2, name: 'SITE A — CRANE' },
    B: { x: 19, z: -11, radius: 4.2, name: 'SITE B — WAREHOUSE' },
  },
};

const WAYPOINTS = [
  [-22, 14], [-12, 15], [0, 15], [12, 15], [22, 14],
  [-22, 6], [-12, 7], [-4, 8], [4, 8], [12, 7], [22, 6],
  [-22, -2], [-13, -1], [-5, 0], [5, 0], [13, -1], [22, -2],
  [-19, -11], [-10, -11], [0, -10], [10, -11], [19, -11],
  [-19, -16], [-8, -13.5], [8, -13.5], [19, -16],
  [-14, -6], [14, -6],
];

function segmentBlocked(colliders, ax, az, bx, bz) {
  // 2D segment vs AABB test at chest height (y = 1.1): a walk is blocked if the
  // segment crosses any collider whose top is above 0.9 m. Colliders that sit
  // entirely above head height (the crane beam, the warehouse roof) or below
  // the floor do not block a walk underneath them.
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 0.001) return false;
  const steps = Math.ceil(len / 0.5);
  for (let i = 1; i < steps; i += 1) {
    const x = ax + (dx * i) / steps;
    const z = az + (dz * i) / steps;
    for (const c of colliders) {
      if (c.max.y < 0.9 || c.min.y > 1.8) continue;
      if (x > c.min.x - 0.35 && x < c.max.x + 0.35 && z > c.min.z - 0.35 && z < c.max.z + 0.35) return true;
    }
  }
  return false;
}

export function createMap(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const shootables = [];
  const raycaster = new THREE.Raycaster();

  const mats = {};
  function mat(color, rough = 0.9, metal = 0.08, emissive = 0x000000, emissiveIntensity = 1) {
    const key = `${color}-${rough}-${metal}-${emissive}`;
    if (!mats[key]) {
      mats[key] = new THREE.MeshStandardMaterial({
        color, roughness: rough, metalness: metal,
        emissive: new THREE.Color(emissive), emissiveIntensity,
      });
    }
    return mats[key];
  }

  function box(w, h, d, x, y, z, color, opts = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts.rough ?? 0.9, opts.metal ?? 0.08, opts.emissive ?? 0, opts.emissiveIntensity ?? 1));
    mesh.position.set(x, y, z);
    if (opts.ry) mesh.rotation.y = opts.ry;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (!opts.noCollide) {
      mesh.updateMatrixWorld(true);
      colliders.push(new THREE.Box3().setFromObject(mesh));
    }
    if (!opts.noShoot) shootables.push(mesh);
    return mesh;
  }

  // Ground: wet concrete slabs with darker patches.
  box(52.8, 0.4, 36.8, 0, -0.2, 0, PALETTE.ground, { noShoot: true });
  for (let i = 0; i < 10; i += 1) {
    const x = -22 + (i % 5) * 11;
    const z = -12 + Math.floor(i / 5) * 22;
    box(7, 0.06, 5, x, 0.03, z, PALETTE.groundDark, { noCollide: true, noShoot: true, rough: 0.6, metal: 0.25 });
  }
  // Yellow lane paint strips.
  box(0.5, 0.05, 30, -8, 0.03, 0, PALETTE.lamp, { noCollide: true, noShoot: true, emissive: PALETTE.lamp, emissiveIntensity: 0.25 });
  box(0.5, 0.05, 30, 8, 0.03, 0, PALETTE.lamp, { noCollide: true, noShoot: true, emissive: PALETTE.lamp, emissiveIntensity: 0.25 });

  // Perimeter: container walls.
  const wallC = PALETTE.steelDark;
  box(0.8, 5, 36.8, -26.4, 2.5, 0, wallC);
  box(0.8, 5, 36.8, 26.4, 2.5, 0, wallC);
  box(52.8, 5, 0.8, 0, 2.5, -18.4, wallC);
  box(52.8, 5, 0.8, 0, 2.5, 18.4, wallC);

  // Stacked shipping containers: the map's cover and its colour.
  const cont = [
    // mid lane
    [6, 2.6, 2.4, -2, 1.3, 2, PALETTE.rust], [6, 2.6, 2.4, 3, 1.3, -4, PALETTE.steel],
    [2.4, 2.6, 6, -6, 1.3, -6, PALETTE.tealDark], [2.4, 2.6, 6, 7, 1.3, 6, PALETTE.rustLight],
    [6, 2.6, 2.4, -1, 3.9, 2, PALETTE.steelDark], // stacked on the first
    // west yard
    [2.4, 2.6, 6, -14, 1.3, 8, PALETTE.steel], [6, 2.6, 2.4, -18, 1.3, 2, PALETTE.rustLight],
    [2.4, 5.2, 2.4, -21, 2.6, -4, PALETTE.emberDark], [6, 2.6, 2.4, -13, 1.3, -8, PALETTE.steel],
    // east yard
    [2.4, 2.6, 6, 14, 1.3, 8, PALETTE.rust], [6, 2.6, 2.4, 18, 1.3, 2, PALETTE.steel],
    [2.4, 5.2, 2.4, 21, 2.6, -4, PALETTE.tealDark], [6, 2.6, 2.4, 13, 1.3, -8, PALETTE.rustLight],
    // north cover near sites
    [6, 2.6, 2.4, -10, 1.3, -13, PALETTE.steelDark], [6, 2.6, 2.4, 10, 1.3, -13, PALETTE.steelDark],
    [2.4, 2.6, 6, 0, 1.3, -14, PALETTE.rust],
    // south cover near spawns
    [6, 2.6, 2.4, -10, 1.3, 12, PALETTE.steel], [6, 2.6, 2.4, 10, 1.3, 12, PALETTE.rust],
  ];
  for (const [w, h, d, x, y, z, c] of cont) box(w, h, d, x, y, z, c, { metal: 0.35, rough: 0.65 });

  // Low crates to crouch behind.
  const crates = [
    [-4, 6], [5, 10], [-9, -2], [9, -2], [-16, 10], [16, 10], [-4, -8], [4, -8],
    [-22, 0], [22, 0], [0, 4], [-15, -13], [15, -13],
  ];
  for (const [x, z] of crates) box(1.3, 1.1, 1.3, x, 0.55, z, PALETTE.rust, { metal: 0.2, rough: 0.8 });

  // Gantry crane over Site A: four legs and a beam, with a hanging hook block.
  for (const [x, z] of [[-23, -15], [-15, -15], [-23, -7], [-15, -7]]) {
    box(0.7, 11, 0.7, x, 5.5, z, PALETTE.steel, { metal: 0.5, rough: 0.5 });
  }
  box(9.4, 1.2, 1.4, -19, 11.4, -11, PALETTE.steel, { metal: 0.5, rough: 0.5 });
  box(1.6, 1.6, 1.6, -19, 9.6, -11, PALETTE.rust, { metal: 0.4, rough: 0.6 });
  // Warehouse shell over Site B.
  box(10, 5, 0.6, 19, 2.5, -16.5, PALETTE.steelDark, { metal: 0.3, rough: 0.7 });
  box(10, 0.8, 7, 19, 5.2, -13, PALETTE.steel, { metal: 0.3, rough: 0.7 });
  box(0.6, 5, 7, 14.2, 2.5, -13, PALETTE.steelDark, { metal: 0.3, rough: 0.7 });
  box(0.6, 5, 7, 23.8, 2.5, -13, PALETTE.steelDark, { metal: 0.3, rough: 0.7 });

  // Site markers: glowing floor rings + a floating beacon.
  function siteMarker(site, color) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.radius - 0.35, site.radius, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.06, site.z);
    group.add(ring);
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 5.5, 8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28 }),
    );
    beacon.position.set(site.x, 2.8, site.z);
    group.add(beacon);
    const lamp = new THREE.PointLight(color, 26, 18, 1.6);
    lamp.position.set(site.x, 4.5, site.z);
    scene.add(lamp);
    return { ring, beacon };
  }
  const siteA = siteMarker(MAP.sites.A, PALETTE.teal);
  const siteB = siteMarker(MAP.sites.B, PALETTE.ember);

  // Sodium lamps on poles along the lanes.
  const lampPositions = [[-8, 12], [8, 12], [-8, -6], [8, -6], [0, 0]];
  for (const [x, z] of lampPositions) {
    box(0.25, 5.2, 0.25, x, 2.6, z, PALETTE.steelDark, { metal: 0.5 });
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 10, 8),
      new THREE.MeshBasicMaterial({ color: PALETTE.lamp }),
    );
    head.position.set(x, 5.3, z);
    group.add(head);
    const light = new THREE.PointLight(PALETTE.lamp, 20, 17, 1.8);
    light.position.set(x, 5.1, z);
    scene.add(light);
  }

  // Distant skyline silhouettes outside the walls, and a low sun disc.
  const skyline = new THREE.Group();
  for (let i = 0; i < 14; i += 1) {
    const h = 8 + ((i * 37) % 18);
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(6, h, 4),
      new THREE.MeshBasicMaterial({ color: 0x1c2333 }),
    );
    const angle = (i / 14) * Math.PI * 2;
    m.position.set(Math.cos(angle) * 62, h / 2 - 1, Math.sin(angle) * 62);
    skyline.add(m);
  }
  scene.add(skyline);
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(6, 32),
    new THREE.MeshBasicMaterial({ color: PALETTE.horizon, fog: false }),
  );
  sun.position.set(-30, 9, -70);
  sun.lookAt(0, 2, 0);
  scene.add(sun);

  // Lighting: low dusk sun, cool hemisphere fill.
  const hemi = new THREE.HemisphereLight(0x9fb0cc, 0x3a3226, 1.6);
  scene.add(hemi);
  const sunLight = new THREE.DirectionalLight(0xffb37a, 3.6);
  sunLight.position.set(-28, 16, -34);
  sunLight.target.position.set(0, 0, 4);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -32;
  sunLight.shadow.camera.right = 32;
  sunLight.shadow.camera.top = 32;
  sunLight.shadow.camera.bottom = -32;
  sunLight.shadow.camera.far = 90;
  sunLight.shadow.bias = -0.0005;
  scene.add(sunLight, sunLight.target);

  // Waypoint graph: nodes from the table, edges where a walk is not blocked.
  const nodes = WAYPOINTS.map(([x, z], i) => ({ id: i, x, z, edges: [] }));
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i];
      const b = nodes[j];
      const dist = Math.hypot(a.x - b.x, a.z - b.z);
      if (dist > 13) continue;
      if (segmentBlocked(colliders, a.x, a.z, b.x, b.z)) continue;
      a.edges.push({ to: j, cost: dist });
      b.edges.push({ to: i, cost: dist });
    }
  }

  function losClear(ax, ay, az, bx, by, bz) {
    const dir = new THREE.Vector3(bx - ax, by - ay, bz - az);
    const dist = dir.length();
    if (dist < 0.01) return true;
    dir.normalize();
    raycaster.set(new THREE.Vector3(ax, ay, az), dir);
    raycaster.far = dist;
    const hit = raycaster.intersectObjects(shootables, false)[0];
    return !hit;
  }

  return {
    colliders, shootables, nodes, losClear,
    siteMarkers: { A: siteA, B: siteB },
    group,
    // 2D footprints of tall cover, for the minimap.
    minimapRects: colliders
      .filter((c) => c.max.y > 0.9 && c.max.y < 6)
      .map((c) => ({ x: c.min.x, z: c.min.z, w: c.max.x - c.min.x, d: c.max.z - c.min.z })),
  };
}
