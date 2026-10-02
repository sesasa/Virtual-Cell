// Molecular close-ups. Each inset is a small animated schematic of the
// machinery behind what the main view shows, driven by live model values.
// Drawn on a 440 × 280 logical canvas.
(function (VC) {
  'use strict';
  const U = VC.U;
  const W = 440, H = 280;
  const F = '"IBM Plex Sans", system-ui, sans-serif';
  const FM = '"IBM Plex Mono", ui-monospace, monospace';

  function text(ctx, s, x, y, o = {}) {
    ctx.font = `${o.weight || 500} ${Math.max(10, o.size || 11)}px ${o.mono ? FM : F}`;
    ctx.fillStyle = o.color || 'rgba(225,240,230,0.92)';
    ctx.textAlign = o.align || 'left';
    ctx.textBaseline = o.base || 'middle';
    ctx.fillText(s, x, y);
    ctx.textAlign = 'left';
  }
  function arrow(ctx, x0, y0, x1, y1, color, w = 1.5, head = 6) {
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    const a = Math.atan2(y1 - y0, x1 - x0);
    ctx.beginPath(); ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - Math.cos(a - 0.45) * head, y1 - Math.sin(a - 0.45) * head);
    ctx.lineTo(x1 - Math.cos(a + 0.45) * head, y1 - Math.sin(a + 0.45) * head);
    ctx.closePath(); ctx.fill();
  }
  function blob(ctx, x, y, rx, ry, fill, stroke) {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, U.TAU);
    ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }
  function bar(ctx, x, y, w, h, frac, color, label) {
    U.roundRect(ctx, x, y, w, h, h / 2); ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
    U.roundRect(ctx, x, y, Math.max(h, w * U.clamp(frac, 0, 1)), h, h / 2); ctx.fillStyle = color; ctx.fill();
    if (label) text(ctx, label, x - 6, y + h / 2, { align: 'right', size: 10 });
  }
  // Point along a polyline by fraction.
  function along(pts, f) {
    const L = [0];
    for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const s = U.clamp(f, 0, 1) * L[L.length - 1];
    for (let i = 1; i < pts.length; i++) {
      if (L[i] >= s) {
        const k = (s - L[i - 1]) / Math.max(1e-6, L[i] - L[i - 1]);
        return [U.lerp(pts[i - 1][0], pts[i][0], k), U.lerp(pts[i - 1][1], pts[i][1], k)];
      }
    }
    return pts[pts.length - 1];
  }
  function membrane(ctx, y0, y1, x0 = 0, x1 = W, color = 'rgba(160,220,150,0.55)') {
    ctx.fillStyle = 'rgba(120,180,110,0.12)';
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.fillStyle = color;
    for (let x = x0 + 3; x < x1; x += 6) {
      ctx.beginPath(); ctx.arc(x, y0 + 2.5, 2.2, 0, U.TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(x, y1 - 2.5, 2.2, 0, U.TAU); ctx.fill();
    }
  }

  // Spotlight within an inset: dim everything except the current step.
  function spot(ctx, targets, t) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    for (const g of targets) { ctx.moveTo(g.x + g.r, g.y); ctx.arc(g.x, g.y, g.r, 0, U.TAU, true); }
    ctx.fillStyle = 'rgba(4,10,12,0.62)';
    ctx.fill('evenodd');
    for (const g of targets) {
      ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, U.TAU);
      ctx.strokeStyle = `rgba(255,236,170,${0.55 + 0.3 * Math.sin(t * 3)})`;
      ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.restore();
  }

  const insets = {};

  // ---------------------------------------------------------------- light reactions
  insets.thylakoid = {
    title: 'Thylakoid membrane · light reactions',
    steps: {
      antenna: [{ x: 62, y: 128, r: 46 }],
      psii: [{ x: 92, y: 152, r: 52 }],
      chain: [{ x: 190, y: 135, r: 50 }, { x: 288, y: 125, r: 42 }, { x: 338, y: 74, r: 38 }],
      atp: [{ x: 400, y: 112, r: 64 }],
    },
    draw(ctx, t, m) {
      const f = m.f, s = m.s;
      const I = f.I || 0;
      const rate = U.clamp((f.J || 0) / 140, 0, 1);
      const yM0 = 118, yM1 = 152;
      ctx.fillStyle = 'rgba(70,140,70,0.10)'; ctx.fillRect(0, 26, W, yM0 - 26);
      ctx.fillStyle = 'rgba(90,120,170,0.12)'; ctx.fillRect(0, yM1, W, H - yM1);
      text(ctx, 'STROMA', 10, 38, { size: 9.5, color: 'rgba(170,230,160,0.8)', weight: 600 });
      text(ctx, 'LUMEN', 10, H - 14, { size: 9.5, color: 'rgba(170,200,240,0.8)', weight: 600 });
      membrane(ctx, yM0, yM1);
      // Complexes.
      blob(ctx, 46, 135, 18, 24, '#2f7d3a', '#9ee08a'); text(ctx, 'LHCII', 46, 98, { size: 9, align: 'center' });
      blob(ctx, 86, 135, 22, 28, '#3a9a46', '#b8f0a0'); text(ctx, 'PSII', 86, 135, { size: 10, align: 'center', weight: 700 });
      blob(ctx, 190, 135, 18, 30, '#c27a2c', '#ffcf8a'); text(ctx, 'Cyt b₆f', 190, 96, { size: 10, align: 'center', weight: 700, color: '#ffcf8a' });
      blob(ctx, 288, 135, 24, 28, '#2a6a3a', '#a6e898'); text(ctx, 'PSI', 288, 135, { size: 10, align: 'center', weight: 700 });
      blob(ctx, 338, 92, 13, 10, '#7a4fb0', '#cdb0ff'); text(ctx, 'FNR', 338, 92, { size: 8.5, align: 'center', weight: 700 });
      // ATP synthase: CF₀ ring + CF₁ head.
      ctx.save(); ctx.translate(400, 135);
      ctx.fillStyle = '#a0522d'; ctx.fillRect(-14, -16, 28, 32);
      const spin = t * (1 + rate * 8);
      for (let k = 0; k < 7; k++) { const a = spin + (k / 7) * U.TAU; ctx.fillStyle = 'rgba(255,200,150,0.6)'; ctx.fillRect(Math.cos(a) * 10 - 1.5, -16, 3, 32); }
      ctx.fillStyle = '#d0703a'; ctx.fillRect(-3, -40, 6, 24);
      blob(ctx, 0, -52, 22, 16, '#e08a4a', '#ffd0a0');
      ctx.restore();
      text(ctx, 'ATP synthase', 400, 66, { size: 9, align: 'center' });
      // Photons.
      for (let k = 0; k < 2; k++) {
        const x = k ? 288 : 60;
        const ph = (t * 1.3 + k * 0.5) % 1;
        if (I > 5) {
          ctx.strokeStyle = U.rgba('#ffe680', 0.9 * Math.min(1, I / 400) * (1 - ph));
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (let y = 0; y < 50; y += 2) { const yy = 30 + y + ph * 40; ctx.lineTo(x - 30 + y * 0.6 + Math.sin(y * 0.5) * 3, yy); }
          ctx.stroke();
        }
      }
      text(ctx, 'light', 20, 52, { size: 9, color: '#ffe680' });
      // Water splitting.
      const wsp = (t * (0.6 + rate * 1.5)) % 1;
      text(ctx, '2 H₂O → O₂ + 4 H⁺', 86, 185, { size: 10, align: 'center', color: '#9fd0ff' });
      if (rate > 0.02) blob(ctx, 112, 180 + 60 * wsp, 4, 4, U.rgba('#8fdcff', 1 - wsp));
      // Electron path.
      const path = [[86, 120], [120, 128], [160, 128], [190, 125], [215, 165], [262, 165], [288, 125], [310, 100], [338, 92]];
      ctx.strokeStyle = 'rgba(255,255,220,0.18)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); path.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.setLineDash([]);
      text(ctx, 'PQ', 138, 112, { size: 8.5, color: '#ffe680' });
      text(ctx, 'PC', 238, 178, { size: 8.5, color: '#9fd0ff' });
      text(ctx, 'Fd', 310, 82, { size: 8.5, color: '#ff9a9a' });
      if (rate > 0.01) {
        for (let k = 0; k < 6; k++) {
          const [x, y] = along(path, (t * (0.15 + rate * 0.5) + k / 6) % 1);
          ctx.beginPath(); ctx.arc(x, y, 3, 0, U.TAU); ctx.fillStyle = '#fffbd0'; ctx.fill();
          ctx.beginPath(); ctx.arc(x, y, 6, 0, U.TAU); ctx.fillStyle = 'rgba(255,250,200,0.2)'; ctx.fill();
        }
      }
      text(ctx, 'NADP⁺ + H⁺ → NADPH', 338, 48, { size: 10, align: 'center', color: '#d8c0ff' });
      // Protons in the lumen.
      const nH = Math.round(6 + 22 * s.atpS * (I > 5 ? 1 : 0.3));
      ctx.fillStyle = '#ff8a65';
      ctx.font = `700 11px ${F}`;
      for (let k = 0; k < nH; k++) {
        const x = 130 + ((k * 53.3 + t * 12) % 260);
        const y = 172 + ((k * 31.7) % 70) + Math.sin(t * 2 + k) * 3;
        ctx.fillText('+', x, y);
      }
      // H⁺ through ATP synthase → ATP.
      if (rate > 0.02) {
        const u = (t * (0.4 + rate)) % 1;
        text(ctx, '+', 400, 170 - u * 90, { color: '#ff8a65', weight: 700, size: 12, align: 'center' });
      }
      text(ctx, 'ADP + Pᵢ → ATP', 400, 28 + 6, { size: 10, align: 'center', color: '#ffe0a0' });
      // NPQ.
      if (s.npq > 0.15) {
        ctx.strokeStyle = U.rgba('#ff7d5c', 0.7 * s.npq);
        ctx.lineWidth = 1.4;
        for (let k = 0; k < 3; k++) {
          ctx.beginPath();
          for (let y = 0; y < 20; y++) ctx.lineTo(30 + k * 10 + Math.sin(y * 0.8 + t * 6) * 3, 108 - y * 1.6);
          ctx.stroke();
        }
        text(ctx, `heat (NPQ ${Math.round(s.npq * 100)}%)`, 8, 70, { size: 9, color: '#ff9c80' });
      }
      // Gauges.
      bar(ctx, 300, 238, 110, 7, s.atpS, '#ffd27f', 'ATP');
      bar(ctx, 300, 254, 110, 7, s.nadph, '#c9a6ff', 'NADPH');
      text(ctx, `J = ${U.fmt(f.J || 0, 0)} µmol e⁻ m⁻² s⁻¹`, 300, 224, { size: 9.5, mono: true });
    },
  };

  // ---------------------------------------------------------------- Calvin–Benson cycle
  insets.calvin = {
    title: 'Calvin–Benson cycle · carbon fixation',
    steps: {
      co2: [{ x: 250, y: 60, r: 50 }, { x: 186, y: 92, r: 34 }],
      rubisco: [{ x: 214, y: 88, r: 56 }],
      reduce: [{ x: 214, y: 196, r: 58 }, { x: 330, y: 242, r: 40 }],
    },
    draw(ctx, t, m) {
      const f = m.f;
      const cx = 150, cy = 156, r = 72;
      const v = U.clamp((f.Vc || 0) / 20, 0, 1.2);
      const arcs = [
        [-1.9, -0.25, '#7ce07a', 'Carboxylation', 'Rubisco + CO₂'],
        [-0.25, 1.75, '#ffd27f', 'Reduction', '6 ATP + 6 NADPH'],
        [1.75, 4.38, '#8fc7ff', 'Regeneration', '3 ATP'],
      ];
      for (const [a0, a1, col, name, sub] of arcs) {
        ctx.strokeStyle = U.rgba(col, 0.7); ctx.lineWidth = 9; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(cx, cy, r, a0 + 0.06, a1 - 0.06); ctx.stroke();
        const am = (a0 + a1) / 2;
        const lx = cx + Math.cos(am) * (r + 34), ly = cy + Math.sin(am) * (r + 26);
        text(ctx, name, lx, ly - 6, { align: 'center', weight: 700, size: 10.5, color: col });
        text(ctx, sub, lx, ly + 7, { align: 'center', size: 9.5 });
      }
      ctx.lineCap = 'butt';
      // Molecules circulating.
      const n = 12;
      for (let k = 0; k < n; k++) {
        const a = -1.9 + ((t * 0.25 * v + k / n) % 1) * U.TAU;
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        ctx.beginPath(); ctx.arc(x, y, 3.2, 0, U.TAU); ctx.fillStyle = v > 0.02 ? '#fff6dd' : 'rgba(255,255,255,0.25)'; ctx.fill();
      }
      text(ctx, 'RuBP (5C)', cx - 34, cy - r + 26, { size: 9.5, color: '#bfe8ff' });
      text(ctx, '3-PGA (3C)', cx + 22, cy - 18, { size: 9.5, color: '#c8f5c0' });
      text(ctx, 'G3P (3C)', cx - 4, cy + r - 26, { size: 9.5, color: '#ffe0a0', align: 'center' });
      text(ctx, '3 CO₂ + 9 ATP + 6 NADPH → 1 G3P', 12, 268, { size: 10.5, weight: 600, color: '#fff0c8' });
      // CO₂ arriving.
      if (v > 0.02) {
        for (let k = 0; k < 3; k++) {
          const u = (t * 0.6 + k / 3) % 1;
          const x = U.lerp(cx + 120, cx + 50, u), y = U.lerp(cy - 120, cy - 66, u);
          blob(ctx, x, y, 3, 3, U.rgba('#d7e0e3', 1 - u * 0.5));
        }
      }
      text(ctx, 'CO₂ in', cx + 112, cy - 126, { size: 9.5 });
      // Oxygenation side reaction.
      const vo = U.clamp(f.voRatio || 0, 0, 1);
      arrow(ctx, cx + 28, cy - r - 4, cx - 30, cy - r - 30, U.rgba('#ff6fb5', 0.4 + vo), 1 + vo * 5);
      text(ctx, `O₂ grabbed ${Math.round(vo * 100)}× per 100 CO₂ → photorespiration`, 12, cy - r - 44, { size: 9, color: '#ff9fd0' });
      // Exit of G3P → starch / sucrose.
      const fs = f.fs || 0;
      const ex = cx + 10, ey = cy + r + 6;
      arrow(ctx, ex, ey, 300, 226, U.rgba('#ffe0a0', 0.9), 2 + 6 * fs);
      arrow(ctx, ex, ey, 300, 258, U.rgba('#ff9419', 0.9), 2 + 6 * (1 - fs));
      text(ctx, `${Math.round(fs * 100)}% → starch`, 306, 226, { size: 10, weight: 600, color: '#fff0c8' });
      text(ctx, `${Math.round((1 - fs) * 100)}% → sucrose`, 306, 258, { size: 10, weight: 600, color: '#ffc27a' });
      // Live panel.
            text(ctx, `CO₂ fixed  ${U.fmt(f.Vc || 0, 1)}`, 312, 44, { size: 9.5, mono: true });
      text(ctx, `O₂ fixed   ${U.fmt(f.Vo || 0, 1)}`, 312, 58, { size: 9.5, mono: true });
      text(ctx, 'µmol m⁻² s⁻¹', 312, 72, { size: 8.5, color: 'rgba(200,220,210,0.7)' });
      text(ctx, 'Limited by', 312, 96, { size: 9.5, color: 'rgba(200,220,210,0.8)' });
      const limShort = { light: 'light', rubisco: 'Rubisco', sink: 'sugar use (sink)', dark: 'darkness' }[f.limiter];
      text(ctx, limShort, 312, 110, { size: 11, weight: 700, color: '#bff5b0' });
    },
  };

  // ---------------------------------------------------------------- photorespiration
  insets.photoresp = {
    title: 'Photorespiration · a three-organelle relay',
    draw(ctx, t, m) {
      const f = m.f;
      const cp = [74, 130], px = [220, 130], mt = [366, 130];
      blob(ctx, cp[0], cp[1], 62, 40, 'rgba(47,138,54,0.6)', '#b9e88d');
      blob(ctx, px[0], px[1], 58, 42, 'rgba(60,46,88,0.9)', '#c9b2ff');
      ctx.save(); ctx.translate(mt[0], mt[1]);
      U.roundRect(ctx, -58, -30, 116, 60, 30); ctx.fillStyle = 'rgba(140,74,44,0.8)'; ctx.fill(); ctx.strokeStyle = '#f2a66c'; ctx.stroke();
      ctx.restore();
      text(ctx, 'Chloroplast', cp[0], 76, { align: 'center', weight: 700, color: '#b9e88d' });
      text(ctx, 'Peroxisome', px[0], 76, { align: 'center', weight: 700, color: '#c9b2ff' });
      text(ctx, 'Mitochondrion', mt[0], 86, { align: 'center', weight: 700, color: '#f2a66c' });
      text(ctx, 'Rubisco + O₂', cp[0], 118, { align: 'center', size: 9.5 });
      text(ctx, '→ 2-phosphoglycolate', cp[0], 131, { align: 'center', size: 9 });
      text(ctx, 'glycolate', cp[0], 145, { align: 'center', size: 9, color: '#ff9fd0' });
      text(ctx, 'glycolate → glycine', px[0], 120, { align: 'center', size: 9 });
      text(ctx, 'H₂O₂ → catalase', px[0], 134, { align: 'center', size: 8.5, color: '#d8c8ff' });
      text(ctx, 'serine → glycerate', px[0], 148, { align: 'center', size: 9 });
      text(ctx, '2 glycine → serine', mt[0], 118, { align: 'center', size: 9 });
      text(ctx, '+ CO₂ + NH₃', mt[0], 134, { align: 'center', size: 9.5, weight: 700, color: '#ffb0b0' });
      // Loop path.
      const loop = [[110, 108], [190, 108], [250, 108], [320, 108], [320, 156], [250, 156], [190, 156], [110, 156]];
      ctx.strokeStyle = 'rgba(255,111,181,0.35)'; ctx.lineWidth = 2;
      ctx.beginPath(); loop.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
      const rate = U.clamp((f.Vo || 0) / 6, 0, 1.4);
      if (rate > 0.01) {
        for (let k = 0; k < 8; k++) {
          const [x, y] = along(loop, (t * 0.12 * (0.4 + rate) + k / 8) % 1);
          ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 3.5, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 3.5, y); ctx.closePath();
          ctx.fillStyle = '#ff6fb5'; ctx.fill();
        }
        // CO₂ escaping.
        const u = (t * 0.5) % 1;
        blob(ctx, mt[0] + 20, mt[1] - 30 - u * 40, 3, 3, U.rgba('#d7e0e3', 1 - u));
        // NH₃ back to chloroplast.
        const u2 = (t * 0.35) % 1;
        const [nx, ny] = along([[mt[0], 175], [px[0], 195], [cp[0], 172]], u2);
        blob(ctx, nx, ny, 3.2, 3.2, '#b98cff');
      }
      text(ctx, 'NH₃ is re-fixed in the chloroplast (GS2 / Fd-GOGAT)', 220, 202, { align: 'center', size: 9.5, color: '#d0b8ff' });
      const loss = (f.prLossFrac || 0) * 100;
      text(ctx, `Carbon lost as CO₂: ${U.fmt(loss, 0)}% of what Rubisco fixes`, 18, 236, { size: 11, weight: 700, color: '#ffc0dc' });
      text(ctx, `Leaf ${m.env.temp} °C, CO₂ inside leaf ${U.fmt(f.Ci || 0, 0)} ppm. Warmer or lower CO₂ → more photorespiration.`, 18, 256, { size: 9.5 });
    },
  };

  // ---------------------------------------------------------------- Sankey of carbon
  insets.allocation = {
    title: 'Carbon budget right now · pmol C per hour',
    draw(ctx, t, m) {
      const fl = m.carbonFlows();
      const srcCol = { 'CO₂ fixed': '#7ce07a', 'Starch broken down': '#f3ecd6' };
      const colors = {
        'Starch store': '#f3ecd6', 'Respiration': '#ff8a5c', 'Cell wall': '#b4e0c8', 'Amino acids': '#6af0a8',
        'Membranes & RNA': '#9ad0ff', 'Vacuole store': '#4f9dff', 'Export to plant': '#ff9419',
      };
      const srcs = Object.entries(fl.sources).filter(([, v]) => v > 0.02);
      const sinks = Object.entries(fl.sinks).filter(([, v]) => v > 0.02).sort((a, b) => b[1] - a[1]);
      const inTotal = srcs.reduce((a, [, v]) => a + v, 0);
      if (inTotal < 0.05) { text(ctx, 'No carbon is flowing right now.', 20, 140); return; }
      const pr = Math.min(fl.photoresp, inTotal);
      const sinkTot = Math.max(1e-6, sinks.reduce((a, [, v]) => a + v, 0));
      const top = 54, avail = 180;
      const sc = avail / inTotal;
      const ribbon = (x0, a0, a1, x1, b0, b1, col, alpha = 0.38) => {
        ctx.beginPath();
        ctx.moveTo(x0, a0);
        ctx.bezierCurveTo((x0 + x1) / 2, a0, (x0 + x1) / 2, b0, x1, b0);
        ctx.lineTo(x1, b1);
        ctx.bezierCurveTo((x0 + x1) / 2, b1, (x0 + x1) / 2, a1, x0, a1);
        ctx.closePath();
        ctx.fillStyle = U.rgba(col, alpha); ctx.fill();
      };
      // Sources.
      const xs = 16, xm = 170, xr = 292;
      let y = top;
      const midH = (inTotal - pr) * sc;
      const midY = top + pr * sc + 10;
      let my = midY;
      for (const [k, v] of srcs) {
        const h = v * sc;
        ctx.fillStyle = srcCol[k]; ctx.fillRect(xs, y, 9, h);
        text(ctx, `${k} ${U.fmt(v, 1)}`, xs, y - 9, { size: 9.5, weight: 600, color: srcCol[k] });
        let a0 = y, hh = h;
        if (k === 'CO₂ fixed' && pr > 0.02) {
          ribbon(xs + 9, a0, a0 + pr * sc, xm - 30, top - 30, top - 30 + pr * sc, '#ff6fb5', 0.45);
          text(ctx, `lost to photorespiration ${U.fmt(pr, 1)}`, xm - 26, top - 30 + (pr * sc) / 2, { size: 9, color: '#ff9fd0' });
          a0 += pr * sc; hh -= pr * sc;
        }
        ribbon(xs + 9, a0, a0 + hh, xm, my, my + hh, srcCol[k]);
        my += hh;
        y += h + 26;
      }
      ctx.fillStyle = '#ffb84d'; ctx.fillRect(xm, midY, 9, midH);
      text(ctx, 'sugar pool', xm - 4, midY + midH + 12, { size: 9, color: '#ffc27a' });
      // Sinks: band heights share the same scale as inputs; labels are spaced apart.
      const sScale = Math.min(sc, (avail - 4 * (sinks.length - 1)) / sinkTot);
      let sy = top - 6, from = midY;
      let ly = -1e9;
      for (const [k, v] of sinks) {
        const h = Math.max(1.2, v * sScale);
        const hFrom = (v / sinkTot) * midH;
        ribbon(xm + 9, from, from + hFrom, xr, sy, sy + h, colors[k] || '#ccc');
        ctx.fillStyle = colors[k] || '#ccc'; ctx.fillRect(xr, sy, 7, h);
        const lyc = Math.max(sy + h / 2, ly + 15);
        ly = lyc;
        ctx.strokeStyle = U.rgba(colors[k] || '#ccc', 0.5); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(xr + 8, sy + h / 2); ctx.lineTo(xr + 14, lyc); ctx.stroke();
        text(ctx, `${k.replace('Membranes & RNA', 'Membranes, RNA').replace('Export to plant', 'Export')} ${Math.round((v / sinkTot) * 100)}%`, xr + 17, lyc, { size: 10, weight: 600, color: colors[k] });
        from += hFrom;
        sy += h + 4;
      }
    },
  };

  // ---------------------------------------------------------------- mitochondrial respiration
  insets.mito = {
    title: 'Mitochondrion · respiration and the plant AOX bypass',
    draw(ctx, t, m) {
      const f = m.f;
      const yM0 = 96, yM1 = 128;
      ctx.fillStyle = 'rgba(200,120,80,0.10)'; ctx.fillRect(0, 26, W, yM0 - 26);
      ctx.fillStyle = 'rgba(140,74,44,0.25)'; ctx.fillRect(0, yM1, W, H - yM1);
      text(ctx, 'INTERMEMBRANE SPACE', 10, 38, { size: 9, weight: 600, color: 'rgba(255,200,160,0.8)' });
      text(ctx, 'MATRIX', 10, H - 14, { size: 9, weight: 600, color: 'rgba(255,200,160,0.8)' });
      membrane(ctx, yM0, yM1, 0, W, 'rgba(255,190,140,0.5)');
      const cx = [[60, 'I'], [118, 'II'], [196, 'III'], [268, 'IV'], [150, 'AOX'], [380, 'ATP synth.']];
      for (const [x, nm] of cx) {
        const col = nm === 'AOX' ? '#5fbfa0' : nm.startsWith('ATP') ? '#e08a4a' : '#c46a3a';
        blob(ctx, x, 112, nm === 'II' || nm === 'AOX' ? 13 : 20, 24, col, '#ffd0a0');
        text(ctx, nm, x, 112, { size: nm.length > 4 ? 8 : 10, align: 'center', weight: 700 });
      }
      // TCA cycle in the matrix.
      const tx = 120, ty = 205;
      ctx.strokeStyle = 'rgba(255,200,140,0.55)'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(tx, ty, 34, 0, U.TAU); ctx.stroke();
      const rk = U.clamp((f.resp || 0) / 2.2, 0, 1.3);
      for (let k = 0; k < 6; k++) {
        const a = t * 0.8 * rk + (k / 6) * U.TAU;
        blob(ctx, tx + Math.cos(a) * 34, ty + Math.sin(a) * 34, 3, 3, '#fff0d8');
      }
      text(ctx, 'TCA cycle', tx, ty, { align: 'center', size: 10, weight: 700 });
      text(ctx, 'pyruvate → acetyl-CoA', tx, ty + 46, { align: 'center', size: 10 });
      text(ctx, '(glycolysis ran in the cytosol)', tx, ty + 60, { align: 'center', size: 10, color: 'rgba(210,230,215,0.7)' });
      arrow(ctx, tx + 30, ty - 30, 60, 140, 'rgba(255,240,200,0.6)', 1.2);
      text(ctx, 'NADH', 92, 156, { size: 9, color: '#ffe0b0' });
      // Electron path.
      const main = [[60, 112], [130, 104], [196, 112], [232, 76], [268, 112], [268, 150]];
      const aox = [[60, 112], [130, 104], [150, 130], [150, 152]];
      ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(255,255,220,0.2)'; ctx.lineWidth = 1;
      for (const p of [main, aox]) { ctx.beginPath(); p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); }
      ctx.setLineDash([]);
      text(ctx, 'UQ', 128, 96, { size: 8.5, color: '#ffe680' });
      text(ctx, 'cyt c', 232, 66, { size: 8.5, color: '#ffb0b0', align: 'center' });
      text(ctx, 'O₂ → H₂O', 268, 162, { size: 9, align: 'center', color: '#9fd0ff' });
      text(ctx, 'O₂ → H₂O', 150, 164, { size: 9, align: 'center', color: '#9fd0ff' });
      if (rk > 0.02) {
        for (let k = 0; k < 5; k++) {
          const [x, y] = along(main, (t * 0.25 * (0.3 + rk) + k / 5) % 1);
          blob(ctx, x, y, 2.8, 2.8, '#fffbd0');
        }
        const [x2, y2] = along(aox, (t * 0.2) % 1);
        blob(ctx, x2, y2, 2.6, 2.6, 'rgba(160,255,220,0.9)');
      }
      // Pumped protons.
      ctx.fillStyle = '#ff8a65'; ctx.font = `700 11px ${F}`;
      for (const x of [60, 196, 268]) {
        const u = (t * (0.4 + rk) + x * 0.01) % 1;
        ctx.fillText('+', x - 3, 86 - u * 40);
      }
      for (let k = 0; k < Math.round(8 + 12 * rk); k++) ctx.fillText('+', 20 + ((k * 47.3 + t * 8) % 400), 50 + ((k * 13.1) % 30));
      const u = (t * (0.5 + rk)) % 1;
      text(ctx, '+', 380, 70 + u * 70, { color: '#ff8a65', weight: 700, size: 12, align: 'center' });
      text(ctx, 'ADP + Pᵢ → ATP', 380, 160, { size: 10, align: 'center', color: '#ffe0a0' });
      text(ctx, `Respiration ${U.fmt(f.resp || 0, 2)} pmol C h⁻¹`, 250, 212, { size: 10, mono: true });
      text(ctx, `≈ ${U.fmt(f.atpMito || 0, 1)} pmol ATP h⁻¹`, 250, 228, { size: 10, mono: true });
      text(ctx, 'AOX skips complexes III and IV:', 250, 248, { size: 10, color: '#a6f0d0' });
      text(ctx, 'fewer H⁺ pumped, more heat.', 250, 262, { size: 10, color: '#a6f0d0' });
    },
  };

  // ---------------------------------------------------------------- nitrogen assimilation
  insets.nitrogen = {
    title: 'Nitrogen assimilation · nitrate to amino acids',
    draw(ctx, t, m) {
      const f = m.f, s = m.s;
      const zones = [[0, 70, 'APOPLAST', 'rgba(134,171,156,0.15)'], [70, 250, 'CYTOSOL', 'rgba(40,66,54,0.5)'], [250, 440, 'CHLOROPLAST', 'rgba(47,138,54,0.22)']];
      for (const [x0, x1, nm, col] of zones) {
        ctx.fillStyle = col; ctx.fillRect(x0, 26, x1 - x0, 160);
        text(ctx, nm, x0 + 6, 38, { size: 9, weight: 600, color: 'rgba(220,240,225,0.7)' });
      }
      ctx.fillStyle = 'rgba(12,38,48,0.9)'; ctx.fillRect(70, 186, 180, 70);
      text(ctx, 'VACUOLE (nitrate bank)', 76, 198, { size: 9, weight: 600, color: 'rgba(160,210,230,0.8)' });
      ctx.fillStyle = 'rgba(220,240,225,0.7)'; ctx.fillRect(68, 26, 3, 160); ctx.fillRect(248, 26, 3, 160);
      const nodes = [
        [36, 100, 'NO₃⁻', '#b98cff'],
        [110, 100, 'NO₃⁻', '#b98cff'],
        [200, 100, 'NO₂⁻', '#d4b0ff'],
        [290, 100, 'NH₄⁺', '#ffb0e0'],
        [350, 70, 'Gln', '#6af0a8'],
        [350, 135, 'Glu', '#6af0a8'],
      ];
      text(ctx, 'amino', 414, 94, { align: 'center', weight: 700, size: 11, color: '#6af0a8' });
      text(ctx, 'acids', 414, 107, { align: 'center', weight: 700, size: 11, color: '#6af0a8' });
      for (const [x, y, nm, col] of nodes) text(ctx, nm, x, y, { align: 'center', weight: 700, size: 11, color: col });
      const steps = [
        [52, 100, 92, 100, 'NRT1.1 + 2H⁺', 86],
        [128, 100, 182, 100, 'NR (2 e⁻, NADH)', 86],
        [218, 100, 272, 100, 'NiR (6 e⁻, Fd)', 86],
        [306, 95, 336, 74, 'GS (ATP)', 56],
        [350, 80, 350, 124, 'GOGAT', 112],
        [366, 120, 388, 104, '', 0],
      ];
      for (const [x0, y0, x1, y1, lbl, ly] of steps) {
        arrow(ctx, x0, y0, x1, y1, 'rgba(230,230,255,0.7)', 1.4);
        if (lbl === 'GOGAT') text(ctx, lbl, 344, 102, { align: 'right', size: 10, color: 'rgba(230,230,255,0.85)' });
        else if (lbl) text(ctx, lbl, (x0 + x1) / 2, ly, { align: 'center', size: 10, color: 'rgba(230,230,255,0.85)' });
      }
      text(ctx, '2-oxoglutarate (from sugar)', 382, 160, { align: 'center', size: 8.5, color: '#ffc27a' });
      arrow(ctx, 382, 152, 360, 138, 'rgba(255,194,122,0.7)', 1.2);
      // Vacuole storage arrow.
      arrow(ctx, 110, 112, 130, 210, U.rgba('#b98cff', f.vacN > 0 ? 0.9 : 0.25), 1.5);
      arrow(ctx, 150, 210, 128, 116, U.rgba('#b98cff', f.vacN < 0 ? 0.9 : 0.25), 1.5);
      text(ctx, `stored ${U.fmt(s.no3v, 2)} pmol`, 160, 232, { size: 9, mono: true });
      // Moving tokens.
      const path = [[36, 100], [110, 100], [200, 100], [290, 100], [350, 74], [350, 130], [405, 100]];
      const r = U.clamp((f.NRactual || 0) / 0.5, 0, 1.3);
      if (r > 0.02) {
        for (let k = 0; k < 6; k++) {
          const u = (t * 0.12 * (0.3 + r) + k / 6) % 1;
          const [x, y] = along(path, u);
          blob(ctx, x, y + 14, 3, 3, u < 0.5 ? '#b98cff' : '#6af0a8');
        }
      }
      // Photorespiratory NH₃ loop.
      const pr = f.prNH3 || 0;
      text(ctx, 'pmol N per hour', 258, 198, { size: 10, color: 'rgba(210,230,215,0.7)' });
      text(ctx, `NH₃ re-fixed (photoresp.) ${U.fmt(pr, 1)}`, 258, 214, { size: 10, color: '#ffb0e0' });
      text(ctx, `new N from nitrate      ${U.fmt(f.NRactual || 0, 2)}`, 258, 230, { size: 10, color: '#d0b8ff' });
      text(ctx, `nitrate taken up        ${U.fmt(f.nUptake || 0, 2)}`, 258, 246, { size: 10, color: '#d0b8ff' });
    },
  };

  // ---------------------------------------------------------------- gene expression & proteome
  insets.expression = {
    title: 'From gene to protein · and where proteins go',
    draw(ctx, t, m) {
      const f = m.f, s = m.s;
      // Nucleus.
      blob(ctx, 70, 140, 62, 92, 'rgba(43,36,71,0.95)', '#a99ae6');
      text(ctx, 'NUCLEUS', 70, 60, { align: 'center', size: 9, weight: 600, color: '#c8bcff' });
      // DNA double helix.
      for (let y = 75; y < 210; y += 2) {
        const a = y * 0.18 + t * 0.5;
        ctx.fillStyle = '#9db8ff'; ctx.fillRect(56 + Math.sin(a) * 10, y, 2, 2);
        ctx.fillStyle = '#ff9ad5'; ctx.fillRect(56 - Math.sin(a) * 10, y, 2, 2);
      }
      // RNA polymerase moving along.
      const py = 80 + ((t * 20) % 120);
      blob(ctx, 58, py, 9, 7, '#ffcf6b');
      text(ctx, 'RNA Pol II', 76, 222, { size: 8.5, color: '#ffcf6b' });
      // mRNA leaving through pore.
      const rate = U.clamp((f.protSynActual || 0) / 0.35, 0, 1.3);
      const mpath = [[66, py], [100, 140], [132, 140], [170, 120]];
      ctx.fillStyle = '#e8e0ff'; ctx.fillRect(129, 134, 4, 12);
      text(ctx, 'pore', 132, 154, { size: 8.5, align: 'center' });
      if (rate > 0.02) for (let k = 0; k < 3; k++) {
        const [x, y] = along(mpath, (t * 0.3 * (0.4 + rate) + k / 3) % 1);
        ctx.strokeStyle = '#ff5a5a'; ctx.lineWidth = 2; ctx.beginPath();
        for (let j = -3; j <= 3; j++) ctx.lineTo(x + j * 2.4, y + Math.sin(j + t * 6) * 2);
        ctx.stroke();
      }
      // Route 1: ER → Golgi → PM.
      text(ctx, 'Secretory route', 178, 44, { weight: 700, size: 10, color: '#46c8ff' });
      ctx.strokeStyle = '#4fb6a9'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(176, 70); ctx.quadraticCurveTo(206, 60, 236, 70); ctx.stroke();
      text(ctx, 'rough ER', 206, 84, { size: 8.5, align: 'center' });
      for (let k = 0; k < 4; k++) { ctx.strokeStyle = '#f2c96b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(262, 60 + k * 5); ctx.quadraticCurveTo(276, 56 + k * 5, 290, 60 + k * 5); ctx.stroke(); }
      text(ctx, 'Golgi', 276, 84, { size: 8.5, align: 'center' });
      ctx.fillStyle = '#dfeecf'; ctx.fillRect(340, 44, 3, 40);
      text(ctx, 'membrane & wall', 344, 92, { size: 8.5, align: 'center' });
      const v1 = (t * 0.4) % 1;
      const [vx, vy] = along([[206, 70], [276, 68], [338, 64]], v1);
      ctx.strokeStyle = '#ffe3b8'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(vx, vy, 4, 0, U.TAU); ctx.stroke();
      // Route 2: cytosolic ribosome → TOC/TIC → chloroplast.
      text(ctx, 'Chloroplast import', 178, 140, { weight: 700, size: 10, color: '#7ce07a' });
      blob(ctx, 205, 172, 10, 8, '#ffb4a0'); text(ctx, 'ribosome', 205, 192, { size: 8.5, align: 'center' });
      blob(ctx, 316, 182, 52, 30, 'rgba(47,138,54,0.6)', '#b9e88d');
      ctx.fillStyle = '#ffe680'; ctx.fillRect(262, 172, 6, 20);
      text(ctx, 'TOC/TIC', 265, 202, { size: 8.5, align: 'center', color: '#ffe680' });
      const v2 = (t * 0.35) % 1;
      const [qx, qy] = along([[215, 172], [262, 180], [300, 182]], v2);
      for (let k = 0; k < 3; k++) blob(ctx, qx - k * 4, qy, 2.4, 2.4, '#46c8ff');
      text(ctx, 'RbcS (nucleus) + RbcL', 316, 178, { size: 8.5, align: 'center' });
      text(ctx, '(chloroplast) → Rubisco', 316, 190, { size: 8.5, align: 'center' });
      // Proteome donut.
      const cx = 412, cy = 240, rr = 22;
      const parts = [['photo', '#7ce07a', 'Photosynthesis'], ['ribo', '#ff9a9a', 'Ribosomes'], ['met', '#9ad0ff', 'Metabolism'], ['house', '#c8bcff', 'Housekeeping']];
      let a0 = -Math.PI / 2;
      for (const [k, col] of parts) {
        const a1 = a0 + s.phi[k] * U.TAU;
        ctx.beginPath(); ctx.arc(cx, cy, rr, a0, a1); ctx.lineWidth = 10; ctx.strokeStyle = col; ctx.stroke();
        a0 = a1;
      }
      text(ctx, 'New protein goes to', 250, 226, { size: 9, color: 'rgba(210,230,215,0.8)' });
      let ly = 240;
      for (const [k, col, nm] of parts) {
        if (k === 'house') continue;
        text(ctx, `${nm} ${Math.round(s.phi[k] * 100)}%`, 250, ly, { size: 10, color: col, weight: 600 });
        ly += 13;
      }
      text(ctx, `Translation ${U.fmt(f.protSynActual || 0, 2)} pmol N h⁻¹`, 12, 262, { size: 9, mono: true });
    },
  };

  // ---------------------------------------------------------------- water, wall & growth
  insets.growth = {
    title: 'Turgor-driven growth · the Lockhart equation',
    draw(ctx, t, m) {
      const f = m.f, s = m.s, p = m.p;
      // Wall face view.
      ctx.save();
      ctx.beginPath(); ctx.rect(12, 34, 190, 180); ctx.clip();
      ctx.fillStyle = 'rgba(134,171,156,0.15)'; ctx.fillRect(12, 34, 190, 180);
      const g = U.clamp(f.rgr * 40, 0, 1.4);
      const slide = (t * 6 * g) % 16;
      // Cellulose hoops run around the cell, perpendicular to the growth axis.
      for (let k = 0; k < 13; k++) {
        const x = 18 + k * 15 + (k % 2 ? slide * 0.3 : -slide * 0.3);
        ctx.strokeStyle = 'rgba(230,245,235,0.8)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, 34); ctx.bezierCurveTo(x - 3, 90, x + 3, 160, x, 214); ctx.stroke();
      }
      // Hemicellulose tethers and expansins.
      for (let k = 0; k < 18; k++) {
        const x = 20 + ((k * 37) % 175), y = 46 + ((k * 23) % 165);
        ctx.strokeStyle = 'rgba(200,185,140,0.6)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 6, y + 9); ctx.stroke();
      }
      const acid = U.clamp(f.acid || 0, 0, 1.4);
      for (let k = 0; k < Math.round(4 + 8 * acid); k++) {
        const x = 20 + ((k * 61 + t * 10) % 175), y = 50 + ((k * 41) % 160);
        ctx.fillStyle = '#ffd36b';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, 4, 0.5, U.TAU - 0.5); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#ff8a65'; ctx.font = `700 10px ${F}`;
      for (let k = 0; k < Math.round(4 + 14 * acid); k++) ctx.fillText('+', 16 + ((k * 29.7 + t * 4) % 182), 44 + ((k * 17.3) % 170));
      ctx.restore();
      text(ctx, 'Cellulose hoops, tethers, expansins, H⁺', 107, 222, { size: 9, align: 'center' });
      text(ctx, `wall pH ${U.fmt(s.pH, 1)}`, 107, 236, { size: 9.5, align: 'center', mono: true, color: '#ffb08a' });
      // Arrows showing growth direction (perpendicular to hoops).
      text(ctx, '↔ growth runs across the hoops', 107, 252, { size: 10, align: 'center', color: '#bff5b0' });
      // Lockhart plot.
      const x0 = 250, y0 = 210, pw = 170, ph = 150;
      ctx.strokeStyle = 'rgba(220,240,225,0.6)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, y0 - ph); ctx.lineTo(x0, y0); ctx.lineTo(x0 + pw, y0); ctx.stroke();
      const Pmax = 1.2, Gmax = 0.06;
      const X = (P) => x0 + (P / Pmax) * pw, Y = (g2) => y0 - (g2 / Gmax) * ph;
      text(ctx, 'Turgor P (MPa)', x0 + pw / 2, y0 + 26, { size: 9, align: 'center' });
      for (const v of [0, 0.4, 0.8, 1.2]) text(ctx, String(v), X(v), y0 + 10, { size: 8.5, align: 'center', mono: true });
      ctx.save(); ctx.translate(x0 - 30, y0 - ph / 2); ctx.rotate(-Math.PI / 2); text(ctx, 'growth (% per h)', 0, 0, { size: 9, align: 'center' }); ctx.restore();
      for (const v of [0, 3, 6]) text(ctx, String(v), x0 - 8, Y(v / 100), { size: 8.5, align: 'right', mono: true });
      // Yield threshold.
      ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(255,160,120,0.7)';
      ctx.beginPath(); ctx.moveTo(X(p.Y), y0); ctx.lineTo(X(p.Y), y0 - ph); ctx.stroke(); ctx.setLineDash([]);
      text(ctx, 'Y', X(p.Y) + 4, y0 - ph + 8, { size: 10, weight: 700, color: '#ffb08a' });
      // φ·(P − Y) line.
      const phi = f.phiL || 0;
      ctx.strokeStyle = '#bff5b0'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(p.Y), Y(0));
      ctx.lineTo(X(Pmax), Y(Math.min(Gmax, phi * (Pmax - p.Y)))); ctx.stroke();
      const P = f.P || 0, gr = f.rgr || 0;
      blob(ctx, X(Math.min(P, Pmax)), Y(Math.min(gr, Gmax)), 5, 5, '#ffffff', '#bff5b0');
      text(ctx, 'dV/dt = φ·V·(P − Y)', x0 + 6, 40, { size: 10.5, weight: 700, mono: true, color: '#e8ffe0' });
      text(ctx, `P ${U.fmt(P, 2)} MPa · π ${U.fmt(f.pi || 0, 2)} MPa`, x0 + 6, 56, { size: 9, mono: true });
      text(ctx, `growth ${U.fmt(gr * 100, 2)} % h⁻¹`, x0 + 6, 70, { size: 9, mono: true });
      text(ctx, `water in ${U.fmt(f.dV || 0, 0)} µm³ h⁻¹`, x0 + 6, 84, { size: 9, mono: true });
      if (f.wallRatio < 0.93) text(ctx, 'Wall too thin: expansion paused', x0 + 6, 98, { size: 9, color: '#ffb08a', weight: 600 });
    },
  };

  // ---------------------------------------------------------------- starch clock
  insets.starch = {
    title: 'Starch: the overnight budget set by the clock',
    draw(ctx, t, m) {
      const hist = m.hist;
      const x0 = 46, y0 = 200, pw = 370, ph = 140;
      if (hist.length < 2) return;
      const tNow = m.s.t;
      const span = U.clamp(tNow - hist[0].t, 6, 48), tMin = tNow - span;
      const maxS = Math.max(60, ...hist.map((h) => h.starch)) * 1.1;
      const X = (tt) => x0 + ((tt - tMin) / span) * pw, Y = (v) => y0 - (v / maxS) * ph;
      // Night shading.
      const sr = m.sunrise(), ss = m.sunset();
      for (let d = Math.floor(tMin / 24) - 1; d <= Math.floor(tNow / 24) + 1; d++) {
        const n0 = d * 24 + ss, n1 = (d + 1) * 24 + sr;
        const a = Math.max(tMin, n0), b = Math.min(tNow, n1);
        if (b > a) { ctx.fillStyle = 'rgba(40,60,140,0.25)'; ctx.fillRect(X(a), y0 - ph, X(b) - X(a), ph); }
      }
      ctx.strokeStyle = 'rgba(220,240,225,0.6)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, y0 - ph); ctx.lineTo(x0, y0); ctx.lineTo(x0 + pw, y0); ctx.stroke();
      ctx.beginPath();
      hist.forEach((h, i) => { if (h.t < tMin) return; const x = X(h.t), y = Y(h.starch); if (!i || hist[i - 1].t < tMin) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
      ctx.lineTo(X(tNow), y0); ctx.lineTo(X(Math.max(tMin, hist[0].t)), y0); ctx.closePath();
      ctx.fillStyle = 'rgba(243,236,214,0.18)'; ctx.fill();
      ctx.beginPath();
      hist.forEach((h, i) => { if (h.t < tMin) return; const x = X(h.t), y = Y(h.starch); if (!i || hist[i - 1].t < tMin) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
      ctx.strokeStyle = '#f3ecd6'; ctx.lineWidth = 2; ctx.stroke();
      blob(ctx, X(tNow), Y(m.s.starch), 4.5, 4.5, '#fff', '#f3ecd6');
      text(ctx, 'starch (pmol C)', x0, y0 - ph - 12, { size: 9 });
      text(ctx, `−${Math.round(span)} h`, x0, y0 + 12, { size: 8.5, mono: true });
      text(ctx, 'now', x0 + pw, y0 + 12, { size: 8.5, mono: true, align: 'right' });
      text(ctx, 'night', x0 + 6, y0 - ph + 10, { size: 8.5, color: '#9fb0ff' });
      const f = m.f;
      if (f.I < 2) {
        text(ctx, `Breakdown ${U.fmt(f.starchDeg, 1)} pmol C/h = (store − 5% reserve) ÷ ${U.fmt(f.hoursToDawn, 1)} h to dawn`, 14, 240, { size: 9.5, mono: true, color: '#fff0c8' });
      } else {
        text(ctx, `Synthesis ${U.fmt(f.starchSyn, 1)} pmol C/h · ${Math.round((f.fs || 0) * 100)}% of new carbon`, 14, 240, { size: 9.5, mono: true, color: '#fff0c8' });
      }
      text(ctx, 'The clock divides the reserve by the hours left until dawn.', 14, 258, { size: 9.5 });
    },
  };

  // ---------------------------------------------------------------- cell cycle
  insets.cycle = {
    title: 'Cell cycle · growing, copying, dividing',
    draw(ctx, t, m) {
      const s = m.s;
      const cx = 110, cy = 150, r = 70;
      const seg = [['G1', 0, 0.42, '#7ce07a'], ['S', 0.42, 0.67, '#ff9ad5'], ['G2', 0.67, 0.87, '#9ad0ff'], ['M', 0.87, 1, '#ffd27f']];
      for (const [nm, a, b, col] of seg) {
        const a0 = -Math.PI / 2 + a * U.TAU + 0.03, a1 = -Math.PI / 2 + b * U.TAU - 0.03;
        ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1); ctx.lineWidth = 16; ctx.strokeStyle = U.rgba(col, s.phase === nm ? 0.95 : 0.35); ctx.stroke();
        const am = (a0 + a1) / 2;
        text(ctx, nm, cx + Math.cos(am) * (r + 24), cy + Math.sin(am) * (r + 24), { align: 'center', weight: 700, size: 12, color: col });
      }
      const fr = m.cycleFraction;
      const a = -Math.PI / 2 + fr * U.TAU;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * (r - 12), cy + Math.sin(a) * (r - 12)); ctx.stroke();
      blob(ctx, cx, cy, 4, 4, '#fff');
      const sub = m.mSubphase();
      text(ctx, sub ? sub.name : s.phase === 'G1' ? 'growth' : s.phase === 'S' ? 'DNA synthesis' : 'preparing', cx, cy + 18, { align: 'center', size: 10, weight: 600 });
      // Checkpoint bars.
      const rel = s.V / s.Vb;
      text(ctx, `Generation ${s.gen}`, 230, 46, { size: 11, weight: 700 });
      text(ctx, 'Size (volume ÷ birth volume)', 230, 70, { size: 9.5 });
      bar(ctx, 230, 80, 190, 8, (rel - 1) / 1, '#bff5b0');
      ctx.fillStyle = '#ff9ad5'; ctx.fillRect(230 + 0.3 * 190, 76, 2, 16);
      ctx.fillStyle = '#ffd27f'; ctx.fillRect(230 + 0.85 * 190, 76, 2, 16);
      text(ctx, `${U.fmt(rel, 2)}×  (S at 1.3×, M at 1.85×)`, 230, 102, { size: 9, mono: true });
      text(ctx, `DNA content ${U.fmt(s.dna, 1)}C`, 230, 124, { size: 9.5, mono: true });
      bar(ctx, 230, 132, 190, 8, (s.dna - 2) / 2, '#ff9ad5');
      text(ctx, `Chloroplasts in this section: ${m._cpVisible || '–'}`, 230, 160, { size: 9.5 });
      text(ctx, 'Sugar gates G1 → S (cyclin D3 is sucrose-induced).', 230, 186, { size: 9.5, color: '#bff5b0' });
      text(ctx, 'Plants mark the division plane in advance', 230, 206, { size: 9.5, color: '#7fe7fa' });
      text(ctx, 'with a preprophase band of microtubules,', 230, 220, { size: 9.5, color: '#7fe7fa' });
      text(ctx, 'then build a cell plate from Golgi vesicles.', 230, 234, { size: 9.5, color: '#7fe7fa' });
    },
  };

  VC.Insets = { list: insets, W, H, spot };
})(window.VC);
