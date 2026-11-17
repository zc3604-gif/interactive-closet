// Shared saved state (./saved/state.json): the repo-committed baseline
// for positions / wire ports / view. It sits UNDER this browser's
// localStorage: anything dragged here still wins on this device, but a
// new visitor (or another device) sees the saved layout. Missing file,
// bad JSON, or a stalled request falls back to the hardcoded defaults
// below — the page must never fail to load because state.json is
// unavailable. Loaded with top-level await (this file is a module) so
// the layout is settled before any node is built; no flash of the
// default positions. The baseline is fetched directly here: the
// "Save to live" button and its client (save-live.js) were removed
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

const modules = [
  {
    id: "artist",
    x: -204,
    y: 126,
    w: 240,
    h: 292,
    kind: "Artist information",
    title: "f(x)",
    body: "Interactive Media Arts & Human-Computer Interaction NYC BasedVideo arts, live coding, 3D, post-production, \nSoftWares: Adobe AE PS  Autodeswk Maya Fusion, Zbrush,  TouchDesigner, HydraSynth, Resolumn\n\nContact:email:zc3604@nyu.edunumber:+1(949)620-7911",
    preview: previewArtist,
  },
  {
    id: "works",
    x: 383,
    y: 95,
    w: 240,
    h: 292,
    kind: "Digital art works",
    title: "Moving image",
    body: "VJ sets, video art, and interface design. Photoshop and Premiere.",
    preview: previewWorks,
  },
  {
    id: "3d",
    x: 76,
    y: 427,
    w: 240,
    h: 292,
    kind: "3D design",
    title: "Models",
    body: "Character and object design in Maya, Blender, ZBrush, and Fusion.",
    preview: previewForm,
  },
  { id: "p5", x: 164, y: 82, w: 112, h: 84, small: true, kind: "p5.js", preview: () => previewOp("p5") },
  { id: "vj", x: 162, y: 185, w: 112, h: 84, small: true, kind: "VJ", preview: () => previewOp("wave") },
  { id: "video", x: 164, y: 288, w: 112, h: 84, small: true, kind: "Fine art", preview: () => previewOp("film") },
];

// Custom modules the user added with "Add module": their definitions
// (id + title + fallback position) live in localStorage, so they survive
// reloads in this browser. Positions still go through the normal
// portfolio-module-positions store (dragged positions win), titles
// through portfolio-module-text like the built-ins, and covers through
// the same IndexedDB "files" store as the artist cover.
const customKey = "portfolio-custom-modules";
const customLinksKey = "portfolio-custom-links";
function readCustomStore() {
  try {
    const list = JSON.parse(localStorage.getItem(customKey)) || [];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}
function writeCustomStore(list) {
  try { localStorage.setItem(customKey, JSON.stringify(list)); } catch {}
}
function readCustomLinks() {
  try {
    const list = JSON.parse(localStorage.getItem(customLinksKey)) || [];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}
function writeCustomLinks(list) {
  try { localStorage.setItem(customLinksKey, JSON.stringify(list)); } catch {}
}
// Custom modules the user deleted (Backspace or the × button): their
// ids are remembered here so a repo-saved custom module — one that
// comes back from the shared state.json baseline — is not resurrected
// on reload. Local-only defs are dropped from portfolio-custom-modules
// on removal anyway; this key covers the repo-saved ones. A reused id
// is cleared from this list when a new module takes it (addCustomModule).
const removedCustomsKey = "portfolio-removed-customs";
function readRemovedCustoms() {
  try {
    const list = JSON.parse(localStorage.getItem(removedCustomsKey)) || [];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}
function writeRemovedCustoms(list) {
  try { localStorage.setItem(removedCustomsKey, JSON.stringify(list)); } catch {}
}
// Wires the user deleted with Backspace: built-in pairs remembered here
// so they stay deleted across reloads (custom wires are dropped from
// portfolio-custom-links instead, so they can be re-added cleanly).
const removedLinksKey = "portfolio-removed-links";
function readRemovedLinks() {
  try {
    const list = JSON.parse(localStorage.getItem(removedLinksKey)) || [];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}
function writeRemovedLinks(list) {
  try { localStorage.setItem(removedLinksKey, JSON.stringify(list)); } catch {}
}
// Restore custom modules saved in this browser, before the position
// restores below (dragged positions still win over the fallback here).
// A custom module the user deleted stays deleted: ids recorded in
// portfolio-removed-customs are skipped, so a repo-saved module (once
// the saved-layout branch lands) is not resurrected on reload.
const removedCustoms = readRemovedCustoms();
for (const def of readCustomStore()) {
  if (!def || typeof def.id !== "string" || !def.id.startsWith("custom-")) continue;
  if (removedCustoms.includes(def.id)) continue;
  if (modules.some((m) => m.id === def.id)) continue;
  const title = typeof def.title === "string" && def.title ? def.title : "New module";
  modules.push({
    id: def.id,
    x: Number.isFinite(def.x) ? def.x : 0,
    y: Number.isFinite(def.y) ? def.y : 0,
    w: 112,
    h: 84,
    small: true,
    kind: title,
    title,
    custom: true,
  });
}
const posKey = "portfolio-module-positions";
const lockKey = "portfolio-layout-locked";
let layoutLocked = true;
try { layoutLocked = localStorage.getItem(lockKey) !== "0"; } catch {}
// View (camera) lock for the front page, same as the works pages:
// locking the view snapshots the current zoom/pan into localStorage,
// so a reload restores the same composition. Modules can still be
// dragged individually while the view is locked (unless the layout
// is locked too).
const viewKey = "portfolio-view-front";
const viewLockKey = "portfolio-view-locked-front";
let viewLocked = false;
try { viewLocked = localStorage.getItem(viewLockKey) === "1"; } catch {}

function currentLayout() {
  return Object.fromEntries(modules.map((m) => [m.id, { x: Math.round(m.x), y: Math.round(m.y) }]));
}

// Effective wire-port positions: the shared state.json baseline with
// this browser's dragged ports overlaid (local wins, same as positions).
function effectiveFrontWirePorts() {
  const ports = {};
  for (const [key, value] of Object.entries(sharedState?.front?.wirePorts || {})) {
    if (Number.isFinite(value)) ports[key] = value;
  }
  for (const [key, value] of Object.entries(readPortStore())) {
    if (Number.isFinite(value)) ports[key] = value;
  }
  return ports;
}

function readPosStore() {
  try {
    return JSON.parse(localStorage.getItem(posKey)) || {};
  } catch {
    return {};
  }
}

function writePosStore(moduleId, px, py) {
  const store = readPosStore();
  store[moduleId] = { x: px, y: py };
  try {
    localStorage.setItem(posKey, JSON.stringify(store));
  } catch {}
}

// Resized module sizes (see the resize-handles section below): a scale
// factor per module id, 1 = natural size. Dragging a corner scales the
// tile PROPORTIONALLY — width and height change together, the aspect
// ratio is kept, so a cover photo never distorts. The shared state.json
// baseline (front.sizes) sits UNDER this browser's localStorage, same as
// positions — a repo-saved size can be added later without a code change.
// Older stores held a single number (or { scale }): that still reads as
// the scale. Stores from the free-resize version held { sx, sy }: equal
// axes read as that scale, differing axes read as their AVERAGE, so a
// tile stretched in one direction comes back near its current size
// instead of jumping to one axis or the other.
const sizeKey = "portfolio-module-sizes";
function readSizeStore() {
  try { return JSON.parse(localStorage.getItem(sizeKey)) || {}; } catch { return {}; }
}
function writeSizeStore(moduleId, scale) {
  const store = readSizeStore();
  if (Number.isFinite(scale) && Math.abs(scale - 1) > 0.001) store[moduleId] = Math.round(scale * 1000) / 1000;
  else delete store[moduleId];
  try { localStorage.setItem(sizeKey, JSON.stringify(store)); } catch {}
}
function savedScaleFor(moduleId) {
  let s = null;
  const parseScale = (v) => {
    if (Number.isFinite(v)) return v;
    if (v && typeof v === "object") {
      if (Number.isFinite(v.scale)) return v.scale;
      if (Number.isFinite(v.sx) && Number.isFinite(v.sy)) return (v.sx + v.sy) / 2;
    }
    return null;
  };
  const shared = parseScale(sharedState?.front?.sizes?.[moduleId]);
  if (shared !== null) s = shared;
  const local = parseScale(readSizeStore()[moduleId]);
  if (local !== null) s = local;
  return Number.isFinite(s) && s > 0 ? s : 1;
}
// Apply a scale to a tile: the visible box is a CSS transform (origin
// top-left), so the layout box stays the natural size while the visible
// box — and the wire ports, which read renderedW/renderedH — follow the
// scale. module.w/h hold the scaled logical size, so the view framing
// (networkSpan) sees the resized tile. The content (cover, sketches,
// text) scales with the tile, so nothing inside reflows or clips when a
// tile is made bigger or smaller.
function setModuleScale(module, s) {
  module.scale = s;
  const bw = (Number.isFinite(module.baseW) && module.baseW > 0) ? module.baseW : module.w;
  const bh = (Number.isFinite(module.baseH) && module.baseH > 0) ? module.baseH : module.h;
  module.w = Math.round(bw * s);
  module.h = Math.round(bh * s);
  if (module.el) {
    module.el.style.transform = s === 1 ? "" : `scale(${s})`;
    module.el.style.transformOrigin = "0 0";
  }
}

// Baseline from state.json, UNDER localStorage (restored just below,
// so a dragged position in this browser still wins over the shared one).
if (sharedState && sharedState.front && sharedState.front.positions) {
  for (const module of modules) {
    const pos = sharedState.front.positions[module.id];
    if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
      module.x = pos.x;
      module.y = pos.y;
    }
  }
}

// Restore dragged positions, so a layout the user arranged stays put.
{
  const saved = readPosStore();
  for (const module of modules) {
    const pos = saved[module.id];
    if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
      module.x = pos.x;
      module.y = pos.y;
    }
  }
}

const links = [
  ["artist", "p5"],
  ["artist", "vj"],
  ["artist", "video"],
  ["artist", "3d"],
  ["p5", "works"],
  ["vj", "works"],
  ["video", "works"],
];

// Wires the user deleted with Backspace stay deleted: the removal is
// remembered in localStorage (portfolio-removed-links), so a reload
// does not bring the built-in wire back.
{
  const removed = readRemovedLinks();
  for (let i = links.length - 1; i >= 0; i -= 1) {
    const [a, b] = links[i];
    if (removed.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) links.splice(i, 1);
  }
}

// Restore wires the user added with "Add wire" (same localStorage idea).
for (const pair of readCustomLinks()) {
  if (!Array.isArray(pair) || pair.length !== 2) continue;
  const [from, to] = pair;
  if (from === to) continue;
  if (!modules.some((m) => m.id === from) || !modules.some((m) => m.id === to)) continue;
  if (links.some(([a, b]) => a === from && b === to)) continue;
  links.push([from, to]);
}

const viewport = document.querySelector("#viewport");
const backdrop = document.querySelector("#backdrop");
const world = document.querySelector("#world");

const byId = Object.fromEntries(modules.map((module) => [module.id, module]));
const outSlot = {};
const inSlot = {};
const routed = [];
// Rebuilt whenever links change (Add wire / removing a custom module),
// so new wires get their port slots and defaults like the built-ins.
function rebuildRouted() {
  for (const k of Object.keys(outSlot)) delete outSlot[k];
  for (const k of Object.keys(inSlot)) delete inSlot[k];
  routed.length = 0;
  for (const [from, to] of links) {
    const outIndex = outSlot[from] || 0;
    const inIndex = inSlot[to] || 0;
    outSlot[from] = outIndex + 1;
    inSlot[to] = inIndex + 1;
    routed.push({ from, to, outIndex, inIndex });
  }
}
rebuildRouted();

// Draggable wire ends: each wire end has a saved position in localStorage
// as a distance in pixels along its module's perimeter, clockwise from the
// top-left corner: top 0..w, right w..w+h, bottom w+h..2w+h, left
// 2w+h..2(w+h). Grab the little dot at the end of a wire and drag it all
// the way AROUND the module — it sticks to whichever edge the pointer is
// nearest, rounding the corners as it travels.
// The range uses the module's REAL rendered size (offsetWidth /
// offsetHeight), not the 292px in the data — the artist tile's long body
// text makes it render ~400px tall, which is why a dot clamped to 292px
// stopped short of the tile's real bottom edge, inside the text.
// Positions saved by earlier versions were vertical offsets (pixels down
// one side: the right edge for a "from" end, the left edge for a "to"
// end), stored under portfolio-wire-ports-v2. They are converted to
// perimeter distances at read time, so every dot stays exactly where the
// user put it — nothing is reset. Positions saved by the earliest test
// versions were fractions of the 132px/52px preview strip, migrated once
// to vertical pixels on load (see migratePortStore below).
const portKey = "portfolio-wire-ports-v3";
// The previous store (vertical offsets) is read-only now: readPortStore
// converts its values to perimeter distances on the fly. Converted values
// are NEVER written back into v3 (see writePortStore), so a conversion
// made before a module's element exists can never freeze a wrong value.
// Lock for the wire ends, mirroring Lock layout: when locked, the dots
// cannot be dragged at all. Starts unlocked so the user can keep
// adjusting; locking also copies the positions, like Lock layout does.
// NOTE: these declarations MUST stay — refreshWireLockBtn() reads
// wiresLocked during toolbar setup, and without them the whole script
// throws and the wire-end dots never appear (v1 of this change lost them).
const wireLockKey = "portfolio-wires-locked";
let wiresLocked = false;
try { wiresLocked = localStorage.getItem(wireLockKey) === "1"; } catch {}
const oldPortKey = "portfolio-wire-ports-v2";
const oldestPortKey = "portfolio-wire-ports";
function readRawPortStore(key) {
  try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; }
}
// Effective port store, in perimeter distances: v3 values win; v2
// vertical offsets are converted (right edge for "from", left edge for
// "to") using the module's current rendered size, so Copy wire positions
// and redraws all see one format.
function readPortStore() {
  const merged = {};
  for (const [k, v] of Object.entries(readRawPortStore(oldPortKey))) {
    if (!Number.isFinite(v)) continue;
    const [pair, end] = k.split(":");
    const [from, to] = pair.split(">");
    const node = byId[end === "from" ? from : to];
    if (!node) continue;
    merged[k] = verticalToPerim(node, end, v);
  }
  for (const [k, v] of Object.entries(readRawPortStore(portKey))) {
    if (Number.isFinite(v)) merged[k] = v;
  }
  return merged;
}
function writePortStore(linkKey, end, px) {
  // Write ONLY the v3 store: the value being saved is a real perimeter
  // distance from a drag. Never persist the merged store — it contains
  // v2 values converted at read time, and writing those would freeze a
  // conversion made with a stale module size.
  const store = readRawPortStore(portKey);
  store[linkKey + ":" + end] = px;
  try { localStorage.setItem(portKey, JSON.stringify(store)); } catch {}
}
(function migratePortStore() {
  try {
    // Earliest test versions stored fractions of the 132px/52px preview
    // strip; convert them once to vertical pixels in the v2 store, where
    // readPortStore picks them up as perimeter distances.
    if (localStorage.getItem(oldPortKey)) return;
    const old = JSON.parse(localStorage.getItem(oldestPortKey) || "{}");
    const next = {};
    for (const [k, frac] of Object.entries(old)) {
      if (!Number.isFinite(frac)) continue;
      const [pair, end] = k.split(":");
      const [from, to] = pair.split(">");
      const node = byId[end === "from" ? from : to];
      if (!node) continue;
      // Old values were fractions of the preview strip (132px large / 52px small).
      next[k] = Math.round(frac * (node.small ? 52 : 132));
    }
    if (Object.keys(next).length) localStorage.setItem(oldPortKey, JSON.stringify(next));
    localStorage.removeItem(oldestPortKey);
  } catch {}
})();
// Rendered size follows the resize: the tile's layout box stays its
// natural size (the scale is a transform), so the resized size is
// natural size x scale. baseW/baseH are measured at build time; before
// that, offsetWidth (unscaled) or the data size do the same job.
function renderedW(node) {
  const s = node.scale || 1;
  const base = (Number.isFinite(node.baseW) && node.baseW > 0) ? node.baseW
    : (node.el && node.el.offsetWidth) || (Number.isFinite(node.w) ? node.w / s : 112);
  return base * s;
}
function renderedH(node) {
  const s = node.scale || 1;
  const base = (Number.isFinite(node.baseH) && node.baseH > 0) ? node.baseH
    : (node.el && node.el.offsetHeight) || (Number.isFinite(node.h) ? node.h / s : 84);
  return base * s;
}
function perim(node) {
  return 2 * (renderedW(node) + renderedH(node));
}
function normPortDist(node, d, fallback) {
  const p = perim(node);
  if (!Number.isFinite(p) || p <= 0) return fallback;
  return Number.isFinite(d) ? ((d % p) + p) % p : fallback;
}
// A vertical offset (pixels down one side) as a perimeter distance: the
// "from" end lives on the right edge, the "to" end on the left edge.
function verticalToPerim(node, end, px) {
  const w = renderedW(node);
  const h = renderedH(node);
  const y = Math.min(h, Math.max(0, px));
  return end === "from" ? w + y : 2 * (w + h) - y;
}
// Point on a w-by-h rectangle's perimeter at distance d clockwise
// from the top-left corner, in rectangle-local coords. Pure helper so
// a port distance can be remapped across a resize (see the resize
// drag): the old point is stretched by w1/w0 and h1/h0, then
// distOnPerim reads it back on the new rectangle — the dot keeps its
// relative spot on the same edge even when width and height change by
// different amounts.
function pointOnPerim(w, h, d) {
  const p = 2 * (w + h);
  d = Number.isFinite(d) ? ((d % p) + p) % p : w / 2;
  if (d < w) return { x: d, y: 0 };
  if (d < w + h) return { x: w, y: d - w };
  if (d < 2 * w + h) return { x: 2 * w + h - d, y: h };
  return { x: 0, y: 2 * (w + h) - d };
}
// Nearest point on a w-by-h rectangle's perimeter to (px, py), as a
// perimeter distance. Dragging a dot sticks it to whichever edge the
// pointer is closest to, so it rounds corners as you drag it around
// the module.
function distOnPerim(w, h, px, py) {
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const cands = [
    { x: clamp(px, 0, w), y: 0, d: clamp(px, 0, w) },
    { x: w, y: clamp(py, 0, h), d: w + clamp(py, 0, h) },
    { x: clamp(px, 0, w), y: h, d: w + h + (w - clamp(px, 0, w)) },
    { x: 0, y: clamp(py, 0, h), d: 2 * w + h + (h - clamp(py, 0, h)) },
  ];
  let best = cands[0];
  let bestD2 = Infinity;
  for (const c of cands) {
    const d2 = (c.x - px) ** 2 + (c.y - py) ** 2;
    if (d2 < bestD2) { bestD2 = d2; best = c; }
  }
  return best.d;
}
// Point on the module's perimeter at distance d clockwise from top-left.
function portPointAt(node, d) {
  const w = renderedW(node);
  const h = renderedH(node);
  const p = pointOnPerim(w, h, normPortDist(node, d, w / 2));
  return { x: node.x + p.x, y: node.y + p.y };
}
function nearestPerimeter(node, px, py) {
  return distOnPerim(renderedW(node), renderedH(node), px, py);
}
// Default attach point, as a perimeter distance: the old auto-assigned
// portTop vertical offset, on the same edge as before (right for "from",
// left for "to"), so the default look is unchanged.
function defaultPortDist(node, link, end) {
  const px = portTop(node, end === "from" ? link.outIndex : link.inIndex, end === "from" ? outSlot[link.from] : inSlot[link.to]);
  return verticalToPerim(node, end, px);
}
function portOffset(node, link, end) {
  const key = link.from + ">" + link.to + ":" + end;
  const stored = readPortStore()[key];
  if (Number.isFinite(stored)) return normPortDist(node, stored, defaultPortDist(node, link, end));
  // Shared baseline (state.json), under this browser's localStorage.
  // Baseline values are perimeter distances (Copy wire positions has
  // saved them that way since the four-side change).
  const shared = sharedState?.front?.wirePorts?.[key];
  if (Number.isFinite(shared)) return normPortDist(node, shared, defaultPortDist(node, link, end));
  return defaultPortDist(node, link, end);
}
function portPos(link, end) {
  const node = byId[end === "from" ? link.from : link.to];
  // A link to a removed module must never throw: a throw here aborts
  // redrawWires and leaves every dot unpositioned.
  if (!node) return { x: 0, y: 0 };
  return portPointAt(node, portOffset(node, link, end));
}

const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
svg.setAttribute("id", "wires");
svg.setAttribute("width", "1960");
svg.setAttribute("height", "980");
world.append(svg);

const wires = [];

// Small dots at each wire end — grab one and drag it all the way around
// the module edge.
// They live in their own overlay svg (appended to #world after the nodes,
// at the bottom of this file), so they sit ABOVE the modules instead of
// underneath them in #wires, where the module would swallow the grab.
// The visible dot is r=7 with a thick dark ring, so it reads clearly
// against the white tiles (the old r=5 dot with a hairline ring was
// almost invisible white-on-white, and looked like the knots had been
// deleted). Each has an invisible r=14 grab circle under it, so the dots
// look bigger but are just as easy to grab as before.
const handlesSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
handlesSvg.setAttribute("id", "wire-handles");
handlesSvg.setAttribute("width", "1960");
handlesSvg.setAttribute("height", "980");
handlesSvg.style.position = "absolute";
handlesSvg.style.top = "0";
handlesSvg.style.left = "0";
handlesSvg.style.overflow = "visible";
handlesSvg.style.pointerEvents = "none";
const wireHandles = [];
// ---- Selecting + deleting a wire (Backspace) ----
// Front page only. Clicking a wire selects it (thicker stroke, black
// end dots); Backspace deletes the selected wire. Clicking empty canvas
// or pressing Esc deselects. Built-in deletions are remembered in
// portfolio-removed-links so the wire stays gone on reload; custom
// wires are dropped from portfolio-custom-links instead. Deleting a
// wire removes its port dots, never any module. Selection is kept as a
// "from>to" key (not the routed object) so it survives rebuilds.
let selectedWireKey = null;
const wireHitPaths = [];
function wireKey(link) { return link.from + ">" + link.to; }
function selectWire(link) {
  selectedWireKey = link ? wireKey(link) : null;
  // A wire selection drops any module selection (selectModule(null)
  // only clears the outline, so this cannot recurse).
  if (link) selectModule(null);
  refreshWireSelection();
}
function refreshWireSelection() {
  wires.forEach((path, i) => {
    const link = routed[i];
    const selected = !!link && selectedWireKey === wireKey(link);
    path.style.strokeWidth = selected ? "4.5" : "";
  });
  for (const h of wireHandles) {
    h.dot.setAttribute("fill", selectedWireKey === wireKey(h.link) ? "#111" : "#fff");
  }
}
// ---- Selecting + deleting a module (Backspace) ----
// Front page only, mirrors the wire delete above: click a module tile
// to select it (thick black outline, same look as a selected wire),
// Backspace deletes it. Only custom modules can be deleted — built-ins
// are navigation and stay, so Backspace with a built-in selected does
// nothing. Selecting a module drops any selected wire and vice versa,
// so Backspace is never ambiguous. Esc or clicking empty canvas
// deselects. Selection is kept as a module id (not the element) so it
// survives rebuilds.
let selectedModuleId = null;
function selectModule(id) {
  if (selectedModuleId === id) return;
  if (selectedModuleId && byId[selectedModuleId] && byId[selectedModuleId].el) {
    byId[selectedModuleId].el.style.outline = "";
    byId[selectedModuleId].el.style.outlineOffset = "";
  }
  selectedModuleId = id || null;
  if (id) {
    // A module selection drops any wire selection (and refreshWireSelection
    // is called directly here, not via selectWire, to avoid recursion).
    selectedWireKey = null;
    refreshWireSelection();
    const el = byId[id] && byId[id].el;
    if (el) { el.style.outline = "3px solid #111"; el.style.outlineOffset = "2px"; }
  }
  refreshResizeHandles();
}
function deleteSelectedModule() {
  const id = selectedModuleId;
  if (!id) return;
  const module = byId[id];
  if (!module || !module.custom) return; // Built-ins cannot be deleted.
  selectModule(null);
  removeCustomModule(id);
}
function deleteSelectedWire() {
  if (!selectedWireKey) return;
  const [from, to] = selectedWireKey.split(">");
  if (!links.some(([a, b]) => (a === from && b === to) || (a === to && b === from))) {
    selectWire(null);
    return;
  }
  const customs = readCustomLinks();
  const customIndex = customs.findIndex(([a, b]) => (a === from && b === to) || (a === to && b === from));
  if (customIndex >= 0) {
    customs.splice(customIndex, 1);
    writeCustomLinks(customs);
  } else {
    const removed = readRemovedLinks();
    if (!removed.some(([a, b]) => (a === from && b === to) || (a === to && b === from))) {
      removed.push([from, to]);
      writeRemovedLinks(removed);
    }
  }
  // Drop the link and its saved port positions; modules stay put.
  for (let i = links.length - 1; i >= 0; i -= 1) {
    if ((links[i][0] === from && links[i][1] === to) || (links[i][0] === to && links[i][1] === from)) links.splice(i, 1);
  }
  const ports = readPortStore();
  let changed = false;
  for (const key of [from + ">" + to + ":from", from + ">" + to + ":to", to + ">" + from + ":from", to + ">" + from + ":to"]) {
    if (key in ports) { delete ports[key]; changed = true; }
  }
  if (changed) { try { localStorage.setItem(portKey, JSON.stringify(ports)); } catch {} }
  selectWire(null);
  rebuildRouted();
  buildWireOverlays();
  redrawWires();
}
// Rebuildable wire overlays: paths + end dots are (re)created from the
// current `routed` list, so Add wire / removing a custom module can add
// or drop wires without a reload. Saved port positions live in
// localStorage, so rebuilding never loses a dragged dot.
function buildWireOverlays() {
  for (const path of wires) path.remove();
  wires.length = 0;
  for (const hit of wireHitPaths) hit.remove();
  wireHitPaths.length = 0;
  for (const h of wireHandles) { h.hit.remove(); h.dot.remove(); }
  wireHandles.length = 0;
  for (const link of routed) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("class", "wire");
    path.setAttribute("d", wirePath(link));
    svg.append(path);
    wires.push(path);
    // Fat invisible hit path over the thin visible wire, so the wire is
    // easy to click (same idea as the r=11 grab circles on the dots).
    // The #wires svg has pointer-events:none, so this sets its own.
    const hit = document.createElementNS("http://www.w3.org/2000/svg", "path");
    hit.setAttribute("class", "wire-hit");
    hit.setAttribute("d", wirePath(link));
    hit.setAttribute("fill", "none");
    hit.setAttribute("stroke", "transparent");
    hit.setAttribute("stroke-width", "14");
    hit.style.pointerEvents = "stroke";
    hit.style.cursor = "pointer";
    hit.addEventListener("click", (event) => {
      event.stopPropagation();
      selectWire(link);
    });
    svg.append(hit);
    wireHitPaths.push(hit);
  }
  for (let li = 0; li < routed.length; li++) {
  const link = routed[li];
  for (const end of ["from", "to"]) {
    // Invisible grab area (r=12) under a clearly visible dot (r=6, thick ring).
    const hit = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    hit.setAttribute("class", "wire-handle-hit");
    hit.setAttribute("r", "12");
    hit.setAttribute("fill", "transparent");
    hit.style.cursor = "grab";
    hit.style.pointerEvents = "all";
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("class", "wire-handle");
    dot.setAttribute("r", "6");
    dot.setAttribute("fill", "#fff");
    dot.setAttribute("stroke", "#111");
    dot.setAttribute("stroke-width", "2");
    dot.style.pointerEvents = "none";
    hit.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      event.preventDefault();
      if (wiresLocked) return;
      hit.setPointerCapture(event.pointerId);
      hit.style.cursor = "grabbing";
      const onMove = (ev) => {
        const rect = viewport.getBoundingClientRect();
        const worldX = (ev.clientX - rect.left - x) / scale;
        const worldY = (ev.clientY - rect.top - y) / scale;
        const node = byId[end === "from" ? link.from : link.to];
        if (!node) return;
        const d = nearestPerimeter(node, worldX - node.x, worldY - node.y);
        writePortStore(link.from + ">" + link.to, end, Math.round(d));
        redrawWires();
      };
      const onUp = () => {
        hit.style.cursor = "grab";
        hit.removeEventListener("pointermove", onMove);
        hit.removeEventListener("pointerup", onUp);
        hit.removeEventListener("pointercancel", onUp);
      };
      hit.addEventListener("pointermove", onMove);
      hit.addEventListener("pointerup", onUp);
      hit.addEventListener("pointercancel", onUp);
    });
    handlesSvg.append(hit);
    handlesSvg.append(dot);
    wireHandles.push({ link, end, dot, hit });
  }
  }
  refreshWireSelection();
}
buildWireOverlays();

function refreshWireDots() {
  for (const h of wireHandles) {
    h.dot.style.cursor = wiresLocked ? "default" : "grab";
    h.hit.style.cursor = wiresLocked ? "default" : "grab";
  }
}

// ---- Resizing a module (front page only) ----
// Left-click a module to select it and four little "+" handles appear at
// its corners; drag a corner to resize the tile proportionally — the
// aspect ratio is kept and the opposite corner stays put, so the tile
// grows/shrinks around it. Works for built-ins and custom modules
// alike. Lock layout locks resizing too, like dragging. Sizes persist
// in localStorage (portfolio-module-sizes, see the size store near the
// top) and are included in Copy layout.
// The handles live in the same world-space overlay svg as the wire dots,
// so they sit above the tiles and follow the view; a pointer down on a
// handle never reaches the tile, so a resize can never start a body
// drag by accident.
const resizeHandles = [];
const MIN_TILE_W = 56;
const MAX_TILE_W = 720;
const MAX_TILE_SCALE = 3;
// Set for ~100ms after a resize drag ends, so the click the browser
// fires after pointerup cannot deselect the module when it lands on
// empty canvas instead of the handle (see the viewport click handler
// below) — otherwise the handles vanish after every resize.
let justResized = false;
function resizeScaleLimits(module) {
  const bw = (Number.isFinite(module.baseW) && module.baseW > 0) ? module.baseW : 112;
  return {
    min: Math.max(0.35, MIN_TILE_W / bw),
    max: Math.min(MAX_TILE_SCALE, MAX_TILE_W / bw),
  };
}
function resizeCorners(module) {
  const w = renderedW(module);
  const h = renderedH(module);
  return [
    { cx: module.x, cy: module.y, anchor: "br", cursor: "nwse-resize" },
    { cx: module.x + w, cy: module.y, anchor: "bl", cursor: "nesw-resize" },
    { cx: module.x + w, cy: module.y + h, anchor: "tl", cursor: "nwse-resize" },
    { cx: module.x, cy: module.y + h, anchor: "tr", cursor: "nesw-resize" },
  ];
}
function refreshResizeHandles() {
  const module = selectedModuleId ? byId[selectedModuleId] : null;
  const show = !!module && !!module.el && !layoutLocked && !wirePicking;
  const corners = show ? resizeCorners(module) : [];
  for (let i = 0; i < resizeHandles.length; i++) {
    const h = resizeHandles[i];
    if (!show) { h.g.style.display = "none"; continue; }
    h.g.style.display = "";
    h.g.setAttribute("transform", `translate(${corners[i].cx} ${corners[i].cy})`);
    h.hit.style.cursor = corners[i].cursor;
  }
}
for (let ci = 0; ci < 4; ci++) {
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.setAttribute("class", "resize-handle");
  g.style.display = "none";
  const hit = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  hit.setAttribute("class", "resize-handle-hit");
  hit.setAttribute("x", "-13");
  hit.setAttribute("y", "-13");
  hit.setAttribute("width", "26");
  hit.setAttribute("height", "26");
  hit.setAttribute("fill", "transparent");
  hit.style.pointerEvents = "all";
  const mark = document.createElementNS("http://www.w3.org/2000/svg", "g");
  mark.setAttribute("class", "resize-handle-mark");
  mark.style.pointerEvents = "none";
  const box = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  box.setAttribute("x", "-6");
  box.setAttribute("y", "-6");
  box.setAttribute("width", "12");
  box.setAttribute("height", "12");
  box.setAttribute("fill", "#fff");
  box.setAttribute("stroke", "#111");
  box.setAttribute("stroke-width", "1.5");
  const barH = document.createElementNS("http://www.w3.org/2000/svg", "line");
  barH.setAttribute("x1", "-3.5"); barH.setAttribute("y1", "0");
  barH.setAttribute("x2", "3.5"); barH.setAttribute("y2", "0");
  barH.setAttribute("stroke", "#111"); barH.setAttribute("stroke-width", "1.5");
  const barV = document.createElementNS("http://www.w3.org/2000/svg", "line");
  barV.setAttribute("x1", "0"); barV.setAttribute("y1", "-3.5");
  barV.setAttribute("x2", "0"); barV.setAttribute("y2", "3.5");
  barV.setAttribute("stroke", "#111"); barV.setAttribute("stroke-width", "1.5");
  mark.append(box, barH, barV);
  g.append(hit, mark);
  handlesSvg.append(g);
  resizeHandles.push({ g, hit, corner: ci });
  hit.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    event.preventDefault();
    const module = selectedModuleId ? byId[selectedModuleId] : null;
    if (!module || !module.el || layoutLocked) return;
    const corner = resizeCorners(module)[ci];
    const anchorX = (corner.anchor === "br" || corner.anchor === "tr") ? module.x + renderedW(module) : module.x;
    const anchorY = (corner.anchor === "bl" || corner.anchor === "br") ? module.y + renderedH(module) : module.y;
    const baseW = (Number.isFinite(module.baseW) && module.baseW > 0) ? module.baseW : renderedW(module);
    const baseH = (Number.isFinite(module.baseH) && module.baseH > 0) ? module.baseH : renderedH(module);
    const baseDiag = Math.hypot(baseW, baseH);
    const startScale = module.scale || 1;
    const limits = resizeScaleLimits(module);
    // Wire ports keep their RELATIVE spot on the perimeter while the
    // tile resizes: each stored distance is scaled by the same ratio as
    // the tile, live during the drag, so the dots stay glued to the
    // edge instead of drifting and snapping back at the end.
    const portOrigins = [];
    for (const link of routed) {
      for (const end of ["from", "to"]) {
        const id = end === "from" ? link.from : link.to;
        if (id !== module.id) continue;
        const key = link.from + ">" + link.to + ":" + end;
        const stored = readPortStore()[key];
        const shared = sharedState?.front?.wirePorts?.[key];
        const d0 = Number.isFinite(stored) ? stored
          : Number.isFinite(shared) ? shared
          : defaultPortDist(module, link, end);
        portOrigins.push({ link, end, d0 });
      }
    }
    // The drag listens on window, not on the little hit rect: the rect
    // is small and moves with the corner while dragging, and the drag
    // used to depend entirely on setPointerCapture retargeting moves
    // to it — if capture ever failed, the moves landed on whatever was
    // under the pointer (tile / empty canvas) and the drag silently
    // did nothing. That is what the artist's bottom-corner drags hit
    // in the real-browser check (the drag math itself is fine: the
    // same drag resizes correctly whenever the moves do reach the
    // handler). Capture is kept as best-effort only — it can throw
    // for a pointer the browser does not recognise, and that used to
    // kill the whole drag before any listener was attached.
    const dragPointerId = event.pointerId;
    try { hit.setPointerCapture(dragPointerId); } catch {}
    const onMove = (ev) => {
      if (ev.pointerId !== undefined && ev.pointerId !== dragPointerId) return;
      const rect = viewport.getBoundingClientRect();
      const wx = (ev.clientX - rect.left - x) / scale;
      const wy = (ev.clientY - rect.top - y) / scale;
      // Proportional resize: the scale follows the pointer's distance
      // from the anchored (opposite) corner, so the tile keeps its
      // aspect ratio no matter which way the corner is dragged.
      let s = Math.hypot(wx - anchorX, wy - anchorY) / baseDiag;
      if (!Number.isFinite(s) || s <= 0) return;
      s = Math.min(limits.max, Math.max(limits.min, s));
      const ratio = s / startScale;
      setModuleScale(module, s);
      const w = renderedW(module);
      const h = renderedH(module);
      if (corner.anchor === "br" || corner.anchor === "tr") module.x = anchorX - w;
      if (corner.anchor === "bl" || corner.anchor === "br") module.y = anchorY - h;
      module.el.style.left = `${module.x}px`;
      module.el.style.top = `${module.y}px`;
      for (const p of portOrigins) {
        writePortStore(p.link.from + ">" + p.link.to, p.end, Math.round(p.d0 * ratio));
      }
      redrawWires();
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      writeSizeStore(module.id, module.scale || 1);
      writePosStore(module.id, Math.round(module.x), Math.round(module.y));
      redrawWires();
      // Handles back on the (moved) corners — redrawWires already
      // repositions them, this is belt-and-braces so they are visibly
      // still on the selected module after the drag.
      refreshResizeHandles();
      // The click the browser fires after pointerup can land on empty
      // canvas instead of the handle; without this the viewport's
      // empty-click handler would deselect the module and the handles
      // would vanish after every resize.
      justResized = true;
      setTimeout(() => { justResized = false; }, 100);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  });
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

function showMedia(preview, blob, type, url) {
  preview.querySelector(".media")?.remove();
  const media = document.createElement(type.startsWith("video/") ? "video" : "img");
  media.className = "media";
  media.src = url || URL.createObjectURL(blob);
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

async function loadSavedMedia(moduleId, preview) {
  if (moduleId === "p5" || moduleId === "vj" || moduleId === "video" || moduleId === "works" || moduleId === "3d") return;
  try {
    const response = await fetch("./saved/catalog.json", { cache: "no-store" });
    if (!response.ok) return;
    const catalog = await response.json();
    const item = (catalog.modules || []).find((entry) => entry.id === moduleId);
    if (item) showMedia(preview, null, item.type, `./${item.file}`);
  } catch {
    // The saved catalog is optional until uploads have been stored.
  }
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

function mountGrapeSketch(preview) {
  if (typeof p5 === "undefined") return;
  const host = document.createElement("div");
  host.className = "sketch";
  preview.append(host);
  new p5((p) => {
    let circleX = 0;
    let circleY = 0;
    let circleRadius = 20;

    function smoothFade(start, end, value) {
      const t = p.constrain((value - start) / (end - start), 0, 1);
      return t * t * (3 - 2 * t);
    }

    p.setup = () => {
      const canvas = p.createCanvas(host.clientWidth || 112, host.clientHeight || 52);
      canvas.elt.style.background = "transparent";
      p.pixelDensity(2);
      circleX = p.width / 2;
      circleY = p.height / 2;
    };

    p.draw = () => {
      p.clear();
      const base = Math.min(p.width, p.height) * 0.46;
      const phase = ((p.millis() / 1000) * p.TWO_PI) / 4;
      circleRadius = base + p.sin(phase) * base * (35 / 145);
      circleX = p.width / 2;
      circleY = p.height / 2;

      const context = p.drawingContext;
      const gradient = context.createRadialGradient(circleX, circleY, 0, circleX, circleY, circleRadius);
      gradient.addColorStop(0.0, "rgba(12,12,12,0.95)");
      gradient.addColorStop(0.12, "rgba(40,40,40,0.85)");
      gradient.addColorStop(0.35, "rgba(90,90,90,0.65)");
      gradient.addColorStop(0.62, "rgba(150,150,150,0.43)");
      gradient.addColorStop(0.84, "rgba(195,195,195,0.25)");
      gradient.addColorStop(1.0, "rgba(230,230,230,0)");
      context.save();
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(circleX, circleY, circleRadius, 0, Math.PI * 2);
      context.fill();
      context.restore();

      p.noFill();
      p.strokeWeight(Math.max(0.35, (0.9 * circleRadius) / 145));
      const ringCount = 30;
      for (let index = 1; index < ringCount; index += 1) {
        const fraction = index / ringCount;
        const radius = circleRadius * fraction;
        const opacity = p.lerp(22, 115, fraction);
        const edgeFade = 1 - smoothFade(0.7, 1, fraction);
        p.stroke(255, opacity * edgeFade);
        p.circle(circleX, circleY, radius * 2);
      }

      p.noStroke();
      p.fill(15, 150);
      p.circle(circleX, circleY, (4 * circleRadius) / 145);
    };
  }, host);
}

function mountBasinSketch(preview) {
  if (typeof p5 === "undefined") return;
  const host = document.createElement("div");
  host.className = "sketch";
  preview.append(host);
  const vert = `
    attribute vec3 aPosition;
    void main() {
      vec4 p = vec4(aPosition, 1.0);
      p.xy = p.xy * 2.0 - 1.0;
      gl_Position = p;
    }
  `;
  const frag = `
    precision highp float;
    uniform vec2 uRes;
    uniform float uPD, uTime, uScale, uGap;
    vec2 hash2(vec2 p) {
      p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
      return fract(sin(p) * 43758.5453);
    }
    void main() {
      vec2 frag = vec2(gl_FragCoord.x, uRes.y * uPD - gl_FragCoord.y) / uPD;
      vec2 p = frag / uScale;
      vec2 ip = floor(p);
      float d1 = 8.0;
      float d2 = 8.0;
      for (int j = -2; j <= 2; j++) {
        for (int i = -2; i <= 2; i++) {
          vec2 g = ip + vec2(float(i), float(j));
          vec2 h = hash2(g);
          vec2 pt = g + 0.5 + 0.42 * sin(uTime * (0.25 + 0.6 * h.yx) + 6.2831 * h);
          float d = length(p - pt);
          if (d < d1) { d2 = d1; d1 = d; }
          else if (d < d2) { d2 = d; }
        }
      }
      float e = d2 - d1;
      float aa = 1.5 / uScale;
      float wall = 1.0 - smoothstep(uGap, uGap + aa, e);
      gl_FragColor = vec4(vec3(0.0), wall);
    }
  `;
  new p5((p) => {
    let shader;
    p.setup = () => {
      p.setAttributes("alpha", true);
      const canvas = p.createCanvas(host.clientWidth || 112, host.clientHeight || 52, p.WEBGL);
      canvas.elt.style.background = "transparent";
      p.pixelDensity(1);
      shader = p.createShader(vert, frag);
    };
    p.draw = () => {
      p.clear();
      p.shader(shader);
      shader.setUniform("uRes", [p.width, p.height]);
      shader.setUniform("uPD", p.pixelDensity());
      shader.setUniform("uTime", p.millis() / 1000);
      shader.setUniform("uScale", Math.max(22, p.width / 3.2));
      shader.setUniform("uGap", 0.13);
      p.noStroke();
      p.rect(0, 0, p.width, p.height);
    };
  }, host);
}

function mountRibbonSketch(preview) {
  if (typeof p5 === "undefined") return;
  const host = document.createElement("div");
  host.className = "sketch";
  preview.append(host);
  new p5((p) => {
    const count = 260;
    const across = 46;
    p.setup = () => {
      const canvas = p.createCanvas(host.clientWidth || 240, host.clientHeight || 132);
      canvas.elt.style.background = "transparent";
      p.pixelDensity(1);
    };
    p.draw = () => {
      p.clear();
      const time = p.millis() / 1000;
      const span = Math.min(p.width, p.height);
      const rotation = time * 0.12;
      const cosine = p.cos(rotation);
      const sine = p.sin(rotation);
      for (let i = 0; i < count; i += 1) {
        const u = i / (count - 1);
        const centerX = (u - 0.5) * p.width * 0.95;
        const centerY = p.sin(u * p.TWO_PI + time * 0.4) * span * 0.14
          + p.sin(u * 5 * p.PI - time * 0.6) * span * 0.025;
        const centerZ = p.cos(u * 3 * p.PI + time * 0.3) * span * 0.12;
        const pinch = 0.25 + 0.75 * Math.abs(p.sin(u * 2.2 * p.PI + 1 + time * 0.2));
        const ribbon = pinch * span * 0.34;
        const twist = u * 3 * p.PI + p.sin(time * 0.5 + u * 4) * 0.6;
        const twistCos = p.cos(twist);
        const twistSin = p.sin(twist);
        for (let j = 0; j < across; j += 1) {
          const v = (j / (across - 1) - 0.5) * 2;
          const offsetY = twistCos * v * ribbon;
          const offsetZ = twistSin * v * ribbon + p.sin(v * 3 + u * 20 + time) * ribbon * 0.08;
          const y = centerY + offsetY;
          const z = centerZ + offsetZ;
          const rotatedY = y * cosine - z * sine;
          const rotatedZ = y * sine + z * cosine;
          const scale = 900 / (900 + rotatedZ);
          const alpha = p.map(rotatedZ, -span * 0.35, span * 0.35, 240, 60, true);
          p.stroke(8, 14, 24, alpha);
          p.strokeWeight(1.7 * scale);
          p.point(p.width / 2 + centerX * scale, p.height / 2 + rotatedY * scale);
        }
      }
    };
  }, host);
}

function mountMovingImageP5Cover(preview) {
  // The user's own p5.js sketch, hosted directly in the repo at
  // ./moving-sketch/ (index.html + sketch.js + style.css, copied verbatim
  // from their public p5 editor project zc3604 / 33Zc3jzwM) and embedded as
  // the Moving image tile's cover. The editor's /full/ page was the problem:
  // it renders a ~28px header bar with the pink p5 logo and sketch name, and
  // its canvas sits below that header sized to the full window, so the art
  // was pushed down and cropped out of the 132px preview strip — the tile
  // showed the logo and the top of a white canvas, not the art. Hosting the
  // sketch files directly removes the editor chrome entirely: the canvas is
  // exactly the preview strip (240x132) and the sketch's own fit logic
  // centers the ASCII art in it, full-bleed, no logo, no header, no offset.
  // NOTE: this is a snapshot of the sketch as of 2026-11-16. If the user
  // edits the sketch in the p5 editor later, re-copy the three files here.
  // v56 (2026-11-16): fill the whole tile edge-to-edge. The user said
  // a tiny edge crop is OK. Centre is UNCHANGED at (114, 62) — sketch.js
  // now scales to cover (art >= 252x140), so the edges crop a little
  // instead of leaving white margins. Bumped to v56 to bust the cache.
  // v55 (2026-11-16): position is PERFECT per the user — do not move it.
  // Zoom in a little more only: sketch padding 10 -> 6, font ~3.48px,
  // art 191-226x120, centre still (114, 62), art still fully inside the
  // 240x132 tile. Bumped to v55 to bust the githack cache again.
  // v54 (2026-11-16): the user still saw the p5 logo on the test preview
  // because raw.githack.com was serving STALE main.js (v52, editor iframe)
  // even for ?v=53, while raw.githubusercontent.com served the correct v53
  // hosted sketch — so the ?v= bump alone did not bust githack's cache.
  // This version also zooms the hosted art in (padding 20 -> 10 in
  // sketch.js) and shifts it up 4px / left 6px per the user, so the whole
  // picture shows centred in the 240x132 tile. The ?v=55 on the iframe
  // src busts the iframe cache too. No editor URL anywhere in this file.
  const host = document.createElement("div");
  host.className = "sketch";
  host.style.background = "#000";
  const frame = document.createElement("iframe");
  frame.src = "./moving-sketch/index.html?v=56";
  frame.title = "Moving image — p5.js sketch";
  frame.setAttribute("frameborder", "0");
  frame.setAttribute("scrolling", "no");
  frame.setAttribute("allowfullscreen", "");
  frame.style.cssText = "position:absolute;inset:0;width:100%;height:100%;border:0;margin:0;padding:0;display:block;background:#000;";
  host.append(frame);
  preview.append(host);
}

function mountHowlerSketch(preview) {
  const host = document.createElement("div");
  host.className = "sketch";
  preview.append(host);
  const canvas = document.createElement("canvas");
  const width = 240;
  const height = 132;
  canvas.width = width;
  canvas.height = height;
  host.append(canvas);
  const context = canvas.getContext("2d");
  const image = context.createImageData(width, height);
  const data = image.data;
  let clock = 0;
  let last = performance.now();

  function smoothstep(edge0, edge1, value) {
    const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  function frame(now) {
    const delta = Math.min(50, now - last);
    last = now;
    clock += delta * 0.001 * 0.35;
    const zoom = 1.8;
    const contrast = 1.4;
    const minSide = Math.min(width, height);
    const angle = 0.35;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const ax = -0.45 + 0.12 * Math.sin(clock);
    const ay = 0.65;
    const bx = 0.25;
    const by = -0.65 + 0.1 * Math.cos(clock);
    const cx = 0.25;
    const cy = 0.25;
    const wave = 0.3 * Math.sin(clock * 0.5);
    for (let y = 0; y < height; y += 1) {
      const fragY = height - (y + 0.5);
      for (let x = 0; x < width; x += 1) {
        const fragX = x + 0.5;
        let zx = ((2 * fragX - width) / minSide) * zoom;
        let zy = ((2 * fragY - height) / minSide) * zoom;
        const rx = cosA * zx - sinA * zy;
        const ry = sinA * zx + cosA * zy;
        const zax = rx - ax;
        const zay = ry - ay;
        const zbx = rx - bx;
        const zby = ry - by;
        const nx = zax * zbx - zay * zby;
        const ny = zax * zby + zay * zbx;
        const zcx = rx - cx;
        const zcy = ry - cy;
        const denom = Math.max(zcx * zcx + zcy * zcy, 0.00001);
        const wx = (nx * zcx + ny * zcy) / denom;
        const wy = (ny * zcx - nx * zcy) / denom;
        const phase = Math.atan2(wy, wx);
        const magnitude = Math.hypot(wx, wy);
        const bend = 0.45 * Math.sin(1.5 * Math.log(1 + magnitude));
        let light = 0.5 + 0.5 * Math.cos(phase + bend + wave);
        light = Math.min(1, Math.max(0, (light - 0.5) * contrast + 0.5));
        const silver = smoothstep(0, 0.75, light);
        const highlight = smoothstep(0.65, 1, light);
        let red = 0.025 + (0.56 - 0.025) * silver;
        let green = 0.02 + (0.63 - 0.02) * silver;
        let blue = 0.055 + (0.7 - 0.055) * silver;
        red += (0.88 - red) * highlight;
        green += (1 - green) * highlight;
        blue += (1 - blue) * highlight;
        const index = (y * width + x) * 4;
        data[index] = red * 255;
        data[index + 1] = green * 255;
        data[index + 2] = blue * 255;
        data[index + 3] = 255;
      }
    }
    context.putImageData(image, 0, 0);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

const workPages = {
  p5: "./p5.html",
  vj: "./vj.html",
  video: "./video.html",
  works: "./moving.html",
  "3d": "./models.html",
};

function bindEditable(element, moduleId, field) {
  element.spellcheck = false;
  if (!workPages[moduleId]) element.addEventListener("pointerdown", (event) => event.stopPropagation());
  element.addEventListener("blur", () => writeTextStore(moduleId, field, element.textContent));
  element.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && field !== "body") event.preventDefault();
  });
}

function buildModule(module) {
  const node = document.createElement("article");
  node.className = module.small ? "node small" : "node";
  if (workPages[module.id]) {
    node.classList.add("link");
    node.title = "Open works";
  }
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
  if (module.id === "vj") mountGrapeSketch(preview);
  if (module.id === "video") mountBasinSketch(preview);
  // Moving image cover (test branch): user's p5.js sketch, embedded full-bleed.
  // This is NOT the old mountHowlerSketch animation removed in PR #1.
  if (module.id === "works") mountMovingImageP5Cover(preview);
  if (module.id === "3d") mountRibbonSketch(preview);
  node.append(preview);
  const kind = document.createElement("p");
  kind.className = "kind";
  kind.textContent = module.kind;
  if (module.custom) {
    // A custom module's title is renamed by double-clicking it (prompt),
    // not by inline editing, so the title stays a plain label.
    kind.title = "Double-click to rename";
    node.addEventListener("dblclick", (event) => {
      event.stopPropagation();
      if (!byId[module.id]) return;
      if (event.target.closest(".remove-custom, .upload, input")) return;
      const next = window.prompt("Rename module:", module.title || module.kind);
      if (next === null) return;
      const name = next.trim() || "New module";
      module.title = name;
      module.kind = name;
      kind.textContent = name;
      writeTextStore(module.id, "kind", name);
      writeTextStore(module.id, "title", name);
      const defs = readCustomStore();
      const def = defs.find((d) => d.id === module.id);
      if (def) { def.title = name; writeCustomStore(defs); }
    });
  } else {
    kind.contentEditable = "true";
    bindEditable(kind, module.id, "kind");
  }
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
  if (module.custom) {
    // Custom modules can be removed again; the × also removes their
    // wires and their saved cover.
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "remove-custom";
    removeBtn.textContent = "×";
    removeBtn.title = "Remove this module";
    removeBtn.style.cssText = "position:absolute;top:2px;right:4px;z-index:5;width:18px;height:18px;padding:0;border:1px solid #111;background:#fff;color:#111;font-size:12px;line-height:16px;cursor:pointer;";
    removeBtn.addEventListener("pointerdown", (event) => event.stopPropagation());
    removeBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      removeCustomModule(module.id);
    });
    node.append(removeBtn);
  }
  // Drag a module: wires follow live, layout is saved, a tap still opens its page.
  node.style.touchAction = "none";
  node.style.cursor = "grab";
  let dragState = null;
  let justDragged = false;
  node.addEventListener("pointerdown", (event) => {
    if (wirePicking) return;
    if (layoutLocked) return;
    if (event.button !== undefined && event.button !== 0) return;
    if (event.target.closest("[contenteditable], .upload, .media, input, a, .remove-custom")) return;
    if (event.pointerType === "touch" && typeof touches !== "undefined" && touches.size >= 2) return;
    const rect = viewport.getBoundingClientRect();
    dragState = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startWorldX: (event.clientX - rect.left - x) / scale,
      startWorldY: (event.clientY - rect.top - y) / scale,
      startModuleX: module.x,
      startModuleY: module.y,
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
    module.x = dragState.startModuleX + (worldX - dragState.startWorldX);
    module.y = dragState.startModuleY + (worldY - dragState.startWorldY);
    node.style.left = `${module.x}px`;
    node.style.top = `${module.y}px`;
    redrawWires();
  });
  const endDrag = (event) => {
    if (!dragState || (event.pointerId !== undefined && event.pointerId !== dragState.pointerId)) return;
    node.style.cursor = "grab";
    if (dragState.moved) {
      writePosStore(module.id, Math.round(module.x), Math.round(module.y));
      justDragged = true;
      setTimeout(() => { justDragged = false; }, 50);
    }
    dragState = null;
  };
  node.addEventListener("pointerup", endDrag);
  node.addEventListener("pointercancel", endDrag);
  node.addEventListener("click", (event) => {
    if (wirePicking) { pickModuleForWire(module.id); return; }
    if (justDragged) return;
    if (event.target.closest("[contenteditable], .upload, .media, input, .remove-custom")) return;
    // Click selects the module (thick black outline, like a selected
    // wire); navigation moved to double-click so a click never opens a
    // page by accident while selecting. Double-click still renames a
    // custom module (its own handler above).
    selectModule(module.id);
  });
  if (!module.custom) {
    // Built-in modules open their works page on double-click.
    node.addEventListener("dblclick", (event) => {
      if (wirePicking) return;
      if (event.target.closest("[contenteditable], .upload, .media, input, .remove-custom")) return;
      const page = workPages[module.id];
      if (page) window.location.href = page;
    });
  }
  world.append(node);
  // Natural (unscaled) size, measured once the tile is in the page:
  // the per-axis resize scale multiplies this, and the wire ports read
  // it back through renderedW/renderedH.
  module.baseW = node.offsetWidth || module.w;
  module.baseH = node.offsetHeight || module.h;
  loadSavedMedia(module.id, preview).then(() => {
    if (module.id !== "p5" && module.id !== "vj" && module.id !== "video" && module.id !== "works" && module.id !== "3d") return loadMedia(module.id, preview);
  });
}

for (const module of modules) buildModule(module);

// Apply any saved resize sizes (repo baseline under localStorage),
// before the first framing — so the view fits the resized tiles.
for (const module of modules) {
  const s = savedScaleFor(module.id);
  if (s !== 1) setModuleScale(module, s);
}

// ---- Custom modules + custom wires ("Add module" / "Add wire") ----
// Front page only, no outside service: new tiles and wires live in the
// same localStorage stores as everything else on this page, and the
// Copy layout / Copy wire positions buttons include them, so the user
// pastes them to Muse to save into the repo like any other layout.
let wirePicking = false;
let wirePickFrom = null;
let addWireBtn = null;

function setWirePicking(on) {
  wirePicking = on;
  // Starting to pick a new wire drops any selected wire, so Backspace
  // cannot delete it by accident while picking modules.
  if (on) selectWire(null);
  // Picking also drops any selected module, for the same reason.
  if (on) selectModule(null);
  if (!on) {
    if (wirePickFrom && byId[wirePickFrom] && byId[wirePickFrom].el) {
      byId[wirePickFrom].el.style.outline = "";
    }
    wirePickFrom = null;
  }
  if (addWireBtn) addWireBtn.textContent = on ? (wirePickFrom ? "Pick 2nd module…" : "Pick 1st module…") : "Add wire";
}

function pickModuleForWire(moduleId) {
  if (!wirePicking) return;
  if (!wirePickFrom) {
    wirePickFrom = moduleId;
    const el = byId[moduleId] && byId[moduleId].el;
    if (el) { el.style.outline = "2px dashed #111"; el.style.outlineOffset = "2px"; }
    if (addWireBtn) addWireBtn.textContent = "Pick 2nd module…";
    return;
  }
  if (moduleId === wirePickFrom) return;
  const from = wirePickFrom;
  const to = moduleId;
  if (links.some(([a, b]) => (a === from && b === to) || (a === to && b === from))) {
    setWirePicking(false);
    if (addWireBtn) {
      addWireBtn.textContent = "Already wired";
      setTimeout(() => { if (addWireBtn) addWireBtn.textContent = "Add wire"; }, 2000);
    }
    return;
  }
  links.push([from, to]);
  const customs = readCustomLinks();
  customs.push([from, to]);
  writeCustomLinks(customs);
  // Re-adding a wire the user had deleted with Backspace clears the
  // remembered removal, so it is not deleted again on reload.
  const removed = readRemovedLinks();
  const removedIndex = removed.findIndex(([a, b]) => (a === from && b === to) || (a === to && b === from));
  if (removedIndex >= 0) { removed.splice(removedIndex, 1); writeRemovedLinks(removed); }
  setWirePicking(false);
  rebuildRouted();
  buildWireOverlays();
  redrawWires();
}

function nextCustomId() {
  let max = 0;
  for (const m of modules) {
    const match = /^custom-(\d+)$/.exec(m.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return "custom-" + (max + 1);
}

function addCustomModule(title) {
  const id = nextCustomId();
  const count = modules.filter((m) => m.custom).length;
  // Near the centre of the current view, staggered so repeated adds
  // do not stack exactly on top of each other. Draggable afterwards
  // (once the layout is unlocked, like the built-in tiles).
  const centerX = (viewport.clientWidth / 2 - x) / scale;
  const centerY = (viewport.clientHeight / 2 - y) / scale;
  const module = {
    id,
    title,
    kind: title,
    x: Math.round(centerX - 56 + ((count * 47) % 180)),
    y: Math.round(centerY - 42 + ((count * 61) % 140)),
    w: 112,
    h: 84,
    small: true,
    custom: true,
  };
  modules.push(module);
  byId[id] = module;
  // If this id was deleted before (and recorded in
  // portfolio-removed-customs), the new module takes it over, so the
  // old removal must not hide it on the next reload.
  const removedCustoms = readRemovedCustoms();
  const removedIndex = removedCustoms.indexOf(id);
  if (removedIndex >= 0) { removedCustoms.splice(removedIndex, 1); writeRemovedCustoms(removedCustoms); }
  const defs = readCustomStore();
  defs.push({ id, title, x: module.x, y: module.y });
  writeCustomStore(defs);
  buildModule(module);
}

function removeCustomModule(id) {
  const module = byId[id];
  if (!module || !module.custom) return;
  if (selectedModuleId === id) selectModule(null);
  if (wirePickFrom === id) setWirePicking(false);
  if (selectedWireKey) {
    const [a, b] = selectedWireKey.split(">");
    if (a === id || b === id) selectWire(null);
  }
  // Remember the deletion so a repo-saved custom module (state.json
  // baseline) is not resurrected on reload; local-only defs are
  // dropped from the custom store just below.
  const removedCustoms = readRemovedCustoms();
  if (!removedCustoms.includes(id)) {
    removedCustoms.push(id);
    writeRemovedCustoms(removedCustoms);
  }
  // Remove wires touching this module (and their saved port positions).
  const touched = links.filter(([a, b]) => a === id || b === id);
  for (let i = links.length - 1; i >= 0; i -= 1) {
    if (links[i][0] === id || links[i][1] === id) links.splice(i, 1);
  }
  if (touched.length) {
    const ports = readPortStore();
    let changed = false;
    for (const [a, b] of touched) {
      for (const end of ["from", "to"]) {
        const k = a + ">" + b + ":" + end;
        if (k in ports) { delete ports[k]; changed = true; }
      }
    }
    if (changed) { try { localStorage.setItem(portKey, JSON.stringify(ports)); } catch {} }
    writeCustomLinks(readCustomLinks().filter(([a, b]) => a !== id && b !== id));
  }
  // Remove the module itself and its saved state (position, text, cover).
  const mi = modules.indexOf(module);
  if (mi >= 0) modules.splice(mi, 1);
  delete byId[id];
  writeCustomStore(readCustomStore().filter((d) => d.id !== id));
  const pos = readPosStore();
  if (id in pos) { delete pos[id]; try { localStorage.setItem(posKey, JSON.stringify(pos)); } catch {} }
  const text = readTextStore();
  if (id in text) { delete text[id]; try { localStorage.setItem(textKey, JSON.stringify(text)); } catch {} }
  deleteModuleCover(id);
  if (module.el) module.el.remove();
  rebuildRouted();
  buildWireOverlays();
  redrawWires();
}

// A custom module's cover lives in the same IndexedDB "files" store as
// the artist cover (picked with the tile's + button, shown cropped by
// .preview .media { object-fit: cover }). Removing the module deletes it.
async function deleteModuleCover(moduleId) {
  try {
    const db = await openMediaDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction("files", "readwrite");
      tx.objectStore("files").delete(moduleId);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {}
}

async function moduleHasCover(moduleId) {
  try {
    const db = await openMediaDb();
    const record = await new Promise((resolve, reject) => {
      const tx = db.transaction("files", "readonly");
      const request = tx.objectStore("files").get(moduleId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return !!record;
  } catch { return false; }
}

// The layout text copied for Muse: built-in positions as before, plus
// one entry per custom module (title + whether it has a cover, so the
// user knows to send the image file along for saving to the repo).
async function layoutCopyText() {
  const layout = currentLayout();
  // Resized modules: scale + logical size, so Muse can save
  // them as repo defaults (state.json front.sizes) later. Only modules
  // whose size actually changed are listed; the rest use the code defaults.
  const sizes = {};
  for (const m of modules) {
    const s = m.scale || 1;
    if (Math.abs(s - 1) > 0.001) {
      sizes[m.id] = { scale: Math.round(s * 1000) / 1000, w: Math.round(renderedW(m)), h: Math.round(renderedH(m)) };
    }
  }
  if (Object.keys(sizes).length) layout.sizes = sizes;
  const customs = modules.filter((m) => m.custom);
  if (customs.length) {
    layout.customModules = [];
    for (const m of customs) {
      layout.customModules.push({
        id: m.id,
        title: m.title || m.kind,
        x: Math.round(m.x),
        y: Math.round(m.y),
        scale: Math.round((m.scale || 1) * 1000) / 1000,
        hasCover: await moduleHasCover(m.id),
      });
    }
  }
  const removedLinks = readRemovedLinks();
  if (removedLinks.length) layout.removedLinks = removedLinks;
  // Deleted custom modules no longer appear in customModules above
  // (they are gone from `modules`); list them too, so Muse can drop
  // a repo-saved one instead of it coming back on reload.
  const removedCustoms = readRemovedCustoms();
  if (removedCustoms.length) layout.removedCustomModules = removedCustoms;
  return JSON.stringify(layout, null, 2);
}

// Lock / copy layout toolbar: drag first, then lock, then paste the copied positions to Muse.
{
  const bar = document.createElement("div");
  bar.style.cssText = "position:fixed;top:64px;right:12px;z-index:9999;display:flex;gap:8px;";
  const copyBtn = document.createElement("button");
  copyBtn.textContent = "Copy layout";
  const wireBtn = document.createElement("button");
  wireBtn.textContent = "Copy wire positions";
  const wireLockBtn = document.createElement("button");
  const lockBtn = document.createElement("button");
  const viewBtn = document.createElement("button");
  viewBtn.type = "button";
  const addModuleBtn = document.createElement("button");
  addModuleBtn.textContent = "Add module";
  addWireBtn = document.createElement("button");
  addWireBtn.textContent = "Add wire";
  function refreshLockBtn() {
    lockBtn.textContent = layoutLocked ? "Unlock layout" : "Lock layout";
    for (const m of modules) if (m.el) m.el.style.cursor = layoutLocked ? "default" : "grab";
  }
  function refreshViewBtn() {
    viewBtn.textContent = viewLocked ? "Unlock view" : "Lock view";
    viewBtn.setAttribute("aria-pressed", viewLocked ? "true" : "false");
    viewBtn.style.background = viewLocked ? "#111" : "#fff";
    viewBtn.style.color = viewLocked ? "#fff" : "#111";
  }
  function refreshWireLockBtn() {
    wireLockBtn.textContent = wiresLocked ? "Unlock wires" : "Lock wires";
    refreshWireDots();
  }
  for (const b of [copyBtn, wireBtn, wireLockBtn, lockBtn, viewBtn, addModuleBtn, addWireBtn]) {
    b.style.cssText = "padding:8px 12px;border:1px solid #111;background:#fff;color:#111;font-size:13px;cursor:pointer;";
  }
  copyBtn.addEventListener("click", async () => {
    const text = await layoutCopyText();
    try { await navigator.clipboard.writeText(text); copyBtn.textContent = "Copied! Paste it to Muse"; }
    catch { window.prompt("Copy your layout and paste it to Muse:", text); copyBtn.textContent = "Copy layout"; return; }
    setTimeout(() => { copyBtn.textContent = "Copy layout"; }, 2500);
  });

  wireBtn.addEventListener("click", async () => {
    const positions = readPortStore();
    const customs = readCustomLinks();
    const removed = readRemovedLinks();
    if (!Object.keys(positions).length && !customs.length && !removed.length) {
      wireBtn.textContent = "No wire moves yet — drag a dot first";
      setTimeout(() => { wireBtn.textContent = "Copy wire positions"; }, 2500);
      return;
    }
    // Custom wires (added with "Add wire") are listed explicitly, so
    // Muse can recreate the links themselves, not just their ports.
    // Deleted built-in wires are listed too, so Muse can drop them.
    const payload = { ...positions };
    if (customs.length) payload.customLinks = customs;
    if (removed.length) payload.removedLinks = removed;
    const text = JSON.stringify(payload, null, 2);
    try { await navigator.clipboard.writeText(text); wireBtn.textContent = "Copied! Paste it to Muse"; }
    catch { window.prompt("Copy your wire positions and paste them to Muse:", text); wireBtn.textContent = "Copy wire positions"; return; }
    setTimeout(() => { wireBtn.textContent = "Copy wire positions"; }, 2500);
  });
  wireLockBtn.addEventListener("click", async () => {
    wiresLocked = !wiresLocked;
    try { localStorage.setItem(wireLockKey, wiresLocked ? "1" : "0"); } catch {}
    refreshWireLockBtn();
    if (wiresLocked) {
      const text = JSON.stringify(readPortStore(), null, 2);
      try { await navigator.clipboard.writeText(text); wireLockBtn.textContent = "Locked — positions copied"; }
      catch { wireLockBtn.textContent = "Locked"; }
      setTimeout(refreshWireLockBtn, 2500);
    }
  });
  lockBtn.addEventListener("click", async () => {
    layoutLocked = !layoutLocked;
    try { localStorage.setItem(lockKey, layoutLocked ? "1" : "0"); } catch {}
    refreshLockBtn();
    // Locking the layout locks resizing too, like dragging.
    refreshResizeHandles();
    if (layoutLocked) {
      const text = await layoutCopyText();
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
  addModuleBtn.addEventListener("click", () => {
    // Headless browsers auto-dismiss prompt(), so a dismissed prompt
    // (null) still creates a tile with the default title.
    const title = (window.prompt("Name the new module:", "New module") || "").trim() || "New module";
    addCustomModule(title);
  });
  addWireBtn.addEventListener("click", () => {
    setWirePicking(!wirePicking);
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && wirePicking) setWirePicking(false);
    // Esc also drops a selected wire or module.
    if (event.key === "Escape") { selectWire(null); selectModule(null); }
    // Backspace deletes the selected wire or module — Backspace only,
    // not Delete. Never while typing in a title/body (contenteditable)
    // or an input: a prompt() blocks key events while it is open, so
    // no extra guard is needed for it. preventDefault stops the
    // browser going back. A wire selection wins over a module one
    // (the two can never both be selected), and a selected built-in
    // module is never deleted.
    if (event.key === "Backspace" && (selectedWireKey || selectedModuleId)) {
      const target = event.target;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (wirePicking) return;
      if (selectedWireKey) {
        event.preventDefault();
        deleteSelectedWire();
      } else if (selectedModuleId) {
        const module = byId[selectedModuleId];
        if (module && module.custom) {
          event.preventDefault();
          deleteSelectedModule();
        }
      }
    }
  });
  bar.append(copyBtn, wireBtn, wireLockBtn, lockBtn, viewBtn, addModuleBtn, addWireBtn);
  document.body.append(bar);
  refreshLockBtn();
  refreshWireLockBtn();
  refreshViewBtn();
}

function readSavedView() {
  try {
    const saved = JSON.parse(localStorage.getItem(viewKey)) || null;
    if (!saved || !Number.isFinite(saved.x) || !Number.isFinite(saved.y) || !Number.isFinite(saved.scale)) return null;
    return saved;
  } catch { return null; }
}
function saveCurrentView() {
  try { localStorage.setItem(viewKey, JSON.stringify({ x: Math.round(x), y: Math.round(y), scale })); } catch {}
}
function restoreSavedView() {
  if (!viewLocked) return false;
  const saved = readSavedView();
  if (!saved) return false;
  scale = Math.min(10000, Math.max(baseScale, saved.scale));
  x = saved.x;
  y = saved.y;
  applyView();
  return true;
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
  const p1 = portPos(link, "from");
  const p2 = portPos(link, "to");
  const x1 = p1.x;
  const y1 = p1.y;
  const x2 = p2.x;
  const y2 = p2.y;
  const bend = Math.max(48, Math.abs(x2 - x1) * 0.45);
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}

function redrawWires() {
  routed.forEach((link, index) => {
    const d = wirePath(link);
    wires[index]?.setAttribute("d", d);
    wireHitPaths[index]?.setAttribute("d", d);
  });
  for (const h of wireHandles) {
    const pos = portPos(h.link, h.end);
    h.dot.setAttribute("cx", pos.x);
    h.dot.setAttribute("cy", pos.y);
    h.hit.setAttribute("cx", pos.x);
    h.hit.setAttribute("cy", pos.y);
  }
  refreshResizeHandles();
}

function applyView() {
  world.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
}

let baseScale = 1;
let fitted = false;

function networkSpan() {
  const minX = Math.min(...modules.map((module) => module.x));
  const minY = Math.min(...modules.map((module) => module.y));
  const maxX = Math.max(...modules.map((module) => module.x + module.w));
  const maxY = Math.max(...modules.map((module) => module.y + module.h));
  const overhang = Math.max(0, -minX);
  return { minX, minY, maxX: maxX + overhang, maxY };
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
  if (viewLocked) return;
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

// Clicking empty canvas drops a selected wire or module. Clicks on a
// module or a wire stop short of here: modules guard with
// closest(".node"), a wire click stops propagation on its hit path, and
// port-dot clicks are guarded below too.
viewport.addEventListener("click", (event) => {
  if (!selectedWireKey && !selectedModuleId) return;
  // A resize drag just ended: swallow the click the browser fires
  // after pointerup, so it cannot deselect the still-selected module
  // (and hide its handles) when it lands on empty canvas.
  if (justResized) return;
  if (event.target.closest(".node, .wire-handle-hit, .wire-handle, .wire-hit, .resize-handle")) return;
  selectWire(null);
  selectModule(null);
});

viewport.addEventListener(
  "wheel",
  (event) => {
    if (viewLocked) { event.preventDefault(); return; }
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

const touches = new Map();
let pinchDistance = 0;
let pinchX = 0;

window.addEventListener(
  "pointerdown",
  (event) => {
    if (event.pointerType !== "touch") return;
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touches.size === 2) {
      const [a, b] = [...touches.values()];
      pinchDistance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      pinchX = (a.x + b.x) / 2;
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
    if (viewLocked) { event.preventDefault(); return; }
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
  if (viewLocked) { restoreSavedView(); drawAxisNumbers(); return; }
  frameNetwork();
  drawAxisNumbers();
});
if (backdrop && !backdrop.complete) {
  backdrop.addEventListener("load", () => {
    fitted = false;
    frameNetwork();
  });
}
world.append(handlesSvg);
frameNetwork();
restoreSavedView();
redrawWires();
drawAxisNumbers();

function drawAxisNumbers() {
  const axes = document.querySelector("#axes");
  if (!axes) return;
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
    addAxisTick(axes, "tick-x", String(index), centerX + index * step, null);
    addAxisTick(axes, "tick-x", String(-index), centerX - index * step, null);
  }
  for (let index = 1; centerY - index * step > 64; index += 1) {
    addAxisTick(axes, "tick-y", String(index), null, centerY - index * step);
  }
  for (let index = 1; centerY + index * step < height - 12; index += 1) {
    addAxisTick(axes, "tick-y", String(-index), null, centerY + index * step);
  }
}

function addAxisTick(axes, kind, label, x, y) {
  if (kind === "tick-x" && x < 28) return;
  const tick = document.createElement("span");
  tick.className = `tick ${kind}`;
  tick.textContent = label;
  if (x != null) tick.style.left = `${x}px`;
  if (y != null) tick.style.top = `${y}px`;
  axes.append(tick);
}

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

