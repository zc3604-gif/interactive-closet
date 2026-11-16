const modules = [
  {
    id: "artist",
    x: -204,
    y: 126,
    w: 240,
    h: 292,
    kind: "Artist information",
    title: "f(x)",
    body: "Interactive Media Arts & Human-Computer Interaction NYC BasedVideo arts, live coding, 3D, post-production, Interfaces designSoftWares: Adobe AE PS\u00a0\u00a0Autodeswk Maya Fusion, Blender, Zbrush, Three.js TouchDesigner, HydraSynth, Resolumn, Module8, MadmapperContact information:email:zc3604@nyu.edunumber:+1(949)620-7911",
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

for (const module of modules) {
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
  // test branch: removed Moving image animated graphic (mountHowlerSketch) - static preview remains
  if (module.id === "3d") mountRibbonSketch(preview);
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
  // Drag a module: wires follow live, layout is saved, a tap still opens its page.
  node.style.touchAction = "none";
  node.style.cursor = "grab";
  let dragState = null;
  let justDragged = false;
  node.addEventListener("pointerdown", (event) => {
    if (layoutLocked) return;
    if (event.button !== undefined && event.button !== 0) return;
    if (event.target.closest("[contenteditable], .upload, .media, input, a")) return;
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
    if (justDragged) return;
    if (event.target.closest("[contenteditable], .upload, .media, input")) return;
    const page = workPages[module.id];
    if (page) window.location.href = page;
  });
  world.append(node);
  loadSavedMedia(module.id, preview).then(() => {
    if (module.id !== "p5" && module.id !== "vj" && module.id !== "video" && module.id !== "works" && module.id !== "3d") return loadMedia(module.id, preview);
  });
}

// Lock / copy layout toolbar: drag first, then lock, then paste the copied positions to Muse.
{
  const bar = document.createElement("div");
  bar.style.cssText = "position:fixed;top:64px;right:12px;z-index:9999;display:flex;gap:8px;";
  const copyBtn = document.createElement("button");
  copyBtn.textContent = "Copy layout";
  const lockBtn = document.createElement("button");
  const viewBtn = document.createElement("button");
  viewBtn.type = "button";
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
  for (const b of [copyBtn, lockBtn, viewBtn]) {
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
  viewBtn.addEventListener("click", () => {
    viewLocked = !viewLocked;
    try { localStorage.setItem(viewLockKey, viewLocked ? "1" : "0"); } catch {}
    if (viewLocked) saveCurrentView();
    refreshViewBtn();
  });
  bar.append(copyBtn, lockBtn, viewBtn);
  document.body.append(bar);
  refreshLockBtn();
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
  routed.forEach((link, index) => {
    wires[index]?.setAttribute("d", wirePath(link));
  });
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
frameNetwork();
restoreSavedView();
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

