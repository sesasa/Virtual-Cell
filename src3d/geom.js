// Geometry helpers for the 3-D cell. Units are micrometres.
//
// The cell is a rounded box. Everything that lives in the thin cytoplasm is
// placed with the box's signed distance field (SDF): a point at depth d sits
// d µm inside the plasma membrane, so organelles follow the cell as it grows.
import * as THREE from 'three';

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A rounded box described by half-extents h (Vector3) and corner radius r.
export class RoundBox {
  constructor(h, r) { this.h = h.clone(); this.r = r; }

  sdf(p) {
    const r = this.r, h = this.h;
    const qx = Math.abs(p.x) - (h.x - r), qy = Math.abs(p.y) - (h.y - r), qz = Math.abs(p.z) - (h.z - r);
    const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
    return Math.hypot(ox, oy, oz) + Math.min(Math.max(qx, qy, qz), 0) - r;
  }

  normal(p, out = new THREE.Vector3()) {
    const e = 0.01, t = new THREE.Vector3();
    const dx = this.sdf(t.set(p.x + e, p.y, p.z)) - this.sdf(t.set(p.x - e, p.y, p.z));
    const dy = this.sdf(t.set(p.x, p.y + e, p.z)) - this.sdf(t.set(p.x, p.y - e, p.z));
    const dz = this.sdf(t.set(p.x, p.y, p.z + e)) - this.sdf(t.set(p.x, p.y, p.z - e));
    return out.set(dx, dy, dz).normalize();
  }

  // Move p so it lies `depth` µm inside the surface (negative depth = outside).
  project(p, depth, out = new THREE.Vector3()) {
    out.copy(p);
    const n = new THREE.Vector3();
    for (let i = 0; i < 4; i++) {
      const d = this.sdf(out) + depth;
      this.normal(out, n);
      out.addScaledVector(n, -d);
    }
    return out;
  }

  // Area-weighted random point on the surface (with outward normal).
  sample(rand) {
    const h = this.h;
    const areas = [h.y * h.z, h.y * h.z, h.x * h.z, h.x * h.z, h.x * h.y, h.x * h.y];
    let a = rand() * areas.reduce((x, y) => x + y, 0), f = 0;
    while (a > areas[f]) { a -= areas[f]; f++; }
    const u = rand() * 2 - 1, v = rand() * 2 - 1;
    const p = new THREE.Vector3();
    if (f < 2) p.set(f ? -h.x : h.x, u * h.y, v * h.z);
    else if (f < 4) p.set(u * h.x, f === 3 ? -h.y : h.y, v * h.z);
    else p.set(u * h.x, v * h.y, f === 5 ? -h.z : h.z);
    const q = this.project(p, 0);
    return { p: q, n: this.normal(q) };
  }

  // Path between two interior points that hugs the cytoplasm at a given depth.
  shellPath(a, b, depth, n = 10) {
    const pts = [a.clone()];
    for (let i = 1; i < n; i++) {
      const m = new THREE.Vector3().lerpVectors(a, b, i / n);
      // Push the chord outward so the path wraps around the vacuole.
      if (m.lengthSq() < 1e-6) m.set(0, 0.01, 0);
      pts.push(this.project(m, depth + (Math.random() - 0.5) * 0.5));
    }
    pts.push(b.clone());
    return new THREE.CatmullRomCurve3(pts);
  }
}

// Mesh of a rounded box at an SDF offset (offset > 0 = outside the base box).
export function roundBoxGeometry(box, offset = 0, seg = [56, 36, 36]) {
  const g = new THREE.BoxGeometry(2, 2, 2, seg[0], seg[1], seg[2]);
  const pos = g.attributes.position;
  const h = box.h, r = box.r;
  const inner = new THREE.Vector3(h.x - r, h.y - r, h.z - r);
  const v = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).multiply(h);
    c.set(clamp(v.x, -inner.x, inner.x), clamp(v.y, -inner.y, inner.y), clamp(v.z, -inner.z, inner.z));
    n.subVectors(v, c);
    if (n.lengthSq() < 1e-9) n.set(0, 0, 1);
    n.normalize();
    v.copy(c).addScaledVector(n, Math.max(0.05, r + offset));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// Lens / ellipsoid with gentle irregularity (chloroplasts, nuclei, starch).
export function blobGeometry(rx, ry, rz, seed = 1, wobble = 0.04, seg = 40) {
  const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.6));
  const pos = g.attributes.position, rand = rng(seed);
  const ph = [rand() * 6, rand() * 6, rand() * 6];
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const w = 1 + wobble * (Math.sin(3 * v.x + ph[0]) * Math.sin(2 * v.y + ph[1]) + 0.5 * Math.sin(5 * v.z + ph[2]));
    pos.setXYZ(i, v.x * rx * w, v.y * ry * w, v.z * rz * w);
  }
  g.computeVertexNormals();
  return g;
}

// Capsule along x (mitochondria), built with a lathe so it works everywhere.
export function capsuleGeometry(len, rad, seg = 20) {
  const pts = [];
  const half = len / 2 - rad;
  for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + (i / 8) * (Math.PI / 2); pts.push(new THREE.Vector2(Math.cos(a) * rad, -half + Math.sin(a) * rad)); }
  for (let i = 0; i <= 8; i++) { const a = (i / 8) * (Math.PI / 2); pts.push(new THREE.Vector2(Math.cos(a) * rad, half + Math.sin(a) * rad)); }
  const g = new THREE.LatheGeometry(pts, seg);
  g.rotateZ(Math.PI / 2);
  return g;
}

// Orient an object so its local +Y axis points along n.
export function alignY(obj, n, spin = 0) {
  obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
  if (spin) obj.rotateY(spin);
}
