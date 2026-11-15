const ZOOM = 1.8;
const SPEED = 0.35;
const CONTRAST = 1.4;

const vertexCode = `
attribute vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const fragmentCode = `
precision highp float;

uniform vec2 uResolution;
uniform vec2 uMouse;
uniform float uTime;
uniform float uZoom;
uniform float uContrast;

vec2 multiplyComplex(vec2 a, vec2 b) {
  return vec2(
    a.x * b.x - a.y * b.y,
    a.x * b.y + a.y * b.x
  );
}

vec2 divideComplex(vec2 a, vec2 b) {
  float denominator = max(dot(b, b), 0.00001);

  return vec2(
    a.x * b.x + a.y * b.y,
    a.y * b.x - a.x * b.y
  ) / denominator;
}

void main() {
  vec2 z = (
    2.0 * gl_FragCoord.xy - uResolution
  ) / min(uResolution.x, uResolution.y);

  z *= uZoom;

  float angle = 0.35;
  z = mat2(
    cos(angle), -sin(angle),
    sin(angle),  cos(angle)
  ) * z;

  vec2 a = vec2(
    -0.45 + 0.12 * sin(uTime),
     0.65
  );

  vec2 b = vec2(
     0.25,
    -0.65 + 0.10 * cos(uTime)
  );

  vec2 c = vec2(
     0.25 + uMouse.x * 0.55,
     0.25 + uMouse.y * 0.55
  );

  vec2 numerator = multiplyComplex(z - a, z - b);
  vec2 w = divideComplex(numerator, z - c);

  float phase = atan(w.y, w.x);
  float magnitude = length(w);

  float bend = 0.45 * sin(
    1.5 * log(1.0 + magnitude)
  );

  float light = 0.5 + 0.5 * cos(
    phase + bend + 0.3 * sin(uTime * 0.5)
  );

  light = clamp(
    (light - 0.5) * uContrast + 0.5,
    0.0,
    1.0
  );

  vec3 shadow = vec3(0.025, 0.020, 0.055);
  vec3 silver = vec3(0.56, 0.63, 0.70);
  vec3 highlight = vec3(0.88, 1.0, 1.0);

  vec3 color = mix(
    shadow,
    silver,
    smoothstep(0.0, 0.75, light)
  );

  color = mix(
    color,
    highlight,
    smoothstep(0.65, 1.0, light)
  );

  gl_FragColor = vec4(color, 1.0);
}
`;

export function startArt(viewport) {
  const editor = document.querySelector("#code");
  const errorLine = document.querySelector("#code-error");
  const opening = editor && editor.value.trim() ? editor.value : defaultSource();
  if (editor && !editor.value.trim()) editor.value = opening;
  let zoom = ZOOM;
  let speed = SPEED;
  let contrast = CONTRAST;
  const surfaces = ["#art", "#stage-art"]
    .map((selector) => document.querySelector(selector))
    .filter(Boolean)
    .map((canvas) => createSurface(canvas))
    .filter(Boolean);
  if (!surfaces.length) return;

  function showError(message) {
    if (!errorLine) return;
    errorLine.hidden = !message;
    errorLine.textContent = message || "";
  }

  function applySource(text) {
    const next = readSource(text);
    zoom = next.zoom;
    speed = next.speed;
    contrast = next.contrast;
    const errors = surfaces
      .map((surface) => surface.setFragment(next.fragment))
      .filter(Boolean);
    showError((errors[0] || "").replace(/\0/g, "").trim());
  }

  applySource(opening);
  if (editor) {
    let pending = 0;
    editor.addEventListener("input", () => {
      clearTimeout(pending);
      pending = setTimeout(() => applySource(editor.value), 120);
    });
  }

  let clock = 0;
  let moving = true;
  let mx = 0;
  let my = 0;
  let targetX = 0;
  let targetY = 0;
  let last = performance.now();
  const stage = document.querySelector("#stage-art");

  window.addEventListener("pointermove", (event) => {
    const stageRect = stage && stage.getBoundingClientRect();
    const overStage =
      stageRect &&
      event.clientX >= stageRect.left &&
      event.clientX <= stageRect.right &&
      event.clientY >= stageRect.top &&
      event.clientY <= stageRect.bottom;
    const rect = overStage ? stageRect : viewport.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    ) {
      return;
    }
    targetX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    targetY = 1 - ((event.clientY - rect.top) / rect.height) * 2;
  });

  window.addEventListener("keydown", (event) => {
    if (event.target === editor) return;
    if (event.key !== " " || event.repeat) return;
    moving = !moving;
    event.preventDefault();
  });

  function frame(now) {
    const delta = Math.min(now - last, 50);
    last = now;
    if (moving) clock += delta * 0.001 * speed;
    mx += (targetX - mx) * 0.04;
    my += (targetY - my) * 0.04;
    for (const surface of surfaces) surface.draw(clock, mx, my, zoom, contrast);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

function defaultSource() {
  return `const ZOOM = ${ZOOM};
const SPEED = ${SPEED};
const CONTRAST = ${CONTRAST};

${fragmentCode.trim()}`;
}

function readConst(text, name, fallback) {
  const match = text.match(new RegExp(`(?:const|float)\\s+${name}\\s*=\\s*(-?[0-9]*\\.?[0-9]+)`));
  if (!match) return fallback;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : fallback;
}

function readSource(text) {
  const start = text.search(/^\s*precision\s+/m);
  return {
    zoom: readConst(text, "ZOOM", ZOOM),
    speed: readConst(text, "SPEED", SPEED),
    contrast: readConst(text, "CONTRAST", CONTRAST),
    fragment: start >= 0 ? text.slice(start) : text,
  };
}

function createSurface(canvas) {
  const gl = canvas.getContext("webgl", {
    antialias: false,
    alpha: false,
    preserveDrawingBuffer: true,
  });
  if (!gl) return null;
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW
  );
  let program = null;
  let resolution = null;
  let mouse = null;
  let time = null;
  let zoom = null;
  let contrast = null;

  function bind(next) {
    program = next;
    gl.useProgram(program);
    const position = gl.getAttribLocation(program, "aPosition");
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    if (position >= 0) {
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    }
    resolution = gl.getUniformLocation(program, "uResolution");
    mouse = gl.getUniformLocation(program, "uMouse");
    time = gl.getUniformLocation(program, "uTime");
    zoom = gl.getUniformLocation(program, "uZoom");
    contrast = gl.getUniformLocation(program, "uContrast");
  }

  return {
    setFragment(source) {
      compile.lastError = "";
      const next = createProgram(gl, vertexCode, source);
      if (!next) return compile.lastError || "The background shader could not be compiled.";
      if (program) gl.deleteProgram(program);
      bind(next);
      return "";
    },
    draw(clock, mx, my, zoomValue, contrastValue) {
      if (!program) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.floor(canvas.clientWidth * ratio));
      const height = Math.max(1, Math.floor(canvas.clientHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(program);
      if (resolution) gl.uniform2f(resolution, canvas.width, canvas.height);
      if (mouse) gl.uniform2f(mouse, mx, my);
      if (time) gl.uniform1f(time, clock);
      if (zoom) gl.uniform1f(zoom, zoomValue);
      if (contrast) gl.uniform1f(contrast, contrastValue);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },
  };
}

function createProgram(gl, vertexSource, fragmentSource) {
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertex || !fragment) {
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
    return null;
  }
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    compile.lastError = gl.getProgramInfoLog(program) || "Shader failed to link.";
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    compile.lastError = log || "Shader failed to compile.";
    return null;
  }
  return shader;
}
