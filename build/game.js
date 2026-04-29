import * as THREE from './three.module.js';
import { FBXLoader } from './FBXLoader.js';
import { FBX_B64, GRASS_B64, MAIN_B64 } from './assets.js';

// ---------- Helpers ----------
function b64ToArrayBuffer(b64) {
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function loadTextureFromB64(b64) {
  const tex = new THREE.TextureLoader().load('data:image/png;base64,' + b64);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// ---------- Scene setup ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 60, 220);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 30, 40);
camera.lookAt(0, 0, 0);

// Lights
const hemi = new THREE.HemisphereLight(0xffffff, 0x556633, 0.7);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.1);
sun.position.set(40, 60, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -80;
sun.shadow.camera.right = 80;
sun.shadow.camera.top = 80;
sun.shadow.camera.bottom = -80;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 200;
scene.add(sun);

// ---------- Textures ----------
const grassTex = loadTextureFromB64(GRASS_B64);
grassTex.repeat.set(40, 40);
const mainTex = loadTextureFromB64(MAIN_B64);

// ---------- Ground ----------
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(600, 600),
  new THREE.MeshLambertMaterial({ map: grassTex })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ---------- Track (serpentine spline) ----------
const trackControlPoints = [
  new THREE.Vector3(0, 0, -45),
  new THREE.Vector3(22, 0, -52),
  new THREE.Vector3(44, 0, -38),
  new THREE.Vector3(50, 0, -10),
  new THREE.Vector3(36, 0, 14),
  new THREE.Vector3(50, 0, 38),
  new THREE.Vector3(30, 0, 56),
  new THREE.Vector3(0, 0, 48),
  new THREE.Vector3(-26, 0, 56),
  new THREE.Vector3(-50, 0, 36),
  new THREE.Vector3(-38, 0, 10),
  new THREE.Vector3(-52, 0, -14),
  new THREE.Vector3(-44, 0, -42),
  new THREE.Vector3(-20, 0, -54)
];
const trackCurve = new THREE.CatmullRomCurve3(trackControlPoints, true, 'centripetal', 0.5);
const TRACK_LENGTH = trackCurve.getLength();

function trackPoint(t, out = new THREE.Vector3()) {
  const u = ((t % 1) + 1) % 1;
  const p = trackCurve.getPointAt(u);
  out.set(p.x, 0, p.z);
  return out;
}
function trackTangent(t, out = new THREE.Vector3()) {
  const u = ((t % 1) + 1) % 1;
  const tan = trackCurve.getTangentAt(u);
  out.set(tan.x, 0, tan.z).normalize();
  return out;
}
function trackOutward(t, out = new THREE.Vector3()) {
  const tan = trackTangent(t);
  out.set(tan.z, 0, -tan.x);
  return out;
}

// Offset curve helper for rails (parallel curve)
class OffsetCurve extends THREE.Curve {
  constructor(base, offset) { super(); this.base = base; this.offset = offset; }
  getPoint(u, target = new THREE.Vector3()) {
    const p = this.base.getPointAt(u);
    const tan = this.base.getTangentAt(u);
    const nx = tan.z, nz = -tan.x;
    target.set(p.x + nx * this.offset, 0.15, p.z + nz * this.offset);
    return target;
  }
}

function buildTrack() {
  const g = new THREE.Group();

  // Helper: build a ribbon mesh along the curve at given half-width and y
  function makeRibbon(halfWidth, y, color) {
    const SAMPLES = 360;
    const positions = new Float32Array(SAMPLES * 2 * 3);
    const uvs = new Float32Array(SAMPLES * 2 * 2);
    const indices = [];
    for (let i = 0; i < SAMPLES; i++) {
      const u = i / SAMPLES;
      const p = trackCurve.getPointAt(u);
      const tan = trackCurve.getTangentAt(u);
      const nx = tan.z, nz = -tan.x;
      const lx = p.x - nx * halfWidth, lz = p.z - nz * halfWidth;
      const rx = p.x + nx * halfWidth, rz = p.z + nz * halfWidth;
      positions[i * 6 + 0] = lx; positions[i * 6 + 1] = y; positions[i * 6 + 2] = lz;
      positions[i * 6 + 3] = rx; positions[i * 6 + 4] = y; positions[i * 6 + 5] = rz;
      uvs[i * 4 + 0] = 0; uvs[i * 4 + 1] = u * 40;
      uvs[i * 4 + 2] = 1; uvs[i * 4 + 3] = u * 40;
      const a = i * 2, b = i * 2 + 1;
      const c = ((i + 1) % SAMPLES) * 2, d = ((i + 1) % SAMPLES) * 2 + 1;
      indices.push(a, b, d, a, d, c);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    const mesh = new THREE.Mesh(geom, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
    mesh.receiveShadow = true;
    return mesh;
  }

  // Wide dirt path under the rails (background "road")
  const path = makeRibbon(4.5, 0.02, 0x8b7148);
  path.renderOrder = 0;
  g.add(path);

  // Ballast ribbon
  const ballast = makeRibbon(1.6, 0.04, 0x6b6258);
  ballast.renderOrder = 1;
  g.add(ballast);

  // Two rails as tubes along offset curves
  const railMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.7, roughness: 0.4 });
  for (const off of [-0.6, 0.6]) {
    const oc = new OffsetCurve(trackCurve, off);
    const railGeom = new THREE.TubeGeometry(oc, 360, 0.07, 6, true);
    const rail = new THREE.Mesh(railGeom, railMat);
    g.add(rail);
  }

  // Sleepers
  const sleeperMat = new THREE.MeshLambertMaterial({ color: 0x4b3a2a });
  const sleeperGeom = new THREE.BoxGeometry(2.6, 0.15, 0.45);
  const SLEEPERS = 140;
  for (let i = 0; i < SLEEPERS; i++) {
    const u = i / SLEEPERS;
    const p = trackCurve.getPointAt(u);
    const tan = trackCurve.getTangentAt(u);
    const s = new THREE.Mesh(sleeperGeom, sleeperMat);
    s.position.set(p.x, 0.07, p.z);
    s.rotation.y = Math.atan2(tan.x, tan.z);
    s.receiveShadow = true;
    g.add(s);
  }

  scene.add(g);
}
buildTrack();

// ---------- Platform ----------
const PLATFORM_T = 0.15; // location on track (parameter on curve) - close to train start
const PLATFORM_LENGTH = 12; // along tangent
const PLATFORM_DEPTH = 4;
const PLATFORM_HEIGHT = 0.6;
const PLATFORM_OFFSET = 1.6 + PLATFORM_DEPTH / 2 + 0.4;

const platformGroup = new THREE.Group();
{
  const center = trackPoint(PLATFORM_T);
  const tangent = trackTangent(PLATFORM_T);
  const outward = trackOutward(PLATFORM_T);
  const platCenter = center.clone().add(outward.clone().multiplyScalar(PLATFORM_OFFSET));

  platformGroup.position.copy(platCenter);
  // orient platform so its X axis is tangent
  const yaw = Math.atan2(tangent.x, tangent.z);
  platformGroup.rotation.y = yaw + Math.PI / 2;

  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(PLATFORM_LENGTH, PLATFORM_HEIGHT, PLATFORM_DEPTH),
    new THREE.MeshLambertMaterial({ map: mainTex.clone() })
  );
  slab.material.map.repeat.set(4, 1);
  slab.material.map.needsUpdate = true;
  slab.position.y = PLATFORM_HEIGHT / 2;
  slab.castShadow = true;
  slab.receiveShadow = true;
  platformGroup.add(slab);

  // Edge stripe
  const edge = new THREE.Mesh(
    new THREE.BoxGeometry(PLATFORM_LENGTH, 0.04, 0.25),
    new THREE.MeshLambertMaterial({ color: 0xffe14a })
  );
  edge.position.set(0, PLATFORM_HEIGHT + 0.02, -PLATFORM_DEPTH / 2 + 0.2);
  platformGroup.add(edge);

  // Narrow roof at the BACK (+Z) side of the platform.
  // -Z is the track-facing (front) side, +Z is the back.
  const ROOF_OVERHANG_X = 0.4;
  const ROOF_DEPTH = PLATFORM_DEPTH * 0.45;
  const ROOF_Z_CENTER = PLATFORM_DEPTH / 2 - ROOF_DEPTH / 2;
  const ROOF_FRONT_EDGE_Z = ROOF_Z_CENTER - ROOF_DEPTH / 2;
  const ROOF_BACK_EDGE_Z = ROOF_Z_CENTER + ROOF_DEPTH / 2;

  // Roof support columns - placed exactly under the roof edges
  const colMat = new THREE.MeshLambertMaterial({ color: 0xe8e8e8 });
  const COL_HEIGHT = 2.6;
  const colInsetX = PLATFORM_LENGTH / 2 - 0.6;
  const COL_INSET_FROM_EDGE = 0.15;
  const colPositions = [
    [-colInsetX, ROOF_BACK_EDGE_Z - COL_INSET_FROM_EDGE],
    [ colInsetX, ROOF_BACK_EDGE_Z - COL_INSET_FROM_EDGE],
    [-colInsetX, ROOF_FRONT_EDGE_Z + COL_INSET_FROM_EDGE],
    [ colInsetX, ROOF_FRONT_EDGE_Z + COL_INSET_FROM_EDGE]
  ];
  for (const [cx, cz] of colPositions) {
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.18, COL_HEIGHT, 0.18), colMat);
    col.position.set(cx, PLATFORM_HEIGHT + COL_HEIGHT / 2, cz);
    col.castShadow = true;
    platformGroup.add(col);
  }
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(PLATFORM_LENGTH + ROOF_OVERHANG_X * 2, 0.18, ROOF_DEPTH),
    new THREE.MeshLambertMaterial({ color: 0x4aa3d9 })
  );
  roof.position.set(0, PLATFORM_HEIGHT + COL_HEIGHT + 0.09, ROOF_Z_CENTER);
  roof.castShadow = true;
  platformGroup.add(roof);

  // Roof underside trim (white band)
  const trim = new THREE.Mesh(
    new THREE.BoxGeometry(PLATFORM_LENGTH + ROOF_OVERHANG_X * 2 + 0.05, 0.06, ROOF_DEPTH + 0.05),
    new THREE.MeshLambertMaterial({ color: 0xffffff })
  );
  trim.position.set(0, PLATFORM_HEIGHT + COL_HEIGHT - 0.02, ROOF_Z_CENTER);
  platformGroup.add(trim);

  scene.add(platformGroup);
}
const PLATFORM_TOP_Y = PLATFORM_HEIGHT;

// world position helper for a point on the platform local space
function platformLocalToWorld(localX, localZ, y = PLATFORM_TOP_Y) {
  const v = new THREE.Vector3(localX, y, localZ);
  platformGroup.localToWorld(v);
  return v;
}

// nearest track point to platform (board point)
const PLATFORM_BOARD_WORLD = trackPoint(PLATFORM_T).clone();
PLATFORM_BOARD_WORLD.y = 0;

// ---------- Decorations ----------
function buildDecorations() {
  const g = new THREE.Group();

  // Lake
  const lakePos = new THREE.Vector3(-95, 0.05, 65);
  const lake = new THREE.Mesh(
    new THREE.CircleGeometry(18, 32),
    new THREE.MeshLambertMaterial({ color: 0x4aa3d9 })
  );
  lake.rotation.x = -Math.PI / 2;
  lake.position.copy(lakePos);
  lake.receiveShadow = true;
  g.add(lake);
  const sand = new THREE.Mesh(
    new THREE.RingGeometry(18, 21, 32),
    new THREE.MeshLambertMaterial({ color: 0xd9c98a })
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(lakePos.x, 0.02, lakePos.z);
  g.add(sand);

  // Tree factory
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b3f1a });
  const foliageMats = [
    new THREE.MeshLambertMaterial({ color: 0x2f8a3e }),
    new THREE.MeshLambertMaterial({ color: 0x3aa050 }),
    new THREE.MeshLambertMaterial({ color: 0x256b2e })
  ];
  function makeTree(scale) {
    const t = new THREE.Group();
    const h = 1.6 * scale;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * scale, 0.22 * scale, h, 6), trunkMat);
    trunk.position.y = h / 2;
    trunk.castShadow = true;
    t.add(trunk);
    const fmat = foliageMats[Math.floor(Math.random() * foliageMats.length)];
    const cone1 = new THREE.Mesh(new THREE.ConeGeometry(1.2 * scale, 2.6 * scale, 7), fmat);
    cone1.position.y = h + 0.9 * scale;
    cone1.castShadow = true;
    t.add(cone1);
    if (Math.random() < 0.6) {
      const cone2 = new THREE.Mesh(new THREE.ConeGeometry(0.85 * scale, 1.8 * scale, 7), fmat);
      cone2.position.y = h + 1.9 * scale;
      cone2.castShadow = true;
      t.add(cone2);
    }
    return t;
  }

  // House factory
  const houseBodyMats = [
    new THREE.MeshLambertMaterial({ color: 0xf2e3c4 }),
    new THREE.MeshLambertMaterial({ color: 0xeec79a }),
    new THREE.MeshLambertMaterial({ color: 0xd8b48a })
  ];
  const roofMats = [
    new THREE.MeshLambertMaterial({ color: 0xb33a2f }),
    new THREE.MeshLambertMaterial({ color: 0x8a4a32 }),
    new THREE.MeshLambertMaterial({ color: 0x4a6e8a })
  ];
  function makeHouse() {
    const h = new THREE.Group();
    const w = 2.2 + Math.random() * 1.4;
    const d = 2.2 + Math.random() * 1.2;
    const bodyH = 1.6 + Math.random() * 0.8;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, bodyH, d), houseBodyMats[Math.floor(Math.random() * houseBodyMats.length)]);
    body.position.y = bodyH / 2;
    body.castShadow = true; body.receiveShadow = true;
    h.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.78, 1.4, 4), roofMats[Math.floor(Math.random() * roofMats.length)]);
    roof.position.y = bodyH + 0.7;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    h.add(roof);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.05), new THREE.MeshLambertMaterial({ color: 0x5a3a20 }));
    door.position.set(0, 0.45, d / 2 + 0.03);
    h.add(door);
    return h;
  }

  // Distance from point to track curve (sample-based)
  const trackSamples = [];
  for (let i = 0; i < 200; i++) {
    trackSamples.push(trackCurve.getPointAt(i / 200));
  }
  function distToTrack(x, z) {
    let min = Infinity;
    for (const p of trackSamples) {
      const dx = p.x - x, dz = p.z - z;
      const d = dx * dx + dz * dz;
      if (d < min) min = d;
    }
    return Math.sqrt(min);
  }
  function distToLake(x, z) {
    const dx = lakePos.x - x, dz = lakePos.z - z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  // Scatter trees
  let placed = 0;
  let attempts = 0;
  while (placed < 110 && attempts < 1500) {
    attempts++;
    const x = (Math.random() - 0.5) * 260;
    const z = (Math.random() - 0.5) * 260;
    if (distToTrack(x, z) < 7) continue;
    if (distToLake(x, z) < 22) continue;
    if (Math.abs(x) < 8 && Math.abs(z) < 8) continue;
    const tree = makeTree(0.7 + Math.random() * 0.9);
    tree.position.set(x, 0, z);
    tree.rotation.y = Math.random() * Math.PI * 2;
    g.add(tree);
    placed++;
  }

  // House clusters
  const clusters = [
    new THREE.Vector3(75, 0, -65),
    new THREE.Vector3(-70, 0, -50),
    new THREE.Vector3(80, 0, 70)
  ];
  for (const c of clusters) {
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      let hx, hz, ok = false;
      for (let tries = 0; tries < 20; tries++) {
        hx = c.x + (Math.random() - 0.5) * 14;
        hz = c.z + (Math.random() - 0.5) * 14;
        if (distToTrack(hx, hz) > 8 && distToLake(hx, hz) > 22) { ok = true; break; }
      }
      if (!ok) continue;
      const h = makeHouse();
      h.position.set(hx, 0, hz);
      h.rotation.y = Math.random() * Math.PI * 2;
      g.add(h);
    }
  }

  // Hills (half-spheres)
  const hillMat = new THREE.MeshLambertMaterial({ color: 0x4d8a3e });
  for (let i = 0; i < 8; i++) {
    const radius = 8 + Math.random() * 10;
    let hx, hz, ok = false;
    for (let tries = 0; tries < 20; tries++) {
      hx = (Math.random() - 0.5) * 280;
      hz = (Math.random() - 0.5) * 280;
      if (distToTrack(hx, hz) > radius + 4 && distToLake(hx, hz) > radius + 22) { ok = true; break; }
    }
    if (!ok) continue;
    const hill = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), hillMat);
    hill.position.set(hx, -0.2, hz);
    hill.receiveShadow = true;
    g.add(hill);
  }

  scene.add(g);
}
buildDecorations();

// ---------- FBX models ----------
const fbxLoader = new FBXLoader();
const fbxBuffer = b64ToArrayBuffer(FBX_B64);
const fbxRoot = fbxLoader.parse(fbxBuffer, '');

const modelTemplates = {
  Locomotive_EU: null,
  Carriage_EU: null,
  characters: []
};

function applyMainTextureRecursive(obj) {
  obj.traverse((c) => {
    if (c.isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
      const tex = mainTex.clone();
      tex.needsUpdate = true;
      const mat = new THREE.MeshLambertMaterial({ map: tex });
      c.material = mat;
    }
  });
}

fbxRoot.traverse((child) => {
  if (!child.name) return;
  if (child.name === 'Locomotive_EU' && !modelTemplates.Locomotive_EU) {
    modelTemplates.Locomotive_EU = child;
  } else if (child.name === 'Carriage_EU' && !modelTemplates.Carriage_EU) {
    modelTemplates.Carriage_EU = child;
  } else if (/^G_Character_\d+$/.test(child.name)) {
    if (!modelTemplates.characters.find((c) => c.name === child.name)) {
      modelTemplates.characters.push(child);
    }
  }
});

function cloneModel(template, scale = 1) {
  const clone = template.clone(true);
  clone.scale.setScalar(scale);
  applyMainTextureRecursive(clone);
  // re-center pivot to bottom for easier placement
  return clone;
}

// Determine wagon length from bbox of locomotive
function bboxSize(obj) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3();
  box.getSize(size);
  return { box, size };
}

const LOCO_SCALE = 1.0;
let WAGON_LENGTH = 4.5; // default, refined below
let WAGON_FORWARD_AXIS = new THREE.Vector3(1, 0, 0); // local axis to align with track tangent

(function calibrateWagon() {
  if (!modelTemplates.Locomotive_EU) return;
  const tmp = cloneModel(modelTemplates.Locomotive_EU, LOCO_SCALE);
  const { size } = bboxSize(tmp);
  // longest axis is forward
  const arr = [
    { axis: new THREE.Vector3(1, 0, 0), len: size.x },
    { axis: new THREE.Vector3(0, 0, 1), len: size.z }
  ];
  arr.sort((a, b) => b.len - a.len);
  WAGON_FORWARD_AXIS.copy(arr[0].axis);
  WAGON_LENGTH = arr[0].len * 1.05;
})();

// ---------- Train ----------
const train = {
  headT: 0.05, // parametric position on track [0,1)
  speed: 0,
  maxSpeed: 14, // units per sec
  accel: 18,
  decel: 13,
  isMoving: false,
  wagons: [],
  passengerCount: 0,
  swayPhase: 0
};

const trainGroup = new THREE.Group();
scene.add(trainGroup);

// arc-length spacing between wagon centers (in t-parameter)
const WAGON_T_GAP = (WAGON_LENGTH + 0.3) / TRACK_LENGTH;

function buildWagon(kind) {
  const tmpl = kind === 'loco' ? modelTemplates.Locomotive_EU : modelTemplates.Carriage_EU;
  const model = cloneModel(tmpl, LOCO_SCALE);
  // pivot wrapper so we can offset to ground
  const pivot = new THREE.Group();
  pivot.add(model);
  // place so that bottom sits at y=0.15 (rail height)
  const { box } = bboxSize(model);
  model.position.y -= box.min.y;
  model.position.y += 0.15;
  // orient model: rotate so its forward axis aligns with +X (we'll rotate pivot to tangent)
  if (Math.abs(WAGON_FORWARD_AXIS.x) > 0.5) {
    model.rotation.y = -Math.PI / 2;
  }
  // sway pivot is the pivot itself (rotate around z = forward roll? we want lateral sway = roll around forward axis)
  // We'll use rotation.z on a sway group inside.
  const swayGroup = new THREE.Group();
  pivot.remove(model);
  swayGroup.add(model);
  pivot.add(swayGroup);
  pivot.userData.swayGroup = swayGroup;
  pivot.userData.kind = kind;
  return pivot;
}

function rebuildTrain(count) {
  // remove old
  for (const w of train.wagons) trainGroup.remove(w);
  train.wagons.length = 0;
  for (let i = 0; i < count; i++) {
    // First wagon = locomotive (forward), last wagon = locomotive (reversed)
    const isLast = i === count - 1;
    const kind = (i === 0 || isLast) ? 'loco' : 'carriage';
    const w = buildWagon(kind);
    w.userData.index = i;
    w.userData.flipped = isLast && i !== 0; // back loco is flipped 180
    trainGroup.add(w);
    train.wagons.push(w);
  }
  updateTrainTransforms();
}

function updateTrainTransforms() {
  for (let i = 0; i < train.wagons.length; i++) {
    const w = train.wagons[i];
    const tt = train.headT - i * WAGON_T_GAP;
    const p = trackPoint(tt);
    w.position.set(p.x, 0, p.z);
    const t = trackTangent(tt);
    const yaw = Math.atan2(t.x, t.z);
    w.rotation.y = w.userData.flipped ? yaw + Math.PI : yaw;
  }
}

// ---------- Passengers ----------
const PASSENGER_SPAWN_INTERVAL = 2.0;
const MAX_PASSENGERS_ON_PLATFORM = 10;
const PASSENGER_SCALE = 0.7;
const passengers = []; // { mesh, state: 'waiting'|'boarding'|'chasing'|'leaving', ... }
let spawnTimer = 0;

function randomCharacterTemplate() {
  const arr = modelTemplates.characters;
  return arr[Math.floor(Math.random() * arr.length)];
}

function passengersOnPlatformCount() {
  let n = 0;
  for (const p of passengers) if (p.state === 'waiting' || p.state === 'boarding' || p.state === 'returning') n++;
  return n;
}

function spawnPassenger() {
  if (passengersOnPlatformCount() >= MAX_PASSENGERS_ON_PLATFORM) return;
  const tmpl = randomCharacterTemplate();
  if (!tmpl) return;
  const mesh = cloneModel(tmpl, PASSENGER_SCALE);
  const { box } = bboxSize(mesh);
  // wrapper
  const wrap = new THREE.Group();
  mesh.position.y -= box.min.y;
  wrap.add(mesh);
  // random local position on platform top
  const localX = (Math.random() - 0.5) * (PLATFORM_LENGTH - 1.6);
  const localZ = (Math.random() - 0.5) * (PLATFORM_DEPTH - 1.4);
  const world = platformLocalToWorld(localX, localZ, PLATFORM_TOP_Y);
  wrap.position.copy(world);
  wrap.rotation.y = Math.random() * Math.PI * 2;
  scene.add(wrap);
  passengers.push({ mesh: wrap, state: 'waiting', vy: 0, homePos: world.clone(), homeRot: wrap.rotation.y });
}

function updatePassengers(dt) {
  const trainStopped = !train.isMoving && Math.abs(train.speed) < 0.05;
  const headPos = trackPoint(train.headT);
  const nearPlatform = headPos.distanceTo(PLATFORM_BOARD_WORLD) < PLATFORM_LENGTH * 0.7
    || train.wagons.some((w) => w.position.distanceTo(PLATFORM_BOARD_WORLD) < PLATFORM_LENGTH * 0.7);

  if (trainStopped && nearPlatform) {
    for (const p of passengers) {
      if (p.state === 'waiting') {
        let nearestW = null;
        let nearestD = Infinity;
        for (const w of train.wagons) {
          const d = w.position.distanceTo(p.mesh.position);
          if (d < nearestD) { nearestD = d; nearestW = w; }
        }
        if (nearestW && nearestD < PLATFORM_LENGTH * 0.9) {
          p.state = 'boarding';
          p.targetWagon = nearestW;
        }
      }
    }
  }

  // Mark when the train has actually visited (stopped at) the platform
  if (trainStopped && nearPlatform) {
    train.hasVisitedPlatform = true;
  }
  // Train departs platform while passengers still waiting -> they leave (walk away)
  // Only triggers if the train had previously stopped here AND is now leaving the platform area
  const leavingPlatform = train.hasVisitedPlatform && train.isMoving && train.speed > 1.5 && !nearPlatform;
  if (leavingPlatform) {
    for (const p of passengers) {
      if (p.state === 'boarding' || p.state === 'chasing') {
        // Those who left the platform but didn't board: walk back to their spot
        p.state = 'returning';
        p.targetWagon = null;
      }
    }
    train.hasVisitedPlatform = false; // reset so next visit must occur first
  }

  for (let i = passengers.length - 1; i >= 0; i--) {
    const p = passengers[i];
    if (p.state === 'boarding' && p.targetWagon) {
      const target = p.targetWagon.position.clone();
      target.y = p.mesh.position.y;
      const dir = target.clone().sub(p.mesh.position);
      const dist = dir.length();
      const speed = 3.5;
      if (dist < 0.3) {
        p.mesh.position.y -= dt * 4;
        p.mesh.scale.multiplyScalar(Math.max(0.001, 1 - dt * 5));
        if (p.mesh.scale.x < 0.05) {
          scene.remove(p.mesh);
          passengers.splice(i, 1);
          train.passengerCount++;
          updateUI();
        }
      } else {
        dir.normalize();
        p.mesh.position.x += dir.x * speed * dt;
        p.mesh.position.z += dir.z * speed * dt;
        const targetY = 0.15;
        p.mesh.position.y += (targetY - p.mesh.position.y) * Math.min(1, dt * 3);
        p.mesh.rotation.y = Math.atan2(dir.x, dir.z);
      }
    } else if (p.state === 'chasing') {
      // Chasing disabled - convert to leaving immediately
      p.state = 'leaving';
      p.leaveDir = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
      continue;
    } else if (p.state === 'returning') {
      // Walk back to original spot on the platform
      const target = p.homePos.clone();
      const dir = target.clone().sub(p.mesh.position);
      dir.y = 0;
      const dist = dir.length();
      const speed = 2.8;
      if (dist < 0.15) {
        p.mesh.position.copy(target);
        p.mesh.rotation.y = p.homeRot;
        p.state = 'waiting';
      } else {
        dir.normalize();
        p.mesh.position.x += dir.x * speed * dt;
        p.mesh.position.z += dir.z * speed * dt;
        const targetY = p.homePos.y;
        p.mesh.position.y += (targetY - p.mesh.position.y) * Math.min(1, dt * 4);
        p.mesh.rotation.y = Math.atan2(dir.x, dir.z);
      }
    } else if (p.state === 'leaving') {
      const speed = 2.0;
      p.mesh.position.x += p.leaveDir.x * speed * dt;
      p.mesh.position.z += p.leaveDir.z * speed * dt;
      p.mesh.rotation.y = Math.atan2(p.leaveDir.x, p.leaveDir.z);
      const distFromCenter = Math.sqrt(p.mesh.position.x * p.mesh.position.x + p.mesh.position.z * p.mesh.position.z);
      if (distFromCenter > 140) {
        scene.remove(p.mesh);
        passengers.splice(i, 1);
      }
    }
  }
}

// ---------- Camera follow ----------
const camOffset = new THREE.Vector3(0, 22, 32);
const camTarget = new THREE.Vector3();
const camDesired = new THREE.Vector3();

function updateCamera(dt) {
  const head = train.wagons[0];
  if (!head) return;
  camDesired.copy(head.position).add(camOffset);
  camera.position.lerp(camDesired, Math.min(1, dt * 3));
  camTarget.lerp(head.position, Math.min(1, dt * 3));
  // No rotation following — fixed orientation but we still need to look once
  // requirement: only translation. We orient camera once at start to look at train, then keep yaw fixed.
}

// ---------- Input ----------
let pointerDown = false;
function setPointer(down) { pointerDown = down; }
window.addEventListener('pointerdown', (e) => {
  // ignore if click on UI button
  if (e.target.closest('#ui')) return;
  setPointer(true);
});
window.addEventListener('pointerup', () => setPointer(false));
window.addEventListener('pointercancel', () => setPointer(false));
window.addEventListener('blur', () => setPointer(false));

// ---------- UI ----------
const ui = document.createElement('div');
ui.id = 'ui';
ui.innerHTML = `
  <div id="counter">
    <div class="label">Passengers</div>
    <div class="value"><span id="pcount">0</span></div>
  </div>
  <div id="btnRow">
    <button id="removeWagonBtn" title="Remove wagon">−</button>
    <button id="addWagonBtn">+ Add Wagon (<span id="wcount">3</span>/<span id="wmax">5</span>)</button>
  </div>
`;
document.body.appendChild(ui);

const style = document.createElement('style');
style.textContent = `
  html, body { margin:0; padding:0; overflow:hidden; height:100%; background:#87ceeb; font-family: -apple-system, system-ui, Roboto, Arial, sans-serif; -webkit-user-select:none; user-select:none; }
  canvas { display:block; touch-action: none; }
  #ui { position: fixed; inset: 0; pointer-events: none; }
  #counter {
    position: absolute; top: 16px; left: 50%; transform: translateX(-50%);
    background: rgba(0,0,0,0.55); color: #fff; padding: 10px 18px; border-radius: 14px;
    text-align: center; pointer-events: none; min-width: 130px;
    box-shadow: 0 4px 14px rgba(0,0,0,0.25);
  }
  #counter .label { font-size: 12px; opacity: 0.85; letter-spacing: 1px; text-transform: uppercase; }
  #counter .value { font-size: 28px; font-weight: 800; margin-top: 2px; }
  #btnRow {
    position: absolute; left: 50%; bottom: 24px; transform: translateX(-50%);
    display: flex; gap: 10px; align-items: center;
    pointer-events: none;
  }
  #addWagonBtn, #removeWagonBtn {
    pointer-events: auto;
    color: #fff; border: none; font-weight: 700;
    cursor: pointer; box-shadow: 0 6px 16px rgba(0,0,0,0.3);
  }
  #addWagonBtn {
    background: linear-gradient(180deg,#2ecc71,#1f9e57);
    padding: 14px 24px; font-size: 16px; border-radius: 30px;
  }
  #removeWagonBtn {
    background: linear-gradient(180deg,#e74c3c,#b03a2e);
    width: 48px; height: 48px; font-size: 24px; border-radius: 24px;
    line-height: 1;
  }
  #addWagonBtn:disabled, #removeWagonBtn:disabled { background: #888; cursor: not-allowed; opacity: 0.7; }
  #hint {
    position: absolute; bottom: 90px; left: 50%; transform: translateX(-50%);
    color: #fff; background: rgba(0,0,0,0.4); padding: 8px 14px; border-radius: 18px;
    font-size: 13px; pointer-events: none;
  }
`;
document.head.appendChild(style);

const hint = document.createElement('div');
hint.id = 'hint';
hint.textContent = 'Hold anywhere to drive';
document.body.appendChild(hint);
setTimeout(() => { hint.style.transition = 'opacity 1s'; hint.style.opacity = '0'; }, 4000);

const pcountEl = document.getElementById('pcount');
const wcountEl = document.getElementById('wcount');
const addBtn = document.getElementById('addWagonBtn');
const removeBtn = document.getElementById('removeWagonBtn');

const MIN_WAGONS = 3; // 1 front loco + 1 carriage + 1 back loco
const MAX_WAGONS = 5;

function updateUI() {
  pcountEl.textContent = train.passengerCount;
  wcountEl.textContent = train.wagons.length;
  addBtn.disabled = train.wagons.length >= MAX_WAGONS;
  removeBtn.disabled = train.wagons.length <= MIN_WAGONS;
}

addBtn.addEventListener('click', () => {
  if (train.wagons.length < MAX_WAGONS) {
    rebuildTrain(train.wagons.length + 1);
    updateUI();
  }
});

removeBtn.addEventListener('click', () => {
  if (train.wagons.length > MIN_WAGONS) {
    rebuildTrain(train.wagons.length - 1);
    updateUI();
  }
});

// ---------- Init train ----------
rebuildTrain(MIN_WAGONS);
updateUI();

// position camera initially based on train head
{
  const head = train.wagons[0];
  camera.position.copy(head.position).add(camOffset);
  camera.lookAt(head.position);
}

// ---------- Main loop ----------
const clock = new THREE.Clock();
function animate() {
  const dt = Math.min(0.05, clock.getDelta());

  // accelerate / decelerate
  if (pointerDown) {
    train.speed = Math.min(train.maxSpeed, train.speed + train.accel * dt);
  } else {
    train.speed = Math.max(0, train.speed - train.decel * dt);
  }
  train.isMoving = train.speed > 0.05;

  // arc-length-based motion: dt-param/dt = speed / track_length
  train.headT += (train.speed * dt) / TRACK_LENGTH;
  train.headT = ((train.headT % 1) + 1) % 1;
  updateTrainTransforms();

  // sway animation
  train.swayPhase += dt * 7; // speed of sway
  const swayAmplitude = train.isMoving ? THREE.MathUtils.degToRad(5) : 0;
  for (let i = 0; i < train.wagons.length; i++) {
    const w = train.wagons[i];
    const sg = w.userData.swayGroup;
    if (!sg) continue;
    const sign = i % 2 === 0 ? 1 : -1;
    const desired = train.isMoving ? Math.sin(train.swayPhase) * swayAmplitude * sign : 0;
    // smooth transition (lerp toward desired)
    sg.rotation.z += (desired - sg.rotation.z) * Math.min(1, dt * 6);
  }

  // passenger spawning
  spawnTimer += dt;
  if (spawnTimer >= PASSENGER_SPAWN_INTERVAL) {
    spawnTimer = 0;
    spawnPassenger();
  }
  updatePassengers(dt);

  updateCamera(dt);

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

// debug
window.__game = { scene, camera, train, modelTemplates, trainGroup, trackPoint, trackCurve };

// ---------- Resize ----------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
