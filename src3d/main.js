// 3-D tour app: renderer + post-processing, camera flights, labels, UI.
// The physiology (VC.Model) and molecular close-ups (VC.Insets) are shared
// with the schematic view and loaded as classic scripts before this bundle.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { makeTextures } from './textures.js';
import { World } from './world.js';
import { Flows, TYPES } from './flows.js';
import { Tour } from './tour.js';
import { ease, clamp } from './geom.js';
import { INFO } from './info.js';

const VC = window.VC;

// Soft image-based light from inside a leaf: bright green-white above, dim below.
function leafEnvironment() {
  const scene = new THREE.Scene();
  const geo = new THREE.SphereGeometry(10, 32, 16);
  const col = [], pos = geo.attributes.position;
  const top = new THREE.Color(0xe8f6d8), mid = new THREE.Color(0x5f8f58), low = new THREE.Color(0x0c1c14);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 10;
    const c = y > 0 ? mid.clone().lerp(top, y) : mid.clone().lerp(low, -y);
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  return scene;
}
const $ = (id) => document.getElementById(id);

// Film grade: vignette, gentle grain and a hint of lens chromatic aberration.
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, amount: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time; uniform float amount; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5;
      float d = dot(c, c);
      vec2 off = c * d * 0.012 * amount;
      vec4 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      col.a = 1.0;
      col.rgb *= 1.0 - d * 0.95 * amount;
      col.rgb += (hash(vUv * 900.0 + time) - 0.5) * 0.035 * amount;
      gl_FragColor = col;
    }`,
};

class App3D {
  constructor() {
    this.model = new VC.Model();
    this.model.cycleHold = true;
    // Start just before sunrise.
    while (this.model.hour() < 4.9) this.model.advance(1 / 30);

    const canvas = $('gl');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.localClippingEnabled = true;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.tex = makeTextures();
    this.world = new World(this.model, this.tex);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.world.scene.environment = pmrem.fromScene(leafEnvironment(), 0.04).texture;
    this.world.scene.environmentIntensity = 0.55;

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.05, 900);
    this.camera.position.set(62, 34, 92);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 1.2;
    this.controls.maxDistance = 220;
    this.controls.target.set(0, -2, -6);
    this.controls.addEventListener('start', () => { this.userTouched = true; this.camAnim = null; });

    this.flows = new Flows(this.world);

    // Post-processing.
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.world.scene, this.camera));
    this.bokeh = new BokehPass(this.world.scene, this.camera, { focus: 60, aperture: 0.00025, maxblur: 0.006 });
    this.composer.addPass(this.bokeh);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.25, 0.4, 0.95);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());

    this.speed = 1;
    this.paused = false;
    this.insetName = null;
    this.insetStep = null;
    this.tag = null;
    this.labelEls = [];
    this.insetCv = $('inset');
    this.insetG = this.insetCv.getContext('2d');
    this.narrator = new VC.Narrator();
    this.tour = new Tour(this);
    this._ui();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.clock = new THREE.Clock();
    this.uiT = 0;
    this.tour.start(0);
    // Warm-up render, then reveal.
    this.params = new URLSearchParams(location.search);
    this.frameTimes = [];
    if (this.params.has('low')) this.applyQuality('low');
    this.composer.render();
    setTimeout(() => { $('loading').classList.add('gone'); }, 300);
    // ?manual: no animation loop; frames are driven by tick() (used for testing).
    if (!this.params.has('manual')) this.renderer.setAnimationLoop(() => this.loop());
  }

  // Drop expensive effects on slow GPUs.
  applyQuality(level) {
    if (this.quality === level) return;
    this.quality = level;
    const low = level === 'low';
    this.renderer.setPixelRatio(low ? 1 : Math.min(1.75, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = !low;
    this.bokeh.enabled = !low;
    this.world.scene.traverse((o) => {
      if (!o.material) return;
      for (const m of [].concat(o.material)) {
        if (m.transmission !== undefined) {
          if (m.userData.tx === undefined) m.userData.tx = m.transmission;
          m.transmission = low ? 0 : m.userData.tx;
          m.needsUpdate = true;
        }
      }
    });
    this.resize();
  }

  tick(dt = 1 / 30, frames = 1) {
    for (let i = 0; i < frames; i++) { this.skipRender = i < frames - 1; this.loop(dt); }
    this.skipRender = false;
  }

  // ---------------------------------------------------------------- camera
  flyTo(pos, target, dur = 3) {
    this.userTouched = false;
    const p0 = this.camera.position.clone(), t0 = this.controls.target.clone();
    const dist = p0.distanceTo(pos);
    // Arc slightly upward and back on long flights so we don't clip through things.
    const mid = p0.clone().lerp(pos, 0.5).add(new THREE.Vector3(0, dist * 0.12, dist * 0.18));
    this.camAnim = { p0, p1: pos.clone(), mid, t0, t1: target.clone(), u: 0, dur: Math.max(0.05, dur) };
    this.base = { pos: pos.clone(), target: target.clone() };
  }

  drift(pos, target, dt) {
    if (this.userTouched) return;
    const k = 1 - Math.exp(-dt * 0.8);
    this.base.pos.lerp(pos, k);
    this.base.target.lerp(target, k);
  }

  _camera(dt, t) {
    const a = this.camAnim;
    if (a) {
      a.u = Math.min(1, a.u + dt / a.dur);
      const e = ease(a.u);
      const q = new THREE.Vector3()
        .copy(a.p0).multiplyScalar((1 - e) * (1 - e))
        .addScaledVector(a.mid, 2 * (1 - e) * e)
        .addScaledVector(a.p1, e * e);
      this.camera.position.copy(q);
      this.controls.target.lerpVectors(a.t0, a.t1, e);
      if (a.u >= 1) this.camAnim = null;
    } else if (this.tour.active && this.base && !this.userTouched) {
      // Gentle "hand-held" drift around the subject.
      const off = this.base.pos.clone().sub(this.base.target);
      off.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(t * 0.12) * 0.07);
      off.multiplyScalar(1 + Math.sin(t * 0.09) * 0.03);
      this.camera.position.copy(this.base.target).add(off);
      this.controls.target.copy(this.base.target);
    }
    this._frame(dt);
    this.controls.update();
    // Inside the vacuole its glassy skin would fog the view: hide it there.
    const w = this.world, d = w.box.sdf(this.camera.position);
    w.vacuole.visible = d > -3.2;
    w.cytoMat.opacity = d < 0 ? 0.1 : 0.32;
    w.pm.visible = d > -0.5;
    w.heroOpen = d < 0;
    // Focus pulls to the subject.
    const fd = this.camera.position.distanceTo(this.controls.target);
    this.bokeh.uniforms.focus.value = fd;
    this.bokeh.uniforms.aperture.value = this.dof ? 0.0005 / Math.max(3, fd) : 0;
  }

  // Shift the projection so the subject sits in the area not covered by the
  // narration card (bottom) and close-up panel (right).
  _frame(dt) {
    const narr = $('narration'), ins = $('insetBox');
    const wide = this.vw > 760;
    let tx = 0, ty = 0;
    if (this.tour.active && narr.offsetHeight) ty = Math.min(this.vh * 0.16, (narr.offsetHeight + 20) * 0.35);
    if (wide && !ins.hidden && !ins.classList.contains('mini')) tx = Math.min(this.vw * 0.14, (ins.offsetWidth + 20) * 0.28);
    this.off = this.off || { x: 0, y: 0 };
    const k = 1 - Math.exp(-dt * 3);
    this.off.x += (tx - this.off.x) * k;
    this.off.y += (ty - this.off.y) * k;
    const W = this.vw, H = this.vh;
    this.camera.setViewOffset(W + 2 * this.off.x, H + 2 * this.off.y, 2 * this.off.x, 2 * this.off.y, W, H);
    // In portrait, pull the camera back so wide shots still fit.
    this.camera.fov = this.camera.aspect < 1 ? 42 / Math.max(0.55, this.camera.aspect) : 42;
    this.camera.updateProjectionMatrix();
  }

  setCut(open, dur) {
    const w = this.world;
    this.cutAnim = { from: w.cutZ, to: open ? 2.0 : w.h.z + 3, u: 0, dur };
  }

  // ---------------------------------------------------------------- tour hooks
  setInset(name, step) {
    this.insetName = name;
    this.insetStep = step;
    $('insetBox').hidden = !name;
    if (name) $('insetTitle').textContent = VC.Insets.list[name].title;
    $('insetPick').value = name || '';
  }
  setSpeed(s) {
    this.speed = s;
    $('sSpeed').value = Math.round((100 * Math.log(s / 0.25)) / Math.log(480));
    this._speedLabel();
  }
  setEmphasis(types, tag) {
    this.flows.emph = types ? new Set(types) : null;
    this.tag = tag;
  }
  setLabels(list) { this.labels = list; }

  onTourChange() {
    const tr = this.tour, s = tr.stop;
    const ci = tr.chapters.indexOf(s.ch);
    $('chapNum').textContent = `Part ${ci + 1} of ${tr.chapters.length}`;
    $('chapTitle').textContent = s.ch;
    const el = $('narrText');
    el.textContent = tr.text();
    this._lastText = el.textContent;
    el.classList.remove('fade'); void el.offsetWidth; el.classList.add('fade');
    $('btnPlay').textContent = tr.playing ? '❚❚' : '▶';
    [...$('chapterDots').children].forEach((b, i) => { b.classList.toggle('on', i === ci); b.classList.toggle('done', i < ci); });
    $('stopCount').textContent = `${tr.i + 1}/${tr.stops.length}`;
    // Speak each stop once, when it begins.
    const n = this.narrator;
    if (n.enabled && tr.playing && this.spokenStop !== tr.i) { this.spokenStop = tr.i; n.say(tr.text()); }
    else if (n.enabled && !tr.playing) n.pause();
    else if (n.enabled && tr.playing) n.resume();
  }

  toggleVoice(on) {
    const n = this.narrator;
    n.blocked = false;
    n.setEnabled(on);
    const b = $('btnVoice');
    b.classList.toggle('on', n.enabled);
    b.setAttribute('aria-pressed', String(n.enabled));
    b.querySelector('span').textContent = n.enabled ? 'Voice on' : 'Voice off';
    if (n.enabled && this.tour.active) {
      this.spokenStop = this.tour.i;
      this.tour.t = 0;
      n.say(this.tour.text());
    }
  }

  // ---------------------------------------------------------------- UI
  _ui() {
    $('btnPlay').onclick = () => {
      if (!this.tour.active) { this.setMode('tour'); return; }
      this.tour.playing = !this.tour.playing;
      if (this.tour.playing && this.tour.stop.end) { this.restart(); return; }
      this.onTourChange();
    };
    $('btnNext').onclick = () => this.tour.next();
    if (!this.narrator.supported) $('btnVoice').hidden = true;
    $('btnVoice').onclick = () => this.toggleVoice(!this.narrator.enabled);
    {
      const b = $('btnVoice'), on = this.narrator.enabled;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
      b.querySelector('span').textContent = on ? 'Voice on' : 'Voice off';
    }
    // Browsers only allow speech after a click: if voice was left on last time,
    // start talking at the first interaction.
    if (this.narrator.enabled) {
      const kick = (e) => {
        document.removeEventListener('pointerdown', kick, true);
        if (e.target.closest && e.target.closest('#btnVoice')) return;
        this.toggleVoice(true);
      };
      document.addEventListener('pointerdown', kick, true);
    }
    $('btnPrev').onclick = () => this.tour.prev();
    this.tour.chapters.forEach((c) => {
      const b = document.createElement('button');
      b.textContent = c;
      b.onclick = () => { if (!this.tour.active) this.setMode('tour'); this.tour.playing = true; this.tour.gotoChapter(c); };
      $('chapterDots').appendChild(b);
    });
    $('modeTour').onclick = () => this.setMode('tour');
    $('modeExplore').onclick = () => this.setMode('explore');
    $('insetClose').onclick = (e) => { e.stopPropagation(); this.setInset(null); };
    $('insetPick').onchange = (e) => this.setInset(e.target.value || null, null);
    if (window.innerWidth < 600) $('insetBox').classList.add('mini');
    document.querySelector('.inset-head').onclick = () => $('insetBox').classList.toggle('mini');
    $('narrText').onclick = () => $('narration').classList.toggle('open');
    const env = this.model.env;
    const bind = (id, out, key, fmt) => {
      const el = $(id); el.value = env[key];
      const upd = () => { env[key] = parseFloat(el.value); $(out).textContent = fmt(env[key]); };
      el.addEventListener('input', upd); upd();
    };
    bind('sLight', 'vLight', 'lightMax', (v) => `${v}`);
    bind('sCo2', 'vCo2', 'co2', (v) => `${v} ppm`);
    bind('sTemp', 'vTemp', 'temp', (v) => `${v} °C`);
    bind('sNo3', 'vNo3', 'nitrate', (v) => `${v.toFixed(1)} mM`);
    bind('sWater', 'vWater', 'water', (v) => `${v.toFixed(2)} MPa`);
    $('sSpeed').addEventListener('input', (e) => { this.speed = 0.25 * Math.pow(480, e.target.value / 100); this._speedLabel(); });
    $('btnPause').onclick = () => { this.paused = !this.paused; $('btnPause').textContent = this.paused ? '▶' : '❚❚'; };
    $('dofBtn').onclick = (e) => { this.dof = !this.dof; e.currentTarget.classList.toggle('on', this.dof); };
    $('cutBtn').onclick = () => this.setCut(this.world.cutZ > this.world.h.z, 1.5);
    this.dof = true;
    // Click to identify.
    const canvas = $('gl');
    const ray = new THREE.Raycaster();
    let down = null;
    canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
    canvas.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      const r = canvas.getBoundingClientRect();
      const m = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(m, this.camera);
      const hits = ray.intersectObjects([this.world.org, this.world.envelope, this.world.neighbors], true);
      for (const h of hits) {
        if (h.point.z > this.world.cutZ + 0.01 && h.object !== this.world.neighbors) continue;
        let o = h.object, kind = null;
        while (o && !kind) { kind = o.userData && o.userData.kind; o = o.parent; }
        if (kind && INFO[kind]) { this.showInfo(kind, h.point, e.clientX - r.left, e.clientY - r.top); return; }
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.key === ' ') { e.preventDefault(); $('btnPlay').click(); }
      if (e.key === 'ArrowRight') this.tour.next();
      if (e.key === 'ArrowLeft') this.tour.prev();
    });
  }

  restart() {
    this.spokenStop = null;
    this.model.reset();
    while (this.model.hour() < 4.9) this.model.advance(1 / 30);
    this.flows.clear();
    this.tour.start(0);
  }

  setMode(mode) {
    const explore = mode === 'explore';
    document.body.classList.toggle('explore', explore);
    $('modeTour').classList.toggle('on', !explore);
    $('modeExplore').classList.toggle('on', explore);
    if (explore) {
      this.narrator.stop();
      this.spokenStop = null;
      this.tour.stopTour();
      this.labels = [];
      this.world.focus = null; this.flows.focus = null;
      this.setSpeed(8);
      this.setCut(true, 1);
      this.flyTo(new THREE.Vector3(10, 9, 58), new THREE.Vector3(0, -2, -5), 2);
      if (!this.insetName) this.setInset('allocation');
    } else {
      $('info').hidden = true;
      this.tour.start(Math.max(0, this.tour.i));
    }
  }

  showInfo(kind, point, sx, sy) {
    const info = INFO[kind];
    const box = $('info');
    box.hidden = false;
    const vw = this.vw, vh = this.vh, cw = Math.min(320, vw - 24);
    box.style.left = `${sx + 20 + cw < vw ? sx + 20 : Math.max(10, sx - 20 - cw)}px`;
    box.style.top = `${clamp(sy - 60, 60, Math.max(60, vh - 240))}px`;
    box.innerHTML = `<h3>${info.title}</h3><p>${info.text}</p><dl>${info.stats(this.model).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl><div class="row">${info.inset ? '<button class="btn" id="infoInset">Close-up</button>' : ''}<button class="btn" id="infoGo">Fly here</button><button class="btn" id="infoX">Close</button></div>`;
    if (info.inset) $('infoInset').onclick = () => this.setInset(info.inset, null);
    $('infoGo').onclick = () => {
      const dir = this.camera.position.clone().sub(point).normalize();
      this.flyTo(point.clone().addScaledVector(dir, info.dist || 8), point.clone(), 2);
    };
    $('infoX').onclick = () => { box.hidden = true; };
  }

  _speedLabel() {
    const s = this.speed;
    $('vSpeed').textContent = s < 1 ? `${Math.round(s * 60)} s/s` : s < 60 ? `${s.toFixed(s < 10 ? 1 : 0)} min/s` : `${(s / 60).toFixed(1)} h/s`;
  }

  resize() {
    const vp = $('viewport').getBoundingClientRect();
    this.vw = vp.width; this.vh = vp.height;
    this.renderer.setSize(vp.width, vp.height, false);
    this.composer.setSize(vp.width, vp.height);
    this.camera.aspect = vp.width / vp.height;
    this.camera.updateProjectionMatrix();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.insetCv.width = VC.Insets.W * dpr; this.insetCv.height = VC.Insets.H * dpr;
    this.insetDpr = dpr;
  }

  // ---------------------------------------------------------------- frame
  loop(fixedDt) {
    const real = this.clock.getDelta();
    const dt = fixedDt || Math.min(0.05, real);
    this.simT = (this.simT || 0) + dt;
    const t = this.simT;
    // Adapt quality after a couple of seconds if frames are slow.
    if (!fixedDt && !this.quality) {
      this.frameTimes.push(real);
      if (this.frameTimes.length === 90) {
        const avg = this.frameTimes.slice(30).reduce((a, b) => a + b, 0) / 60;
        this.applyQuality(avg > 0.045 ? 'low' : 'high');
      }
    }
    if (!this.paused) this.model.advance((this.speed * dt) / 60);
    if (this.cutAnim) {
      const c = this.cutAnim;
      c.u = Math.min(1, c.u + dt / c.dur);
      this.world.cutZ = c.from + (c.to - c.from) * ease(c.u);
      if (c.u >= 1) this.cutAnim = null;
    }
    this.world.update(this.paused ? 0 : dt);
    if (!this.paused) { this.flows.spawn(dt, this.model); this.flows.update(dt, t, this.camera.position); }
    this.tour.update(dt);
    this._camera(dt, t);
    this.grade.uniforms.time.value = t;
    const day = Math.min(1, (this.model.f.I || 0) / 600);
    this.renderer.toneMappingExposure = 0.62 + 0.3 * day;
    if (!this.skipRender) this.composer.render();
    this._labels();
    this._drawInset(t);
    this.uiT += dt;
    if (this.uiT > 0.25) { this.uiT = 0; this._hud(); }
  }

  _project(p) {
    const v = p.clone().project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.vw, y: (-v.y * 0.5 + 0.5) * this.vh, behind: v.z > 1 };
  }

  _labels() {
    const layer = $('labels');
    const list = this.labels || [];
    while (this.labelEls.length < list.length) {
      const d = document.createElement('div');
      d.className = 'lbl';
      d.innerHTML = '<i></i><span><b></b><small></small></span>';
      layer.appendChild(d);
      this.labelEls.push(d);
    }
    this.labelEls.forEach((el, i) => {
      const L = list[i];
      if (!L) { el.style.display = 'none'; return; }
      const s = this._project(L.p);
      if (s.behind || s.x < -20 || s.y < -20 || s.x > this.vw + 20 || s.y > this.vh + 20) { el.style.display = 'none'; return; }
      if (this._covered(s.x, s.y)) { el.style.display = 'none'; return; }
      el.style.display = '';
      el.classList.toggle('flip', s.x > this.vw - 240);
      el.style.transform = `translate(${s.x}px, ${s.y}px)`;
      el.querySelector('b').textContent = L.text;
      el.querySelector('small').textContent = L.sub || '';
    });
    // Caption that rides along with one molecule.
    const chip = $('tagChip');
    const p = this.tag ? this.flows.representative(this.tag) : null;
    if (p) {
      const s = this._project(p.pos);
      if (!s.behind) {
        chip.hidden = false;
        chip.style.transform = `translate(${s.x}px, ${s.y}px)`;
        chip.querySelector('span').textContent = TYPES[this.tag].label;
        chip.style.setProperty('--c', `#${TYPES[this.tag].color.toString(16).padStart(6, '0')}`);
        return;
      }
    }
    chip.hidden = true;
  }

  _covered(x, y) {
    for (const id of ['narration', 'insetBox', 'hud', 'drawer']) {
      const el = $(id);
      if (!el || el.hidden || !el.offsetParent) continue;
      const r = el.getBoundingClientRect(), v = $('viewport').getBoundingClientRect();
      if (x > r.left - v.left - 8 && x < r.right - v.left + 8 && y > r.top - v.top - 8 && y < r.bottom - v.top + 8) return true;
    }
    return false;
  }

  _drawInset(t) {
    if (!this.insetName) return;
    const ins = VC.Insets.list[this.insetName];
    const g = this.insetG;
    g.setTransform(this.insetDpr, 0, 0, this.insetDpr, 0, 0);
    g.fillStyle = '#0a1719';
    g.fillRect(0, 0, VC.Insets.W, VC.Insets.H);
    this.model._cpVisible = this.world.chloroplasts.length;
    ins.draw(g, t, this.model);
    if (this.insetStep && ins.steps && ins.steps[this.insetStep]) VC.Insets.spot(g, ins.steps[this.insetStep], t);
  }

  _hud() {
    const m = this.model, f = m.f, s = m.s;
    const c = VC.U.fmtClock(s.t);
    $('clockText').textContent = `Day ${c.day} · ${c.text}`;
    $('sky').classList.toggle('night', f.I < 2);
    const sub = m.mSubphase();
    $('phaseChip').textContent = sub ? `Dividing · ${sub.name}` : s.phase === 'G1' ? 'Growing (G1)' : s.phase === 'S' ? 'Copying DNA (S)' : 'Preparing (G2)';
    const vals = {
      hLight: `${Math.round(f.I)}`, hA: f.netA.toFixed(1), hStarch: s.starch.toFixed(0),
      hSugar: (s.suc + s.vsug).toFixed(0), hP: f.P.toFixed(2), hV: (s.V / 1000).toFixed(1),
    };
    for (const k in vals) $(k).textContent = vals[k];
    // Scale bar for the distance to the subject.
    const d = this.camera.position.distanceTo(this.controls.target);
    const pxPerUm = this.vh / (2 * d * Math.tan((this.camera.fov * Math.PI) / 360));
    const um = [0.5, 1, 2, 5, 10, 20, 50].find((u) => u * pxPerUm > 60) || 50;
    $('scaleBar').style.width = `${Math.round(um * pxPerUm)}px`;
    $('scaleLabel').textContent = `${um} µm`;
    if (this.tour.active) {
      $('narrBar').style.width = `${Math.round(this.tour.progress() * 100)}%`;
      const txt = this.tour.text();
      if (txt !== this._lastText) { $('narrText').textContent = txt; this._lastText = txt; }
    }
  }
}

function boot() {
  try {
    window.VC.app3d = new App3D();
  } catch (e) {
    console.error(e);
    $('loading').innerHTML = `<p>This 3-D view needs WebGL, which isn’t available here.</p><p><a href="schematic.html">Open the schematic view instead</a></p>`;
  }
}
if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', boot); else boot();
