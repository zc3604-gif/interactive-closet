// Works pages as a TouchDesigner-style node graph, like the front page.
// Each uploaded work is a module, joined by ONE single line that runs through
// a small port on the top edge of every module, on a canvas you can
// pan (drag the background), zoom (scroll / pinch) and rearrange (drag a node).
// Data behaviour is unchanged from the grid version of p5-works.js: local
// IndexedDB uploads only (store "p5"), newest first. No saved catalog.
const grid = document.querySelector("#works");
const input = document.querySelector(".add-work input");
const storeName = document.body.dataset.store || "p5";
const urls = new Set();
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
    const tx = db.transaction("p5", mode);
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

let layoutLocked = false;
try { layoutLocked = localStorage.getItem(lockKey) === "1"; } catch {}
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

// Draggable wire ports, like the front page wire ends: one dot on the top
// edge of every module. Drag it left/right along the top edge to move
// where the single line attaches to that module. Stored per store, per
// work id, as pixels from the module's left edge (default: centre).
const wirePortKey = `portfolio-works-wire-ports-${storeName}`;
const wireLockKey = `portfolio-works-wires-locked-${storeName}`;
let wiresLocked = false;
try { wiresLocked = localStorage.getItem(wireLockKey) === "1"; } catch {}
function readWirePortStore() {
  try { return JSON.parse(localStorage.getItem(wirePortKey)) || {}; } catch { return {}; }
}
function writeWirePortStore(workId, px) {
  const store = readWirePortStore();
  store[workId] = px;
  try { localStorage.setItem(wirePortKey, JSON.stringify(store)); } catch {}
}
function portOffset(entry) {
  const stored = readWirePortStore()[entry.work.id];
  if (Number.isFinite(stored)) return Math.min(NODE_W - 6, Math.max(6, stored));
  return NODE_W / 2;
}
function topPort(n) {
  return { x: n.x + portOffset(n), y: n.y };
}

function redrawWires() {
  // One continuous VERY CURVY line through every module's top port, in order,
  // like the front page wires but more pronounced: each segment bows out
  // sideways by ~72px, alternating left / right, so the wire is visibly
  // wavy, not straight. Still one single line, redrawn live on drag.
  if (!nodes.length) {
    singleWire.setAttribute("d", "");
    return;
  }
  const pts = nodes.map((n) => topPort(n));
  if (pts.length === 1) {
    singleWire.setAttribute("d", `M ${pts[0].x} ${pts[0].y}`);
    return;
  }
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy) || 1;
    const px = -dy / len;
    const py = dx / len;
    const sway = (i % 2 === 0 ? 72 : -72);
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
    const p = n.el && n.el.querySelector(".port");
    if (p) p.style.cursor = wiresLocked ? "default" : "grab";
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
    wireBtn.textContent = "No wire moves yet — drag a dot first";
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
    const media = document.createElement(work.type.startsWith("video/") ? "video" : "img");
    media.className = "media";
    const url = URL.createObjectURL(work.blob);
    urls.add(url);
    media.src = url;
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
      await withStore("readwrite", (store) => store.delete(work.id));
      await showWorks();
    });
    meta.append(title, remove);
    node.append(preview, meta);
    const entry = { work, el: node, x: pos.x, y: pos.y };
    nodes.push(entry);
    // One port dot on the top edge — the single line runs through it.
    // Drag it left/right along the top edge to move where the line attaches.
    const port = document.createElement("span");
    port.className = "port";
    port.setAttribute("aria-hidden", "true");
    port.style.left = `${portOffset(entry)}px`;
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
        const px = Math.min(NODE_W - 6, Math.max(6, worldX - entry.x));
        writeWirePortStore(work.id, Math.round(px));
        port.style.left = `${px}px`;
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
    node.append(port);
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
  const works = await withStore("readonly", (store) => store.getAll());
  works.sort((a, b) => b.created - a.created);
  render(works);
}

input.addEventListener("change", async () => {
  const files = [...(input.files || [])];
  input.value = "";
  if (!files.length) return;
  const db = await openWorksDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction("p5", "readwrite");
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
