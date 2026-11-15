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
  const surfaces = ["#art", "#stage-art"]
    .map((selector) => document.querySelector(selector))
    .filter(Boolean)
    .map((canvas) => createSurface(canvas))
    .filter(Boolean);
  if (!surfaces.length) return;

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
    if (event.key !== " " || event.repeat) return;
    moving = !moving;
    event.preventDefault();
  });

  function frame(now) {
    const delta = Math.min(now - last, 50);
    last = now;
    if (moving) clock += delta * 0.001 * SPEED;
    mx += (targetX - mx) * 0.04;
    my += (targetY - my) * 0.04;
    for (const surface of surfaces) surface.draw(clock, mx, my);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

function createSurface(canvas) {
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false });
  if (!gl) return null;
  const program = createProgram(gl, vertexCode, fragmentCode);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW
  );
  const position = gl.getAttribLocation(program, "aPosition");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  gl.useProgram(program);
  const resolution = gl.getUniformLocation(program, "uResolution");
  const mouse = gl.getUniformLocation(program, "uMouse");
  const time = gl.getUniformLocation(program, "uTime");
  const zoom = gl.getUniformLocation(program, "uZoom");
  const contrast = gl.getUniformLocation(program, "uContrast");

  return {
    draw(clock, mx, my) {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.floor(canvas.clientWidth * ratio));
      const height = Math.max(1, Math.floor(canvas.clientHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(resolution, canvas.width, canvas.height);
      gl.uniform2f(mouse, mx, my);
      gl.uniform1f(time, clock);
      gl.uniform1f(zoom, ZOOM);
      gl.uniform1f(contrast, CONTRAST);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },
  };
}

function createProgram(gl, vertexSource, fragmentSource) {
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  return program;
}

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}
