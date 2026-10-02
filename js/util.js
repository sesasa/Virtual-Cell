// Shared helpers. Everything hangs off the global VC namespace so the app
// runs from file:// without a bundler.
window.VC = window.VC || {};
(function (VC) {
  'use strict';
  const U = (VC.U = {});

  U.TAU = Math.PI * 2;
  U.clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.smooth = (t) => t * t * (3 - 2 * t);
  U.easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  U.rand = (a, b) => a + Math.random() * (b - a);
  U.pick = (arr) => arr[(Math.random() * arr.length) | 0];
  U.wrap01 = (t) => ((t % 1) + 1) % 1;

  // Deterministic PRNG so a cell's layout is stable between frames.
  U.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // Weighted random choice: weights is {key: weight}.
  U.weighted = function (weights) {
    let total = 0;
    for (const k in weights) total += Math.max(0, weights[k]);
    if (total <= 0) return null;
    let r = Math.random() * total;
    for (const k in weights) {
      r -= Math.max(0, weights[k]);
      if (r <= 0) return k;
    }
    return Object.keys(weights)[0];
  };

  U.hexToRgb = function (hex) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  U.rgba = function (hex, a) {
    const [r, g, b] = U.hexToRgb(hex);
    return `rgba(${r},${g},${b},${a})`;
  };
  U.mix = function (h1, h2, t) {
    const a = U.hexToRgb(h1), b = U.hexToRgb(h2);
    const c = a.map((v, i) => Math.round(U.lerp(v, b[i], t)));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  };

  U.fmtClock = function (simHours) {
    const day = Math.floor(simHours / 24) + 1;
    const h = simHours % 24;
    const hh = Math.floor(h);
    const mm = Math.floor((h - hh) * 60);
    return { day, text: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}` };
  };

  U.fmt = function (x, d = 1) {
    if (!isFinite(x)) return '–';
    return x.toFixed(d);
  };

  // Catmull-Rom spline through points -> dense polyline with cumulative length.
  U.spline = function (pts, seg = 8) {
    if (pts.length < 2) return { pts: pts.slice(), len: [0], total: 0 };
    const out = [];
    const P = [pts[0], ...pts, pts[pts.length - 1]];
    for (let i = 1; i < P.length - 2; i++) {
      const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
      for (let j = 0; j < seg; j++) {
        const t = j / seg, t2 = t * t, t3 = t2 * t;
        out.push({
          x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
        });
      }
    }
    out.push(pts[pts.length - 1]);
    const len = [0];
    for (let i = 1; i < out.length; i++) len.push(len[i - 1] + Math.hypot(out[i].x - out[i - 1].x, out[i].y - out[i - 1].y));
    return { pts: out, len, total: len[len.length - 1] };
  };

  U.samplePath = function (path, s) {
    const { pts, len, total } = path;
    if (s <= 0) return { x: pts[0].x, y: pts[0].y, a: 0 };
    if (s >= total) {
      const n = pts.length;
      const a = n > 1 ? Math.atan2(pts[n - 1].y - pts[n - 2].y, pts[n - 1].x - pts[n - 2].x) : 0;
      return { x: pts[n - 1].x, y: pts[n - 1].y, a };
    }
    let lo = 0, hi = len.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (len[mid] < s) lo = mid; else hi = mid;
    }
    const f = (s - len[lo]) / Math.max(1e-6, len[hi] - len[lo]);
    const p = pts[lo], q = pts[hi];
    return { x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f, a: Math.atan2(q.y - p.y, q.x - p.x) };
  };

  // Rounded text box helper for canvas labels.
  U.roundRect = function (ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  U.wrapText = function (ctx, text, maxW) {
    const words = text.split(/\s+/);
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line);
        line = w;
      } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  };
})(window.VC);
