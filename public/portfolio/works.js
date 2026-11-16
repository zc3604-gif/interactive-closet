// Shared saved state (./saved/state.json): the repo-committed baseline
// for positions / wire ports / view. It sits UNDER this browser's
// localStorage: anything dragged here still wins on this device, but a
// new visitor (or another device) sees the saved layout. Missing file,
// bad JSON, or a stalled request falls back to the hardcoded
// DEFAULT_POSITIONS below, then the chain layout — the page must never
// fail to load because state.json is unavailable. Loaded with top-level
// await (this file is a module) so the saved layout is the baseline
// before any node is placed. The baseline is fetched directly here:
// the "Save to live" button and its client (save-live.js) were removed
// 2026-11-16 because the save relay never worked.
async function fetchSharedJson(url) {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}
async function loadSharedState() {
  const state = await fetchSharedJson("./saved/state.json");
  if (!state || typeof state !== "object" || Array.isArray(state)) return null;
  return state;
}
let sharedState = null;
try {
  sharedState = await loadSharedState();
} catch {
  sharedState = null;
}

// Works pages as a TouchDesigner-style node graph, like the front page.
// Each uploaded work is a module, joined by ONE single line that runs through
// a small port on the top edge of every module, on a canvas you can
// pan (drag the background), zoom (scroll / pinch) and rearrange (drag a node).
// Data behaviour is unchanged from the grid version: saved catalog + local
// IndexedDB uploads, hidden works, title overrides, newest first.
const grid = document.querySelector("#works");
const input = document.querySelector(".add-work input");
const storeName = document.body.dataset.store || "p5";
const urls = new Set();
const hiddenKey = "portfolio-hidden-works";

function hiddenWorkIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem(hiddenKey)) || []);
  } catch {
    return new Set();
  }
}

function workTitleOverride(id, fallback) {
  try {
    const titles = JSON.parse(localStorage.getItem("portfolio-work-titles") || "{}");
    return titles[id] || fallback;
  } catch {
    return fallback;
  }
}

function rememberWorkTitle(id, title) {
  const titles = JSON.parse(localStorage.getItem("portfolio-work-titles") || "{}");
  titles[id] = title;
  localStorage.setItem("portfolio-work-titles", JSON.stringify(titles));
}

function hideWork(id) {
  const hidden = hiddenWorkIds();
  hidden.add(id);
  localStorage.setItem(hiddenKey, JSON.stringify([...hidden]));
}

async function loadCatalog() {
  try {
    const response = await fetch("./saved/catalog.json", { cache: "no-store" });
    if (!response.ok) return { works: {} };
    return await response.json();
  } catch {
    return { works: {} };
  }
}

function openWorksDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("portfolio-works", 3);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of ["p5", "models", "vj", "video", "moving"]) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, run) {
  const db = await openWorksDb();
  const result = await new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const request = run(tx.objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return result;
}

function workTitle(file) {
  const name = file.name.replace(/\.[^.]+$/, "").trim();
  return name || "Untitled";
}

// ---------------------------------------------------------------------------
// Node-graph canvas (same vocabulary as the front page: #viewport, #world,
// #axes, SVG #wires, .node modules).
// ---------------------------------------------------------------------------
const NODE_W = 120;
const NODE_H = 92; // preview 64 + title row ~28
const COLS = 4;
const COL_GAP = 150;
const ROW_GAP = 170;

document.body.classList.add("works-graph");

// Turn the old grid container into the full-screen viewport, reusing the
// front-page #viewport / #world / #axes styles from style.css.
const viewport = grid;
viewport.id = "viewport";
viewport.className = "";
const axes = document.createElement("div");
axes.id = "axes";
axes.setAttribute("aria-hidden", "true");
axes.innerHTML = '<span class="axis-label x">X</span><span class="axis-label y">Y</span>';
const world = document.createElement("div");
world.id = "world";
viewport.append(axes, world);

const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
svg.setAttribute("id", "wires");
svg.setAttribute("width", "1960");
svg.setAttribute("height", "980");
world.append(svg);

// One single line for the whole page: it runs through a small port on the
// top edge of every module, in chain order. No per-pair wires, no elbows.
const singleWire = document.createElementNS("http://www.w3.org/2000/svg", "path");
singleWire.setAttribute("class", "wire single-wire");
singleWire.setAttribute("d", "");
svg.append(singleWire);

// Dragged positions, per works page. A work that has never been dragged gets
// the next free slot in the chain, so new uploads never shift or overlap
// works that are already placed.
const posKey = `portfolio-works-positions-${storeName}`;
const lockKey = `portfolio-works-locked-${storeName}`;
// View (camera) lock: zoom + pan only, independent of the layout lock.
// Locking the view snapshots the current zoom/pan into localStorage per
// store, so a reload restores the same composition. Modules can still be
// dragged individually while the view is locked (unless the layout is
// locked too). Fit view is disabled while the view is locked.
const viewKey = `portfolio-view-${storeName}`;
const viewLockKey = `portfolio-view-locked-${storeName}`;

// Default layouts saved in the repo, keyed by store then work id.
// These are positions the user arranged by dragging and pasted to Muse.
// A work's position comes from localStorage first, then this map, then the
// normal chain layout — so a new visitor sees the saved layout, while the
// user's own dragged positions in their browser still win.
const DEFAULT_POSITIONS = {
  models: {
    "25bbac23-d41b-4e76-9300-bc623b2cfb79": { x: -354, y: -67 }, // LC FAR
    "0144f428-15b3-4d3c-9f71-8a5bcd6b3245": { x: -216, y: 51 }, // CLOSE
    "f0a84f8e-317b-4c31-b803-5d4789e6f9f8": { x: -213, y: 185 }, // misa
    "9546bd75-be05-4814-bc25-9c129b03abab": { x: -219, y: 315 }, // room
    "f2f624ea-6552-458f-8459-839c62d751ff": { x: -135, y: 492 }, // room
  },
};
const storeDefaults = {
  ...(DEFAULT_POSITIONS[storeName] || {}),
  // Shared state.json baseline wins over the hardcoded map (it starts
  // as a copy of it, then moves on as the user saves from the live site).
  ...((sharedState?.works?.[storeName]?.positions) || {}),
};

// Dragging starts unlocked for every store (including Models, even though
// it has a saved default layout), so the user can keep adjusting positions.
// It only starts locked if the user locked it in this browser before.
let layoutLocked = false;
try {
  const lockState = localStorage.getItem(lockKey);
  if (lockState === "1") layoutLocked = true;
} catch {}
let viewLocked = false;
try { viewLocked = localStorage.getItem(viewLockKey) === "1"; } catch {}

function readPosStore() {
  try {
    return JSON.parse(localStorage.getItem(posKey)) || {};
  } catch {
    return {};
  }
}

function writePosStore(workId, px, py) {
  const store = readPosStore();
  store[workId] = { x: px, y: py };
  try {
    localStorage.setItem(posKey, JSON.stringify(store));
  } catch {}
}

function chainPos(slot) {
  return { x: (slot % COLS) * COL_GAP, y: Math.floor(slot / COLS) * ROW_GAP };
}

let nodes = []; // { work, el, x, y }
let emptyEl = null;

function currentLayout() {
  return Object.fromEntries(nodes.map((n) => [n.work.id, { x: Math.round(n.x), y: Math.round(n.y) }]));
}

// Effective wire ports for the works on screen: local drags over the
// shared state.json baseline, normalised to { in, out } per work.
// Only rendered works are included, so a hidden work's ports drop out
// of the saved state along with the work itself.
function currentWirePorts() {
  return Object.fromEntries(nodes.map((n) => [n.work.id, readWirePorts(n.work.id)]));
}

// Draggable wire ports, like the front page wire ends. Every module used
// to have ONE dot where the incoming wire and the outgoing wire both met
// — one knot, two lines. Now an intermediate module (one with a wire in
// AND a wire out) gets TWO separate dots, one per wire, so each line has
// its own attach point. End modules (first / last in the chain) keep one
// dot each. Each dot can be dragged all the way AROUND the module — top,
// right, bottom, left — not just along the top, with the same
// nearestPerimeter behaviour as before.
// Stored per store, per work id, as { in, out }: each a distance in
// pixels along the module's perimeter, clockwise from the top-left
// corner: top 0..120, right 120..212, bottom 212..332, left 332..424.
// Backwards compatible: an old stored value was a single number — it is
// read as the "in" port, and the "out" port starts PORT_OFFSET px further
// along the perimeter, so the user's existing dot stays exactly where
// they put it and the new dot appears next to it, not on top of it.
// A work with no stored value starts at top centre (60) for "in" and
// 60 + PORT_OFFSET for "out".
const wirePortKey = `portfolio-works-wire-ports-${storeName}`;
const wireLockKey = `portfolio-works-wires-locked-${storeName}`;
const PERIMETER = 2 * (NODE_W + NODE_H);
const PORT_OFFSET = 30; // perimeter px between a module's in and out dots
let wiresLocked = false;
try { wiresLocked = localStorage.getItem(wireLockKey) === "1"; } catch {}
function readWirePortStore() {
  try { return JSON.parse(localStorage.getItem(wirePortKey)) || {}; } catch { return {}; }
}
function normPortDist(d, fallback) {
  return Number.isFinite(d) ? ((d % PERIMETER) + PERIMETER) % PERIMETER : fallback;
}
// Both ports of one work, as { in, out }. Local drags win; the shared
// state.json baseline fills in the rest. Accepts the old single-number
// format and partial objects, so nothing the user saved is lost.
function readWirePorts(workId) {
  const local = readWirePortStore()[workId];
  const shared =
    local === undefined ? sharedState?.works?.[storeName]?.wirePorts?.[workId] : undefined;
  return normWirePorts(local !== undefined ? local : shared);
}
function normWirePorts(stored) {
  if (Number.isFinite(stored)) {
    const inD = normPortDist(stored, NODE_W / 2);
    return { in: inD, out: normPortDist(inD + PORT_OFFSET, inD + PORT_OFFSET) };
  }
  if (stored && typeof stored === "object") {
    const inD = normPortDist(stored.in ?? stored.out, NODE_W / 2);
    const outD = normPortDist(stored.out ?? inD + PORT_OFFSET, inD + PORT_OFFSET);
    return { in: inD, out: outD };
  }
  return { in: NODE_W / 2, out: NODE_W / 2 + PORT_OFFSET };
}
function writeWirePortStore(workId, role, d) {
  const store = readWirePortStore();
  const ports = readWirePorts(workId);
  ports[role] = normPortDist(d, ports[role]);
  store[workId] = ports;
  try { localStorage.setItem(wirePortKey, JSON.stringify(store)); } catch {}
}
function portDist(entry, role = "in") {
  return readWirePorts(entry.work.id)[role];
}
function portPointAt(entry, d) {
  if (d < NODE_W) return { x: entry.x + d, y: entry.y };
  if (d < NODE_W + NODE_H) return { x: entry.x + NODE_W, y: entry.y + (d - NODE_W) };
  if (d < 2 * NODE_W + NODE_H) return { x: entry.x + (2 * NODE_W + NODE_H - d), y: entry.y + NODE_H };
  return { x: entry.x, y: entry.y + (PERIMETER - d) };
}
function portPoint(entry, role = "in") {
  return portPointAt(entry, portDist(entry, role));
}
// Nearest point on the module's perimeter to a pointer (module-local
// coords), as a perimeter distance plus the point itself. Dragging the
// dot sticks it to whichever edge the pointer is closest to, so it
// rounds corners as you drag it around the module.
function nearestPerimeter(px, py) {
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const cands = [
    { x: clamp(px, 0, NODE_W), y: 0, d: clamp(px, 0, NODE_W) },
    { x: NODE_W, y: clamp(py, 0, NODE_H), d: NODE_W + clamp(py, 0, NODE_H) },
    { x: clamp(px, 0, NODE_W), y: NODE_H, d: NODE_W + NODE_H + (NODE_W - clamp(px, 0, NODE_W)) },
    { x: 0, y: clamp(py, 0, NODE_H), d: 2 * NODE_W + NODE_H + (NODE_H - clamp(py, 0, NODE_H)) },
  ];
  let best = cands[0];
  let bestD2 = Infinity;
  for (const c of cands) {
    const d2 = (c.x - px) ** 2 + (c.y - py) ** 2;
    if (d2 < bestD2) { bestD2 = d2; best = c; }
  }
  return best;
}

function redrawWires() {
  // One continuous VERY CURVY line through every module's ports, in order,
  // like the front page wires but more pronounced: each segment between
  // modules bows out sideways by ~72px, alternating left / right, so the
  // wire is visibly wavy, not straight. Still one single line, redrawn
  // live on drag. Intermediate modules now contribute TWO points — the
  // incoming wire ends at their "in" dot and the outgoing wire leaves
  // from their separate "out" dot — so no dot ever carries two lines.
  // The short hop between a module's own in and out dots is drawn straight
  // (it runs underneath the module, which sits on top of the SVG), so it
  // never bulges out past the module's edges.
  if (!nodes.length) {
    singleWire.setAttribute("d", "");
    return;
  }
  const pts = [];
  nodes.forEach((n, i) => {
    const first = i === 0;
    const last = i === nodes.length - 1;
    if (first && last) pts.push({ ...portPoint(n, "in"), node: n });
    else if (first) pts.push({ ...portPoint(n, "out"), node: n });
    else if (last) pts.push({ ...portPoint(n, "in"), node: n });
    else {
      pts.push({ ...portPoint(n, "in"), node: n });
      pts.push({ ...portPoint(n, "out"), node: n });
    }
  });
  if (pts.length === 1) {
    singleWire.setAttribute("d", `M ${pts[0].x} ${pts[0].y}`);
    return;
  }
  let d = `M ${pts[0].x} ${pts[0].y}`;
  let interIdx = 0; // counts only between-module segments, for the sway
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    if (p1.node === p2.node) {
      // Hop across one module, in dot -> out dot: straight, hidden below it.
      d += ` L ${p2.x} ${p2.y}`;
      continue;
    }
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy) || 1;
    const px = -dy / len;
    const py = dx / len;
    const sway = (interIdx % 2 === 0 ? 72 : -72);
    interIdx += 1;
    const c1x = p1.x + dx * 0.35 + px * sway;
    const c1y = p1.y + dy * 0.35 + py * sway;
    const c2x = p2.x - dx * 0.35 + px * sway;
    const c2y = p2.y - dy * 0.35 + py * sway;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  singleWire.setAttribute("d", d);
}

// --- view: pan / zoom -------------------------------------------------------
let x = 0;
let y = 0;
let scale = 1;
let baseScale = 1;

function networkSpan() {
  if (!nodes.length) {
    if (emptyEl) return { minX: 0, minY: 0, maxX: 360, maxY: 80 };
    return { minX: 0, minY: 0, maxX: NODE_W, maxY: NODE_H };
  }
  return {
    minX: Math.min(...nodes.map((n) => n.x)),
    minY: Math.min(...nodes.map((n) => n.y)),
    maxX: Math.max(...nodes.map((n) => n.x + NODE_W)),
    maxY: Math.max(...nodes.map((n) => n.y + NODE_H)),
  };
}

function applyView() {
  world.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
}

function clampView() {
  // Keep at least a sliver of the network on screen after any pan / zoom.
  const span = networkSpan();
  const margin = 120;
  const vw = viewport.clientWidth;
  const vh = viewport.clientHeight;
  const left = x + span.minX * scale;
  const right = x + span.maxX * scale;
  const top = y + span.minY * scale;
  const bottom = y + span.maxY * scale;
  if (right < margin) x += margin - right;
  if (left > vw - margin) x -= left - (vw - margin);
  if (bottom < margin) y += margin - bottom;
  if (top > vh - margin) y -= top - (vh - margin);
}

function readSavedView() {
  try {
    const saved = JSON.parse(localStorage.getItem(viewKey)) || null;
    if (!saved || !Number.isFinite(saved.x) || !Number.isFinite(saved.y) || !Number.isFinite(saved.scale)) return null;
    return saved;
  } catch {
    return null;
  }
}

function saveCurrentView() {
  try { localStorage.setItem(viewKey, JSON.stringify({ x: Math.round(x), y: Math.round(y), scale })); } catch {}
}

function restoreSavedView() {
  // Re-apply the locked view after a reframe (render / load): frameNetwork()
  // recomputes the fit, then the saved zoom/pan wins back, clamped to the
  // zoom range for the current window size.
  if (!viewLocked) return false;
  const saved = readSavedView();
  if (!saved) return false;
  scale = Math.min(baseScale * 8, Math.max(baseScale, saved.scale));
  x = saved.x;
  y = saved.y;
  clampView();
  applyView();
  return true;
}

function frameNetwork() {
  const span = networkSpan();
  const padX = Math.max(24, viewport.clientWidth * 0.025);
  const padTop = 116; // below the chrome header + works head + toolbar
  const padBottom = 24;
  const width = Math.max(240, viewport.clientWidth - padX * 2);
  const height = Math.max(180, viewport.clientHeight - padTop - padBottom);
  baseScale = Math.min(1, width / (span.maxX - span.minX), height / (span.maxY - span.minY));
  scale = baseScale;
  const spanW = (span.maxX - span.minX) * scale;
  const spanH = (span.maxY - span.minY) * scale;
  x = (viewport.clientWidth - spanW) / 2 - span.minX * scale;
  y = padTop + (height - spanH) / 2 - span.minY * scale;
  applyView();
}

function zoomAt(clientX, clientY, nextScale) {
  if (viewLocked) return;
  const rect = viewport.getBoundingClientRect();
  const px = clientX - rect.left;
  const py = clientY - rect.top;
  const worldX = (px - x) / scale;
  const worldY = (py - y) / scale;
  scale = Math.min(baseScale * 8, Math.max(baseScale, nextScale));
  x = px - worldX * scale;
  y = py - worldY * scale;
  clampView();
  applyView();
}

function drawAxisNumbers() {
  const step = 48;
  axes.querySelectorAll(".tick").forEach((tick) => tick.remove());
  const width = viewport.clientWidth;
  const height = viewport.clientHeight;
  const centerX = width / 2;
  const centerY = height / 2;
  const origin = document.createElement("span");
  origin.className = "tick origin";
  origin.textContent = "0";
  axes.append(origin);
  for (let index = 1; centerX + index * step < width - 28; index += 1) {
    addAxisTick("tick-x", String(index), centerX + index * step, null);
    addAxisTick("tick-x", String(-index), centerX - index * step, null);
  }
  for (let index = 1; centerY - index * step > 64; index += 1) {
    addAxisTick("tick-y", String(index), null, centerY - index * step);
  }
  for (let index = 1; centerY + index * step < height - 12; index += 1) {
    addAxisTick("tick-y", String(-index), null, centerY + index * step);
  }
}

function addAxisTick(kind, label, left, top) {
  if (kind === "tick-x" && left < 28) return;
  const tick = document.createElement("span");
  tick.className = `tick ${kind}`;
  tick.textContent = label;
  if (left != null) tick.style.left = `${left}px`;
  if (top != null) tick.style.top = `${top}px`;
  axes.append(tick);
}

// Scroll: vertical = zoom at cursor, horizontal / shift = pan sideways.
viewport.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    if (viewLocked) return;
    const sideways = event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY);
    if (sideways) {
      x -= event.deltaX || event.deltaY;
      clampView();
      applyView();
      return;
    }
    const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
    if (delta > 0 && scale <= baseScale) return;
    zoomAt(event.clientX, event.clientY, scale * Math.exp(-delta * 0.0014));
  },
  { passive: false }
);

// Drag the background to pan.
let panState = null;
viewport.addEventListener("pointerdown", (event) => {
  if (viewLocked) return;
  if (event.target.closest(".node, .works-toolbar, button, [contenteditable], input, a")) return;
  if (event.button !== undefined && event.button !== 0) return;
  panState = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startViewX: x, startViewY: y };
  try { viewport.setPointerCapture(event.pointerId); } catch {}
  event.preventDefault();
});
viewport.addEventListener("pointermove", (event) => {
  if (!panState || event.pointerId !== panState.pointerId) return;
  x = panState.startViewX + (event.clientX - panState.startX);
  y = panState.startViewY + (event.clientY - panState.startY);
  applyView();
});
const endPan = (event) => {
  if (!panState || (event.pointerId !== undefined && event.pointerId !== panState.pointerId)) return;
  clampView();
  applyView();
  panState = null;
};
viewport.addEventListener("pointerup", endPan);
viewport.addEventListener("pointercancel", endPan);

// Pinch to zoom (touch).
const touches = new Map();
let pinchDistance = 0;
let pinchMidX = 0;
let pinchMidY = 0;
window.addEventListener(
  "pointerdown",
  (event) => {
    if (event.pointerType !== "touch") return;
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touches.size === 2) {
      const [a, b] = [...touches.values()];
      pinchDistance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      pinchMidX = (a.x + b.x) / 2;
      pinchMidY = (a.y + b.y) / 2;
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
    if (touches.size < 2) return;
    if (viewLocked) return;
    event.preventDefault();
    const [a, b] = [...touches.values()];
    const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    zoomAt(pinchMidX, pinchMidY, scale * (distance / pinchDistance));
    x += midX - pinchMidX;
    y += midY - pinchMidY;
    pinchDistance = distance;
    pinchMidX = midX;
    pinchMidY = midY;
    clampView();
    applyView();
  },
  { passive: false }
);
function endTouch(event) {
  if (event && touches.has(event.pointerId)) touches.delete(event.pointerId);
}
viewport.addEventListener(
  "touchmove",
  (event) => {
    if (event.touches.length > 1) event.preventDefault();
  },
  { passive: false }
);
window.addEventListener("pointerup", endTouch);
window.addEventListener("pointercancel", endTouch);

window.addEventListener("resize", () => {
  // A locked view is a fixed composition: resizing must not reframe it.
  if (viewLocked) { drawAxisNumbers(); return; }
  frameNetwork();
  drawAxisNumbers();
});

// --- toolbar: Copy layout / Lock layout / Lock view / Fit view ----------------
const toolbar = document.createElement("div");
toolbar.className = "works-toolbar";
toolbar.style.cssText = "position:fixed;top:108px;right:12px;z-index:9999;display:flex;gap:8px;";
const copyBtn = document.createElement("button");
copyBtn.type = "button";
copyBtn.textContent = "Copy layout";
const wireBtn = document.createElement("button");
wireBtn.type = "button";
wireBtn.textContent = "Copy wire positions";
const wireLockBtn = document.createElement("button");
wireLockBtn.type = "button";
const lockBtn = document.createElement("button");
lockBtn.type = "button";
const viewBtn = document.createElement("button");
viewBtn.type = "button";
const fitBtn = document.createElement("button");
fitBtn.type = "button";
fitBtn.textContent = "Fit view";
function refreshLockBtn() {
  lockBtn.textContent = layoutLocked ? "Unlock layout" : "Lock layout";
  for (const n of nodes) if (n.el) n.el.style.cursor = layoutLocked ? "default" : "grab";
}
function refreshViewBtn() {
  viewBtn.textContent = viewLocked ? "Unlock view" : "Lock view";
  viewBtn.setAttribute("aria-pressed", viewLocked ? "true" : "false");
  viewBtn.classList.toggle("locked", viewLocked);
  viewBtn.style.background = viewLocked ? "#111" : "#fff";
  viewBtn.style.color = viewLocked ? "#fff" : "#111";
  // Fit view would move a locked composition, so it is disabled while
  // the view is locked instead of silently moving it.
  fitBtn.disabled = viewLocked;
  fitBtn.style.opacity = viewLocked ? "0.45" : "";
  fitBtn.style.cursor = viewLocked ? "not-allowed" : "pointer";
}

function refreshWireLockBtn() {
  wireLockBtn.textContent = wiresLocked ? "Unlock wires" : "Lock wires";
  for (const n of nodes) {
    // A module can now have two port dots (in + out); lock / unlock both.
    if (!n.el) continue;
    for (const p of n.el.querySelectorAll(".port")) p.style.cursor = wiresLocked ? "default" : "grab";
  }
}
for (const b of [copyBtn, wireBtn, wireLockBtn, lockBtn, viewBtn, fitBtn]) {
  b.style.cssText = "padding:8px 12px;border:1px solid #111;background:#fff;color:#111;font-size:13px;cursor:pointer;";
}
copyBtn.addEventListener("click", async () => {
  const text = JSON.stringify(currentLayout(), null, 2);
  try { await navigator.clipboard.writeText(text); copyBtn.textContent = "Copied! Paste it to Muse"; }
  catch { window.prompt("Copy your layout and paste it to Muse:", text); copyBtn.textContent = "Copy layout"; return; }
  setTimeout(() => { copyBtn.textContent = "Copy layout"; }, 2500);
});

wireBtn.addEventListener("click", async () => {
  const positions = readWirePortStore();
  if (!Object.keys(positions).length) {
    wireBtn.textContent = "No wire moves yet — drag a dot around a module first";
    setTimeout(() => { wireBtn.textContent = "Copy wire positions"; }, 2500);
    return;
  }
  const text = JSON.stringify(positions, null, 2);
  try { await navigator.clipboard.writeText(text); wireBtn.textContent = "Copied! Paste it to Muse"; }
  catch { window.prompt("Copy your wire positions and paste them to Muse:", text); wireBtn.textContent = "Copy wire positions"; return; }
  setTimeout(() => { wireBtn.textContent = "Copy wire positions"; }, 2500);
});
wireLockBtn.addEventListener("click", async () => {
  wiresLocked = !wiresLocked;
  try { localStorage.setItem(wireLockKey, wiresLocked ? "1" : "0"); } catch {}
  refreshWireLockBtn();
  if (wiresLocked) {
    const text = JSON.stringify(readWirePortStore(), null, 2);
    try { await navigator.clipboard.writeText(text); wireLockBtn.textContent = "Locked — positions copied"; }
    catch { wireLockBtn.textContent = "Locked"; }
    setTimeout(refreshWireLockBtn, 2500);
  }
});
lockBtn.addEventListener("click", async () => {
  layoutLocked = !layoutLocked;
  try { localStorage.setItem(lockKey, layoutLocked ? "1" : "0"); } catch {}
  refreshLockBtn();
  if (layoutLocked) {
    const text = JSON.stringify(currentLayout(), null, 2);
    try { await navigator.clipboard.writeText(text); lockBtn.textContent = "Locked - layout copied"; }
    catch { lockBtn.textContent = "Locked"; }
    setTimeout(refreshLockBtn, 2500);
  }
});
viewBtn.addEventListener("click", () => {
  viewLocked = !viewLocked;
  try { localStorage.setItem(viewLockKey, viewLocked ? "1" : "0"); } catch {}
  if (viewLocked) saveCurrentView();
  refreshViewBtn();
});
fitBtn.addEventListener("click", () => {
  if (viewLocked) return;
  frameNetwork();
  drawAxisNumbers();
});
toolbar.append(copyBtn, wireBtn, wireLockBtn, lockBtn, viewBtn, fitBtn);
document.body.append(toolbar);
refreshLockBtn();
refreshWireLockBtn();
refreshViewBtn();

// --- lightbox: click a module's preview to view it full size ----------------
// Fixed overlay on document.body (outside #viewport/#world), so it is never
// scaled by the canvas zoom/pan. Backdrop click, the x button, or Esc closes.
const lightbox = document.createElement("div");
lightbox.className = "works-lightbox";
lightbox.setAttribute("aria-hidden", "true");
lightbox.innerHTML = '<button class="lightbox-close" type="button" aria-label="Close">\u00d7</button><figure class="lightbox-figure"><div class="lightbox-media"></div><figcaption class="lightbox-caption"></figcaption></figure>';
document.body.append(lightbox);

function openLightbox(work, media) {
  const holder = lightbox.querySelector(".lightbox-media");
  holder.replaceChildren();
  const full = document.createElement(media.tagName === "VIDEO" ? "video" : "img");
  full.src = media.currentSrc || media.src;
  full.alt = work.title;
  if (full.tagName === "VIDEO") {
    full.controls = true;
    full.loop = true;
    full.playsInline = true;
    full.autoplay = true;
    full.muted = true; // starts silent so it can autoplay; unmute in the controls
  }
  holder.append(full);
  lightbox.querySelector(".lightbox-caption").textContent = work.title;
  lightbox.classList.add("open");
  lightbox.setAttribute("aria-hidden", "false");
}

function closeLightbox() {
  const holder = lightbox.querySelector(".lightbox-media");
  const video = holder.querySelector("video");
  if (video) video.pause();
  holder.replaceChildren();
  lightbox.classList.remove("open");
  lightbox.setAttribute("aria-hidden", "true");
}

lightbox.addEventListener("click", (event) => {
  if (event.target === lightbox || event.target.closest(".lightbox-close")) closeLightbox();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && lightbox.classList.contains("open")) closeLightbox();
});

// --- render: one node per work ----------------------------------------------
function render(works) {
  for (const url of urls) URL.revokeObjectURL(url);
  urls.clear();
  world.replaceChildren();
  world.append(svg);
  nodes = [];
  emptyEl = null;
  if (!works.length) {
    emptyEl = document.createElement("p");
    emptyEl.className = "empty";
    emptyEl.textContent = "No works yet. Use + add a work.";
    emptyEl.style.left = "0px";
    emptyEl.style.top = "0px";
    world.append(emptyEl);
    redrawWires();
    frameNetwork();
    restoreSavedView();
    drawAxisNumbers();
    return;
  }
  const saved = readPosStore();
  let slot = 0;
  for (const work of works) {
    let pos = saved[work.id];
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
      pos = storeDefaults[work.id];
    }
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
      pos = chainPos(slot);
      writePosStore(work.id, pos.x, pos.y);
    }
    slot += 1;
    let justDragged = false; // set for 50ms after a drag, so a drag never opens the lightbox
    const node = document.createElement("article");
    node.className = "node work-node";
    node.style.left = `${pos.x}px`;
    node.style.top = `${pos.y}px`;
    node.style.touchAction = "none";
    const preview = document.createElement("div");
    preview.className = "preview";
    const media = document.createElement((work.type || "").startsWith("video/") ? "video" : "img");
    media.className = "media";
    if (work.src) {
      media.src = work.src;
    } else {
      const url = URL.createObjectURL(work.blob);
      urls.add(url);
      media.src = url;
    }
    media.alt = work.title;
    if (media.tagName === "VIDEO") {
      media.controls = true;
      media.loop = true;
      media.muted = true;
      media.playsInline = true;
    }
    preview.append(media);
    preview.addEventListener("click", () => {
      if (justDragged) return;
      openLightbox(work, media);
    });
    const meta = document.createElement("div");
    meta.className = "meta";
    const title = document.createElement("p");
    title.className = "title";
    title.contentEditable = "true";
    title.spellcheck = false;
    title.textContent = work.title;
    title.addEventListener("pointerdown", (event) => event.stopPropagation());
    title.addEventListener("blur", async () => {
      const next = title.textContent.trim() || "Untitled";
      title.textContent = next;
      work.title = next;
      if (work.saved) {
        rememberWorkTitle(work.id, next);
        return;
      }
      await withStore("readwrite", (store) => store.put(work));
    });
    title.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        title.blur();
      }
    });
    const remove = document.createElement("button");
    remove.className = "remove";
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Remove ${work.title}`);
    remove.addEventListener("click", async () => {
      if (work.saved) hideWork(work.id);
      else await withStore("readwrite", (store) => store.delete(work.id));
      await showWorks();
    });
    meta.append(title, remove);
    node.append(preview, meta);
    const entry = { work, el: node, x: pos.x, y: pos.y };
    nodes.push(entry);
    // Port dots on the module — one per wire that touches it. An
    // intermediate module gets TWO dots (in + out), so the incoming and
    // outgoing wires no longer share one knot; end modules get one dot.
    // Each dot drags all the way around the module (top, right, bottom,
    // left) to move where its line attaches, and saves its own position.
    const makePort = (role) => {
      const port = document.createElement("span");
      port.className = "port";
      port.dataset.role = role;
      port.setAttribute("aria-hidden", "true");
      {
        const pp = portPoint(entry, role);
        port.style.left = `${pp.x - entry.x}px`;
        port.style.top = `${pp.y - entry.y}px`;
      }
      port.style.cursor = wiresLocked ? "default" : "grab";
      port.style.touchAction = "none";
      port.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
        event.preventDefault();
        if (wiresLocked) return;
        try { port.setPointerCapture(event.pointerId); } catch {}
        port.style.cursor = "grabbing";
        const onMove = (ev) => {
          const rect = viewport.getBoundingClientRect();
          const worldX = (ev.clientX - rect.left - x) / scale;
          const worldY = (ev.clientY - rect.top - y) / scale;
          const hit = nearestPerimeter(worldX - entry.x, worldY - entry.y);
          writeWirePortStore(work.id, role, Math.round(hit.d));
          port.style.left = `${hit.x}px`;
          port.style.top = `${hit.y}px`;
          redrawWires();
        };
        const onUp = () => {
          port.style.cursor = wiresLocked ? "default" : "grab";
          port.removeEventListener("pointermove", onMove);
          port.removeEventListener("pointerup", onUp);
          port.removeEventListener("pointercancel", onUp);
        };
        port.addEventListener("pointermove", onMove);
        port.addEventListener("pointerup", onUp);
        port.addEventListener("pointercancel", onUp);
      });
      return port;
    };
    {
      const idx = nodes.length - 1;
      const isFirst = idx === 0;
      const isLast = idx === works.length - 1;
      if (isFirst && isLast) node.append(makePort("in"));
      else if (isFirst) node.append(makePort("out"));
      else if (isLast) node.append(makePort("in"));
      else { node.append(makePort("in")); node.append(makePort("out")); }
    }
    // Drag a node: wires follow live, layout is saved; dragging starts on the
    // image / title area, never on a video, the editable title or the × button.
    let dragState = null;
    node.style.cursor = layoutLocked ? "default" : "grab";
    node.addEventListener("pointerdown", (event) => {
      if (layoutLocked) return;
      if (event.button !== undefined && event.button !== 0) return;
      if (event.target.closest("[contenteditable], video, button, input, a")) return;
      if (touches.size >= 2) return;
      const rect = viewport.getBoundingClientRect();
      dragState = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startWorldX: (event.clientX - rect.left - x) / scale,
        startWorldY: (event.clientY - rect.top - y) / scale,
        startX: entry.x,
        startY: entry.y,
        moved: false,
      };
      try { node.setPointerCapture(event.pointerId); } catch {}
      node.style.cursor = "grabbing";
      event.preventDefault();
    });
    node.addEventListener("pointermove", (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      const rect = viewport.getBoundingClientRect();
      const worldX = (event.clientX - rect.left - x) / scale;
      const worldY = (event.clientY - rect.top - y) / scale;
      if (Math.abs(event.clientX - dragState.startClientX) > 4 || Math.abs(event.clientY - dragState.startClientY) > 4) dragState.moved = true;
      if (!dragState.moved) return;
      entry.x = dragState.startX + (worldX - dragState.startWorldX);
      entry.y = dragState.startY + (worldY - dragState.startWorldY);
      node.style.left = `${entry.x}px`;
      node.style.top = `${entry.y}px`;
      redrawWires();
    });
    const endDrag = (event) => {
      if (!dragState || (event.pointerId !== undefined && event.pointerId !== dragState.pointerId)) return;
      node.style.cursor = layoutLocked ? "default" : "grab";
      if (dragState.moved) {
        writePosStore(work.id, Math.round(entry.x), Math.round(entry.y));
        justDragged = true;
        setTimeout(() => { justDragged = false; }, 50);
      }
      dragState = null;
    };
    node.addEventListener("pointerup", endDrag);
    node.addEventListener("pointercancel", endDrag);
    world.append(node);
  }
  // One single line through every module's top port, in chain order.
  redrawWires();
  frameNetwork();
  restoreSavedView();
  drawAxisNumbers();
  refreshLockBtn();
  refreshWireLockBtn();
  refreshViewBtn();
}

async function showWorks() {
  const hidden = hiddenWorkIds();
  const catalog = await loadCatalog();
  const saved = (catalog.works?.[storeName] || [])
    .filter((work) => !hidden.has(work.id))
    .map((work) => ({
      ...work,
      title: workTitleOverride(work.id, work.title),
      src: `./${work.file}`,
      saved: true,
    }));
  let local = [];
  try {
    local = await withStore("readonly", (store) => store.getAll());
  } catch {
    local = [];
  }
  const seen = new Set(saved.map((work) => work.id));
  const works = [
    ...saved,
    ...local.filter((work) => !seen.has(work.id) && !hidden.has(work.id)),
  ];
  works.sort((a, b) => (b.created || 0) - (a.created || 0));
  render(works);
}

input.addEventListener("change", async () => {
  const files = [...(input.files || [])];
  input.value = "";
  if (!files.length) return;
  const db = await openWorksDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    for (const file of files) {
      store.put({
        id: crypto.randomUUID(),
        title: workTitle(file),
        type: file.type || "application/octet-stream",
        blob: file,
        created: Date.now(),
      });
    }
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  await showWorks();
});

frameNetwork();
drawAxisNumbers();
showWorks();
