import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { Cloth } from "./cloth.js";

const HARD_NAME = /floor|rug|ground|rack|rail|pole|hanger|hangar|hook|wire|rod|stand|wall|cube|wood|shelf|frame|base|plane|pCube|pCylinder|pPipe|pTorus|closet|room/i;
const SOFT_NAME = /cloth|shirt|jacket|coat|dress|pant|jean|skirt|sweater|cardigan|hoodie|garment|tee|blouse|meshy|knit|leather|apparel|gown/i;
const MAX_DEFORM_VERTS = 28000;

const canvas = document.querySelector("#c");
const hint = document.querySelector(".hint");
const overlay = document.querySelector("#drop-overlay");
const fileInput = document.querySelector("#file");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x141210);
scene.fog = new THREE.Fog(0x141210, 28, 70);

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 10, 28);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.target.set(0, 10, 0);
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 6;
controls.maxDistance = 48;

scene.add(new THREE.HemisphereLight(0xfff4e6, 0x2a241c, 1.1));

const key = new THREE.DirectionalLight(0xfff1dc, 2.2);
key.position.set(8, 18, 10);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
scene.add(key);

const fill = new THREE.DirectionalLight(0x9bb7d4, 0.45);
fill.position.set(-12, 6, -8);
scene.add(fill);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(22, 48),
  new THREE.MeshStandardMaterial({ color: 0x2a261f, roughness: 0.9 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const rail = new THREE.Mesh(
  new THREE.CylinderGeometry(0.12, 0.12, 22, 16),
  new THREE.MeshStandardMaterial({ color: 0x8a7a62, metalness: 0.7, roughness: 0.35 })
);
rail.rotation.z = Math.PI / 2;
rail.position.set(0, 16.1, 0);
rail.castShadow = true;
scene.add(rail);

function createSwing(slider, rotator, { minX = -10, maxX = 10 } = {}) {
  return {
    slider,
    pivot: rotator,
    angle: 0,
    vel: 0,
    xVel: 0,
    targetAngle: 0,
    targetX: slider.position.x,
    minX,
    maxX,
    dragging: false,
  };
}

function stepSwing(swing, dt) {
  const t = Math.min(dt, 0.033);
  const stiffness = swing.dragging ? 20 : 9;
  const damping = swing.dragging ? 5.5 : 1.55;
  swing.vel += (swing.targetAngle - swing.angle) * stiffness * t - swing.vel * damping * t;
  swing.angle += swing.vel * t;
  swing.pivot.rotation.z = swing.angle;
  swing.pivot.rotation.x = -Math.abs(swing.angle) * 0.22;

  const follow = swing.dragging ? 5.2 : 7;
  swing.xVel += (swing.targetX - swing.slider.position.x) * follow * t - swing.xVel * 4.2 * t;
  swing.slider.position.x = THREE.MathUtils.clamp(
    swing.slider.position.x + swing.xVel * t,
    swing.minX,
    swing.maxX
  );
}

function hangFromTop(mesh) {
  mesh.updateWorldMatrix(true, false);
  const box = new THREE.Box3().setFromObject(mesh);
  const top = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2);
  const parent = mesh.parent;
  const slider = new THREE.Group();
  const rotator = new THREE.Group();
  parent.add(slider);
  slider.position.copy(parent.worldToLocal(top));
  slider.add(rotator);
  rotator.attach(mesh);
  return { slider, rotator };
}

function makeHanger() {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xb7a88c,
    metalness: 0.72,
    roughness: 0.32,
  });
  const hanger = new THREE.Group();
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.032, 8, 16, Math.PI * 1.2), mat);
  hook.rotation.y = Math.PI / 2;
  hook.position.y = 0.02;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.26, 8), mat);
  neck.position.y = -0.24;
  const left = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 1.05, 8), mat);
  left.rotation.z = Math.PI / 2 + 0.24;
  left.position.set(-0.46, -0.52, 0);
  const right = left.clone();
  right.rotation.z = -(Math.PI / 2 + 0.24);
  right.position.set(0.46, -0.52, 0);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 1.55, 8), mat);
  bar.rotation.z = Math.PI / 2;
  bar.position.y = -0.7;
  hanger.add(hook, neck, left, right, bar);
  hanger.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.raycast = () => {};
  });
  return hanger;
}

const demoClothes = [
  { width: 8, height: 14, spacing: 0.42, x: -6.2, color: 0xc4a574 },
  { width: 7, height: 13, spacing: 0.42, x: 0, color: 0x7d4b45 },
  { width: 8, height: 15, spacing: 0.42, x: 6.2, color: 0x5c6b7a },
].map((spec) => {
  const cloth = new Cloth(spec);
  const topY = (spec.height / 2) * spec.spacing + 8;
  cloth.mesh.position.set(0, -topY, 0);
  cloth.mesh.material.color.setHex(spec.color);

  const slider = new THREE.Group();
  slider.position.set(spec.x, 16.1, 0);
  const hanger = makeHanger();
  const rotator = new THREE.Group();
  rotator.position.y = -0.78;
  rotator.add(cloth.mesh);
  slider.add(hanger, rotator);
  scene.add(slider);

  return {
    cloth,
    mesh: cloth.mesh,
    hanger,
    slider,
    swing: createSwing(slider, rotator, { minX: -10.5, maxX: 10.5 }),
  };
});

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const dragPlane = new THREE.Plane();
const hit = new THREE.Vector3();
const localHit = new THREE.Vector3();
const push = new THREE.Vector3();
const worldScale = new THREE.Vector3();
const worldPos = new THREE.Vector3();
const dragPoint = new THREE.Vector3();
const dragStart = new THREE.Vector3();
const closetBounds = new THREE.Box3();
let dragOriginX = 0;
const faceNormal = new THREE.Vector3();
const highlight = new THREE.Color(0x4a3218);

let closetRoot = null;
let garments = [];
let hovered = null;
let dragging = null;
let hoveredDemo = null;
const blobUrls = [];

function setHint(text) {
  if (hint) hint.textContent = text;
}

function setPointer(event) {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
}

function materialsOf(mesh) {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function countMeshes(model) {
  let count = 0;
  model.traverse((child) => {
    if (child.isMesh) count += 1;
  });
  return count;
}

function toStandard(material) {
  if (!material) {
    return new THREE.MeshStandardMaterial({
      color: 0xc4b7a4,
      roughness: 0.7,
      metalness: 0.04,
      side: THREE.DoubleSide,
    });
  }
  if (Array.isArray(material)) return material.map(toStandard);
  if (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial) {
    material.side = THREE.DoubleSide;
    return material;
  }
  const std = new THREE.MeshStandardMaterial({
    color: material.color ? material.color.clone() : new THREE.Color(0xc4b7a4),
    map: material.map || null,
    transparent: Boolean(material.transparent),
    opacity: material.opacity ?? 1,
    side: THREE.DoubleSide,
    roughness: 0.68,
    metalness: 0.04,
  });
  if (std.map) std.map.colorSpace = THREE.SRGBColorSpace;
  return std;
}

function meshName(mesh) {
  return `${mesh.name} ${mesh.parent?.name || ""} ${mesh.parent?.parent?.name || ""}`;
}

function isHardwareShape(size, volume, medianVolume) {
  const dims = [size.x, size.y, size.z].sort((a, b) => a - b);
  const thin = dims[0] < 0.22 || dims[0] < dims[2] * 0.1;
  const wire = dims[0] < 0.3 && dims[1] < 1.35;
  const small = volume < medianVolume * 0.2;
  if (size.y < 0.45 && size.x > 2 && size.z > 2) return true;
  if (size.y > 2.2 && Math.max(size.x, size.z) < 0.75) return true;
  if (size.y < 0.35 && Math.max(size.x, size.z) > 2 && Math.min(size.x, size.z) < 0.5) return true;
  return (thin && small) || wire;
}

function classifyMesh(mesh, meshCount, medianVolume = 1) {
  const name = meshName(mesh);
  if (meshCount === 1) return "mixed";
  if (HARD_NAME.test(name)) return "hard";
  if (SOFT_NAME.test(name)) return "soft";

  const box = new THREE.Box3().setFromObject(mesh);
  const size = box.getSize(new THREE.Vector3());
  const volume = Math.max(size.x * size.y * size.z, 1e-6);
  if (isHardwareShape(size, volume, medianVolume)) return "hard";
  return "soft";
}

function isFabricHit(intersection, item) {
  if (!intersection) return false;
  if (item.kind !== "mixed" && item.kind !== "hard") return true;
  if (intersection.point.y < 0.35) return false;
  if (intersection.face) {
    faceNormal.copy(intersection.face.normal).transformDirection(intersection.object.matrixWorld);
    if (faceNormal.y > 0.82 && intersection.point.y < 1.1) return false;
  }
  return true;
}

function setHighlight(item, on) {
  if (!item || item.kind === "mixed") return;
  materialsOf(item.mesh).forEach((material, i) => {
    if (!material?.emissive) return;
    material.emissive.copy(on ? highlight : item.origEmissive[i]);
  });
}

function updateCursor() {
  if (dragging) canvas.style.cursor = "grabbing";
  else if (hovered || hoveredDemo) canvas.style.cursor = "grab";
  else canvas.style.cursor = "";
}

function setDemoVisible(visible) {
  for (const item of demoClothes) {
    item.slider.visible = visible;
    item.cloth.setMouseWorld(hit, false);
    item.cloth.setTug(0);
  }
  rail.visible = visible;
  floor.visible = visible;
}

function pickDemoCloth() {
  const hits = raycaster.intersectObjects(
    demoClothes.map((item) => item.mesh),
    false
  );
  if (!hits.length) return null;
  hit.copy(hits[0].point);
  return demoClothes.find((item) => item.mesh === hits[0].object) || null;
}

function pickGarment() {
  if (!closetRoot || garments.length === 0) return null;
  const hits = raycaster.intersectObjects(
    garments.map((item) => item.mesh),
    false
  );
  for (const intersection of hits) {
    const item = garments.find((entry) => entry.mesh === intersection.object);
    if (item && isFabricHit(intersection, item)) {
      hit.copy(intersection.point);
      return item;
    }
  }
  return null;
}

function frameCamera(model) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const distance = Math.max(size.x, size.y, size.z) * 1.55;
  controls.target.copy(center);
  camera.position.set(center.x, center.y + size.y * 0.12, center.z + distance);
  camera.near = Math.max(distance / 100, 0.05);
  camera.far = distance * 20;
  camera.updateProjectionMatrix();
}

function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    const mats = child.material ? materialsOf(child) : [];
    mats.forEach((material) => material?.dispose?.());
  });
  scene.remove(object);
}

function clearCloset() {
  if (closetRoot) disposeObject(closetRoot);
  closetRoot = null;
  garments = [];
  hovered = null;
  dragging = null;
  controls.enabled = true;
  blobUrls.splice(0).forEach((url) => URL.revokeObjectURL(url));
}

function prepareModel(model) {
  model.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    child.material = toStandard(child.material);
    if (child.geometry?.attributes.position) {
      child.geometry = child.geometry.clone();
    }
  });

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  model.scale.setScalar(16 / Math.max(size.x, size.y, size.z, 0.001));
  box.setFromObject(model);
  model.position.x -= (box.min.x + box.max.x) / 2;
  model.position.z -= (box.min.z + box.max.z) / 2;
  model.position.y -= box.min.y;
  model.updateMatrixWorld(true);
  return model;
}

function collectGarments(model) {
  const meshes = [];
  model.traverse((child) => {
    if (child.isMesh && child.geometry?.attributes.position) meshes.push(child);
  });

  const volumes = meshes.map((mesh) => {
    const size = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());
    return Math.max(size.x * size.y * size.z, 1e-6);
  });
  const medianVolume = volumes.slice().sort((a, b) => a - b)[Math.floor(volumes.length / 2)] || 1;

  let triangles = 0;
  garments = meshes
    .map((mesh) => {
      const kind = classifyMesh(mesh, meshes.length, medianVolume);
      const positions = mesh.geometry.attributes.position;
      triangles += mesh.geometry.index ? mesh.geometry.index.count / 3 : positions.count / 3;
      return {
        mesh,
        geometry: mesh.geometry,
        original: positions.array.slice(),
        origEmissive: materialsOf(mesh).map((material) =>
          material.emissive ? material.emissive.clone() : new THREE.Color(0x000000)
        ),
        kind,
        movable: kind === "soft" && meshes.length > 1,
        canDeform: positions.count <= MAX_DEFORM_VERTS && kind === "soft",
        dirty: false,
        sway: 0,
      };
    })
    .filter((item) => item.kind === "soft" || item.kind === "mixed");

  closetBounds.setFromObject(model);
  const pad = Math.max((closetBounds.max.x - closetBounds.min.x) * 0.08, 0.35);
  for (const item of garments) {
    if (!item.movable) continue;
    const hung = hangFromTop(item.mesh);
    item.slider = hung.slider;
    item.swing = createSwing(hung.slider, hung.rotator, {
      minX: closetBounds.min.x + pad,
      maxX: closetBounds.max.x - pad,
    });
  }
  return Math.round(triangles);
}

function installCloset(model, label = "closet") {
  if (countMeshes(model) === 0) {
    throw new Error("That file has no meshes");
  }

  clearCloset();
  closetRoot = prepareModel(model);
  scene.add(closetRoot);
  const triangles = collectGarments(closetRoot);
  setDemoVisible(false);
  frameCamera(closetRoot);

  const movable = garments.some((item) => item.movable);
  const deforming = garments.some((item) => item.canDeform);
  let message = `Hover clothes to press the fabric. ${
    movable ? "Drag left and right to swing a garment. " : ""
  }Drag empty space to orbit.`;
  if (triangles > 300000) {
    message += ` ${label} is still heavy (${triangles.toLocaleString()} tris), so some pieces only highlight and slide.`;
  } else if (!deforming) {
    message += " This export looks like one solid mesh, so the mouse presses nearby vertices.";
  }
  setHint(message);
}

function pushGarment(item, dt) {
  if (!item.canDeform) {
    return;
  }

  const pos = item.geometry.attributes.position;
  const active = hovered === item || dragging === item;
  localHit.copy(hit);
  item.mesh.worldToLocal(localHit);
  item.mesh.getWorldScale(worldScale);
  const radius = 1.8 / Math.max(worldScale.x, 1e-4);
  const strength = active ? 0.62 : 0;
  const settle = 1 - Math.exp(-dt * 10);
  let changed = false;

  for (let i = 0; i < pos.count; i++) {
    const ox = item.original[i * 3];
    const oy = item.original[i * 3 + 1];
    const oz = item.original[i * 3 + 2];
    let tx = ox;
    let ty = oy;
    let tz = oz;

    if (strength > 0) {
      push.set(ox - localHit.x, oy - localHit.y, oz - localHit.z);
      const dist = push.length();
      if (dist < radius && dist > 1e-5) {
        push.multiplyScalar(((1 - dist / radius) * strength) / dist);
        tx += push.x;
        ty += push.y;
        tz += push.z;
      }
    }

    const x = pos.getX(i) + (tx - pos.getX(i)) * settle;
    const y = pos.getY(i) + (ty - pos.getY(i)) * settle;
    const z = pos.getZ(i) + (tz - pos.getZ(i)) * settle;
    if (Math.abs(x - pos.getX(i)) + Math.abs(y - pos.getY(i)) + Math.abs(z - pos.getZ(i)) > 1e-5) {
      pos.setXYZ(i, x, y, z);
      changed = true;
    }
  }

  if (changed) {
    pos.needsUpdate = true;
    item.geometry.computeVertexNormals();
    item.dirty = true;
  } else if (!active) {
    item.dirty = false;
  }
}

function swingOf(target) {
  return target?.swing || null;
}

function leanToward(swing, worldX, amount, limit) {
  if (!swing) return;
  swing.targetAngle = THREE.MathUtils.clamp((worldX - swing.slider.position.x) * amount, -limit, limit);
}

function updateImportedGarments(dt) {
  for (const item of garments) {
    if (item.swing) {
      if (item !== dragging && item !== hovered) item.swing.targetAngle = 0;
      stepSwing(item.swing, dt);
    }
    if (item === hovered || item === dragging || item.dirty) {
      pushGarment(item, dt);
    }
  }
}

function beginDrag(target) {
  dragging = target;
  controls.enabled = false;
  const swing = swingOf(target);
  if (swing) {
    swing.dragging = true;
    swing.slider.getWorldPosition(worldPos);
  } else {
    target.mesh.getWorldPosition(worldPos);
  }
  dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1), worldPos);
  raycaster.ray.intersectPlane(dragPlane, dragStart);
  dragOriginX = dragStart.x;
  updateCursor();
}

function moveDrag() {
  if (!dragging) return;
  const swing = swingOf(dragging);
  const anchor = swing?.slider || dragging.slider || dragging.mesh;
  anchor.getWorldPosition(worldPos);
  dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1), worldPos);
  if (!raycaster.ray.intersectPlane(dragPlane, dragPoint)) return;
  hit.copy(dragPoint);

  const nextX = dragPoint.x;
  if (swing) {
    swing.targetX = THREE.MathUtils.clamp(nextX, swing.minX, swing.maxX);
    const pull = dragPoint.x - swing.slider.position.x;
    const travel = dragPoint.x - dragOriginX;
    swing.targetAngle = THREE.MathUtils.clamp(travel * 0.16 + pull * 0.22 + swing.xVel * 0.04, -1.2, 1.2);
  } else {
    dragging.mesh.position.x = nextX;
  }
}

function endDrag() {
  const swing = swingOf(dragging);
  if (swing) {
    swing.dragging = false;
    swing.targetAngle = 0;
    swing.targetX = THREE.MathUtils.clamp(swing.slider.position.x, swing.minX, swing.maxX);
  }
  dragging = null;
  controls.enabled = true;
  updateCursor();
}

function driveDemo(dt) {
  for (const item of demoClothes) {
    const active = hoveredDemo === item || dragging === item;
    if (active) {
      localHit.copy(hit);
      item.mesh.worldToLocal(localHit);
      item.cloth.setMouseWorld(localHit, true);
      item.cloth.setTug(item.swing.xVel * 4.2 + item.swing.angle * 36);
    } else {
      item.cloth.setMouseWorld(hit, false);
      item.cloth.setTug(item.swing.vel * 16);
    }
    if (item !== dragging && item !== hoveredDemo) item.swing.targetAngle = 0;
    stepSwing(item.swing, dt);
    item.cloth.simulate(dt);
  }
}

canvas.addEventListener("pointermove", (event) => {
  setPointer(event);

  if (closetRoot) {
    if (dragging) {
      moveDrag();
      hit.copy(dragPoint);
      updateCursor();
      return;
    }
    const next = pickGarment();
    if (hovered !== next) {
      setHighlight(hovered, false);
      setHighlight(next, true);
      hovered = next;
    }
    if (hovered?.swing) leanToward(hovered.swing, hit.x, 0.22, 0.55);
    updateCursor();
    return;
  }

  if (dragging) {
    moveDrag();
    hit.copy(dragPoint);
    updateCursor();
    return;
  }

  hoveredDemo = pickDemoCloth();
  if (hoveredDemo) leanToward(hoveredDemo.swing, hit.x, 0.35, 0.7);
  updateCursor();
});

canvas.addEventListener(
  "pointerdown",
  (event) => {
    if (event.button !== 0) return;
    setPointer(event);
    if (closetRoot) {
      const item = pickGarment();
      if (item?.swing) {
        event.preventDefault();
        event.stopPropagation();
        canvas.setPointerCapture(event.pointerId);
        beginDrag(item);
      }
      return;
    }
    const cloth = pickDemoCloth();
    if (cloth) {
      event.preventDefault();
      event.stopPropagation();
      canvas.setPointerCapture(event.pointerId);
      beginDrag(cloth);
    }
  },
  true
);

canvas.addEventListener("pointerup", () => endDrag());
canvas.addEventListener("pointercancel", () => endDrag());
canvas.addEventListener("pointerleave", () => {
  if (dragging) return;
  setHighlight(hovered, false);
  hovered = null;
  hoveredDemo = null;
  for (const item of demoClothes) item.cloth.setMouseWorld(hit, false);
  updateCursor();
});

function rememberBlob(file) {
  const url = URL.createObjectURL(file);
  blobUrls.push(url);
  return url;
}

async function assertModelUrl(url) {
  const response = await fetch(url);
  const type = response.headers.get("content-type") || "";
  if (!response.ok || type.includes("text/html")) {
    throw new Error(`Missing ${url}`);
  }
}

async function loadObjFromUrl(url, resourcePath = "/models/") {
  const objLoader = new OBJLoader();
  try {
    const mtlLoader = new MTLLoader();
    mtlLoader.setResourcePath(resourcePath);
    const materials = await mtlLoader.loadAsync(url.replace(/\.obj$/i, ".mtl"));
    materials.preload();
    objLoader.setMaterials(materials);
  } catch {
    // Materials file is optional.
  }
  return objLoader.loadAsync(url);
}

async function loadFromFiles(fileList) {
  const files = [...fileList];
  if (files.length === 0) return;

  const byExt = (ext) => files.find((file) => file.name.toLowerCase().endsWith(ext));
  const glb = byExt(".glb") || byExt(".gltf");
  const fbx = byExt(".fbx");
  const obj = byExt(".obj");

  setHint("Loading closet…");

  if (glb) {
    const gltf = await new GLTFLoader().loadAsync(rememberBlob(glb));
    installCloset(gltf.scene, glb.name);
    return;
  }

  if (fbx) {
    installCloset(await new FBXLoader().loadAsync(rememberBlob(fbx)), fbx.name);
    return;
  }

  if (obj) {
    const manager = new THREE.LoadingManager();
    const named = new Map(files.map((file) => [file.name, rememberBlob(file)]));
    manager.setURLModifier((url) => {
      const base = url.split("/").pop();
      return named.get(base) || named.get(decodeURIComponent(base)) || url;
    });
    const objLoader = new OBJLoader(manager);
    const mtl = byExt(".mtl");
    if (mtl) {
      const mtlLoader = new MTLLoader(manager);
      const materials = await mtlLoader.loadAsync(rememberBlob(mtl));
      materials.preload();
      objLoader.setMaterials(materials);
    }
    installCloset(await objLoader.loadAsync(rememberBlob(obj)), obj.name);
    return;
  }

  setHint("Drop a .glb, .gltf, .obj, or .fbx closet file onto the page.");
}

async function tryLoadCloset() {
  const candidates = [
    { url: "/models/closet.glb", load: async () => (await new GLTFLoader().loadAsync("/models/closet.glb")).scene },
    { url: "/models/closet.gltf", load: async () => (await new GLTFLoader().loadAsync("/models/closet.gltf")).scene },
    { url: "/models/closet.fbx", load: () => new FBXLoader().loadAsync("/models/closet.fbx") },
    { url: "/models/closet.obj", load: () => loadObjFromUrl("/models/closet.obj") },
  ];

  for (const candidate of candidates) {
    try {
      await assertModelUrl(candidate.url);
      installCloset(await candidate.load(), candidate.url);
      return;
    } catch {
      // File is missing or not a real model.
    }
  }
}

function showOverlay(on) {
  if (overlay) overlay.classList.toggle("show", on);
}

window.addEventListener("dragenter", (event) => {
  event.preventDefault();
  showOverlay(true);
});
window.addEventListener("dragover", (event) => {
  event.preventDefault();
  showOverlay(true);
});
window.addEventListener("dragleave", (event) => {
  if (event.relatedTarget) return;
  showOverlay(false);
});
window.addEventListener("drop", async (event) => {
  event.preventDefault();
  showOverlay(false);
  try {
    await loadFromFiles(event.dataTransfer.files);
  } catch (error) {
    setHint(`Could not load that file: ${error.message}`);
    setDemoVisible(true);
  }
});

fileInput?.addEventListener("change", async () => {
  try {
    await loadFromFiles(fileInput.files);
  } catch (error) {
    setHint(`Could not load that file: ${error.message}`);
    setDemoVisible(true);
  }
});

tryLoadCloset();

const clock = new THREE.Clock();

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener("resize", resize);

function frame() {
  const dt = clock.getDelta();
  if (closetRoot) updateImportedGarments(dt);
  else driveDemo(dt);
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

frame();
