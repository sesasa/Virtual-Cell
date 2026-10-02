// Procedural textures (no image assets): value noise, fibrous cellulose,
// grainy cytoplasm, soft sprites. All drawn on canvases at startup.
import * as THREE from 'three';
import { rng } from './geom.js';

function noiseGrid(n, rand) {
  const g = new Float32Array(n * n);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const s = (t) => t * t * (3 - 2 * t);
    const at = (i, j) => g[((j % n + n) % n) * n + ((i % n + n) % n)];
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * s(xf) + (c - a) * s(yf) + (a - b - c + d) * s(xf) * s(yf);
  };
}

function fbm(noise, x, y, oct = 4) {
  let v = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { v += amp * noise(x * f, y * f); amp *= 0.5; f *= 2; }
  return v;
}

function canvasTex(size, draw, opts = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (opts.color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Height field → tangent-space normal map.
function normalFromHeight(size, height, strength = 2) {
  return canvasTex(size, (g, n) => {
    const img = g.createImageData(n, n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const hl = height((x - 1 + n) % n, y), hr = height((x + 1) % n, y);
      const hd = height(x, (y - 1 + n) % n), hu = height(x, (y + 1) % n);
      let nx = (hl - hr) * strength, ny = (hd - hu) * strength, nz = 1;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const i = (y * n + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = (ny * 0.5 + 0.5) * 255; img.data[i + 2] = (nz * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
}

export function makeTextures() {
  const rand = rng(42);
  const N = noiseGrid(64, rand);
  const S = 256;

  // Cellulose wall: long crossing fibres plus matrix noise.
  const fib = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    // Microfibrils are below optical resolution: only a soft, irregular matrix shows.
    fib[y * S + x] = fbm(N, u * 5, v * 5, 5) * 0.8 + fbm(N, u * 22 + 4, v * 22, 3) * 0.2;
  }
  const wallNormal = normalFromHeight(S, (x, y) => fib[y * S + x], 3);
  const wallColor = canvasTex(S, (g, n) => {
    const img = g.createImageData(n, n);
    for (let i = 0; i < n * n; i++) {
      const h = fib[i];
      img.data[i * 4] = 205 + h * 30; img.data[i * 4 + 1] = 212 + h * 28; img.data[i * 4 + 2] = 196 + h * 26; img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { color: true });

  // Granular cytoplasm / membrane bumpiness.
  const gran = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) gran[y * S + x] = fbm(N, x / 16, y / 16, 5);
  const bumpNormal = normalFromHeight(S, (x, y) => gran[y * S + x], 4);

  // Chloroplast surface: mottled, with faint thylakoid banding showing through.
  const cpColor = canvasTex(S, (g, n) => {
    const img = g.createImageData(n, n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const m = fbm(N, x / 22 + 3, y / 22, 4);
      const band = 0.5 + 0.2 * fbm(N, x / 6, y / 6, 3);
      const i = (y * n + x) * 4;
      img.data[i] = 40 + m * 40 + band * 10; img.data[i + 1] = 120 + m * 70 + band * 25; img.data[i + 2] = 40 + m * 30; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { color: true });

  // Soft round sprite for granules, photons and glows.
  const sprite = canvasTex(64, (g, n) => {
    const r = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, n, n);
  });

  // Vertical light-shaft gradient.
  const shaft = canvasTex(128, (g, n) => {
    const lg = g.createLinearGradient(0, 0, 0, n);
    lg.addColorStop(0, 'rgba(255,245,210,0.9)');
    lg.addColorStop(1, 'rgba(255,245,210,0)');
    g.fillStyle = lg; g.fillRect(0, 0, n, n);
    const hg = g.createLinearGradient(0, 0, n, 0);
    hg.addColorStop(0, 'rgba(0,0,0,1)'); hg.addColorStop(0.5, 'rgba(0,0,0,0)'); hg.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = hg; g.fillRect(0, 0, n, n);
  });

  // Background: deep leaf-interior gradient.
  const backdrop = canvasTex(512, (g, n) => {
    const lg = g.createLinearGradient(0, 0, 0, n);
    lg.addColorStop(0, '#20402c');
    lg.addColorStop(0.45, '#0c2019');
    lg.addColorStop(1, '#040b0a');
    g.fillStyle = lg; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * n, y = Math.random() * n * 0.7, r = 20 + Math.random() * 90;
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, 'rgba(90,150,80,0.10)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg; g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
  }, { color: true });
  backdrop.wrapS = backdrop.wrapT = THREE.ClampToEdgeWrapping;

  return { wallNormal, wallColor, bumpNormal, cpColor, sprite, shaft, backdrop };
}

// ---------------------------------------------------------------------------
// Cross-section faces for cut-open organelles, drawn like a coloured electron
// micrograph: what a real section through the organelle shows.

// Chloroplast section (long axis horizontal, thin axis vertical).
export function drawChloroplastSection(canvas, starchK, seed = 5) {
  const rand = rng(seed);
  const W = canvas.width, H = canvas.height, g = canvas.getContext('2d');
  g.clearRect(0, 0, W, H);
  const cx = W / 2, cy = H / 2, rx = W / 2 - 4, ry = H / 2 - 4;
  g.save();
  g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.clip();
  // Stroma: dense, finely granular.
  const sg = g.createRadialGradient(cx, cy, 10, cx, cy, rx);
  sg.addColorStop(0, '#2f5f26'); sg.addColorStop(1, '#244c1e');
  g.fillStyle = sg; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(${150 + rand() * 60},${200 + rand() * 40},${140 + rand() * 40},${0.05 + rand() * 0.1})`;
    g.fillRect(rand() * W, rand() * H, 1.4, 1.4);
  }
  // Ribosomes (darker dots).
  g.fillStyle = 'rgba(20,40,16,0.55)';
  for (let i = 0; i < 700; i++) { g.beginPath(); g.arc(rand() * W, rand() * H, 1.3, 0, Math.PI * 2); g.fill(); }
  const inside = (x, y, m = 0) => ((x - cx) / (rx - m)) ** 2 + ((y - cy) / (ry - m)) ** 2 < 1;
  // Stroma lamellae: long wavy single membranes running the length of the plastid.
  g.strokeStyle = 'rgba(205,240,170,0.75)'; g.lineWidth = 1.6;
  for (let k = 0; k < 9; k++) {
    const y0 = cy + (k - 4) * (ry * 0.17);
    g.beginPath();
    for (let x = cx - rx; x <= cx + rx; x += 6) {
      const y = y0 + Math.sin(x * 0.012 + k) * 5;
      if (inside(x, y, 12)) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.stroke();
  }
  // Grana: stacks of appressed discs, each disc = two membranes around a dark lumen.
  const stacks = [];
  for (let tries = 0; stacks.length < 26 && tries < 600; tries++) {
    const n = 5 + Math.floor(rand() * 12);
    const w = 52 + rand() * 16, h = n * 7;
    const x = cx - rx + 40 + rand() * (2 * rx - 80), y = cy - ry + 20 + rand() * (2 * ry - 40);
    if (!inside(x - w / 2, y - h / 2, 14) || !inside(x + w / 2, y + h / 2, 14) || !inside(x - w / 2, y + h / 2, 14) || !inside(x + w / 2, y - h / 2, 14)) continue;
    if (stacks.some((s) => Math.abs(s.x - x) < (s.w + w) / 2 + 22 && Math.abs(s.y - y) < (s.h + h) / 2 + 10)) continue;
    stacks.push({ x, y, w, h, n });
  }
  for (const s of stacks) {
    for (let k = 0; k < s.n; k++) {
      const y = s.y - s.h / 2 + k * 7;
      g.fillStyle = '#cdeca6'; g.fillRect(s.x - s.w / 2, y, s.w, 5.2);
      g.fillStyle = '#3d6b2e'; g.fillRect(s.x - s.w / 2 + 2, y + 1.6, s.w - 4, 2);
    }
  }
  // Starch grains: pale, smooth, lens-shaped; size follows the model.
  const sk = Math.max(0.04, Math.min(1.2, starchK));
  for (const [ux, uy, f] of [[-0.42, 0.05, 1], [0.12, -0.12, 0.85], [0.55, 0.08, 0.7]]) {
    const a = 70 * Math.sqrt(sk) * f, b = 34 * Math.sqrt(sk) * f;
    const x = cx + ux * rx, y = cy + uy * ry;
    const sg2 = g.createRadialGradient(x - a * 0.3, y - b * 0.3, 2, x, y, a);
    sg2.addColorStop(0, '#fbf7ea'); sg2.addColorStop(1, '#e4dcc0');
    g.fillStyle = sg2;
    g.beginPath(); g.ellipse(x, y, a, b, (rand() - 0.5) * 0.3, 0, Math.PI * 2); g.fill();
  }
  // Plastoglobuli.
  g.fillStyle = '#d6b44a';
  for (let i = 0; i < 14; i++) {
    const x = cx + (rand() - 0.5) * rx * 1.6, y = cy + (rand() - 0.5) * ry * 1.4;
    if (inside(x, y, 20)) { g.beginPath(); g.arc(x, y, 3 + rand() * 3, 0, Math.PI * 2); g.fill(); }
  }
  g.restore();
  // Double envelope.
  g.strokeStyle = '#c8eaa8'; g.lineWidth = 2.6;
  g.beginPath(); g.ellipse(cx, cy, rx - 1, ry - 1, 0, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 1.8;
  g.beginPath(); g.ellipse(cx, cy, rx - 7, ry - 7, 0, 0, Math.PI * 2); g.stroke();
}

// Mitochondrion section: smooth outer membrane, inner membrane folded into cristae.
export function drawMitoSection(canvas, seed = 9) {
  const rand = rng(seed);
  const W = canvas.width, H = canvas.height, g = canvas.getContext('2d');
  g.clearRect(0, 0, W, H);
  const r = H / 2 - 3;
  const stadium = (inset) => {
    g.beginPath();
    g.moveTo(r + 3, 3 + inset);
    g.lineTo(W - r - 3, 3 + inset);
    g.arc(W - r - 3, H / 2, r - inset, -Math.PI / 2, Math.PI / 2);
    g.lineTo(r + 3, H - 3 - inset);
    g.arc(r + 3, H / 2, r - inset, Math.PI / 2, (3 * Math.PI) / 2);
    g.closePath();
  };
  // Intermembrane space + outer membrane.
  stadium(0); g.fillStyle = '#c7875c'; g.fill();
  // Matrix.
  stadium(7); g.fillStyle = '#7a3f22'; g.fill();
  g.save(); stadium(7); g.clip();
  for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(255,190,140,${0.05 + rand() * 0.1})`; g.fillRect(rand() * W, rand() * H, 1.5, 1.5); }
  // Cristae: tubular/lamellar folds of the inner membrane reaching into the matrix.
  g.strokeStyle = '#f2c095'; g.lineCap = 'round';
  for (let x = r * 0.7; x < W - r * 0.7; x += 22 + rand() * 10) {
    const top = rand() < 0.5;
    const len = H * (0.35 + rand() * 0.3);
    const y0 = top ? 6 : H - 6, y1 = top ? y0 + len : y0 - len;
    g.lineWidth = 7; g.strokeStyle = '#f2c095';
    g.beginPath(); g.moveTo(x, y0); g.quadraticCurveTo(x + (rand() - 0.5) * 14, (y0 + y1) / 2, x + (rand() - 0.5) * 8, y1); g.stroke();
    g.lineWidth = 2.6; g.strokeStyle = '#8a4826';
    g.beginPath(); g.moveTo(x, y0); g.quadraticCurveTo(x + (rand() - 0.5) * 4, (y0 + y1) / 2, x, y1); g.stroke();
  }
  // Matrix granules and a ribosome/DNA speckle.
  g.fillStyle = 'rgba(40,16,6,0.7)';
  for (let i = 0; i < 18; i++) { g.beginPath(); g.arc(rand() * W, rand() * H, 2.5, 0, Math.PI * 2); g.fill(); }
  g.restore();
  stadium(1); g.strokeStyle = '#ffd0a6'; g.lineWidth = 2.2; g.stroke();
  stadium(7); g.strokeStyle = '#f2c095'; g.lineWidth = 1.8; g.stroke();
}
