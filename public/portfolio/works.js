// Works pages as a TouchDesigner-style node graph, like the front page.
// Each uploaded work is a module, wired to the next one, on a canvas you can
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
const NODE_W = 160;
const NODE_H = 120; // preview 88 + title row ~32
const PREVIEW_MID = 44; // vertical centre of the preview area
const COLS = 3;
const COL_GAP = 200;
const ROW_GAP = 220;

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

// Dragged positions, per works page. A work that has never been dragged gets
// the next free slot in the chain, so new uploads never shift or overlap
// works that are already placed.
const posKey = `portfolio-works-positions-${storeName}`;
const lockKey = `portfolio-works-locked-${storeName}`;
let layoutLocked = false;
try { layoutLocked = localStorage.getItem(lockKey) === "1"; } catch {}

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
let wirePaths = [];
let emptyEl = null;

function currentLayout() {
  return Object.fromEntries(nodes.map((n) => [n.work.id, { x: Math.round(n.x), y: Math.round(n.y) }]));
}

function wirePath(a, b) {
  if (b.y !== a.y) {
    // Next row: bottom edge of one node to the top edge of the next.
    const x1 = a.x + NODE_W / 2;
    const y1 = a.y + NODE_H;
    const x2 = b.x + NODE_W / 2;
    const y2 = b.y;
    const bend = Math.max(48, Math.abs(y2 - y1) * 0.45);
    return `M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`;
  }
  // Same row: right edge of one node to the left edge of the next.
  const x1 = a.x + NODE_W;
  const y1 = a.y + PREVIEW_MID;
  const x2 = b.x;
  const y2 = b.y + PREVIEW_MID;
  const bend = Math.max(48, Math.abs(x2 - x1) * 0.45);
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}

function redrawWires() {
  for (let i = 0; i + 1 < nodes.length; i += 1) {
    wirePaths[i]?.setAttribute("d", wirePath(nodes[i], nodes[i + 1]));
  }
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
  frameNetwork();
  drawAxisNumbers();
});

// --- toolbar: Copy layout / Lock layout / Fit view --------------------------
const toolbar = document.createElement("div");
toolbar.className = "works-toolbar";
toolbar.style.cssText = "position:fixed;top:108px;right:12px;z-index:9999;display:flex;gap:8px;";
const copyBtn = document.createElement("button");
copyBtn.type = "button";
copyBtn.textContent = "Copy layout";
const lockBtn = document.createElement("button");
lockBtn.type = "button";
const fitBtn = document.createElement("button");
fitBtn.type = "button";
fitBtn.textContent = "Fit view";
function refreshLockBtn() {
  lockBtn.textContent = layoutLocked ? "Unlock layout" : "Lock layout";
  for (const n of nodes) if (n.el) n.el.style.cursor = layoutLocked ? "default" : "grab";
}
for (const b of [copyBtn, lockBtn, fitBtn]) {
  b.style.cssText = "padding:8px 12px;border:1px solid #111;background:#fff;color:#111;font-size:13px;cursor:pointer;";
}
copyBtn.addEventListener("click", async () => {
  const text = JSON.stringify(currentLayout(), null, 2);
  try { await navigator.clipboard.writeText(text); copyBtn.textContent = "Copied! Paste it to Muse"; }
  catch { window.prompt("Copy your layout and paste it to Muse:", text); copyBtn.textContent = "Copy layout"; return; }
  setTimeout(() => { copyBtn.textContent = "Copy layout"; }, 2500);
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
fitBtn.addEventListener("click", () => {
  frameNetwork();
  drawAxisNumbers();
});
toolbar.append(copyBtn, lockBtn, fitBtn);
document.body.append(toolbar);
refreshLockBtn();


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
  wirePaths = [];
  emptyEl = null;
  if (!works.length) {
    emptyEl = document.createElement("p");
    emptyEl.className = "empty";
    emptyEl.textContent = "No works yet. Use + add a work.";
    emptyEl.style.left = "0px";
    emptyEl.style.top = "0px";
    world.append(emptyEl);
    frameNetwork();
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
  // Wires: each work wired to the next one, newest first.
  for (let i = 0; i + 1 < nodes.length; i += 1) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("class", "wire");
    path.setAttribute("d", wirePath(nodes[i], nodes[i + 1]));
    svg.append(path);
    wirePaths.push(path);
  }
  redrawWires();
  frameNetwork();
  drawAxisNumbers();
  refreshLockBtn();
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
