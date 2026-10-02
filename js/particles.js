// Molecular traffic. Each particle is a token for a flux in the model: spawn
// rates follow the simulated rates, and routes follow the real cellular
// geography (which membrane, which transporter, which organelle).
(function (VC) {
  'use strict';
  const U = VC.U;

  const TYPES = {
    photon: { color: '#ffe680', label: 'Photon', group: 'light' },
    o2: { color: '#8fdcff', label: 'O₂', group: 'light' },
    h2o: { color: '#4f9dff', label: 'Water', group: 'water' },
    co2: { color: '#d7e0e3', label: 'CO₂', group: 'carbon' },
    triose: { color: '#ffb84d', label: 'Triose phosphate', group: 'carbon' },
    sugar: { color: '#ff9419', label: 'Sucrose', group: 'carbon' },
    maltose: { color: '#ffe0a3', label: 'Maltose (from starch)', group: 'carbon' },
    glycolate: { color: '#ff6fb5', label: 'Glycolate / glycine / serine', group: 'photoresp' },
    atp: { color: '#fff59d', label: 'ATP', group: 'energy' },
    nitrate: { color: '#b98cff', label: 'Nitrate / nitrite', group: 'nitrogen' },
    aa: { color: '#6af0a8', label: 'Amino acids', group: 'nitrogen' },
    mrna: { color: '#ff5a5a', label: 'mRNA', group: 'genes' },
    protein: { color: '#46c8ff', label: 'Protein', group: 'genes' },
    vesicle: { color: '#ffe3b8', label: 'Vesicle', group: 'genes' },
    k: { color: '#f59ac4', label: 'K⁺', group: 'water' },
    hplus: { color: '#ff8a65', label: 'H⁺', group: 'water' },
  };

  const GROUPS = {
    light: 'Light & O₂',
    carbon: 'Carbon & sugar',
    photoresp: 'Photorespiration',
    energy: 'ATP',
    nitrogen: 'Nitrogen',
    genes: 'Genes & proteins',
    water: 'Water & ions',
  };

  class Particles {
    constructor(scene) {
      this.scene = scene;
      this.list = [];
      this.acc = {};
      this.max = 650;
      this.enabled = Object.fromEntries(Object.keys(GROUPS).map((g) => [g, true]));
      this.bursts = []; // small arrival flashes
      this.density = 1;
    }

    add(type, pts, opts = {}) {
      if (this.list.length >= this.max) return null;
      if (!this.enabled[TYPES[type].group] && !opts.force) return null;
      const path = U.spline(pts, 6);
      const p = {
        type, path, s: 0, speed: opts.speed || U.rand(55, 95), ph: Math.random() * 6.28,
        wob: opts.wob != null ? opts.wob : 3, onArrive: opts.onArrive, dead: false, age: 0,
        size: opts.size || 1, fade: 0, delay: opts.delay || 0,
      };
      this.list.push(p);
      return p;
    }

    burst(x, y, color, r = 10) {
      if (this.bursts.length < 120) this.bursts.push({ x, y, color, r, life: 1 });
    }

    // ---------- route helpers ----------
    cyto(t, d) { return this.scene.outline.at(t, d == null ? 0.25 + Math.random() * 0.5 : d); }
    // Path from an arbitrary point A (with band param tA) to B along the cytoplasm.
    via(A, tA, B, tB, d) {
      const o = this.scene.outline;
      const dd = d == null ? 0.3 + Math.random() * 0.4 : d;
      return [A, ...o.bandPath(tA, tB, dd), B];
    }
    tOf(obj) { return obj.t != null ? obj.t : this.scene.outline.nearestT(obj.x, obj.y); }

    // ---------- the flows ----------
    spawn(dt, model, focusGroups) {
      const f = model.f, sc = this.scene, o = sc.outline, L = sc.layout;
      if (!f || !L.chloroplasts.length) return;
      const dens = this.density;
      const rate = (key, perSec, fn) => {
        this.acc[key] = (this.acc[key] || 0) + perSec * dens * dt;
        let n = 0;
        while (this.acc[key] >= 1 && n < 6) { this.acc[key] -= 1; fn(); n++; }
        if (this.acc[key] > 3) this.acc[key] = 3;
      };
      const capP = model.s.Pphoto / model.p.Pphoto0;
      const bounds = sc.bounds();

      // Photons rain down from the leaf surface above.
      rate('photon', (f.I / 1100) * 26, () => {
        const c = U.pick(L.chloroplasts);
        const x0 = c.x + U.rand(-60, 60) - 40;
        this.add('photon', [{ x: x0, y: bounds.y0 - 420 }, { x: c.x + U.rand(-8, 8), y: c.y + U.rand(-4, 4) }], {
          speed: 900, wob: 0,
          onArrive: () => { c.flash = Math.min(1, c.flash + 0.5); },
        });
      });

      // Water split by PSII, O₂ released to the air spaces.
      rate('o2', (f.o2 / 60) * 7, () => {
        const c = U.pick(L.chloroplasts);
        const t = c.t + U.rand(-0.01, 0.01);
        this.add('o2', [{ x: c.x, y: c.y }, o.at(t, 0.05), sc.outsidePoint(t, 60 + Math.random() * 60)], { speed: 70, wob: 4 });
      });

      // CO₂ diffuses in from the intercellular air space to Rubisco.
      rate('co2', (f.fixC / 27) * 11 * Math.min(1, 1 / Math.max(0.5, capP)), () => {
        const c = U.pick(L.chloroplasts);
        const t = c.t + U.rand(-0.015, 0.015);
        this.add('co2', [sc.outsidePoint(t, 50 + Math.random() * 70), o.at(t, -0.02), { x: c.x, y: c.y }], { speed: 60, wob: 5 });
      });

      // Triose phosphate leaves via the TPT and becomes cytosolic sucrose.
      rate('triose', (f.sucSyn / 16) * 7, () => {
        const c = U.pick(L.chloroplasts);
        const end = this.cyto(c.t + U.rand(-0.02, 0.02), 0.82);
        this.add('triose', [{ x: c.x, y: c.y }, end], {
          speed: 40, wob: 2, onArrive: () => this.sugarFate(model, end, c.t),
        });
      });

      // Night: starch → maltose → cytosol (MEX1) → sucrose.
      rate('maltose', (f.starchDeg / 8) * 6, () => {
        const c = U.pick(L.chloroplasts);
        const end = this.cyto(c.t + U.rand(-0.02, 0.02), 0.85);
        this.add('maltose', [{ x: c.x, y: c.y }, end], { speed: 35, wob: 2, onArrive: () => this.sugarFate(model, end, c.t) });
      });

      // Photorespiration relay: chloroplast → peroxisome → mitochondrion → peroxisome → chloroplast.
      rate('glyco', ((f.Vo * 1.8 * capP) / 9) * 5, () => {
        const c = U.pick(L.chloroplasts);
        const px = sc.nearestOf('perox', c.x, c.y);
        const mi = sc.nearestOf('mito', px.x, px.y);
        if (!px || !mi) return;
        const pts = [{ x: c.x, y: c.y }, { x: px.x, y: px.y }, { x: mi.x, y: mi.y }, { x: px.x + 3, y: px.y + 3 }, { x: c.x + 4, y: c.y }];
        this.add('glycolate', pts, {
          speed: 45, wob: 1.5,
          onArrive: () => { this.burst(c.x, c.y, TYPES.glycolate.color, 8); },
        });
        if (Math.random() < 0.5) {
          // Glycine decarboxylase in the mitochondrion releases CO₂.
          this.add('co2', [{ x: mi.x, y: mi.y }, { x: c.x, y: c.y }], { speed: 50, wob: 3, delay: 2.5 });
        }
      });

      // Mitochondria export ATP to the cytosol.
      rate('atp', (f.atpMito / 8) * 5, () => {
        const mi = U.pick(L.mitochondria);
        const dst = U.weighted({ er: 2, pm: 2, nuc: 1, golgi: 1 });
        let end;
        if (dst === 'pm') end = this.cyto(mi.t + U.rand(-0.04, 0.04), 0.03);
        else if (dst === 'nuc') end = sc.nuclearPore();
        else if (dst === 'golgi') { const g = U.pick(L.golgi); end = { x: g.x, y: g.y }; }
        else end = this.cyto(mi.t + U.rand(-0.05, 0.05));
        this.add('atp', [{ x: mi.x, y: mi.y }, end], { speed: 70, wob: 2.5, onArrive: () => this.burst(end.x, end.y, TYPES.atp.color, 5) });
      });

      // Nitrate uptake by NRT1.1 (with 2 H⁺), reduction to nitrite (NR, cytosol),
      // nitrite to the chloroplast (NiR) → ammonium → GS/GOGAT → amino acids.
      rate('no3', (f.nUptake / 0.5) * 3.5, () => {
        const tr = sc.pmProtein('nrt');
        const t = tr.t;
        const inside = this.cyto(t + U.rand(-0.02, 0.02), 0.6);
        const store = f.vacN > 0 && Math.random() < U.clamp(f.vacN / Math.max(0.05, f.nUptake), 0, 0.8);
        this.add('nitrate', [sc.outsidePoint(t, 40 + Math.random() * 40), o.at(t, 0), inside], {
          speed: 55, wob: 3,
          onArrive: () => {
            if (store) {
              const v = o.vacuolePoint();
              this.add('nitrate', [inside, o.tonoAt(t), v], { speed: 40, wob: 3 });
            } else {
              const c = sc.nearestOf('chloroplast', inside.x, inside.y);
              this.add('nitrate', [inside, { x: c.x, y: c.y }], {
                speed: 40, wob: 2,
                onArrive: () => {
                  const tgt = this.ribosomeTarget();
                  this.add('aa', [{ x: c.x, y: c.y }, ...o.bandPath(c.t, tgt.t, 0.5), tgt], { speed: 55, wob: 2 });
                },
              });
            }
          },
        });
      });

      // Amino acids made in chloroplasts feed ribosomes.
      rate('aa', (f.protSynActual / 0.35) * 2.5, () => {
        const c = U.pick(L.chloroplasts);
        const tgt = this.ribosomeTarget();
        this.add('aa', [{ x: c.x, y: c.y }, ...o.bandPath(c.t, tgt.t, 0.5), tgt], { speed: 60, wob: 2 });
      });

      // mRNA leaves the nucleus through pores; ribosomes translate it.
      rate('mrna', (f.protSynActual / 0.35) * 2.2, () => {
        const pore = sc.nuclearPore();
        const toCp = Math.random() < 0.45;
        if (toCp) {
          // Translated in the cytosol; preproteins are imported by TOC/TIC.
          const c = U.pick(L.chloroplasts);
          const mid = this.cyto(o.nucT + U.rand(-0.05, 0.05), 0.5);
          this.add('mrna', [pore, mid], {
            speed: 45, wob: 4,
            onArrive: () => this.add('protein', [mid, ...o.bandPath(o.nucT, c.t, 0.55), { x: c.x, y: c.y }], {
              speed: 55, wob: 2, onArrive: () => { c.flash = Math.min(1, c.flash + 0.2); this.burst(c.x, c.y, TYPES.protein.color, 7); },
            }),
          });
        } else {
          // Secretory route: rough ER → Golgi → vesicle → plasma membrane / wall.
          const er = this.ribosomeTarget(true);
          this.add('mrna', [pore, er], {
            speed: 45, wob: 4,
            onArrive: () => {
              const g = sc.nearestOf('golgi', er.x, er.y);
              this.add('protein', [er, { x: g.x, y: g.y }], {
                speed: 40, wob: 2,
                onArrive: () => this.vesicleFrom(g),
              });
            },
          });
        }
      });

      // Golgi vesicles carry pectin/hemicellulose (and membrane proteins) to the wall.
      rate('vesicle', (f.wallSyn / 1.6) * 1.6, () => this.vesicleFrom(U.pick(L.golgi)));

      // Water enters through aquaporins and fills the vacuole as the cell grows.
      rate('water', U.clamp(f.dV / 1000, 0, 3) * 6 + 0.6, () => {
        const aq = sc.pmProtein('aquaporin');
        const v = o.vacuolePoint();
        this.add('h2o', [sc.outsidePoint(aq.t, 30 + Math.random() * 40), o.at(aq.t, 0), o.tonoAt(aq.t), v], { speed: 80, wob: 2 });
      });

      // K⁺ through inward-rectifying channels into the vacuole (osmoticum).
      rate('k', U.clamp(f.Kup / 0.15, 0, 3) * 2.2, () => {
        const ch = sc.pmProtein('kchannel');
        const v = o.vacuolePoint();
        this.add('k', [sc.outsidePoint(ch.t, 30 + Math.random() * 30), o.at(ch.t, 0), o.tonoAt(ch.t), v], { speed: 60, wob: 2 });
      });

      // H⁺-ATPase acidifies the wall (acid growth).
      rate('hplus', (f.hatp || 0) * 3, () => {
        const pump = sc.pmProtein('hatpase');
        const a = o.at(pump.t, 0.05);
        this.add('hplus', [a, sc.outsidePoint(pump.t + U.rand(-0.01, 0.01), -sc.wall * 0.5 + Math.random() * 6)], { speed: 25, wob: 1.5 });
      });
    }

    ribosomeTarget(rough) {
      const sc = this.scene, L = sc.layout, o = sc.outline;
      const nodes = L.er.nodes.filter((n) => (rough ? n.rough : true));
      const n = U.pick(nodes.length ? nodes : L.er.nodes);
      const p = o.at(n.t, n.d);
      return { x: p.x, y: p.y, t: n.t };
    }

    vesicleFrom(g) {
      const sc = this.scene, o = sc.outline;
      const t = g.t + U.rand(-0.03, 0.03);
      const end = o.at(t, 0.0);
      this.add('vesicle', [{ x: g.x, y: g.y }, o.at(t, 0.15), end], {
        speed: 30, wob: 1, size: 1.4,
        onArrive: () => this.burst(end.x, end.y, TYPES.vesicle.color, 9),
      });
    }

    // The allocation decision for each new sugar molecule in the cytosol.
    sugarFate(model, from, tFrom) {
      const f = model.f, sc = this.scene, o = sc.outline, L = sc.layout;
      const w = {
        resp: Math.pow(f.resp, 0.8),
        wall: Math.pow(f.wallSyn + f.lipidSyn + f.nuclSyn, 0.8),
        aa: Math.pow(f.aaC, 0.8),
        vac: Math.pow(Math.max(0, f.vacSug), 0.8),
        exp: Math.pow(f.export, 0.8),
      };
      const fate = U.weighted(w) || 'resp';
      if (fate === 'resp') {
        const mi = sc.nearestOf('mito', from.x, from.y);
        this.add('sugar', [from, { x: mi.x, y: mi.y }], {
          speed: 50, wob: 2,
          onArrive: () => {
            this.burst(mi.x, mi.y, '#ffb06a', 8);
            if (Math.random() < 0.5) this.add('co2', [{ x: mi.x, y: mi.y }, sc.outsidePoint(mi.t, 60)], { speed: 55, wob: 4 });
          },
        });
      } else if (fate === 'wall') {
        // To a cellulose synthase complex at the plasma membrane, or a Golgi stack.
        if (Math.random() < 0.6) {
          const csc = sc.pmProtein('csc');
          const end = o.at(csc.t, 0);
          this.add('sugar', [from, ...o.bandPath(tFrom, csc.t, 0.4), end], { speed: 55, wob: 2, onArrive: () => this.burst(end.x, end.y, '#fff3c4', 7) });
        } else {
          const g = sc.nearestOf('golgi', from.x, from.y);
          this.add('sugar', [from, { x: g.x, y: g.y }], { speed: 50, wob: 2 });
        }
      } else if (fate === 'aa') {
        const c = sc.nearestOf('chloroplast', from.x, from.y);
        this.add('sugar', [from, { x: c.x, y: c.y }], { speed: 40, wob: 2 });
      } else if (fate === 'vac') {
        const tp = sc.tonoProtein('tst');
        const v = o.vacuolePoint();
        this.add('sugar', [from, ...o.bandPath(tFrom, tp.t, 0.7), o.tonoAt(tp.t), v], { speed: 55, wob: 2 });
      } else {
        const pd = U.pick(L.plasmodesmata);
        const a = o.at(pd.t, 0.1), b = sc.outsidePoint(pd.t, 25);
        this.add('sugar', [from, ...o.bandPath(tFrom, pd.t, 0.4), a, b], { speed: 60, wob: 2, onArrive: () => this.burst(b.x, b.y, TYPES.sugar.color, 6) });
      }
    }

    update(dt, time) {
      for (const p of this.list) {
        if (p.dead) continue;
        if (p.delay > 0) { p.delay -= dt; continue; }
        p.age += dt;
        if (p.s >= p.path.total) {
          p.fade += dt * 4;
          if (p.fade >= 1) p.dead = true;
          if (p.onArrive && !p.arrived) { p.arrived = true; p.onArrive(); }
          continue;
        }
        p.s += p.speed * dt;
      }
      if (this.list.length > 0 && this.list.some((p) => p.dead)) this.list = this.list.filter((p) => !p.dead);
      for (const b of this.bursts) b.life -= dt * 2.2;
      this.bursts = this.bursts.filter((b) => b.life > 0);
    }

    clear() { this.list = []; this.bursts = []; }
  }

  Particles.TYPES = TYPES;
  Particles.GROUPS = GROUPS;
  VC.Particles = Particles;
})(window.VC);
