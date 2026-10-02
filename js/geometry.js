// Cell geometry and organelle layout.
//
// World units: 1 unit = 0.1 µm. A newborn cell is ~44 × 30 µm in this section.
// Everything inside the cytoplasm is positioned in band coordinates (t, d):
//   t ∈ [0, 1)  position around the cell perimeter
//   d ∈ [0, 1]  depth from the plasma membrane (0) to the tonoplast (1)
// so organelles stay in the thin cytoplasm as the cell grows and elongates.
(function (VC) {
  'use strict';
  const U = VC.U;
  const N = 360;

  function roundedRectPolyline(W, H, R) {
    const pts = [];
    const line = (x0, y0, x1, y1) => {
      const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4));
      for (let i = 0; i < n; i++) pts.push({ x: U.lerp(x0, x1, i / n), y: U.lerp(y0, y1, i / n) });
    };
    const arc = (cx, cy, a0, a1) => {
      const n = 24;
      for (let i = 0; i < n; i++) {
        const a = U.lerp(a0, a1, i / n);
        pts.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) });
      }
    };
    // Clockwise on screen, starting at the right-middle.
    line(W, 0, W, H - R);
    arc(W - R, H - R, 0, Math.PI / 2);
    line(W - R, H, -W + R, H);
    arc(-W + R, H - R, Math.PI / 2, Math.PI);
    line(-W, H - R, -W, -H + R);
    arc(-W + R, -H + R, Math.PI, 1.5 * Math.PI);
    line(-W + R, -H, W - R, -H);
    arc(W - R, -H + R, 1.5 * Math.PI, 2 * Math.PI);
    line(W, -H + R, W, 0);
    return pts;
  }

  function resample(pts, n) {
    const len = [0];
    for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    const total = len[len.length - 1] + Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y);
    const out = [];
    let j = 0;
    for (let i = 0; i < n; i++) {
      const s = (i / n) * total;
      while (j < len.length - 1 && len[j + 1] < s) j++;
      const a = pts[j], b = pts[(j + 1) % pts.length];
      const segLen = (j + 1 < len.length ? len[j + 1] : total) - len[j];
      const f = segLen > 0 ? (s - len[j]) / segLen : 0;
      out.push({ x: U.lerp(a.x, b.x, f), y: U.lerp(a.y, b.y, f) });
    }
    return { pts: out, total };
  }

  // A cell outline + cytoplasm band.
  class Outline {
    constructor(opts) {
      this.seed = opts.seed || 1;
      this.cx = opts.cx || 0;
      this.cy = opts.cy || 0;
      this.nucT = opts.nucT != null ? opts.nucT : 0.5;
      this.bulge = opts.bulge != null ? opts.bulge : 1;
      this.base = opts.base || 42;
      this.set(opts.W, opts.H);
    }

    set(W, H) {
      if (this.W === W && this.H === H) return false;
      this.W = W; this.H = H;
      const R = Math.min(W, H) * 0.5;
      const raw = roundedRectPolyline(W, H, R);
      const { pts, total } = resample(raw, N);
      this.perimeter = total;
      const rnd = U.rng(this.seed);
      const ph = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28];
      this.p = new Array(N);
      for (let i = 0; i < N; i++) {
        const a = pts[(i + N - 1) % N], b = pts[(i + 1) % N];
        let tx = b.x - a.x, ty = b.y - a.y;
        const l = Math.hypot(tx, ty) || 1;
        tx /= l; ty /= l;
        let nx = -ty, ny = tx;
        if (nx * -pts[i].x + ny * -pts[i].y < 0) { nx = -nx; ny = -ny; }
        const th = (i / N) * U.TAU;
        const wob = 2.5 * Math.sin(3 * th + ph[0]) + 1.6 * Math.sin(7 * th + ph[1]) + 0.8 * Math.sin(13 * th + ph[2]);
        this.p[i] = { x: pts[i].x - nx * wob + this.cx, y: pts[i].y - ny * wob + this.cy, nx, ny, tx, ty };
      }
      // Band thickness profile.
      this.th = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const t = i / N;
        let dt = Math.abs(t - this.nucT); dt = Math.min(dt, 1 - dt);
        const ds = dt * this.perimeter;
        const g = Math.exp(-(ds * ds) / (2 * 62 * 62));
        this.th[i] = this.base + 5 * Math.sin(t * U.TAU * 4 + ph[1]) + this.bulge * 118 * g;
      }
      // Smooth tonoplast.
      this.tono = new Array(N);
      for (let i = 0; i < N; i++) {
        const q = this.p[i];
        this.tono[i] = { x: q.x + q.nx * this.th[i], y: q.y + q.ny * this.th[i] };
      }
      for (let pass = 0; pass < 3; pass++) {
        const c = this.tono.map((v) => ({ ...v }));
        for (let i = 0; i < N; i++) {
          const a = c[(i + N - 1) % N], b = c[(i + 1) % N];
          this.tono[i] = { x: (a.x + 2 * c[i].x + b.x) / 4, y: (a.y + 2 * c[i].y + b.y) / 4 };
        }
      }
      return true;
    }

    idx(t) {
      const f = U.wrap01(t) * N;
      const i = Math.floor(f);
      return { i, j: (i + 1) % N, f: f - i };
    }

    // Point on plasma membrane.
    pm(t) {
      const { i, j, f } = this.idx(t);
      const a = this.p[i], b = this.p[j];
      return { x: U.lerp(a.x, b.x, f), y: U.lerp(a.y, b.y, f), nx: U.lerp(a.nx, b.nx, f), ny: U.lerp(a.ny, b.ny, f), tx: a.tx, ty: a.ty };
    }

    thick(t) {
      const { i, j, f } = this.idx(t);
      return U.lerp(this.th[i], this.th[j], f);
    }

    tonoAt(t) {
      const { i, j, f } = this.idx(t);
      const a = this.tono[i], b = this.tono[j];
      return { x: U.lerp(a.x, b.x, f), y: U.lerp(a.y, b.y, f) };
    }

    // Band point: interpolates PM → tonoplast.
    at(t, d) {
      const m = this.pm(t);
      const to = this.tonoAt(t);
      return { x: U.lerp(m.x, to.x, d), y: U.lerp(m.y, to.y, d), a: Math.atan2(m.ty, m.tx), nx: m.nx, ny: m.ny };
    }

    // Nearest perimeter parameter to a world point.
    nearestT(x, y) {
      let best = 0, bd = Infinity;
      for (let i = 0; i < N; i += 2) {
        const q = this.p[i];
        const d = (q.x - x) ** 2 + (q.y - y) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
      return best / N;
    }

    pathPM(ctx, offset = 0) {
      ctx.moveTo(this.p[0].x - this.p[0].nx * offset, this.p[0].y - this.p[0].ny * offset);
      for (let i = 1; i < N; i++) ctx.lineTo(this.p[i].x - this.p[i].nx * offset, this.p[i].y - this.p[i].ny * offset);
      ctx.closePath();
    }

    pathTono(ctx) {
      ctx.moveTo(this.tono[0].x, this.tono[0].y);
      for (let i = 1; i < N; i++) ctx.lineTo(this.tono[i].x, this.tono[i].y);
      ctx.closePath();
    }

    // Is a world point inside the plasma membrane / the vacuole?
    inside(x, y, ring) {
      ring = ring || this.p;
      let c = false;
      for (let i = 0, j = N - 1; i < N; j = i++) {
        const a = ring[i], b = ring[j];
        if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
      }
      return c;
    }
    inVacuole(x, y) { return this.inside(x, y, this.tono); }

    // Band waypoints from tA to tB (shortest way round) at depth d.
    bandPath(tA, tB, d, step = 0.025) {
      let delta = U.wrap01(tB - tA);
      if (delta > 0.5) delta -= 1;
      const n = Math.max(1, Math.ceil(Math.abs(delta) / step));
      const out = [];
      for (let i = 1; i < n; i++) out.push(this.at(tA + (delta * i) / n, d));
      return out;
    }

    // Random point inside the vacuole.
    vacuolePoint(rnd = Math.random) {
      for (let k = 0; k < 30; k++) {
        const x = this.cx + (rnd() * 2 - 1) * (this.W - 40);
        const y = this.cy + (rnd() * 2 - 1) * (this.H - 40);
        if (this.inVacuole(x, y)) return { x, y };
      }
      return { x: this.cx + 20, y: this.cy };
    }
  }

  // Organelle layout for the focal cell.
  class Layout {
    constructor(outline, seed) {
      this.o = outline;
      this.seed = seed;
      this.build();
    }

    build() {
      const o = this.o;
      const rnd = U.rng(this.seed);
      this.rnd = rnd;
      const nuc = o.nucT;
      const avoid = (t, width) => {
        let dt = Math.abs(U.wrap01(t) - nuc); dt = Math.min(dt, 1 - dt);
        return dt * o.perimeter < width;
      };

      // Chloroplasts — appressed to the cell periphery.
      this.chloroplasts = [];
      this.addChloroplasts(12);

      // Mitochondria and peroxisomes stream with the cytoplasm.
      this.mitochondria = [];
      for (let i = 0; i < 12; i++) this.mitochondria.push(this.newMito(rnd() ));
      this.peroxisomes = [];
      for (let i = 0; i < 7; i++) {
        this.peroxisomes.push({ id: 'px' + i, t: rnd(), d: rnd() < 0.5 ? 0.14 : 0.84, r: 7, v: 0.0045 + rnd() * 0.004, ph: rnd() * 6.28, hl: 0 });
      }
      // Golgi stacks (plant Golgi are many small mobile stacks).
      this.golgi = [];
      for (let i = 0; i < 7; i++) {
        let t = nuc + (rnd() - 0.5) * 0.24;
        if (i > 3) t = rnd();
        this.golgi.push({ id: 'g' + i, t, d: 0.35 + rnd() * 0.35, v: 0.002 + rnd() * 0.002, ph: rnd() * 6.28, hl: 0 });
      }
      // Free ribosomes / polysomes.
      this.ribosomes = [];
      for (let i = 0; i < 260; i++) this.ribosomes.push({ t: rnd(), d: 0.08 + rnd() * 0.84, s: rnd() });
      // ER network nodes: denser around the nucleus.
      this.er = { nodes: [], edges: [] };
      for (let i = 0; i < 90; i++) {
        let t = rnd();
        if (i < 34) t = nuc + (rnd() - 0.5) * 0.22;
        this.er.nodes.push({ t, d: 0.1 + rnd() * 0.8, rough: i < 34 || rnd() < 0.2 });
      }
      // Connect each node to its 2 nearest neighbours (computed at layout time).
      const P = this.er.nodes.map((n) => o.at(n.t, n.d));
      const seen = new Set();
      for (let i = 0; i < P.length; i++) {
        const ds = P.map((q, j) => ({ j, d: (q.x - P[i].x) ** 2 + (q.y - P[i].y) ** 2 })).filter((x) => x.j !== i).sort((a, b) => a.d - b.d);
        for (let k = 0; k < 3; k++) {
          const j = ds[k].j;
          if (ds[k].d > 95 * 95) continue;
          const key = i < j ? i + '-' + j : j + '-' + i;
          if (seen.has(key)) continue;
          seen.add(key);
          this.er.edges.push([i, j, (rnd() - 0.5) * 14]);
        }
      }
      // Membrane proteins on the plasma membrane.
      const pmTypes = ['aquaporin', 'hatpase', 'kchannel', 'nrt', 'aquaporin', 'sut', 'hatpase', 'csc'];
      this.pmProteins = [];
      for (let i = 0; i < 64; i++) {
        this.pmProteins.push({ t: (i + rnd() * 0.6) / 64, type: pmTypes[i % pmTypes.length], ph: rnd() * 6.28 });
      }
      const tonoTypes = ['vatpase', 'tip', 'vppase', 'nhx', 'tip', 'tst', 'clc'];
      this.tonoProteins = [];
      for (let i = 0; i < 30; i++) this.tonoProteins.push({ t: (i + rnd() * 0.6) / 30, type: tonoTypes[i % tonoTypes.length], ph: rnd() * 6.28 });

      // Plasmodesmata in pit fields at the four faces where neighbours touch.
      this.plasmodesmata = [];
      const faces = [0.0, 0.25, 0.5, 0.75];
      faces.forEach((c) => {
        for (let k = 0; k < 3; k++) this.plasmodesmata.push({ t: U.wrap01(c + (k - 1) * 0.012 + (rnd() - 0.5) * 0.004) });
      });
      // Actin cables & transvacuolar strands.
      this.strands = [];
      // Transvacuolar strands radiate from the nuclear pocket to the far side.
      const ends = [0.86 + rnd() * 0.05, 0.12 + rnd() * 0.05];
      ends.forEach((t1, k) => this.strands.push({ t0: nuc + (k ? 0.035 : -0.035), t1, bend: (k ? 1 : -1) * (50 + rnd() * 40) }));
    }

    newMito(t) {
      const rnd = this.rnd;
      return { id: 'm' + Math.floor(rnd() * 1e6), t, d: rnd() < 0.5 ? 0.1 + rnd() * 0.06 : 0.82 + rnd() * 0.08, len: 16 + rnd() * 8, v: 0.006 + rnd() * 0.006, ph: rnd() * 6.28, hl: 0, bend: (rnd() - 0.5) * 0.6 };
    }

    addChloroplasts(n) {
      const o = this.o, rnd = this.rnd;
      const nuc = o.nucT;
      // Evenly spaced home positions outside the nuclear bulge.
      const usable = [];
      for (let i = 0; i < n; i++) usable.push(i);
      const span = 1 - 2 * (70 / o.perimeter);
      this.chloroplasts = usable.map((i) => {
        const t = U.wrap01(nuc + 70 / o.perimeter + span * ((i + 0.5) / n) + (rnd() - 0.5) * 0.01);
        return this.newChloroplast(t);
      });
      // One or two chloroplasts tucked next to the nucleus.
      this.chloroplasts.push(this.newChloroplast(U.wrap01(nuc - 0.012), 0.12));
    }

    newChloroplast(t, d = 0.47) {
      const rnd = this.rnd;
      const grana = [];
      const ng = 6 + Math.floor(rnd() * 3);
      for (let g = 0; g < ng; g++) {
        grana.push({ u: -0.7 + (1.4 * (g + 0.5)) / ng + (rnd() - 0.5) * 0.08, v: (rnd() - 0.5) * 0.35, n: 4 + Math.floor(rnd() * 4) });
      }
      const starch = [];
      for (let k = 0; k < 2 + Math.floor(rnd() * 2); k++) starch.push({ u: -0.5 + rnd(), v: (rnd() - 0.5) * 0.5, a: (rnd() - 0.5) * 0.6, w: 0.6 + rnd() * 0.6 });
      const globules = [];
      for (let k = 0; k < 5; k++) globules.push({ u: (rnd() - 0.5) * 1.6, v: (rnd() - 0.5) * 0.7 });
      return {
        id: 'cp' + Math.floor(rnd() * 1e6), t, home: t, d, len: 54 + rnd() * 10, wid: 22 + rnd() * 4,
        grana, starch, globules, ph: rnd() * 6.28, hl: 0, flash: 0, divide: 0,
      };
    }
  }

  VC.Outline = Outline;
  VC.Layout = Layout;
})(window.VC);
