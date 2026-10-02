// Canvas renderer for the cell. Draws in world coordinates (0.1 µm units)
// through a camera, with level-of-detail as you zoom in.
(function (VC) {
  'use strict';
  const U = VC.U;
  const TYPES = () => VC.Particles.TYPES;

  const C = {
    bg: '#050d0f',
    air: '#081619',
    wall: '#86ab9c',
    lamella: '#c8b98d',
    cyto: '#1c2f27',
    cytoHi: '#2a4236',
    vac: '#0c2630',
    vacHi: '#14404d',
    tono: '#6fb7cc',
    pm: '#dfeecf',
    er: '#4fb6a9',
    actin: '#d9b47c',
    cp: '#2f8a36',
    cpEdge: '#b9e88d',
    granum: '#8fe27a',
    starch: '#f3ecd6',
    mito: '#8c4a2c',
    mitoEdge: '#f2a66c',
    perox: '#3c2e58',
    peroxEdge: '#c9b2ff',
    golgi: '#f2c96b',
    nuc: '#2b2447',
    nucEdge: '#a99ae6',
    chromatin: '#7464bd',
    nucleolus: '#a28aec',
    mt: '#7fe7fa',
  };

  class Camera {
    constructor() {
      this.x = 0; this.y = 0; this.z = 1;
      this.tx = 0; this.ty = 0; this.tz = 1;
      this.anim = null;
    }
    flyTo(x, y, z, dur = 1.8) {
      this.anim = { x0: this.x, y0: this.y, z0: this.z, x1: x, y1: y, z1: z, t: 0, dur };
    }
    update(dt) {
      if (this.anim) {
        const a = this.anim;
        a.t += dt;
        const k = U.easeInOut(U.clamp(a.t / a.dur, 0, 1));
        // Zoom interpolates geometrically so it feels even.
        this.z = Math.exp(U.lerp(Math.log(a.z0), Math.log(a.z1), k));
        this.x = U.lerp(a.x0, a.x1, k);
        this.y = U.lerp(a.y0, a.y1, k);
        if (a.t >= a.dur) this.anim = null;
      }
    }
  }

  class Renderer {
    constructor(canvas, scene, model, particles) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.scene = scene;
      this.model = model;
      this.particles = particles;
      this.cam = new Camera();
      this.labels = [];
      this.focus = null; // {targets:[{x,y,r}], strength}
      this.spot = 0;
      this.showLabels = true;
      this.safe = { l: 0, r: 0, t: 0, b: 0 }; // screen area hidden by overlays
      this.safeTarget = { l: 0, r: 0, t: 0, b: 0 };
      this.hover = null;
      this.noise = this._makeNoise();
      this.spotCanvas = document.createElement('canvas');
      this.chromatin = Array.from({ length: 26 }, () => ({ a: Math.random() * U.TAU, r: Math.random() * 0.85, s: 3 + Math.random() * 6 }));
      this.resize();
    }

    _makeNoise() {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d');
      const img = g.createImageData(128, 128);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random();
        img.data[i] = 200; img.data[i + 1] = 230; img.data[i + 2] = 200;
        img.data[i + 3] = v > 0.93 ? 70 : v > 0.8 ? 28 : 0;
      }
      g.putImageData(img, 0, 0);
      return c;
    }

    resize() {
      const r = this.cv.getBoundingClientRect();
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.cw = Math.max(10, r.width);
      this.ch = Math.max(10, r.height);
      this.cv.width = Math.round(this.cw * this.dpr);
      this.cv.height = Math.round(this.ch * this.dpr);
      this.spotCanvas.width = this.cv.width;
      this.spotCanvas.height = this.cv.height;
      this.base = Math.min(this.cw / 1050, this.ch / 720);
      this.pattern = null;
    }

    get S() { return this.base * this.cam.z; }
    // The camera centres its target in the part of the screen not covered by overlays.
    get ox() { return (this.cw + this.safe.l - this.safe.r) / 2; }
    get oy() { return (this.ch + this.safe.t - this.safe.b) / 2; }
    toScreen(x, y) { return { x: (x - this.cam.x) * this.S + this.ox, y: (y - this.cam.y) * this.S + this.oy }; }
    toWorld(sx, sy) { return { x: (sx - this.ox) / this.S + this.cam.x, y: (sy - this.oy) / this.S + this.cam.y }; }
    // Zoom so that a world width w fills the free area.
    zoomForWidth(w) { return Math.max(0.3, (this.cw - this.safe.l - this.safe.r) / (w * this.base)); }

    // Fit the whole focal cell.
    fitCell(margin = 1.25) {
      const b = this.scene.bounds();
      const w = (b.x1 - b.x0) * margin, h = (b.y1 - b.y0) * margin;
      const fw = Math.max(200, this.cw - this.safe.l - this.safe.r), fh = Math.max(160, this.ch - this.safe.t - this.safe.b);
      const z = Math.min(fw / (w * this.base), fh / (h * this.base));
      return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, z };
    }

    draw(dt) {
      const ctx = this.ctx, m = this.model, sc = this.scene;
      this.cam.update(dt);
      const ks = 1 - Math.exp(-dt * 3);
      for (const k of ['l', 'r', 't', 'b']) this.safe[k] += (this.safeTarget[k] - this.safe[k]) * ks;
      const S = this.S, px = 1 / S;
      this.px = px;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const I = m.f.I || 0;
      const dayK = U.clamp(I / 900, 0, 1);

      // Background: the dark intercellular air space, lit from above by day.
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, this.cw, this.ch);
      if (dayK > 0) {
        const g = ctx.createLinearGradient(0, 0, 0, this.ch);
        g.addColorStop(0, U.rgba('#fff2b8', 0.13 * dayK));
        g.addColorStop(0.6, U.rgba('#fff2b8', 0.02 * dayK));
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, this.cw, this.ch);
      }

      ctx.setTransform(this.dpr * S, 0, 0, this.dpr * S, this.dpr * (this.ox - this.cam.x * S), this.dpr * (this.oy - this.cam.y * S));

      // Air-space gas molecules (decorative, slow drift) when zoomed in.
      this._airDust(ctx, px);

      for (const n of sc.neighbors) this._neighbor(ctx, n, px);
      this._cell(ctx, px, dt);
      this._particles(ctx, px);

      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      // Sun shafts.
      if (dayK > 0.05) this._shafts(ctx, dayK);
      // Night tint.
      const night = 1 - U.clamp(I / 150, 0, 1);
      if (night > 0) {
        ctx.fillStyle = `rgba(8,18,52,${0.22 * night})`;
        ctx.fillRect(0, 0, this.cw, this.ch);
      }
      this._spotlight(ctx, dt);
      if (sc.flash > 0) {
        ctx.fillStyle = `rgba(230,255,240,${0.55 * sc.flash * sc.flash})`;
        ctx.fillRect(0, 0, this.cw, this.ch);
      }
      if (this.showLabels) this._labels(ctx);
      this._scaleBar(ctx);
    }

    _airDust(ctx, px) {
      if (this.cam.z < 1.6) return;
      const t = this.scene.time;
      const b = this.scene.bounds();
      ctx.fillStyle = 'rgba(180,220,230,0.18)';
      for (let i = 0; i < 70; i++) {
        const x = b.x0 - 300 + ((i * 97.3 + t * (6 + (i % 5))) % (b.x1 - b.x0 + 600));
        const y = b.y0 - 250 + ((i * 53.7 + Math.sin(t * 0.3 + i) * 20) % (b.y1 - b.y0 + 500));
        ctx.beginPath();
        ctx.arc(x, y, 1.2 * px * 2, 0, U.TAU);
        ctx.fill();
      }
    }

    _shafts(ctx, k) {
      const t = this.scene.time;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        const x = ((i * 0.23 + 0.08) * this.cw + Math.sin(t * 0.07 + i) * 30) % this.cw;
        const g = ctx.createLinearGradient(x, 0, x + 120, this.ch);
        g.addColorStop(0, U.rgba('#fff4c2', 0.06 * k));
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x - 30, 0); ctx.lineTo(x + 50, 0); ctx.lineTo(x + 230, this.ch); ctx.lineTo(x + 80, this.ch);
        ctx.fill();
      }
      ctx.restore();
    }

    _neighbor(ctx, n, px) {
      const o = n.outline;
      const sister = n.sister;
      ctx.save();
      ctx.globalAlpha = sister ? 0.75 + 0.25 * this.scene.sisterGlow : 0.5;
      ctx.beginPath(); o.pathPM(ctx, VC.Scene.WALL);
      ctx.fillStyle = U.rgba(C.wall, 0.28);
      ctx.fill();
      ctx.beginPath(); o.pathPM(ctx, 0);
      ctx.fillStyle = C.cyto;
      ctx.fill();
      ctx.beginPath(); o.pathTono(ctx);
      ctx.fillStyle = C.vac;
      ctx.fill();
      ctx.strokeStyle = U.rgba(C.tono, 0.35);
      ctx.lineWidth = 1;
      ctx.stroke();
      // Nucleus.
      const nq = o.at(o.nucT, 0.5);
      ctx.beginPath(); ctx.ellipse(nq.x, nq.y, 44, 38, nq.a + Math.PI / 2, 0, U.TAU);
      ctx.fillStyle = C.nuc; ctx.fill();
      ctx.strokeStyle = U.rgba(C.nucEdge, 0.5); ctx.stroke();
      // Chloroplasts.
      const starchK = U.clamp(this.model.s.starch / 160, 0.05, 1);
      const glow = U.clamp((this.model.f.I || 0) / 1100, 0, 1);
      for (const c of n.cps) {
        const q = o.at(c.t, 0.47);
        ctx.save();
        ctx.translate(q.x, q.y); ctx.rotate(q.a);
        ctx.beginPath(); ctx.ellipse(0, 0, c.len / 2, c.wid / 2, 0, 0, U.TAU);
        ctx.fillStyle = U.mix('#245e2a', '#4aa043', glow * 0.6);
        ctx.fill();
        ctx.fillStyle = U.rgba(C.starch, 0.7);
        ctx.beginPath(); ctx.ellipse(-6, 0, 7 * Math.sqrt(starchK) * (0.6 + c.starch * 0.5), 4 * Math.sqrt(starchK), 0, 0, U.TAU);
        ctx.fill();
        ctx.restore();
      }
      ctx.beginPath(); o.pathPM(ctx, 0);
      ctx.strokeStyle = U.rgba(C.pm, 0.35); ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    }

    _cell(ctx, px, dt) {
      const sc = this.scene, o = sc.outline, L = sc.layout, m = this.model;
      const t = sc.time;
      const W = VC.Scene.WALL;

      // ---- Cell wall: layered cellulose + pectin-rich middle lamella ----
      ctx.beginPath(); o.pathPM(ctx, W);
      ctx.fillStyle = U.rgba(C.wall, 0.42);
      ctx.fill();
      ctx.save();
      ctx.setLineDash([6, 4]);
      for (let k = 1; k < 4; k++) {
        ctx.beginPath(); o.pathPM(ctx, (W * k) / 4);
        ctx.strokeStyle = U.rgba('#cfe8db', 0.18);
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
      ctx.restore();
      ctx.beginPath(); o.pathPM(ctx, W);
      ctx.strokeStyle = U.rgba(C.lamella, 0.5);
      ctx.lineWidth = 1.4;
      ctx.stroke();
      // Wall acidity glow (acid growth) when zoomed.
      const acid = U.clamp((6.1 - m.s.pH) / 1.3, 0, 1);
      if (acid > 0.1) {
        ctx.beginPath(); o.pathPM(ctx, W / 2);
        ctx.strokeStyle = U.rgba('#ff8a65', 0.1 * acid);
        ctx.lineWidth = W * 0.8;
        ctx.stroke();
      }

      // ---- Cytoplasm ----
      ctx.beginPath(); o.pathPM(ctx, 0);
      ctx.fillStyle = C.cyto;
      ctx.fill();
      if (!this.pattern) this.pattern = ctx.createPattern(this.noise, 'repeat');
      ctx.save();
      ctx.clip();
      ctx.globalAlpha = 0.5;
      ctx.translate(Math.sin(t * 0.05) * 20, Math.cos(t * 0.04) * 20);
      ctx.scale(0.6, 0.6);
      ctx.fillStyle = this.pattern;
      const b = sc.bounds();
      ctx.fillRect((b.x0 - 100) / 0.6, (b.y0 - 100) / 0.6, (b.x1 - b.x0 + 200) / 0.6, (b.y1 - b.y0 + 200) / 0.6);
      ctx.restore();

      // ---- Vacuole ----
      ctx.beginPath(); o.pathTono(ctx);
      const vg = ctx.createRadialGradient(o.cx + 40, o.cy - 20, 10, o.cx, o.cy, Math.max(o.W, o.H));
      vg.addColorStop(0, C.vacHi);
      vg.addColorStop(1, C.vac);
      ctx.fillStyle = vg;
      ctx.fill();
      // Caustic shimmer inside the vacuole.
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = 'rgba(140,210,230,0.05)';
      ctx.lineWidth = 6;
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        const y0 = o.cy - o.H + (i + 0.5) * (2 * o.H) / 6;
        ctx.moveTo(o.cx - o.W, y0);
        for (let x = -o.W; x <= o.W; x += 30) ctx.lineTo(o.cx + x, y0 + Math.sin(x * 0.02 + t * 0.6 + i) * 10);
        ctx.stroke();
      }
      ctx.restore();

      // Mitosis: the phragmosome — a sheet of cytoplasm across the vacuole.
      const nuc = sc.nucleus;
      if (nuc && nuc.migrate > 0) {
        ctx.save();
        ctx.beginPath(); o.pathTono(ctx); ctx.clip();
        const wv = 36 * nuc.migrate;
        ctx.fillStyle = C.cyto;
        ctx.fillRect(o.cx - wv, o.cy - o.H - 10, wv * 2, 2 * o.H + 20);
        ctx.restore();
      } else {
        this._strands(ctx, o, L, px);
      }

      // Tonoplast.
      ctx.beginPath(); o.pathTono(ctx);
      ctx.strokeStyle = U.rgba(C.tono, 0.75);
      ctx.lineWidth = Math.max(0.9, 1.2 * px);
      ctx.stroke();

      // ---- Cytoskeleton: actin cables ----
      ctx.strokeStyle = U.rgba(C.actin, 0.16);
      ctx.lineWidth = 0.8;
      for (const d of [0.22, 0.78]) {
        ctx.beginPath();
        for (let i = 0; i <= 120; i++) { const q = o.at(i / 120, d); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); }
        ctx.stroke();
      }

      // ---- ER network ----
      const P = L.er.nodes.map((n) => o.at(n.t, n.d));
      ctx.strokeStyle = U.rgba(C.er, 0.5);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const [i, j, bend] of L.er.edges) {
        const a = P[i], c = P[j];
        if (Math.hypot(a.x - c.x, a.y - c.y) > 120) continue;
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo((a.x + c.x) / 2 + bend * 0.5, (a.y + c.y) / 2 - bend * 0.5, c.x, c.y);
      }
      ctx.stroke();
      if (this.S > 2.2) {
        // Ribosomes stud the rough ER.
        ctx.fillStyle = 'rgba(255,170,150,0.7)';
        for (const [i, j] of L.er.edges) {
          if (!L.er.nodes[i].rough) continue;
          const a = P[i], c = P[j];
          for (let k = 1; k < 6; k++) {
            const x = U.lerp(a.x, c.x, k / 6), y = U.lerp(a.y, c.y, k / 6);
            ctx.beginPath(); ctx.arc(x + 1.2, y + 1.2, 0.7, 0, U.TAU); ctx.fill();
          }
        }
      }
      // Free ribosomes / polysomes.
      if (this.S > 1.5) {
        ctx.fillStyle = 'rgba(255,190,170,0.45)';
        for (const r of L.ribosomes) {
          const q = o.at(r.t, r.d);
          ctx.beginPath(); ctx.arc(q.x, q.y, 0.7, 0, U.TAU); ctx.fill();
        }
      }

      // ---- Plasmodesmata ----
      for (const pd of L.plasmodesmata) {
        const p = o.pm(pd.t);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.atan2(p.ny, p.nx));
        ctx.fillStyle = 'rgba(10,25,25,0.9)';
        ctx.fillRect(-W - 1, -1.8, W + 2, 3.6);
        ctx.strokeStyle = U.rgba(C.er, 0.9);
        ctx.lineWidth = 0.7;
        ctx.beginPath(); ctx.moveTo(-W - 1, 0); ctx.lineTo(4, 0); ctx.stroke();
        ctx.restore();
      }

      // ---- Organelles ----
      const I = m.f.I || 0;
      const light = U.clamp(I / 1100, 0, 1);
      const nCp = Math.max(1, L.chloroplasts.length);
      const starchPer = m.s.starch / nCp; // pmol C per chloroplast
      const starchK = U.clamp(starchPer / 13, 0, 1.4);
      for (const g of L.golgi) this._golgi(ctx, g, t);
      for (const px_ of L.peroxisomes) this._perox(ctx, px_);
      for (const c of L.chloroplasts) this._chloroplast(ctx, c, light, starchK, m.s.npq, t, m);
      const respK = U.clamp((m.f.resp || 0) / 2, 0, 1);
      for (const mi of L.mitochondria) this._mito(ctx, mi, respK, t);
      this._nucleus(ctx, nuc, t, m);

      // ---- Plasma membrane (bilayer) ----
      ctx.beginPath(); o.pathPM(ctx, 0);
      ctx.strokeStyle = U.rgba(C.pm, 0.85);
      ctx.lineWidth = Math.max(0.8, 1.1 * px);
      ctx.stroke();
      if (this.S > 2.5) {
        ctx.beginPath(); o.pathPM(ctx, -1.6);
        ctx.strokeStyle = U.rgba(C.pm, 0.45);
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
      // Preprophase band of microtubules marking the future division plane.
      if (nuc && nuc.mitosis && ['preprophase', 'prophase'].includes(nuc.mitosis.name)) {
        const a = nuc.mitosis.name === 'preprophase' ? nuc.mitosis.prog : 1 - nuc.mitosis.prog * 0.7;
        ctx.fillStyle = U.rgba(C.mt, 0.8 * a);
        for (const sgn of [-1, 1]) {
          ctx.beginPath();
          ctx.ellipse(o.cx, o.cy + sgn * (o.H - 4), 16, 3.2, 0, 0, U.TAU);
          ctx.fill();
        }
      }
      // Membrane proteins.
      if (this.S > 2.2) this._membraneProteins(ctx, o, L, t);
    }

    _strands(ctx, o, L, px) {
      const t = this.scene.time;
      for (const s of L.strands) {
        const a = o.at(s.t0, 0.85), b = o.at(s.t1, 0.85);
        const mx = (a.x + b.x) / 2 + s.bend, my = (a.y + b.y) / 2 - s.bend * 0.6;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mx, my, b.x, b.y);
        ctx.strokeStyle = U.rgba('#2a4236', 0.85); ctx.lineWidth = 6; ctx.stroke();
        ctx.strokeStyle = U.rgba(C.actin, 0.25); ctx.lineWidth = 0.7; ctx.stroke();
        // Streaming granules.
        ctx.fillStyle = 'rgba(220,240,200,0.5)';
        for (let k = 0; k < 6; k++) {
          const u = ((t * 0.05 + k / 6) % 1);
          const x = (1 - u) * (1 - u) * a.x + 2 * (1 - u) * u * mx + u * u * b.x;
          const y = (1 - u) * (1 - u) * a.y + 2 * (1 - u) * u * my + u * u * b.y;
          ctx.beginPath(); ctx.arc(x, y, 1.4, 0, U.TAU); ctx.fill();
        }
      }
    }

    _chloroplast(ctx, c, light, starchK, npq, t, m) {
      const S = this.S;
      const L2 = c.len / 2, H2 = c.wid / 2;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.a);
      const dv = c.divide;
      const shape = () => {
        ctx.beginPath();
        if (dv > 0) {
          // Constricting at the FtsZ ring: two lobes pull apart.
          const off = L2 * 0.5 * (0.3 + dv * 0.7);
          const pinch = H2 * (1 - 0.85 * dv);
          ctx.moveTo(-L2 - dv * 6, 0);
          ctx.bezierCurveTo(-L2 - dv * 6, -H2 * 1.3, -off * 0.4, -H2, 0, -pinch);
          ctx.bezierCurveTo(off * 0.4, -H2, L2 + dv * 6, -H2 * 1.3, L2 + dv * 6, 0);
          ctx.bezierCurveTo(L2 + dv * 6, H2 * 1.3, off * 0.4, H2, 0, pinch);
          ctx.bezierCurveTo(-off * 0.4, H2, -L2 - dv * 6, H2 * 1.3, -L2 - dv * 6, 0);
        } else ctx.ellipse(0, 0, L2, H2, 0, 0, U.TAU);
      };
      shape();
      const g = ctx.createRadialGradient(-L2 * 0.2, -H2 * 0.3, 2, 0, 0, L2);
      g.addColorStop(0, U.mix('#3a8f3a', '#63c955', light * 0.7));
      g.addColorStop(1, U.mix('#1a4f22', '#2e7d32', light * 0.6));
      ctx.fillStyle = g;
      ctx.fill();
      ctx.save();
      ctx.clip();
      // Stroma lamellae.
      if (S * c.len > 30) {
        ctx.strokeStyle = U.rgba('#7ccf6b', 0.45 + 0.3 * light);
        ctx.lineWidth = 0.5;
        for (const v of [-0.3, -0.05, 0.2]) {
          ctx.beginPath();
          ctx.moveTo(-L2 * 0.85, v * H2);
          ctx.quadraticCurveTo(0, (v + 0.15) * H2, L2 * 0.85, v * H2);
          ctx.stroke();
        }
      }
      // Grana stacks.
      const glow = 0.6 + 0.4 * light + 0.3 * c.flash;
      for (const gr of c.grana) {
        const gx = gr.u * L2, gy = gr.v * H2;
        const h = gr.n * 1.55;
        for (let k = 0; k < gr.n; k++) {
          ctx.fillStyle = U.rgba(k % 2 ? '#79d067' : C.granum, 0.75 * glow);
          ctx.fillRect(gx - 3.6, gy - h / 2 + k * 1.55, 7.2, 1.15);
        }
      }
      // Starch grains: grow by day, shrink by night.
      if (starchK > 0.02) {
        for (const st of c.starch) {
          const r = Math.sqrt(starchK) * st.w;
          ctx.beginPath();
          ctx.ellipse(st.u * L2 * 0.8, st.v * H2 * 0.7, 7.5 * r, 4.2 * r, st.a, 0, U.TAU);
          ctx.fillStyle = U.rgba(C.starch, 0.92);
          ctx.fill();
          ctx.strokeStyle = 'rgba(160,140,90,0.5)';
          ctx.lineWidth = 0.4;
          ctx.stroke();
        }
      }
      // Plastoglobuli.
      if (S * c.len > 40) {
        ctx.fillStyle = 'rgba(230,200,100,0.7)';
        for (const gl of c.globules) { ctx.beginPath(); ctx.arc(gl.u * L2, gl.v * H2, 0.9, 0, U.TAU); ctx.fill(); }
      }
      // Electron sparkle in thylakoids when lit and zoomed.
      if (light > 0.05 && S * c.len > 90) {
        ctx.fillStyle = U.rgba('#fffbd0', 0.8);
        for (let k = 0; k < 6; k++) {
          const u = ((t * 0.6 + k * 0.17 + c.ph) % 1) * 2 - 1;
          ctx.beginPath(); ctx.arc(u * L2 * 0.8, Math.sin(k * 2 + t * 3) * H2 * 0.3, 0.6, 0, U.TAU); ctx.fill();
        }
      }
      ctx.restore();
      // Envelope (double membrane).
      shape();
      ctx.strokeStyle = U.rgba(C.cpEdge, 0.85);
      ctx.lineWidth = 0.9;
      ctx.stroke();
      if (S * c.len > 45) {
        ctx.beginPath(); ctx.ellipse(0, 0, L2 - 1.5, H2 - 1.5, 0, 0, U.TAU);
        ctx.strokeStyle = U.rgba(C.cpEdge, 0.35);
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
      // Excess light dissipated as heat (NPQ).
      if (npq > 0.15) {
        shape();
        ctx.strokeStyle = U.rgba('#ff7d5c', 0.45 * npq * (0.7 + 0.3 * Math.sin(t * 4 + c.ph)));
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      if (c.flash > 0.01) {
        shape();
        ctx.fillStyle = U.rgba('#eaffb0', 0.22 * c.flash);
        ctx.fill();
      }
      if (dv > 0) {
        ctx.strokeStyle = U.rgba('#ff7cf0', 0.9);
        ctx.lineWidth = 1.8;
        const pinch = H2 * (1 - 0.85 * dv);
        ctx.beginPath(); ctx.moveTo(0, -pinch - 1); ctx.lineTo(0, pinch + 1); ctx.stroke();
      }
      ctx.restore();
    }

    _mito(ctx, mi, respK, t) {
      const S = this.S;
      ctx.save();
      ctx.translate(mi.x, mi.y);
      ctx.rotate(mi.a);
      const l = mi.len / 2, w = 4.6;
      U.roundRect(ctx, -l, -w, l * 2, w * 2, w);
      ctx.fillStyle = U.mix(C.mito, '#c4683a', respK * 0.6);
      ctx.fill();
      ctx.strokeStyle = U.rgba(C.mitoEdge, 0.9);
      ctx.lineWidth = 0.8;
      ctx.stroke();
      if (S * mi.len > 18) {
        // Cristae folds.
        ctx.strokeStyle = U.rgba('#ffd2a6', 0.7);
        ctx.lineWidth = 0.55;
        ctx.beginPath();
        const n = Math.floor(mi.len / 3.2);
        for (let k = 0; k < n; k++) {
          const x = -l + 2.5 + k * 3.2;
          const up = k % 2 === 0;
          ctx.moveTo(x, up ? -w + 0.8 : w - 0.8);
          ctx.lineTo(x, up ? w * 0.35 : -w * 0.35);
        }
        ctx.stroke();
      }
      if (respK > 0.05) {
        U.roundRect(ctx, -l - 1, -w - 1, l * 2 + 2, w * 2 + 2, w + 1);
        ctx.strokeStyle = U.rgba('#ffb36b', 0.25 * respK * (0.6 + 0.4 * Math.sin(t * 5 + mi.ph)));
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
      ctx.restore();
    }

    _perox(ctx, p) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.beginPath(); ctx.arc(0, 0, p.r, 0, U.TAU);
      ctx.fillStyle = C.perox; ctx.fill();
      ctx.strokeStyle = U.rgba(C.peroxEdge, 0.9); ctx.lineWidth = 0.8; ctx.stroke();
      ctx.rotate(0.6);
      ctx.fillStyle = U.rgba('#a68cf0', 0.85);
      ctx.fillRect(-2.6, -2.6, 5.2, 5.2); // catalase crystal
      if (this.S > 2.5) {
        ctx.strokeStyle = 'rgba(40,20,80,0.7)'; ctx.lineWidth = 0.3;
        for (let k = -2; k <= 2; k += 1.3) { ctx.beginPath(); ctx.moveTo(k, -2.6); ctx.lineTo(k, 2.6); ctx.stroke(); }
      }
      ctx.restore();
    }

    _golgi(ctx, g, t) {
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.rotate(g.a);
      ctx.strokeStyle = U.rgba(C.golgi, 0.9);
      ctx.lineCap = 'round';
      for (let k = 0; k < 5; k++) {
        const w = 9 - Math.abs(k - 2) * 1.2;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-w, -4 + k * 2.1 + 1.5);
        ctx.quadraticCurveTo(0, -4 + k * 2.1 - 1.5, w, -4 + k * 2.1 + 1.5);
        ctx.stroke();
      }
      ctx.fillStyle = U.rgba('#ffe3b8', 0.85);
      for (let k = 0; k < 3; k++) {
        const a = t * 0.8 + k * 2.1 + g.ph;
        ctx.beginPath(); ctx.arc(Math.cos(a) * 11, Math.sin(a) * 6, 1.1, 0, U.TAU); ctx.fill();
      }
      ctx.restore();
    }

    _nucleus(ctx, n, t, m) {
      if (!n) return;
      const sub = n.mitosis;
      const name = sub ? sub.name : null;
      const prog = sub ? sub.prog : 0;
      ctx.save();
      ctx.translate(n.x, n.y);
      const envelopeAlpha = !sub ? 1 : name === 'preprophase' || name === 'prophase' ? 1 : name === 'prometaphase' ? 1 - prog : 0;
      if (envelopeAlpha > 0) {
        ctx.save();
        ctx.rotate(n.a);
        ctx.globalAlpha = envelopeAlpha;
        ctx.beginPath(); ctx.ellipse(0, 0, n.rx, n.ry, 0, 0, U.TAU);
        const g = ctx.createRadialGradient(-10, -10, 4, 0, 0, n.rx);
        g.addColorStop(0, '#3d3266');
        g.addColorStop(1, C.nuc);
        ctx.fillStyle = g; ctx.fill();
        ctx.strokeStyle = U.rgba(C.nucEdge, 0.95); ctx.lineWidth = 1.2; ctx.stroke();
        ctx.beginPath(); ctx.ellipse(0, 0, n.rx + 2.2, n.ry + 2.2, 0, 0, U.TAU);
        ctx.strokeStyle = U.rgba(C.nucEdge, 0.45); ctx.lineWidth = 0.6; ctx.stroke();
        // Nuclear pores.
        ctx.fillStyle = '#e8e0ff';
        for (let k = 0; k < 28; k++) {
          const a = (k / 28) * U.TAU;
          ctx.beginPath(); ctx.arc(Math.cos(a) * (n.rx + 1.1), Math.sin(a) * (n.ry + 1.1), 0.9, 0, U.TAU); ctx.fill();
        }
        if (!sub || name === 'preprophase') {
          // Interphase chromatin and nucleolus.
          ctx.fillStyle = U.rgba(C.chromatin, 0.45);
          for (const c of this.chromatin) {
            ctx.beginPath(); ctx.arc(Math.cos(c.a) * c.r * n.rx * 0.9, Math.sin(c.a) * c.r * n.ry * 0.9, c.s, 0, U.TAU); ctx.fill();
          }
          ctx.beginPath(); ctx.arc(12, -8, 13, 0, U.TAU);
          ctx.fillStyle = U.rgba(C.nucleolus, 0.85); ctx.fill();
          // Transcription sparkles: busy genes.
          const busy = U.clamp((m.f.protSynActual || 0) / 0.4, 0.1, 1);
          ctx.fillStyle = U.rgba('#ff8a8a', 0.8);
          for (let k = 0; k < 8 * busy; k++) {
            const a = t * 0.7 + k * 0.8;
            ctx.beginPath(); ctx.arc(Math.cos(a * 1.3 + k) * n.rx * 0.6, Math.sin(a + k * 2) * n.ry * 0.6, 1, 0, U.TAU); ctx.fill();
          }
        }
        ctx.restore();
      }
      if (sub) this._mitosis(ctx, name, prog, n, t);
      ctx.restore();
    }

    _mitosis(ctx, name, prog, n, t) {
      const chromo = (x, y, a, len, w, color, split) => {
        ctx.save();
        ctx.translate(x, y); ctx.rotate(a);
        ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineWidth = w;
        ctx.beginPath();
        if (split) { ctx.moveTo(-len / 2, -len / 3); ctx.lineTo(0, 0); ctx.lineTo(-len / 2, len / 3); }
        else { ctx.moveTo(-len / 2, -len / 3); ctx.lineTo(len / 2, len / 3); ctx.moveTo(-len / 2, len / 3); ctx.lineTo(len / 2, -len / 3); }
        ctx.stroke();
        ctx.restore();
      };
      const colors = ['#ff9ad5', '#b89cff', '#7fd8ff', '#ffd27f', '#9cf0b0'];
      const nCh = 10; // Arabidopsis 2n = 10
      const spindle = (alpha, x0 = -62, x1 = 62) => {
        ctx.strokeStyle = U.rgba(C.mt, alpha);
        ctx.lineWidth = 0.6;
        for (let k = 0; k < 14; k++) {
          const y = -38 + (k * 76) / 13;
          ctx.beginPath(); ctx.moveTo(x0, 0); ctx.quadraticCurveTo(x0 / 2, y * 0.8, 0, y); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x1, 0); ctx.quadraticCurveTo(x1 / 2, y * 0.8, 0, y); ctx.stroke();
        }
      };
      if (name === 'prophase') {
        for (let i = 0; i < nCh; i++) {
          const a = (i / nCh) * U.TAU + 0.3;
          chromo(Math.cos(a) * 22, Math.sin(a) * 18, a + t * 0.05, 8 + prog * 6, 1.2 + prog * 2.2, colors[i % 5]);
        }
      } else if (name === 'prometaphase') {
        spindle(0.5 * prog);
        for (let i = 0; i < nCh; i++) {
          const a = (i / nCh) * U.TAU + 0.3;
          const x = U.lerp(Math.cos(a) * 22, 0, prog * 0.6), y = U.lerp(Math.sin(a) * 18, -32 + (i * 64) / (nCh - 1), prog * 0.6);
          chromo(x, y, U.lerp(a, Math.PI / 2, prog), 14, 3.4, colors[i % 5]);
        }
      } else if (name === 'metaphase') {
        spindle(0.6);
        for (let i = 0; i < nCh; i++) chromo(Math.sin(t * 3 + i) * 0.8, -32 + (i * 64) / (nCh - 1), Math.PI / 2, 14, 3.4, colors[i % 5]);
      } else if (name === 'anaphase') {
        const dx = 6 + prog * 40;
        spindle(0.6, -62 + prog * 6, 62 - prog * 6);
        for (let i = 0; i < nCh; i++) {
          const y = (-32 + (i * 64) / (nCh - 1)) * (1 - prog * 0.35);
          chromo(-dx, y, 0, 12, 2.6, colors[i % 5], true);
          chromo(dx, y, Math.PI, 12, 2.6, colors[i % 5], true);
        }
      } else if (name === 'telophase' || name === 'cytokinesis') {
        const tp = name === 'telophase' ? prog : 1;
        for (const sx of [-1, 1]) {
          ctx.beginPath(); ctx.ellipse(sx * 50, 0, 18 + tp * 14, 16 + tp * 12, 0, 0, U.TAU);
          ctx.fillStyle = U.rgba(C.nuc, tp); ctx.fill();
          ctx.strokeStyle = U.rgba(C.nucEdge, 0.3 + 0.7 * tp); ctx.lineWidth = 1.1; ctx.stroke();
          ctx.fillStyle = U.rgba(C.chromatin, 0.7 * (1 - tp) + 0.3);
          for (let i = 0; i < nCh; i++) {
            const a = (i / nCh) * U.TAU;
            ctx.beginPath(); ctx.arc(sx * 50 + Math.cos(a) * 10 * (1 + tp), Math.sin(a) * 9 * (1 + tp), 2.2 * (1 - tp * 0.5), 0, U.TAU); ctx.fill();
          }
          if (tp > 0.6) { ctx.beginPath(); ctx.arc(sx * 50 + 6, -4, 6 * tp, 0, U.TAU); ctx.fillStyle = U.rgba(C.nucleolus, 0.8); ctx.fill(); }
        }
        // Phragmoplast and the growing cell plate.
        const o = this.scene.outline;
        const reach = name === 'cytokinesis' ? U.easeInOut(prog) : 0;
        const H = o.H + 2;
        const span = 10 + reach * (H - 10);
        ctx.strokeStyle = U.rgba(C.mt, 0.55);
        ctx.lineWidth = 0.6;
        for (const sgn of [-1, 1]) {
          for (let k = 0; k < 6; k++) {
            const y = sgn * (span - 2 - k * 1.8);
            ctx.beginPath(); ctx.moveTo(-14, y); ctx.lineTo(14, y); ctx.stroke();
          }
        }
        ctx.strokeStyle = U.rgba('#e9ffe0', 0.95);
        ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.moveTo(0, -span); ctx.lineTo(0, span); ctx.stroke();
        ctx.fillStyle = U.rgba('#ffe3b8', 0.9);
        for (let k = 0; k < 10; k++) {
          const y = (k % 2 ? 1 : -1) * (span - 3 + Math.sin(t * 4 + k) * 2);
          ctx.beginPath(); ctx.arc(Math.sin(k * 7.3) * 6, y, 1.4, 0, U.TAU); ctx.fill();
        }
      }
    }

    _membraneProteins(ctx, o, L, t) {
      // Real transporters are ~10 nm; drawn ~15× larger so they stay visible.
      const size = 1.5;
      ctx.globalAlpha = U.clamp((this.S - 2.2) / 1.5, 0, 0.9);
      for (const p of L.pmProteins) {
        const q = o.pm(p.t);
        ctx.save();
        ctx.translate(q.x, q.y);
        ctx.rotate(Math.atan2(q.ny, q.nx) - Math.PI / 2);
        this._protein(ctx, p.type, size, t + p.ph);
        ctx.restore();
      }
      for (const p of L.tonoProteins) {
        const q = o.tonoAt(p.t), n = o.pm(p.t);
        ctx.save();
        ctx.translate(q.x, q.y);
        ctx.rotate(Math.atan2(n.ny, n.nx) - Math.PI / 2);
        this._protein(ctx, p.type, size * 0.9, t + p.ph);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    // Small glyphs for transmembrane proteins; +y points into the cell.
    _protein(ctx, type, s, t) {
      switch (type) {
        case 'aquaporin':
        case 'tip':
          ctx.fillStyle = '#5aa8ff';
          ctx.beginPath(); ctx.moveTo(-s, -s); ctx.lineTo(s, -s); ctx.lineTo(0.4, 0); ctx.lineTo(s, s); ctx.lineTo(-s, s); ctx.lineTo(-0.4, 0); ctx.closePath(); ctx.fill();
          break;
        case 'hatpase':
        case 'vatpase':
          ctx.fillStyle = type === 'hatpase' ? '#ff8a65' : '#ffb74d';
          ctx.beginPath(); ctx.arc(0, s * 0.9, s * 0.95, 0, U.TAU); ctx.fill();
          ctx.fillRect(-s * 0.7, -s, s * 1.4, s * 1.2);
          ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.4;
          ctx.beginPath(); ctx.arc(0, s * 0.9, s * 0.5, t * 3, t * 3 + 4); ctx.stroke();
          break;
        case 'kchannel':
        case 'nhx':
          ctx.fillStyle = '#f59ac4';
          ctx.fillRect(-s, -s, s * 0.8, s * 2); ctx.fillRect(s * 0.2, -s, s * 0.8, s * 2);
          break;
        case 'nrt':
        case 'clc':
          ctx.fillStyle = '#b98cff';
          U.roundRect(ctx, -s, -s, s * 2, s * 2, s * 0.6); ctx.fill();
          break;
        case 'sut':
        case 'tst':
          ctx.fillStyle = '#ffa53d';
          U.roundRect(ctx, -s * 0.9, -s, s * 1.8, s * 2, s * 0.4); ctx.fill();
          break;
        case 'vppase':
          ctx.fillStyle = '#ffd36b';
          ctx.beginPath(); ctx.ellipse(0, 0, s * 0.9, s * 1.2, 0, 0, U.TAU); ctx.fill();
          break;
        case 'csc':
          ctx.fillStyle = '#fff3c4';
          for (let k = 0; k < 6; k++) { const a = (k / 6) * U.TAU + t * 0.2; ctx.beginPath(); ctx.arc(Math.cos(a) * s * 0.8, s * 0.5 + Math.sin(a) * s * 0.8, s * 0.38, 0, U.TAU); ctx.fill(); }
          ctx.strokeStyle = 'rgba(255,243,196,0.7)'; ctx.lineWidth = 0.5;
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -s * 2.4); ctx.stroke(); // nascent cellulose microfibril into the wall
          break;
        default:
          ctx.fillStyle = '#ccc'; ctx.fillRect(-s / 2, -s / 2, s, s);
      }
    }

    _particles(ctx, px) {
      const T = TYPES();
      const r = Math.min(9, 3 + 1.5 * Math.log2(Math.max(1, this.cam.z))) * px * 1.1;
      for (const p of this.particles.list) {
        if (p.delay > 0) continue;
        const q = U.samplePath(p.path, p.s);
        const wob = Math.sin(p.age * 6 + p.ph) * p.wob;
        const x = q.x - Math.sin(q.a) * wob, y = q.y + Math.cos(q.a) * wob;
        const a = 1 - p.fade;
        ctx.globalAlpha = a;
        this._glyph(ctx, p.type, x, y, r * p.size, q.a, T[p.type].color, p.age);
      }
      ctx.globalAlpha = 1;
      for (const b of this.particles.bursts) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * (1.4 - b.life * 0.6) * Math.max(1, px * 1.5), 0, U.TAU);
        ctx.strokeStyle = U.rgba(b.color.startsWith('#') ? b.color : '#ffffff', 0.6 * b.life);
        ctx.lineWidth = 1 * px * 1.5;
        ctx.stroke();
      }
    }

    _glyph(ctx, type, x, y, r, a, color, age) {
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      switch (type) {
        case 'photon': {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.lineWidth = r * 0.7;
          ctx.lineCap = 'round';
          const l = r * 6;
          ctx.strokeStyle = U.rgba('#ffe680', 0.75);
          ctx.beginPath(); ctx.moveTo(x - Math.cos(a) * l, y - Math.sin(a) * l); ctx.lineTo(x, y); ctx.stroke();
          ctx.restore();
          break;
        }
        case 'o2':
          ctx.beginPath(); ctx.arc(x - r * 0.5, y, r * 0.65, 0, U.TAU); ctx.arc(x + r * 0.5, y, r * 0.65, 0, U.TAU); ctx.fill();
          break;
        case 'co2':
          ctx.beginPath(); ctx.arc(x, y, r * 0.6, 0, U.TAU); ctx.fill();
          ctx.fillStyle = '#ff8c8c';
          ctx.beginPath(); ctx.arc(x - r * 0.95, y, r * 0.45, 0, U.TAU); ctx.arc(x + r * 0.95, y, r * 0.45, 0, U.TAU); ctx.fill();
          break;
        case 'h2o':
          ctx.beginPath(); ctx.arc(x, y, r * 0.7, 0, U.TAU); ctx.fill();
          break;
        case 'triose':
          ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.9, y + r * 0.7); ctx.lineTo(x - r * 0.9, y + r * 0.7); ctx.closePath(); ctx.fill();
          break;
        case 'sugar':
        case 'maltose': {
          const hex = (cx, cy, rr) => {
            ctx.beginPath();
            for (let k = 0; k < 6; k++) { const aa = (k / 6) * U.TAU; ctx.lineTo(cx + Math.cos(aa) * rr, cy + Math.sin(aa) * rr); }
            ctx.closePath(); ctx.fill();
          };
          hex(x - r * 0.55, y, r * 0.65); hex(x + r * 0.55, y, r * 0.65);
          break;
        }
        case 'glycolate':
          ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.8, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.8, y); ctx.closePath(); ctx.fill();
          break;
        case 'atp':
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.beginPath(); ctx.arc(x, y, r * 1.2, 0, U.TAU); ctx.fillStyle = U.rgba('#fff59d', 0.25); ctx.fill();
          ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, U.TAU); ctx.fillStyle = '#fffde0'; ctx.fill();
          ctx.restore();
          break;
        case 'nitrate':
          ctx.beginPath(); ctx.moveTo(x, y + r); ctx.lineTo(x + r * 0.9, y - r * 0.7); ctx.lineTo(x - r * 0.9, y - r * 0.7); ctx.closePath(); ctx.fill();
          break;
        case 'aa':
          U.roundRect(ctx, x - r * 0.7, y - r * 0.7, r * 1.4, r * 1.4, r * 0.4); ctx.fill();
          break;
        case 'mrna':
          ctx.lineWidth = r * 0.45; ctx.lineCap = 'round';
          ctx.beginPath();
          for (let k = -3; k <= 3; k++) {
            const u = k * r * 0.5;
            const w = Math.sin(k * 1.4 + age * 8) * r * 0.5;
            const xx = x + Math.cos(a) * u - Math.sin(a) * w, yy = y + Math.sin(a) * u + Math.cos(a) * w;
            if (k === -3) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
          }
          ctx.stroke();
          break;
        case 'protein':
          for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.arc(x + Math.cos(a) * k * r * 0.8, y + Math.sin(a) * k * r * 0.8 + (k === 0 ? r * 0.3 : 0), r * 0.5, 0, U.TAU); ctx.fill(); }
          break;
        case 'vesicle':
          ctx.lineWidth = r * 0.35;
          ctx.beginPath(); ctx.arc(x, y, r * 1.1, 0, U.TAU); ctx.stroke();
          ctx.globalAlpha *= 0.4; ctx.fill(); ctx.globalAlpha = Math.min(1, ctx.globalAlpha / 0.4);
          break;
        case 'k':
          ctx.beginPath(); ctx.arc(x, y, r * 0.7, 0, U.TAU); ctx.fill();
          break;
        case 'hplus':
          ctx.lineWidth = r * 0.4;
          ctx.beginPath(); ctx.moveTo(x - r * 0.7, y); ctx.lineTo(x + r * 0.7, y); ctx.moveTo(x, y - r * 0.7); ctx.lineTo(x, y + r * 0.7); ctx.stroke();
          break;
        default:
          ctx.beginPath(); ctx.arc(x, y, r * 0.6, 0, U.TAU); ctx.fill();
      }
    }

    // Dim everything except the story's focus targets.
    _spotlight(ctx, dt) {
      const want = this.focus && this.focus.targets && this.focus.targets.length ? 1 : 0;
      this.spot += (want - this.spot) * (1 - Math.exp(-dt * 3));
      if (this.spot < 0.02) return;
      const sc = this.spotCanvas, g = sc.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, sc.width, sc.height);
      g.fillStyle = `rgba(2,6,8,${0.6 * this.spot})`;
      g.fillRect(0, 0, sc.width, sc.height);
      g.globalCompositeOperation = 'destination-out';
      if (this.focus && this.focus.targets) {
        for (const tg of this.focus.targets) {
          const s = this.toScreen(tg.x, tg.y);
          const r = Math.max(30, tg.r * this.S) * this.dpr;
          const rg = g.createRadialGradient(s.x * this.dpr, s.y * this.dpr, r * 0.55, s.x * this.dpr, s.y * this.dpr, r);
          rg.addColorStop(0, 'rgba(0,0,0,1)');
          rg.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = rg;
          g.beginPath(); g.arc(s.x * this.dpr, s.y * this.dpr, r, 0, U.TAU); g.fill();
        }
      }
      g.globalCompositeOperation = 'source-over';
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(sc, 0, 0);
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    // Callout labels (screen space). Each label: {x,y,text,sub,side}
    _labels(ctx) {
      const list = this.labels.slice();
      if (this.hover && this.hover.label) list.push({ ...this.hover.label, hover: true });
      ctx.font = '600 12.5px "IBM Plex Sans", system-ui, sans-serif';
      const placed = [];
      for (const lb of list) {
        const s = this.toScreen(lb.x, lb.y);
        if (s.x < -50 || s.y < -50 || s.x > this.cw + 50 || s.y > this.ch + 50) continue;
        const dirX = lb.dx != null ? lb.dx : s.x > this.cw / 2 ? 1 : -1;
        const dirY = lb.dy != null ? lb.dy : -1;
        let lx = s.x + dirX * 46, ly = s.y + dirY * 40;
        ctx.font = '600 12.5px "IBM Plex Sans", system-ui, sans-serif';
        const w1 = ctx.measureText(lb.text).width;
        ctx.font = '400 11px "IBM Plex Sans", system-ui, sans-serif';
        const w2 = lb.sub ? ctx.measureText(lb.sub).width : 0;
        const w = Math.max(w1, w2) + 16, h = lb.sub ? 36 : 22;
        let bx = dirX > 0 ? lx : lx - w, by = ly - h / 2;
        // Avoid overlaps with earlier labels.
        for (let k = 0; k < 6; k++) {
          const hit = placed.find((p) => bx < p.x + p.w && bx + w > p.x && by < p.y + p.h && by + h > p.y);
          if (!hit) break;
          by = dirY < 0 ? hit.y - h - 4 : hit.y + hit.h + 4;
        }
        bx = U.clamp(bx, 6, this.cw - w - 6);
        by = U.clamp(by, 6, this.ch - h - 6);
        placed.push({ x: bx, y: by, w, h });
        const ax = dirX > 0 ? bx : bx + w;
        ctx.strokeStyle = lb.hover ? 'rgba(255,255,255,0.8)' : 'rgba(230,245,235,0.65)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(ax, by + h / 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(s.x, s.y, 3, 0, U.TAU); ctx.fillStyle = '#f2fff4'; ctx.fill();
        U.roundRect(ctx, bx, by, w, h, 5);
        ctx.fillStyle = 'rgba(8,20,22,0.86)'; ctx.fill();
        ctx.strokeStyle = lb.color ? U.rgba(lb.color, 0.8) : 'rgba(200,230,210,0.35)';
        ctx.stroke();
        ctx.fillStyle = '#eef8f0';
        ctx.font = '600 12.5px "IBM Plex Sans", system-ui, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillText(lb.text, bx + 8, by + (lb.sub ? 12 : h / 2));
        if (lb.sub) {
          ctx.font = '400 11px "IBM Plex Sans", system-ui, sans-serif';
          ctx.fillStyle = 'rgba(205,225,212,0.85)';
          ctx.fillText(lb.sub, bx + 8, by + 26);
        }
      }
    }

    _scaleBar(ctx) {
      const um = [1, 2, 5, 10, 20].find((u) => u * 10 * this.S > 70) || 20;
      const len = um * 10 * this.S;
      const x = 18, y = this.ch - 22;
      ctx.strokeStyle = 'rgba(230,245,235,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y); ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4); ctx.moveTo(x + len, y - 4); ctx.lineTo(x + len, y + 4); ctx.stroke();
      ctx.fillStyle = 'rgba(230,245,235,0.9)';
      ctx.font = '500 11px "IBM Plex Mono", ui-monospace, monospace';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`${um} µm`, x, y - 6);
    }

    // ---------- Hit testing ----------
    pick(sx, sy) {
      const w = this.toWorld(sx, sy);
      const sc = this.scene, o = sc.outline, L = sc.layout;
      const within = (obj, rx, ry, a = 0) => {
        const dx = w.x - obj.x, dy = w.y - obj.y;
        const c = Math.cos(-a), s = Math.sin(-a);
        const u = dx * c - dy * s, v = dx * s + dy * c;
        return (u * u) / (rx * rx) + (v * v) / (ry * ry) <= 1;
      };
      for (const mi of L.mitochondria) if (within(mi, mi.len / 2 + 2, 7, mi.a)) return { kind: 'mito', obj: mi };
      for (const p of L.peroxisomes) if (within(p, p.r + 2, p.r + 2)) return { kind: 'perox', obj: p };
      for (const g of L.golgi) if (within(g, 12, 8, g.a)) return { kind: 'golgi', obj: g };
      for (const c of L.chloroplasts) if (within(c, c.len / 2, c.wid / 2 + 1, c.a)) return { kind: 'chloroplast', obj: c };
      const n = sc.nucleus;
      if (n && within(n, n.rx + 2, n.ry + 2, n.a)) return { kind: 'nucleus', obj: n };
      const insidePM = o.inside(w.x, w.y);
      if (!insidePM) {
        // Wall?
        const t = o.nearestT(w.x, w.y);
        const p = o.pm(t);
        const d = Math.hypot(w.x - p.x, w.y - p.y);
        if (d < VC.Scene.WALL + 2) {
          const pd = L.plasmodesmata.find((q) => Math.abs(U.wrap01(q.t - t + 0.5) - 0.5) < 0.004);
          if (pd) return { kind: 'plasmodesma', obj: { x: p.x, y: p.y } };
          return { kind: 'wall', obj: { x: w.x, y: w.y } };
        }
        for (const nb of sc.neighbors) if (nb.outline.inside(w.x, w.y)) return { kind: nb.sister ? 'sister' : 'neighbor', obj: { x: w.x, y: w.y } };
        return { kind: 'air', obj: { x: w.x, y: w.y } };
      }
      if (o.inVacuole(w.x, w.y)) return { kind: 'vacuole', obj: { x: w.x, y: w.y } };
      const t = o.nearestT(w.x, w.y);
      const p = o.pm(t);
      if (Math.hypot(w.x - p.x, w.y - p.y) < 3.5) return { kind: 'pm', obj: { x: p.x, y: p.y } };
      return { kind: 'cytosol', obj: { x: w.x, y: w.y } };
    }
  }

  VC.Renderer = Renderer;
  VC.Camera = Camera;
  VC.COLORS = C;
})(window.VC);
