import { startArt } from "./art.js";

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
    body: "VJ sets, video art, and interface design. Photoshop, After Effects, and Premiere.",
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
  {
    id: "systems",
    x: 992,
    y: 362,
    w: 240,
    h: 292,
    kind: "Live systems",
    title: "Tools and code",
    body: "JavaScript, p5.js, Three.js, TouchDesigner, Hydra, Resolume, MadMapper, and Module8.",
    preview: previewSystems,
  },
  { id: "production", x: 312, y: 0, w: 112, h: 84, small: true, kind: "Production", preview: () => previewOp("production") },
  { id: "p5", x: 312, y: 112, w: 112, h: 84, small: true, kind: "p5.js", preview: () => previewOp("p5") },
  { id: "vj", x: 312, y: 224, w: 112, h: 84, small: true, kind: "VJ", preview: () => previewOp("wave") },
  { id: "video", x: 312, y: 336, w: 112, h: 84, small: true, kind: "Video", preview: () => previewOp("film") },
  { id: "face", x: 312, y: 468, w: 112, h: 84, small: true, kind: "Interface", preview: () => previewOp("grid") },
  { id: "char", x: 312, y: 580, w: 112, h: 84, small: true, kind: "Character", preview: () => previewOp("figure") },
  { id: "ae", x: 808, y: 0, w: 112, h: 84, small: true, kind: "After Effects", preview: () => previewOp("layers") },
  { id: "premiere", x: 808, y: 112, w: 112, h: 84, small: true, kind: "Premiere", preview: () => previewOp("clapper") },
  { id: "resolume", x: 808, y: 224, w: 112, h: 84, small: true, kind: "Resolume", preview: () => previewOp("clips") },
  { id: "maya", x: 808, y: 336, w: 112, h: 84, small: true, kind: "Maya", preview: () => previewOp("cube") },
  { id: "hydra", x: 808, y: 468, w: 112, h: 84, small: true, kind: "Hydra", preview: () => previewOp("synth") },
  { id: "td", x: 808, y: 580, w: 112, h: 84, small: true, kind: "TouchDesigner", preview: () => previewOp("patch") },
  { id: "blender", x: 808, y: 692, w: 112, h: 84, small: true, kind: "Blender", preview: () => previewOp("blender") },
  { id: "zbrush", x: 808, y: 804, w: 112, h: 84, small: true, kind: "ZBrush", preview: () => previewOp("sculpt") },
  { id: "javascript", x: 1304, y: 352, w: 112, h: 84, small: true, kind: "JavaScript", preview: () => previewOp("code") },
  { id: "module8", x: 1304, y: 464, w: 112, h: 84, small: true, kind: "Module8", preview: () => previewOp("sliders") },
];

const links = [
  ["artist", "production"],
  ["artist", "p5"],
  ["artist", "vj"],
  ["artist", "video"],
  ["artist", "face"],
  ["artist", "char"],
  ["production", "works"],
  ["p5", "works"],
  ["vj", "works"],
  ["video", "works"],
  ["face", "3d"],
  ["char", "3d"],
  ["works", "ae"],
  ["works", "premiere"],
  ["works", "resolume"],
  ["works", "maya"],
  ["3d", "hydra"],
  ["3d", "td"],
  ["3d", "blender"],
  ["3d", "zbrush"],
  ["ae", "systems"],
  ["premiere", "systems"],
  ["resolume", "systems"],
  ["maya", "systems"],
  ["hydra", "systems"],
  ["td", "systems"],
  ["blender", "systems"],
  ["zbrush", "systems"],
  ["systems", "javascript"],
  ["systems", "module8"],
];

const viewport = document.querySelector("#viewport");
const gridLayer = document.querySelector("#grid");
startArt(viewport);
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

const travelers = [];
for (const link of routed) {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("class", "wire");
  path.setAttribute("d", wirePath(link));
  svg.append(path);
  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("class", "traveler");
  circle.setAttribute("r", "5");
  svg.append(circle);
  travelers.push({ path, circle, length: 0, offset: travelers.length / routed.length });
}

for (const module of modules) {
  const node = document.createElement("article");
  node.className = module.small ? "node small" : "node";
  node.style.left = `${module.x}px`;
  node.style.top = `${module.y}px`;
  const copy = module.small
    ? `<p class="kind">${module.kind}</p>`
    : `<div class="copy">
        <p class="kind">${module.kind}</p>
        <h2>${module.title}</h2>
        <p class="body">${module.body}</p>
      </div>`;
  node.innerHTML = `<div class="preview">${module.preview()}</div>${copy}`;
  addPorts(node, module, "in", inSlot[module.id] || 0);
  addPorts(node, module, "out", outSlot[module.id] || 0);
  module.el = node;
  node.addEventListener("pointerdown", (event) => startNodeDrag(module, event));
  world.append(node);
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

function addPorts(nodeEl, module, side, total) {
  for (let index = 0; index < total; index += 1) {
    const port = document.createElement("span");
    port.className = `port ${side}`;
    port.style.top = `${portTop(module, index, total)}px`;
    nodeEl.append(port);
  }
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
    travelers[index].path.setAttribute("d", wirePath(routed[index]));
    travelers[index].length = 0;
  }
}

function placeNode(module) {
  module.el.style.left = `${module.x}px`;
  module.el.style.top = `${module.y}px`;
}

function stepTravelers(now) {
  for (const traveler of travelers) {
    if (!traveler.length) traveler.length = traveler.path.getTotalLength();
    const distance = ((now / 1000) * 90 + traveler.offset * traveler.length) % traveler.length;
    const point = traveler.path.getPointAtLength(distance);
    traveler.circle.setAttribute("cx", point.x);
    traveler.circle.setAttribute("cy", point.y);
  }
  requestAnimationFrame(stepTravelers);
}

requestAnimationFrame(stepTravelers);

const axes = document.querySelector("#axes");
const axisTicks = document.querySelector("#axis-ticks");

function axisStep() {
  const raw = 88 / scale;
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * power;
}

function formatAxis(value) {
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded);
}

function drawAxisMarks(originX, originY) {
  const step = axisStep();
  const width = viewport.clientWidth;
  const height = viewport.clientHeight;
  const worldLeft = -x / scale;
  const worldRight = (width - x) / scale;
  const worldTop = -y / scale;
  const worldBottom = (height - y) / scale;
  const marks = [];
  const firstX = Math.ceil(worldLeft / step);
  const lastX = Math.floor(worldRight / step);
  for (let index = firstX; index <= lastX; index += 1) {
    const value = index * step;
    const sx = x + value * scale;
    const sy = originY;
    if (Math.abs(sx - originX) < 36) continue;
    marks.push(`<line x1="${sx}" y1="${sy - 5}" x2="${sx}" y2="${sy}"></line>`);
    marks.push(`<text x="${sx}" y="${sy - 8}" text-anchor="middle">${formatAxis(value)}</text>`);
  }
  const firstY = Math.ceil(worldTop / step);
  const lastY = Math.floor(worldBottom / step);
  for (let index = firstY; index <= lastY; index += 1) {
    const value = index * step;
    const sx = originX;
    const sy = y + value * scale;
    if (Math.abs(sy - originY) < 22) continue;
    marks.push(`<line x1="${sx - 5}" y1="${sy}" x2="${sx}" y2="${sy}"></line>`);
    marks.push(`<text x="${sx - 8}" y="${sy + 3}" text-anchor="end">${formatAxis(value)}</text>`);
  }
  marks.push(`<text x="${originX - 8}" y="${originY - 8}" text-anchor="end">0</text>`);
  axisTicks.innerHTML = marks.join("");
}

function applyView() {
  world.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  const grid = 24 * scale;
  gridLayer.style.backgroundSize = `${grid}px ${grid}px`;
  gridLayer.style.backgroundPosition = `${x}px ${y}px`;
  const originX = x;
  const originY = y;
  axes.style.setProperty("--axis-x", `${originX}px`);
  axes.style.setProperty("--axis-y", `${originY}px`);
  drawAxisMarks(originX, originY);
}

let baseScale = 1;
let leftAnchor = 0;
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
  leftAnchor = 48;
  const rightSpace = Math.max(88, viewport.clientWidth * 0.1);
  const width = Math.max(280, viewport.clientWidth - leftAnchor - rightSpace);
  const height = viewport.clientHeight;
  const padding = 28;
  baseScale = Math.min(
    width / (span.maxX - span.minX),
    (height - padding * 2) / (span.maxY - span.minY)
  );
  if (!fitted || scale < baseScale) {
    scale = baseScale;
    x = leftAnchor - span.minX * scale;
    fitted = true;
  }
  placeVertical(span);
  clampX(span);
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
let lastX = 0;
let lastY = 0;
let front = 1;
const touches = new Map();
let pinchDistance = 0;
let pinchX = 0;

function startNodeDrag(module, event) {
  if (event.button !== 0 || touches.size > 1) return;
  event.stopPropagation();
  event.preventDefault();
  dragged = module;
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
  if (event && touches.has(event.pointerId)) touches.delete(event.pointerId);
  if (touches.size > 0) return;
  if (dragged) dragged.el.classList.remove("lifting");
  dragged = null;
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
frameNetwork();

function previewArtist() {
  return `<svg viewBox="0 0 240 132" aria-hidden="true">
    <rect width="240" height="132" fill="none"/>
    <circle cx="120" cy="58" r="22" fill="none" stroke="#ffffff" stroke-width="1.4"/>
    <path d="M78 112c8-22 22-32 42-32s34 10 42 32" fill="none" stroke="#ffffff" stroke-width="1.4"/>
  </svg>`;
}

function previewWorks() {
  return `<svg viewBox="0 0 240 132" aria-hidden="true">
    <rect width="240" height="132" fill="none"/>
    <rect x="28" y="36" width="184" height="60" fill="none" stroke="#ffffff" stroke-width="1.2"/>
    <path d="M28 96 L70 62 L104 84 L150 46 L212 78" fill="none" stroke="#ffffff" stroke-width="1.3"/>
  </svg>`;
}

function previewForm() {
  return `<svg viewBox="0 0 240 132" aria-hidden="true">
    <rect width="240" height="132" fill="none"/>
    <path d="M120 28 L168 52 L168 96 L120 118 L72 96 L72 52 Z" fill="none" stroke="#ffffff" stroke-width="1.3"/>
    <path d="M120 28 L120 74 L168 96 M120 74 L72 96" fill="none" stroke="#ffffff" stroke-width="1.2"/>
  </svg>`;
}

function previewOp(kind) {
  const marks = {
    wave: `<path d="M16 26 C28 8, 40 44, 56 26 S84 8, 96 26" fill="none" stroke="#ffffff" stroke-width="1.3"/>`,
    film: `<rect x="24" y="14" width="64" height="24" fill="none" stroke="#ffffff"/><path d="M24 20 H88 M24 32 H88" stroke="#ffffff"/>`,
    grid: `<path d="M28 14 H84 V38 H28 Z M46 14 V38 M66 14 V38 M28 26 H84" fill="none" stroke="#ffffff"/>`,
    figure: `<circle cx="56" cy="16" r="6" fill="none" stroke="#ffffff"/><path d="M40 40c4-10 10-14 16-14s12 4 16 14" fill="none" stroke="#ffffff"/>`,
    layers: `<path d="M56 12 L88 24 L56 36 L24 24 Z M32 30 L56 42 L80 30" fill="none" stroke="#ffffff"/>`,
    cube: `<path d="M56 12 L80 24 V40 L56 50 L32 40 V24 Z M56 12 V32 M56 32 L80 24 M56 32 L32 24" fill="none" stroke="#ffffff"/>`,
    synth: `<circle cx="40" cy="26" r="8" fill="none" stroke="#ffffff"/><circle cx="72" cy="26" r="8" fill="none" stroke="#ffffff"/><path d="M48 26 H64" stroke="#ffffff"/>`,
    patch: `<rect x="22" y="16" width="16" height="12" fill="none" stroke="#ffffff"/><rect x="48" y="12" width="16" height="12" fill="none" stroke="#ffffff"/><rect x="74" y="24" width="16" height="12" fill="none" stroke="#ffffff"/><path d="M38 22 H48 M64 18 H74 V30" fill="none" stroke="#ffffff"/>`,
    production: `<rect x="30" y="14" width="52" height="26" fill="none" stroke="#ffffff"/><path d="M50 20 L66 27 L50 34 Z" fill="none" stroke="#ffffff"/>`,
    p5: `<circle cx="40" cy="26" r="10" fill="none" stroke="#ffffff"/><rect x="62" y="16" width="20" height="20" fill="none" stroke="#ffffff"/>`,
    clapper: `<path d="M28 18 H84 L76 28 H24 Z M24 28 H88 V40 H24 Z" fill="none" stroke="#ffffff"/>`,
    clips: `<rect x="24" y="12" width="18" height="12" fill="none" stroke="#ffffff"/><rect x="47" y="12" width="18" height="12" fill="none" stroke="#ffffff"/><rect x="70" y="12" width="18" height="12" fill="none" stroke="#ffffff"/><rect x="24" y="30" width="18" height="12" fill="none" stroke="#ffffff"/><rect x="47" y="30" width="18" height="12" fill="none" stroke="#ffffff"/><rect x="70" y="30" width="18" height="12" fill="none" stroke="#ffffff"/>`,
    blender: `<circle cx="56" cy="26" r="14" fill="none" stroke="#ffffff"/><circle cx="56" cy="26" r="4" fill="none" stroke="#ffffff"/>`,
    sculpt: `<path d="M30 34 C40 14, 52 12, 62 24 S84 40, 86 22" fill="none" stroke="#ffffff"/>`,
    code: `<path d="M46 14 L30 26 L46 38 M66 14 L82 26 L66 38" fill="none" stroke="#ffffff"/>`,
    sliders: `<path d="M34 14 V40 M56 14 V40 M78 14 V40 M34 22 H42 M56 30 H64 M78 18 H86" fill="none" stroke="#ffffff"/>`,
  };
  return `<svg viewBox="0 0 112 52" aria-hidden="true"><rect width="112" height="52" fill="none"/>${marks[kind]}</svg>`;
}

function previewSystems() {
  return `<svg viewBox="0 0 240 132" aria-hidden="true">
    <rect width="240" height="132" fill="none"/>
    <rect x="36" y="46" width="36" height="28" fill="none" stroke="#ffffff"/>
    <rect x="102" y="28" width="36" height="28" fill="none" stroke="#ffffff"/>
    <rect x="102" y="76" width="36" height="28" fill="none" stroke="#ffffff"/>
    <rect x="168" y="52" width="36" height="28" fill="none" stroke="#ffffff"/>
    <path d="M72 60 H102 M138 42 H168 M138 90 H156 V66 H168" fill="none" stroke="#ffffff" stroke-width="1.2"/>
  </svg>`;
}
