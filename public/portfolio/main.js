const modules = [
  {
    id: "artist",
    x: 0,
    y: 250,
    w: 240,
    h: 292,
    kind: "Artist information",
    title: "Zihan",
    body: "Interactive media artist. VJ, video art, interface design, 3D, and digital production.",
    preview: previewArtist,
  },
  {
    id: "works",
    x: 496,
    y: 128,
    w: 240,
    h: 292,
    kind: "Digital art works",
    title: "Moving image",
    body: "VJ sets, video art, and interface design. Photoshop and Premiere.",
    preview: previewWorks,
  },
  {
    id: "3d",
    x: 496,
    y: 484,
    w: 240,
    h: 292,
    kind: "3D design",
    title: "Form and character",
    body: "Character and object design in Maya, Blender, ZBrush, and Fusion.",
    preview: previewForm,
  },
  { id: "p5", x: 312, y: 0, w: 112, h: 84, small: true, kind: "p5.js", preview: () => previewOp("p5") },
  { id: "vj", x: 312, y: 92, w: 112, h: 84, small: true, kind: "VJ", preview: () => previewOp("wave") },
  { id: "video", x: 312, y: 184, w: 112, h: 84, small: true, kind: "Video", preview: () => previewOp("film") },
  { id: "char", x: 312, y: 276, w: 112, h: 84, small: true, kind: "Character", preview: () => previewOp("figure") },
  { id: "resolume", x: 808, y: 0, w: 112, h: 84, small: true, kind: "Resolume", preview: () => previewOp("clips") },
  { id: "maya", x: 808, y: 92, w: 112, h: 84, small: true, kind: "Maya", preview: () => previewOp("cube") },
  { id: "hydra", x: 808, y: 184, w: 112, h: 84, small: true, kind: "Hydra", preview: () => previewOp("synth") },
  { id: "zbrush", x: 808, y: 276, w: 112, h: 84, small: true, kind: "ZBrush", preview: () => previewOp("sculpt") },
];

const links = [
  ["artist", "p5"],
  ["artist", "vj"],
  ["artist", "video"],
  ["artist", "char"],
  ["p5", "works"],
  ["vj", "works"],
  ["video", "works"],
  ["char", "3d"],
  ["works", "resolume"],
  ["works", "maya"],
  ["3d", "hydra"],
  ["3d", "zbrush"],
];

const viewport = document.querySelector("#viewport");
const backdrop = document.querySelector("#backdrop");
const world = document.querySelector("#world");

const byId = Object.fromEntries(modules.map((module) => [module.id, module]));
const outSlot = {};
const inSlot = {};
const routed = links.map(([from, to]) => {
  const outIndex = outSlot[from] || 0;
  const inIndex = inSlot[to] || 0;
  outSlot[from] = outIndex + 1;
  inSlot[to] = inIndex + 1;
  return { from, to, outIndex, inIndex };
});

const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
svg.setAttribute("id", "wires");
svg.setAttribute("width", "1960");
svg.setAttribute("height", "980");
world.append(svg);

const wires = [];
for (const link of routed) {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("class", "wire");
  path.setAttribute("d", wirePath(link));
  svg.append(path);
  wires.push(path);
}

const textKey = "portfolio-module-text";

function readTextStore() {
  try {
    return JSON.parse(localStorage.getItem(textKey)) || {};
  } catch {
    return {};
  }
}

function writeTextStore(moduleId, field, value) {
  const store = readTextStore();
  store[moduleId] = { ...(store[moduleId] || {}), [field]: value };
  localStorage.setItem(textKey, JSON.stringify(store));
}

function openMediaDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("portfolio-media", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("files");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function showMedia(preview, blob, type) {
  preview.querySelector(".media")?.remove();
  const media = document.createElement(type.startsWith("video/") ? "video" : "img");
  media.className = "media";
  media.src = URL.createObjectURL(blob);
  if (media.tagName === "VIDEO") {
    media.controls = true;
    media.loop = true;
    media.muted = true;
    media.playsInline = true;
  }
  preview.append(media);
}

async function saveMedia(moduleId, file) {
  const db = await openMediaDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").put({ blob: file, type: file.type }, moduleId);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function loadMedia(moduleId, preview) {
  const db = await openMediaDb();
  const record = await new Promise((resolve, reject) => {
    const tx = db.transaction("files", "readonly");
    const request = tx.objectStore("files").get(moduleId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  if (record) showMedia(preview, record.blob, record.type);
}

function mountBoxSketch(preview) {
  if (typeof p5 === "undefined") return;
  const host = document.createElement("div");
  host.className = "sketch";
  preview.append(host);
  new p5((p) => {
    p.setup = () => {
      p.setAttributes("alpha", true);
      const canvas = p.createCanvas(host.clientWidth || 112, host.clientHeight || 52, p.WEBGL);
      canvas.elt.style.background = "transparent";
    };
    p.draw = () => {
      p.clear();
      p.ambientLight(80);
      p.directionalLight(255, 255, 255, 0.5, 0.5, -1);
      p.rotateX(p.frameCount * 0.01);
      p.rotateY(p.frameCount * 0.01);
      p.rotateZ(p.frameCount * 0.008);
      p.stroke(0);
      p.strokeWeight(1);
      p.fill(255, 190);
      p.box(Math.min(p.width, p.height) * 0.7);
    };
  }, host);
}

function bindEditable(element, moduleId, field) {
  const saved = readTextStore()[moduleId];
  if (saved && typeof saved[field] === "string") element.textContent = saved[field];
  element.spellcheck = false;
  if (moduleId !== "p5") element.addEventListener("pointerdown", (event) => event.stopPropagation());
  element.addEventListener("blur", () => writeTextStore(moduleId, field, element.textContent));
  element.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && field !== "body") event.preventDefault();
  });
}

for (const module of modules) {
  const node = document.createElement("article");
  node.className = module.small ? "node small" : "node";
  if (module.id === "p5") node.classList.add("link");
  if (module.id === "p5") node.title = "Open p5.js works";
  node.style.left = `${module.x}px`;
  node.style.top = `${module.y}px`;
  const preview = document.createElement("div");
  preview.className = "preview";
  const upload = document.createElement("label");
  upload.className = "upload";
  upload.textContent = "+";
  upload.title = "Add an image or video";
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*,video/*";
  upload.append(input);
  upload.addEventListener("pointerdown", (event) => event.stopPropagation());
  input.addEventListener("change", async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    showMedia(preview, file, file.type);
    await saveMedia(module.id, file);
  });
  preview.append(upload);
  if (module.id === "p5") mountBoxSketch(preview);
  node.append(preview);
  const kind = document.createElement("p");
  kind.className = "kind";
  kind.contentEditable = "true";
  kind.textContent = module.kind;
  bindEditable(kind, module.id, "kind");
  if (module.small) {
    node.append(kind);
  } else {
    const copy = document.createElement("div");
    copy.className = "copy";
    const title = document.createElement("h2");
    title.contentEditable = "true";
    title.textContent = module.title;
    const body = document.createElement("p");
    body.className = "body";
    body.contentEditable = "true";
    body.textContent = module.body;
    bindEditable(title, module.id, "title");
    bindEditable(body, module.id, "body");
    copy.append(kind, title, body);
    node.append(copy);
  }
  module.el = node;
  node.addEventListener("pointerdown", (event) => startNodeDrag(module, event));
  world.append(node);
  if (module.id !== "p5") loadMedia(module.id, preview);
}

let x = 0;
let y = 0;
let scale = 1;

function portTop(node, index, total) {
  const band = node.small ? 52 : 132;
  if (total <= 1) return band * 0.5;
  const margin = node.small ? 7 : 12;
  return margin + ((band - margin * 2) * index) / (total - 1);
}

function wirePath(link) {
  const from = byId[link.from];
  const to = byId[link.to];
  const x1 = from.x + from.w;
  const y1 = from.y + portTop(from, link.outIndex, outSlot[from.id]);
  const x2 = to.x;
  const y2 = to.y + portTop(to, link.inIndex, inSlot[to.id]);
  const bend = Math.max(48, Math.abs(x2 - x1) * 0.45);
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}

function redrawWires() {
  for (let index = 0; index < routed.length; index += 1) {
    wires[index].setAttribute("d", wirePath(routed[index]));
  }
}

function placeNode(module) {
  module.el.style.left = `${module.x}px`;
  module.el.style.top = `${module.y}px`;
}

function applyView() {
  world.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
}

let baseScale = 1;
let fitted = false;

function networkSpan() {
  return {
    minX: Math.min(...modules.map((module) => module.x)),
    minY: Math.min(...modules.map((module) => module.y)),
    maxX: Math.max(...modules.map((module) => module.x + module.w)),
    maxY: Math.max(...modules.map((module) => module.y + module.h)),
  };
}

function scrollLimit() {
  return Math.max(72, viewport.clientWidth * 0.08);
}

function placeVertical(span) {
  y = viewport.clientHeight / 2 - ((span.minY + span.maxY) / 2) * scale;
}

function clampX(span) {
  const margin = scrollLimit();
  const viewCenter = viewport.clientWidth / 2;
  const xMax = viewCenter + margin - span.minX * scale;
  const xMin = viewCenter - margin - span.maxX * scale;
  x = Math.min(xMax, Math.max(xMin, x));
}

function frameNetwork() {
  const span = networkSpan();
  const padX = Math.max(24, viewport.clientWidth * 0.025);
  const padTop = 54;
  const padBottom = 18;
  const width = Math.max(240, viewport.clientWidth - padX * 2);
  const height = Math.max(180, viewport.clientHeight - padTop - padBottom);
  baseScale = Math.min(
    width / (span.maxX - span.minX),
    height / (span.maxY - span.minY)
  );
  scale = baseScale;
  const spanW = (span.maxX - span.minX) * scale;
  const spanH = (span.maxY - span.minY) * scale;
  x = (viewport.clientWidth - spanW) / 2 - span.minX * scale;
  y = padTop + (height - spanH) / 2 - span.minY * scale;
  fitted = true;
  applyView();
}

function zoomAt(clientX, nextScale) {
  const span = networkSpan();
  const rect = viewport.getBoundingClientRect();
  const px = clientX - rect.left;
  const worldX = (px - x) / scale;
  scale = Math.min(10000, Math.max(baseScale, nextScale));
  x = px - worldX * scale;
  placeVertical(span);
  clampX(span);
  applyView();
}

viewport.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    const sideways = event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY);
    if (sideways) {
      x -= event.deltaX || event.deltaY;
      const span = networkSpan();
      placeVertical(span);
      clampX(span);
      applyView();
      return;
    }
    const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
    if (delta > 0 && scale <= baseScale) return;
    zoomAt(event.clientX, scale * Math.exp(-delta * 0.0014));
  },
  { passive: false }
);

let dragged = null;
let dragMoved = false;
let dragOriginX = 0;
let dragOriginY = 0;
let lastX = 0;
let lastY = 0;
let front = 1;
const touches = new Map();
let pinchDistance = 0;
let pinchX = 0;

function startNodeDrag(module, event) {
  if (event.button !== 0 || touches.size > 1) return;
  if (event.target.closest("[contenteditable], .upload, .media")) return;
  event.stopPropagation();
  event.preventDefault();
  dragged = module;
  dragMoved = false;
  dragOriginX = event.clientX;
  dragOriginY = event.clientY;
  lastX = event.clientX;
  lastY = event.clientY;
  front += 1;
  module.el.style.zIndex = String(front);
  module.el.classList.add("lifting");
  try {
    module.el.setPointerCapture(event.pointerId);
  } catch {
    // A synthetic pointer has no capture target. Window listeners still track the drag.
  }
}

window.addEventListener(
  "pointerdown",
  (event) => {
    if (event.pointerType !== "touch") return;
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touches.size === 2) {
      const [a, b] = [...touches.values()];
      pinchDistance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      pinchX = (a.x + b.x) / 2;
      if (dragged) dragged.el.classList.remove("lifting");
      dragged = null;
    }
  },
  true
);

window.addEventListener(
  "pointermove",
  (event) => {
    if (touches.has(event.pointerId)) {
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (touches.size >= 2) {
      event.preventDefault();
      const [a, b] = [...touches.values()];
      const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const midX = (a.x + b.x) / 2;
      const span = networkSpan();
      const rect = viewport.getBoundingClientRect();
      const px = pinchX - rect.left;
      const worldX = (px - x) / scale;
      scale = Math.min(10000, Math.max(baseScale, scale * (distance / pinchDistance)));
      x = px - worldX * scale + (midX - pinchX);
      pinchDistance = distance;
      pinchX = midX;
      placeVertical(span);
      clampX(span);
      applyView();
      return;
    }
    if (!dragged) return;
    if (Math.hypot(event.clientX - dragOriginX, event.clientY - dragOriginY) > 4) dragMoved = true;
    dragged.x += (event.clientX - lastX) / scale;
    dragged.y += (event.clientY - lastY) / scale;
    lastX = event.clientX;
    lastY = event.clientY;
    placeNode(dragged);
    redrawWires();
  },
  { passive: false }
);

function endDrag(event) {
  const module = dragged;
  const moved = dragMoved;
  if (event && touches.has(event.pointerId)) touches.delete(event.pointerId);
  if (touches.size > 0) return;
  if (dragged) dragged.el.classList.remove("lifting");
  dragged = null;
  if (event?.type === "pointerup" && module?.id === "p5" && !moved) {
    window.location.href = "./p5.html";
  }
}

viewport.addEventListener(
  "touchmove",
  (event) => {
    if (event.touches.length > 1) event.preventDefault();
  },
  { passive: false }
);

window.addEventListener("pointerup", endDrag);
window.addEventListener("pointercancel", endDrag);

window.addEventListener("resize", frameNetwork);
if (backdrop && !backdrop.complete) {
  backdrop.addEventListener("load", () => {
    fitted = false;
    frameNetwork();
  });
}
frameNetwork();

function previewArtist() {
  return `<svg viewBox="0 0 240 132" aria-hidden="true">
    <rect width="240" height="132" fill="none"/>
    <circle cx="120" cy="58" r="22" fill="none" stroke="#111111" stroke-width="1.4"/>
    <path d="M78 112c8-22 22-32 42-32s34 10 42 32" fill="none" stroke="#111111" stroke-width="1.4"/>
  </svg>`;
}

function previewWorks() {
  return `<svg viewBox="0 0 240 132" aria-hidden="true">
    <rect width="240" height="132" fill="none"/>
    <rect x="28" y="36" width="184" height="60" fill="none" stroke="#111111" stroke-width="1.2"/>
    <path d="M28 96 L70 62 L104 84 L150 46 L212 78" fill="none" stroke="#111111" stroke-width="1.3"/>
  </svg>`;
}

function previewForm() {
  return `<svg viewBox="0 0 240 132" aria-hidden="true">
    <rect width="240" height="132" fill="none"/>
    <path d="M120 28 L168 52 L168 96 L120 118 L72 96 L72 52 Z" fill="none" stroke="#111111" stroke-width="1.3"/>
    <path d="M120 28 L120 74 L168 96 M120 74 L72 96" fill="none" stroke="#111111" stroke-width="1.2"/>
  </svg>`;
}

function previewOp(kind) {
  const marks = {
    wave: `<path d="M16 26 C28 8, 40 44, 56 26 S84 8, 96 26" fill="none" stroke="#111111" stroke-width="1.3"/>`,
    film: `<rect x="24" y="14" width="64" height="24" fill="none" stroke="#111111"/><path d="M24 20 H88 M24 32 H88" stroke="#111111"/>`,
    figure: `<circle cx="56" cy="16" r="6" fill="none" stroke="#111111"/><path d="M40 40c4-10 10-14 16-14s12 4 16 14" fill="none" stroke="#111111"/>`,
    cube: `<path d="M56 12 L80 24 V40 L56 50 L32 40 V24 Z M56 12 V32 M56 32 L80 24 M56 32 L32 24" fill="none" stroke="#111111"/>`,
    synth: `<circle cx="40" cy="26" r="8" fill="none" stroke="#111111"/><circle cx="72" cy="26" r="8" fill="none" stroke="#111111"/><path d="M48 26 H64" stroke="#111111"/>`,
    p5: `<circle cx="40" cy="26" r="10" fill="none" stroke="#111111"/><rect x="62" y="16" width="20" height="20" fill="none" stroke="#111111"/>`,
    clips: `<rect x="24" y="12" width="18" height="12" fill="none" stroke="#111111"/><rect x="47" y="12" width="18" height="12" fill="none" stroke="#111111"/><rect x="70" y="12" width="18" height="12" fill="none" stroke="#111111"/><rect x="24" y="30" width="18" height="12" fill="none" stroke="#111111"/><rect x="47" y="30" width="18" height="12" fill="none" stroke="#111111"/><rect x="70" y="30" width="18" height="12" fill="none" stroke="#111111"/>`,
    sculpt: `<path d="M30 34 C40 14, 52 12, 62 24 S84 40, 86 22" fill="none" stroke="#111111"/>`,
    code: `<path d="M46 14 L30 26 L46 38 M66 14 L82 26 L66 38" fill="none" stroke="#111111"/>`,
    sliders: `<path d="M34 14 V40 M56 14 V40 M78 14 V40 M34 22 H42 M56 30 H64 M78 18 H86" fill="none" stroke="#111111"/>`,
  };
  return `<svg viewBox="0 0 112 52" aria-hidden="true"><rect width="112" height="52" fill="none"/>${marks[kind]}</svg>`;
}

