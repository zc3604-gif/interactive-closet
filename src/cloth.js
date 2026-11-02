import * as THREE from "three";

const DRAG = 0.97;
const MASS = 0.12;
const GRAVITY = new THREE.Vector3(0, -98 * 1.4, 0).multiplyScalar(MASS);

export class Cloth {
  constructor({ width = 20, height = 16, spacing = 2.5 } = {}) {
    this.w = width;
    this.h = height;
    this.spacing = spacing;
    this.pins = [];
    this.particles = [];
    this.constraints = [];
    this.mouse = new THREE.Vector3();
    this.mouseInfluence = Math.max(spacing * 5.5, 2.4);
    this.tugX = 0;
    this.tmp = new THREE.Vector3();

    for (let v = 0; v <= height; v++) {
      for (let u = 0; u <= width; u++) {
        const x = (u - width / 2) * spacing;
        const y = (height / 2 - v) * spacing + 8;
        const z = 0;
        this.particles.push(new Particle(x, y, z, MASS));
      }
    }

    const index = (u, v) => u + v * (width + 1);

    for (let v = 0; v < height; v++) {
      for (let u = 0; u < width; u++) {
        this.constraints.push([
          this.particles[index(u, v)],
          this.particles[index(u, v + 1)],
          spacing,
        ]);
        this.constraints.push([
          this.particles[index(u, v)],
          this.particles[index(u + 1, v)],
          spacing,
        ]);
      }
    }

    for (let u = 0; u < width; u++) {
      this.constraints.push([
        this.particles[index(u, height)],
        this.particles[index(u + 1, height)],
        spacing,
      ]);
    }
    for (let v = 0; v < height; v++) {
      this.constraints.push([
        this.particles[index(width, v)],
        this.particles[index(width, v + 1)],
        spacing,
      ]);
    }

    for (let u = 0; u <= width; u++) {
      this.pins.push(u);
    }

    const geometry = new THREE.BufferGeometry();
    const count = (width + 1) * (height + 1);
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(this.buildUvs(), 2));

    const indices = [];
    for (let v = 0; v < height; v++) {
      for (let u = 0; u < width; u++) {
        const a = index(u, v);
        const b = index(u + 1, v);
        const c = index(u, v + 1);
        const d = index(u + 1, v + 1);
        indices.push(a, b, d);
        indices.push(a, d, c);
      }
    }
    geometry.setIndex(indices);

    const material = new THREE.MeshPhysicalMaterial({
      color: 0xc4a574,
      roughness: 0.72,
      metalness: 0.02,
      side: THREE.DoubleSide,
      sheen: 0.4,
      sheenColor: new THREE.Color(0xf2e4c9),
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.geometry = geometry;
  }

  buildUvs() {
    const uvs = [];
    for (let v = 0; v <= this.h; v++) {
      for (let u = 0; u <= this.w; u++) {
        uvs.push(u / this.w, 1 - v / this.h);
      }
    }
    return new Float32Array(uvs);
  }

  setMouseWorld(point, active) {
    this.mouse.copy(point);
    this.mouseActive = active;
  }

  setTug(x) {
    this.tugX = x;
  }

  simulate(delta) {
    const particles = this.particles;
    const dt = Math.min(delta, 0.032);
    const topY = particles[0].original.y;
    const botY = particles[particles.length - 1].original.y;
    const span = Math.max(topY - botY, 0.001);

    for (const particle of particles) {
      particle.addForce(GRAVITY);
      const hem = (topY - particle.original.y) / span;
      if (this.tugX) {
        particle.addForce(this.tmp.set(this.tugX * hem * hem * MASS, 0, 0));
      }
      if (this.mouseActive) {
        const dist = particle.position.distanceTo(this.mouse);
        if (dist < this.mouseInfluence) {
          this.tmp.copy(particle.position).sub(this.mouse);
          this.tmp.y *= 0.35;
          const strength = (1 - dist / this.mouseInfluence) * (90 + hem * 140);
          particle.addForce(this.tmp.normalize().multiplyScalar(strength));
        }
      }
      particle.integrate(dt);
    }

    for (let i = 0; i < 6; i++) {
      for (const [p1, p2, rest] of this.constraints) {
        satisfy(p1, p2, rest);
      }
      for (const pin of this.pins) {
        particles[pin].reset();
      }
    }

    const pos = this.geometry.attributes.position;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i].position;
      pos.setXYZ(i, p.x, p.y, p.z);
    }
    pos.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }
}

class Particle {
  constructor(x, y, z, mass) {
    this.position = new THREE.Vector3(x, y, z);
    this.previous = new THREE.Vector3(x, y, z);
    this.original = new THREE.Vector3(x, y, z);
    this.a = new THREE.Vector3(0, 0, 0);
    this.mass = mass;
    this.invMass = 1 / mass;
    this.tmp = new THREE.Vector3();
    this.tmp2 = new THREE.Vector3();
  }

  addForce(force) {
    this.a.add(this.tmp2.copy(force).multiplyScalar(this.invMass));
  }

  integrate(dt) {
    const newPos = this.tmp
      .subVectors(this.position, this.previous)
      .multiplyScalar(DRAG)
      .add(this.position)
      .add(this.a.multiplyScalar(dt * dt * 800));
    this.tmp2.copy(this.position);
    this.position.copy(newPos);
    this.previous.copy(this.tmp2);
    this.a.set(0, 0, 0);
  }

  reset() {
    this.position.copy(this.original);
    this.previous.copy(this.original);
  }
}

function satisfy(p1, p2, rest) {
  const diff = p2.position.clone().sub(p1.position);
  const current = diff.length() || 0.0001;
  const correction = diff.multiplyScalar(1 - rest / current).multiplyScalar(0.5);
  if (p1.invMass !== 0) p1.position.add(correction);
  if (p2.invMass !== 0) p2.position.sub(correction);
}
