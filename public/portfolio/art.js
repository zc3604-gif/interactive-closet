const vertexCode = `
attribute vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const fragmentCode = `
precision highp float;

uniform vec2 uResolution;
uniform float uTime;

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float t = uTime * 0.15;

  uv.x += 0.08 * sin(uv.y * 5.0 + t);
  uv.y += 0.06 * sin(uv.x * 4.0 - t * 0.7);

  vec2 a = uv - vec2(0.03 + 0.08 * sin(t), 1.02);
  float lightA = exp(-dot(a * vec2(1.5, 1.1), a * vec2(1.5, 1.1)) * 5.0);

  vec2 b = uv - vec2(0.50 + 0.15 * sin(t * 0.8), -0.15);
  float lightB = exp(-dot(b * vec2(0.85, 1.5), b * vec2(0.85, 1.5)) * 5.0);

  float base = clamp(lightA * 1.8 + lightB * 1.9, 0.0, 1.0);
  vec2 pixel = floor(gl_FragCoord.xy);
  float frame = floor(uTime * 18.0);
  float grain = fract(sin(dot(pixel, vec2(12.9898, 78.233)) + frame * 3.17) * 43758.5453);
  float grainMask = 0.12 + 0.88 * pow(4.0 * base * (1.0 - base), 0.6);
  float shade = clamp(base + (grain - 0.5) * 0.22 * grainMask, 0.0, 1.0);

  gl_FragColor = vec4(vec3(shade), 1.0);
}
`;

export function startArt(viewport) {
  const canvas = viewport.querySelector("#art");
  if (!canvas) return;
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false });
  if (!gl) return;

  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertexCode));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragmentCode));
  gl.linkProgram(program);
  gl.useProgram(program);

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
  const resolution = gl.getUniformLocation(program, "uResolution");
  const time = gl.getUniformLocation(program, "uTime");
  const started = performance.now();

  function frame(now) {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.floor(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(resolution, canvas.width, canvas.height);
    gl.uniform1f(time, (now - started) * 0.001);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}
