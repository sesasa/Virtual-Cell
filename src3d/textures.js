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
    const f1 = Math.pow(Math.abs(Math.sin((v * 46 + fbm(N, u * 6, v * 2) * 3) * Math.PI)), 6);
    const f2 = Math.pow(Math.abs(Math.sin(((u + v) * 30 + fbm(N, u * 3 + 9, v * 3) * 2) * Math.PI)), 10) * 0.5;
    fib[y * S + x] = f1 * 0.7 + f2 + fbm(N, u * 16, v * 16) * 0.35;
  }
  const wallNormal = normalFromHeight(S, (x, y) => fib[y * S + x], 3);
  const wallColor = canvasTex(S, (g, n) => {
    const img = g.createImageData(n, n);
    for (let i = 0; i < n * n; i++) {
      const h = fib[i];
      img.data[i * 4] = 170 + h * 50; img.data[i * 4 + 1] = 200 + h * 40; img.data[i * 4 + 2] = 175 + h * 40; img.data[i * 4 + 3] = 255;
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
      const band = 0.5 + 0.5 * Math.sin((y / n) * Math.PI * 26 + m * 4);
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
