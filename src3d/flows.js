// Molecular traffic in 3-D. As in the schematic view, every token stands for a
// live flux in the physiology model, and routes follow the real geography:
// air space → wall → membrane → chloroplast, chloroplast → cytosol → sinks.
import * as THREE from 'three';
import { clamp } from './geom.js';

export const TYPES = {
  o2: { color: 0x9fe4ff, size: 0.2, label: 'O₂' },
  co2: { color: 0xe3ecef, size: 0.2, label: 'CO₂' },
  h2o: { color: 0x58a8ff, size: 0.17, label: 'water' },
  triose: { color: 0xffbe55, size: 0.2, label: 'triose phosphate' },
  sugar: { color: 0xff9a1f, size: 0.28, label: 'sucrose' },
  maltose: { color: 0xffe3a8, size: 0.24, label: 'maltose' },
  glycolate: { color: 0xff6fb5, size: 0.22, label: 'glycolate' },
  atp: { color: 0xfff6a0, size: 0.15, label: 'ATP' },
  nitrate: { color: 0xc09aff, size: 0.21, label: 'nitrate' },
  aa: { color: 0x6af0a8, size: 0.2, label: 'amino acid' },
  mrna: { color: 0xff5a5a, size: 0.2, label: 'mRNA' },
  protein: { color: 0x4fd0ff, size: 0.22, label: 'protein' },
  vesicle: { color: 0xfff0d8, size: 0.3, label: 'vesicle' },
  k: { color: 0xf7a2cb, size: 0.17, label: 'K⁺' },
};
const MAX = 220;

export class Flows {
  constructor(world) {
    this.world = world;
    this.group = new THREE.Group();
    world.scene.add(this.group);
    this.list = [];
    this.acc = {};
    this.emph = null;
    this.focus = null; // {p: Vector3, r}
    this.density = 1;
    this.inst = {};
    const geo = new THREE.SphereGeometry(1, 12, 8);
    for (const [k, t] of Object.entries(TYPES)) {
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(t.color).multiplyScalar(1.6), toneMapped: false, transparent: true, opacity: 0.95, clippingPlanes: [world.cut] });
      const im = new THREE.InstancedMesh(geo, mat, MAX);
      im.count = 0;
      im.frustumCulled = false;
      this.inst[k] = im;
      this.group.add(im);
    }
    // Photons as additive streaks.
    this.photons = [];
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(400 * 6), 3));
    this.photonLines = new THREE.LineSegments(pg, new THREE.LineBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.photonLines.frustumCulled = false;
    this.group.add(this.photonLines);
    this.sunDir = new THREE.Vector3(0.18, 1, 0.38).normalize();
  }

  clear() { this.list = []; this.photons = []; }

  add(type, pts, opts = {}) {
    if (this.list.length > 900) return null;
    if (!(pts instanceof THREE.Curve) && pts.some((q) => !q || !isFinite(q.x))) { console.warn('bad path', type); return null; }
    const curve = (pts instanceof THREE.Curve) ? pts : new THREE.CatmullRomCurve3(pts);
    let len;
    try { len = curve.getLength(); } catch (e) { console.warn('bad curve', type, JSON.stringify(curve.points)); return null; }
    const p = { type, curve, len, s: 0, speed: opts.speed || 3.2, onArrive: opts.onArrive, delay: opts.delay || 0, pos: new THREE.Vector3(), age: 0 };
    this.list.push(p);
    return p;
  }

  // Prefer organelles near the camera's subject so the traffic is on screen.
  pick(arr, posOf = (x) => x.pos) {
    if (!arr.length) return null;
    if (this.focus && Math.random() < 0.75) {
      const near = arr.filter((x) => posOf(x).distanceTo(this.focus.p) < this.focus.r);
      if (near.length) return near[(Math.random() * near.length) | 0];
    }
    return arr[(Math.random() * arr.length) | 0];
  }
  nearest(arr, p, posOf = (x) => x.pos) {
    let best = null, bd = Infinity;
    for (const a of arr) { const d = posOf(a).distanceToSquared(p); if (d < bd) { bd = d; best = a; } }
    return best;
  }

  spawn(dt, model) {
    const w = this.world, f = model.f, box = w.box;
    const cps = w.visibleChloroplasts().concat(w.heroCp ? [w.heroCp] : []);
    if (!cps.length) return;
    const rate = (key, perSec, fn) => {
      this.acc[key] = (this.acc[key] || 0) + perSec * this.density * dt;
      let n = 0;
      while (this.acc[key] >= 1 && n < 5) { this.acc[key] -= 1; fn(); n++; }
      if (this.acc[key] > 3) this.acc[key] = 3;
    };
    const capP = model.s.Pphoto / model.p.Pphoto0;
    const out = (c, d) => c.pos.clone().addScaledVector(c.n, 1.25 + 0.9 + d);
    const inCyto = (c) => c.pos.clone().addScaledVector(c.n, -1.1).add(new THREE.Vector3().randomDirection().projectOnPlane(c.n).multiplyScalar(1.5));

    // Photons from the sun.
    rate('photon', (f.I / 1100) * 40, () => {
      const c = this.pick(cps);
      const end = c.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 1.5));
      this.photons.push({ a: end.clone().addScaledVector(this.sunDir, 60), b: end, u: 0, c });
    });
    rate('o2', (f.o2 / 60) * 9, () => {
      const c = this.pick(cps);
      this.add('o2', [c.pos.clone(), out(c, 0.5), out(c, 4 + Math.random() * 4).add(new THREE.Vector3().randomDirection())], { speed: 2.6 });
    });
    rate('co2', (f.fixC / 27) * 12 / Math.max(0.6, capP), () => {
      const c = this.pick(cps);
      this.add('co2', [out(c, 5 + Math.random() * 4).add(new THREE.Vector3().randomDirection()), out(c, 0.3), c.pos.clone()], { speed: 2.4 });
    });
    rate('triose', (f.sucSyn / 16) * 8, () => {
      const c = this.pick(cps);
      const e = inCyto(c);
      this.add('triose', [c.pos.clone(), e], { speed: 1.4, onArrive: () => this.sugarFate(model, e) });
    });
    rate('maltose', (f.starchDeg / 8) * 7, () => {
      const c = this.pick(cps);
      const e = inCyto(c);
      this.add('maltose', [c.pos.clone(), e], { speed: 1.2, onArrive: () => this.sugarFate(model, e) });
    });
    rate('glyco', ((f.Vo * 1.8 * capP) / 9) * 5, () => {
      const c = this.pick(cps);
      const px = this.nearest(w.perox, c.pos);
      if (!px || !px.pos) return;
      const mi = this.nearest(w.mitos, px.pos);
      this.add('glycolate', [c.pos.clone(), px.pos.clone(), mi.pos.clone(), px.pos.clone().add(new THREE.Vector3(0.3, 0.3, 0)), c.pos.clone()], { speed: 1.8 });
      if (Math.random() < 0.5) this.add('co2', [mi.pos.clone(), c.pos.clone()], { speed: 2, delay: 2.5 });
    });
    rate('atp', (f.atpMito / 8) * 6, () => {
      const mi = this.pick(w.mitos);
      const e = box.project(mi.pos.clone().add(new THREE.Vector3().randomDirection().multiplyScalar(3)), 1 + Math.random() * 1.5);
      this.add('atp', [mi.pos.clone(), e], { speed: 2.6 });
    });
    rate('no3', (f.nUptake / 0.5) * 4, () => {
      const s = w.pmPoint();
      const inside = s.p.clone().addScaledVector(s.n, -1.2);
      const store = f.vacN > 0 && Math.random() < clamp(f.vacN / Math.max(0.05, f.nUptake), 0, 0.8);
      this.add('nitrate', [s.p.clone().addScaledVector(s.n, 5), s.p.clone(), inside], {
        speed: 2.2,
        onArrive: () => {
          if (store) this.add('nitrate', [inside, box.project(inside, 3.1), w.vacuolePoint()], { speed: 2 });
          else {
            const c = this.nearest(cps, inside);
            this.add('nitrate', box.shellPath(inside, c.pos.clone(), 1.3, 5), {
              speed: 1.8,
              onArrive: () => this.add('aa', box.shellPath(c.pos.clone(), this.erPoint(), 1.5, 8), { speed: 2 }),
            });
          }
        },
      });
    });
    rate('aa', (f.protSynActual / 0.35) * 3, () => {
      const c = this.pick(cps);
      this.add('aa', box.shellPath(c.pos.clone(), this.erPoint(), 1.5, 8), { speed: 2.2 });
    });
    rate('mrna', (f.protSynActual / 0.35) * 3, () => {
      const pore = w.nuclearPore();
      if (Math.random() < 0.45) {
        const c = this.pick(cps);
        const mid = pore.clone().add(new THREE.Vector3().randomDirection().multiplyScalar(1.5));
        this.add('mrna', [pore, mid], {
          speed: 1.5,
          onArrive: () => this.add('protein', box.shellPath(mid, c.pos.clone(), 1.4, 10), { speed: 2.4, onArrive: () => { c.flash = 1; } }),
        });
      } else {
        const er = this.erPoint(true);
        this.add('mrna', [pore, er], {
          speed: 1.5,
          onArrive: () => {
            const g = this.nearest(w.golgi, er);
            this.add('protein', [er, g.pos.clone()], { speed: 1.6, onArrive: () => this.vesicleFrom(g) });
          },
        });
      }
    });
    rate('vesicle', (f.wallSyn / 1.6) * 2, () => this.vesicleFrom(this.pick(w.golgi)));
    rate('water', clamp(f.dV / 1000, 0, 3) * 7 + 0.8, () => {
      const s = w.pmPoint();
      this.add('h2o', [s.p.clone().addScaledVector(s.n, 4), s.p.clone(), box.project(s.p, 3.1), w.vacuolePoint()], { speed: 3.4 });
    });
    rate('k', clamp(f.Kup / 0.15, 0, 3) * 3, () => {
      const s = w.pmPoint();
      this.add('k', [s.p.clone().addScaledVector(s.n, 4), s.p.clone(), box.project(s.p, 3.1), w.vacuolePoint()], { speed: 2.6 });
    });
  }

  erPoint(rough) {
    const w = this.world;
    const n = w.nucleus.position;
    const p = rough ? n.clone().add(new THREE.Vector3().randomDirection().multiplyScalar(5.5)) : w.box.sample(Math.random).p;
    return w.box.project(p, 1.4);
  }

  vesicleFrom(g) {
    if (!g) return;
    const w = this.world;
    const n = w.box.normal(g.pos);
    const end = w.box.project(g.pos.clone().add(new THREE.Vector3().randomDirection().projectOnPlane(n).multiplyScalar(2)), 0.1);
    this.add('vesicle', [g.pos.clone(), end], { speed: 0.9 });
  }

  // Each new sugar molecule is sent to a sink in proportion to current demand.
  sugarFate(model, from) {
    const f = model.f, w = this.world, box = w.box;
    const wts = { resp: f.resp, wall: f.wallSyn + f.lipidSyn + f.nuclSyn, aa: f.aaC, vac: Math.max(0, f.vacSug), exp: f.export };
    let tot = 0;
    for (const k in wts) { wts[k] = Math.pow(Math.max(0, wts[k]), 0.8); tot += wts[k]; }
    let r = Math.random() * tot, fate = 'resp';
    for (const k in wts) { r -= wts[k]; if (r <= 0) { fate = k; break; } }
    if (fate === 'resp') {
      const mi = this.nearest(w.mitos, from);
      this.add('sugar', [from, mi.pos.clone()], { speed: 1.8, onArrive: () => this.add('co2', [mi.pos.clone(), box.project(mi.pos, -4)], { speed: 2.4 }) });
    } else if (fate === 'wall') {
      if (Math.random() < 0.6) {
        const e = box.project(from.clone().add(new THREE.Vector3().randomDirection().multiplyScalar(3)), 0.05);
        this.add('sugar', box.shellPath(from, e, 1, 4), { speed: 1.8 });
      } else {
        const g = this.nearest(w.golgi, from);
        this.add('sugar', box.shellPath(from, g.pos.clone(), 1.5, 5), { speed: 1.8 });
      }
    } else if (fate === 'aa') {
      const c = this.nearest(w.chloroplasts, from);
      this.add('sugar', [from, c.pos.clone()], { speed: 1.5 });
    } else if (fate === 'vac') {
      this.add('sugar', [from, box.project(from, 3.1), w.vacuolePoint()], { speed: 2.2 });
    } else {
      const pd = this.nearest(w.pds.map((p) => ({ pos: p.norm.clone().multiply(w.h), n: p.n })), from);
      this.add('sugar', box.shellPath(from, pd.pos, 0.6, 10).getPoints(20).concat([pd.pos.clone().addScaledVector(pd.n, 3)]), { speed: 2.4 });
    }
  }

  update(dt, time, camPos) {
    const o = new THREE.Object3D();
    const counts = {};
    for (const k in this.inst) counts[k] = 0;
    for (const p of this.list) {
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.age += dt;
      p.s += p.speed * dt;
      if (p.s >= p.len) {
        if (!p.done) { p.done = true; if (p.onArrive) p.onArrive(); }
        continue;
      }
      p.curve.getPointAt(p.s / p.len, p.pos);
      // A little Brownian jitter.
      p.pos.x += Math.sin(p.age * 9 + p.len) * 0.03;
      p.pos.y += Math.cos(p.age * 7 + p.len) * 0.03;
      const im = this.inst[p.type];
      const i = counts[p.type];
      if (i >= MAX) continue;
      const hi = this.emph && this.emph.has(p.type);
      // Keep tokens a sensible size on screen: smaller when the camera is close.
      const dc = camPos ? camPos.distanceTo(p.pos) : 20;
      const near = clamp((dc - 0.8) / 1.5, 0, 1);
      const sz = near * clamp(dc / 18, 0.12, 1) * TYPES[p.type].size * (hi ? 1.8 + 0.25 * Math.sin(time * 6 + p.len) : this.emph ? 0.7 : 1);
      o.position.copy(p.pos); o.scale.setScalar(sz); o.updateMatrix();
      im.setMatrixAt(i, o.matrix);
      counts[p.type] = i + 1;
    }
    this.list = this.list.filter((p) => !p.done);
    for (const k in this.inst) {
      const im = this.inst[k];
      im.count = counts[k];
      im.instanceMatrix.needsUpdate = true;
      im.material.opacity = this.emph && !this.emph.has(k) ? 0.35 : 0.95;
    }
    // Photons.
    const arr = this.photonLines.geometry.attributes.position.array;
    let n = 0;
    for (const ph of this.photons) {
      ph.u += dt * 1.8;
      if (ph.u >= 1) { ph.done = true; if (ph.c) ph.c.flash = 1; continue; }
      if (n >= 400) continue;
      const head = new THREE.Vector3().lerpVectors(ph.a, ph.b, ph.u);
      const tail = head.clone().addScaledVector(this.sunDir, 3.5);
      arr.set([head.x, head.y, head.z, tail.x, tail.y, tail.z], n * 6);
      n++;
    }
    this.photons = this.photons.filter((p) => !p.done);
    this.photonLines.geometry.setDrawRange(0, n * 2);
    this.photonLines.geometry.attributes.position.needsUpdate = true;
  }

  // A representative live particle of a type near the focus (for caption chips).
  representative(type) {
    let best = null, bd = Infinity;
    for (const p of this.list) {
      if (p.type !== type || p.delay > 0 || p.done || p.s < 0.15 * p.len || p.s > 0.8 * p.len) continue;
      const d = this.focus ? p.pos.distanceTo(this.focus.p) : 0;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
}
