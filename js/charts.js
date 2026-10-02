// Sidebar sparklines (last 48 simulated hours, nights shaded).
(function (VC) {
  'use strict';
  const U = VC.U;

  const METRICS = [
    { key: 'I', name: 'Light', unit: 'µmol m⁻² s⁻¹', color: '#ffd56b', d: 0, get: (m) => m.f.I },
    { key: 'A', name: 'Net photosynthesis', unit: 'µmol m⁻² s⁻¹', color: '#8fdc6a', d: 1, get: (m) => m.f.netA, zero: true },
    { key: 'starch', name: 'Starch', unit: 'pmol C', color: '#f3ecd6', d: 0, get: (m) => m.s.starch },
    { key: 'suc', name: 'Sugars', unit: 'pmol C', color: '#ff9419', d: 1, get: (m) => m.s.suc + m.s.vsug },
    { key: 'aa', name: 'Amino acids', unit: 'pmol N', color: '#6af0a8', d: 1, get: (m) => m.s.aa },
    { key: 'P', name: 'Turgor', unit: 'MPa', color: '#5aa8ff', d: 2, get: (m) => m.f.P },
    { key: 'V', name: 'Cell volume', unit: '×10³ µm³', color: '#c8bcff', d: 1, get: (m) => m.s.V / 1000, scale: 1 / 1000 },
  ];

  class Charts {
    constructor(root, model) {
      this.model = model;
      this.rows = METRICS.map((mt) => {
        const el = document.createElement('div');
        el.className = 'vital';
        el.innerHTML = `<span class="name">${mt.name}</span><span class="val"><b></b><small>${mt.unit}</small></span><canvas></canvas>`;
        root.appendChild(el);
        return { mt, val: el.querySelector('b'), cv: el.querySelector('canvas') };
      });
    }

    draw() {
      const m = this.model, hist = m.hist;
      const tNow = m.s.t;
      const span = hist.length ? U.clamp(tNow - hist[0].t, 6, 48) : 6;
      const tMin = tNow - span;
      for (const r of this.rows) {
        const { mt, cv } = r;
        r.val.textContent = U.fmt(mt.get(m), mt.d);
        const w = cv.clientWidth, h = cv.clientHeight;
        if (!w) continue;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
        const g = cv.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, w, h);
        const X = (t) => ((t - tMin) / span) * w;
        // Nights.
        const sr = m.sunrise(), ss = m.sunset();
        if (!m.env.constantLight) {
          g.fillStyle = 'rgba(80,100,200,0.13)';
          for (let d = Math.floor(tMin / 24) - 1; d <= Math.floor(tNow / 24) + 1; d++) {
            const a = Math.max(tMin, d * 24 + ss), b = Math.min(tNow, (d + 1) * 24 + sr);
            if (b > a) g.fillRect(X(a), 0, X(b) - X(a), h);
          }
        }
        const pts = hist.filter((p) => p.t >= tMin);
        if (pts.length < 2) continue;
        const vals = pts.map((p) => (mt.key === 'V' ? p.V / 1000 : p[mt.key]));
        let lo = Math.min(...vals), hi = Math.max(...vals);
        if (mt.zero) lo = Math.min(0, lo);
        if (mt.key === 'I' || mt.key === 'starch') lo = 0;
        if (hi - lo < 1e-6) hi = lo + 1;
        const Y = (v) => h - 3 - ((v - lo) / (hi - lo)) * (h - 6);
        if (mt.zero && lo < 0) {
          g.strokeStyle = 'rgba(255,255,255,0.15)'; g.lineWidth = 1;
          g.beginPath(); g.moveTo(0, Y(0)); g.lineTo(w, Y(0)); g.stroke();
        }
        g.beginPath();
        pts.forEach((p, i) => (i ? g.lineTo(X(p.t), Y(vals[i])) : g.moveTo(X(p.t), Y(vals[i]))));
        g.lineTo(X(pts[pts.length - 1].t), h); g.lineTo(X(pts[0].t), h); g.closePath();
        g.fillStyle = U.rgba(mt.color, 0.16); g.fill();
        g.beginPath();
        pts.forEach((p, i) => (i ? g.lineTo(X(p.t), Y(vals[i])) : g.moveTo(X(p.t), Y(vals[i]))));
        g.strokeStyle = mt.color; g.lineWidth = 1.4; g.stroke();
        const last = pts[pts.length - 1];
        g.beginPath(); g.arc(X(last.t), Y(vals[vals.length - 1]), 2.4, 0, U.TAU); g.fillStyle = mt.color; g.fill();
      }
    }
  }

  VC.Charts = Charts;
})(window.VC);
