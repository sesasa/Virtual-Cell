// Scene: ties the physiology model to the cell's geometry. It owns the focal
// cell's outline and organelle layout, the neighbouring cells, streaming,
// chloroplast division, nuclear migration in mitosis, and cell division.
(function (VC) {
  'use strict';
  const U = VC.U;
  const W0 = 220, H0 = 150; // newborn half-width / half-height (world units, 0.1 µm)
  const WALL = 9;

  class Scene {
    constructor(model) {
      this.model = model;
      this.time = 0;
      this.seed = 7;
      this.flash = 0;
      this.sisterGlow = 0;
      this._build();
      model.onChloroplastDivision = () => this.queueChloroplastDivision();
      model.onDivide = () => this.onCellDivision();
    }

    dims() {
      const r = this.model.s.V / this.model.V0;
      // Anisotropic growth: transverse cellulose hoops make the cell elongate.
      return { W: W0 * Math.pow(r, 0.8), H: H0 * Math.pow(r, 0.2) };
    }

    _build() {
      const { W, H } = this.dims();
      this.outline = new VC.Outline({ W, H, seed: this.seed, nucT: 0.5 });
      this.layout = new VC.Layout(this.outline, this.seed * 13 + 5);
      this.pendingCp = 0;
      this.neighbors = [
        { key: 'R', W: 205, H: 150, seed: 21, nucT: 0.0 },
        { key: 'L', W: 190, H: 140, seed: 22, nucT: 0.27 },
        { key: 'T', W: 230, H: 128, seed: 23, nucT: 0.75 },
        { key: 'B', W: 215, H: 136, seed: 24, nucT: 0.6 },
        { key: 'TR', W: 180, H: 120, seed: 25, nucT: 0.1 },
        { key: 'BL', W: 200, H: 130, seed: 26, nucT: 0.4 },
        { key: 'TL', W: 170, H: 130, seed: 27, nucT: 0.9 },
        { key: 'BR', W: 190, H: 125, seed: 28, nucT: 0.3 },
      ].map((n) => ({ ...n, outline: null, cps: null }));
      this._placeNeighbors(true);
    }

    _placeNeighbors(force) {
      const { W, H } = this.outline;
      const g = WALL * 2 + 1;
      const pos = {
        R: [W + g + 205, 18],
        L: [-W - g - 190, -14],
        T: [-60, -H - g - 140],
        B: [70, H + g + 148],
        TR: [W + 215, -H - 150],
        BL: [-W - 195, H + 160],
        TL: [-W - 160, -H - 170],
        BR: [W + 200, H + 155],
      };
      for (const n of this.neighbors) {
        const [cx, cy] = pos[n.key];
        if (force || !n.outline || Math.abs(n.outline.cx - cx) > 0.5 || Math.abs(n.outline.cy - cy) > 0.5 || n.sisterW) {
          const w = n.sisterW || n.W, h = n.sisterH || n.H;
          const cxx = n.sisterW ? W + g + w : cx;
          n.outline = new VC.Outline({ W: w, H: h, seed: n.seed, cx: cxx, cy: n.sisterW ? 0 : cy, nucT: n.nucT, bulge: 0.8 });
          if (!n.cps) {
            const rnd = U.rng(n.seed);
            const k = 11 + Math.floor(rnd() * 4);
            n.cps = [];
            for (let i = 0; i < k; i++) n.cps.push({ t: U.wrap01(n.nucT + 0.06 + (0.88 * (i + 0.5)) / k), len: 52 + rnd() * 8, wid: 22, starch: rnd() });
          }
        }
      }
    }

    get wall() { return WALL; }

    queueChloroplastDivision() { this.pendingCp++; }

    onCellDivision() {
      // Keep the left daughter as the focal cell; the right one becomes the sister.
      const prev = this.dims();
      this.flash = 1;
      this.seed += 1;
      const right = this.neighbors.find((n) => n.key === 'R');
      this._build();
      const r = this.neighbors.find((n) => n.key === 'R');
      r.sisterW = this.outline.W; r.sisterH = this.outline.H; r.sister = true;
      r.nucT = 0.5;
      r.cps = null;
      this._placeNeighbors(true);
      this.sisterGlow = 1;
      if (this.onDivided) this.onDivided(prev);
    }

    // Called every frame with the real elapsed time (s).
    update(dt) {
      this.time += dt;
      const m = this.model;
      const { W, H } = this.dims();
      if (this.outline.set(W, H)) this._placeNeighbors(false);
      const o = this.outline, L = this.layout;
      const per = o.perimeter;
      this.flash = Math.max(0, this.flash - dt * 0.7);
      this.sisterGlow = Math.max(0, this.sisterGlow - dt * 0.05);

      // Cytoplasmic streaming (myosin XI on actin). Real-time speed: a few µm/s.
      const stream = m.s.phase === 'M' ? 0.3 : 1;
      for (const mi of L.mitochondria) {
        mi.t = U.wrap01(mi.t + (mi.v * 1400 * dt * stream) / per);
        mi.d = U.clamp(mi.d + Math.sin(this.time * 0.3 + mi.ph) * 0.0006, 0.08, 0.92);
      }
      for (const px of L.peroxisomes) px.t = U.wrap01(px.t + (px.v * 1400 * dt * stream) / per);
      for (const g of L.golgi) g.t = U.wrap01(g.t + (g.v * 1400 * dt * stream) / per);

      // Chloroplast light-avoidance: in strong light they slide off the faces
      // that face the light (top/bottom) toward the side walls.
      const I = m.f.I || 0;
      const avoid = U.clamp((I - 700) / 600, 0, 1);
      const kMove = 1 - Math.exp(-dt * 0.4);
      for (const c of L.chloroplasts) {
        const p = o.pm(c.home);
        let target = c.home;
        if (Math.abs(p.ny) > 0.8) {
          const dir = p.x > o.cx ? 1 : -1;
          const toward = dir * (p.ny > 0 ? 1 : -1); // param direction toward the nearest side wall
          target = c.home + toward * avoid * 0.035;
        }
        let dlt = U.wrap01(target - c.t); if (dlt > 0.5) dlt -= 1;
        c.t = U.wrap01(c.t + dlt * kMove);
        c.flash = Math.max(0, c.flash - dt * 2.5);
        if (c.divide > 0) {
          c.divide += dt / 6;
          if (c.divide >= 1) this._splitChloroplast(c);
        }
      }
      if (this.pendingCp > 0) {
        const active = L.chloroplasts.filter((c) => c.divide > 0).length;
        if (active < 3 && L.chloroplasts.length < 30) {
          const cands = L.chloroplasts.filter((c) => c.divide === 0 && c.d > 0.3);
          if (cands.length) {
            U.pick(cands).divide = 0.001;
          }
          this.pendingCp--;
        } else if (L.chloroplasts.length >= 30) this.pendingCp = 0;
      }

      // World positions.
      for (const c of L.chloroplasts) { const q = o.at(c.t, c.d); c.x = q.x; c.y = q.y; c.a = q.a; }
      for (const mi of L.mitochondria) { const q = o.at(mi.t, mi.d); mi.x = q.x; mi.y = q.y; mi.a = q.a + mi.bend; }
      for (const px of L.peroxisomes) { const q = o.at(px.t, px.d); px.x = q.x; px.y = q.y; }
      for (const g of L.golgi) { const q = o.at(g.t, g.d); g.x = q.x; g.y = q.y; g.a = q.a; }

      // Nucleus: sits in the cytoplasmic bulge; in mitosis it migrates to the
      // division plane in the middle of the cell (phragmosome).
      const home = o.at(o.nucT, 0.5);
      const sub = m.mSubphase();
      let k = 0;
      if (sub) {
        if (sub.name === 'preprophase') k = U.easeInOut(sub.prog);
        else k = 1;
      }
      this.nucleus = {
        x: U.lerp(home.x, o.cx, k), y: U.lerp(home.y, o.cy, k),
        rx: 54, ry: 46, a: home.a + Math.PI / 2, mitosis: sub, migrate: k,
      };
    }

    _splitChloroplast(c) {
      const L = this.layout, o = this.outline;
      c.divide = 0;
      const half = (c.len * 0.55) / o.perimeter;
      const twin = L.newChloroplast(U.wrap01(c.t + half), c.d);
      twin.flash = 1;
      c.t = U.wrap01(c.t - half * 0.2);
      const idx = L.chloroplasts.indexOf(c);
      L.chloroplasts.splice(idx + 1, 0, twin);
      // Re-space home positions evenly (except the perinuclear one).
      const ring = L.chloroplasts.filter((x) => x.d > 0.3).sort((a, b) => U.wrap01(a.t - o.nucT) - U.wrap01(b.t - o.nucT));
      const span = 1 - 2 * (70 / o.perimeter);
      ring.forEach((x, i) => { x.home = U.wrap01(o.nucT + 70 / o.perimeter + span * ((i + 0.5) / ring.length)); });
    }

    // ---------- Queries used by particles, camera and hit-testing ----------
    randomOf(kind) {
      const L = this.layout;
      const arr = kind === 'chloroplast' ? L.chloroplasts : kind === 'mito' ? L.mitochondria : kind === 'perox' ? L.peroxisomes : kind === 'golgi' ? L.golgi : null;
      return arr && arr.length ? U.pick(arr) : null;
    }

    nearestOf(kind, x, y) {
      const L = this.layout;
      const arr = kind === 'chloroplast' ? L.chloroplasts : kind === 'mito' ? L.mitochondria : kind === 'perox' ? L.peroxisomes : L.golgi;
      let best = null, bd = Infinity;
      for (const a of arr) {
        const d = (a.x - x) ** 2 + (a.y - y) ** 2;
        if (d < bd) { bd = d; best = a; }
      }
      return best;
    }

    pmProtein(type) {
      const list = this.layout.pmProteins.filter((p) => p.type === type);
      return list.length ? U.pick(list) : U.pick(this.layout.pmProteins);
    }
    tonoProtein(type) {
      const list = this.layout.tonoProteins.filter((p) => p.type === type);
      return list.length ? U.pick(list) : U.pick(this.layout.tonoProteins);
    }

    outsidePoint(t, dist) {
      const p = this.outline.pm(t);
      const d = WALL + (dist == null ? 18 + Math.random() * 40 : dist);
      return { x: p.x - p.nx * d, y: p.y - p.ny * d };
    }

    nuclearPore() {
      const n = this.nucleus;
      const a = Math.random() * U.TAU;
      return { x: n.x + Math.cos(a) * n.rx, y: n.y + Math.sin(a) * n.ry, a };
    }

    bounds() {
      const o = this.outline;
      return { x0: o.cx - o.W, x1: o.cx + o.W, y0: o.cy - o.H, y1: o.cy + o.H };
    }
  }

  Scene.W0 = W0; Scene.H0 = H0; Scene.WALL = WALL;
  VC.Scene = Scene;
})(window.VC);
