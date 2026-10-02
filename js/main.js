// App controller: main loop, UI wiring, story/explore modes.
(function (VC) {
  'use strict';
  const U = VC.U;
  const $ = (id) => document.getElementById(id);

  const SPEED_MIN = 0.25, SPEED_MAX = 120; // simulated minutes per real second
  const sliderToSpeed = (v) => SPEED_MIN * Math.pow(SPEED_MAX / SPEED_MIN, v / 100);
  const speedToSlider = (s) => (100 * Math.log(s / SPEED_MIN)) / Math.log(SPEED_MAX / SPEED_MIN);

  const INFO = {
    chloroplast: {
      title: 'Chloroplast', inset: 'thylakoid',
      text: 'Captures light, splits water and fixes CO₂ into sugar. Thylakoid stacks (grana) hold the light machinery; Rubisco works in the surrounding stroma. White grains are starch. Has its own DNA and divides by fission.',
      stats: (m) => [['CO₂ fixed (cell)', `${U.fmt(m.f.fixC, 1)} pmol C/h`], ['Limited by', m.f.limiter], ['Starch (cell)', `${U.fmt(m.s.starch, 0)} pmol C`], ['Heat dissipation (NPQ)', `${Math.round(m.s.npq * 100)}%`]],
    },
    mito: {
      title: 'Mitochondrion', inset: 'mito',
      text: 'Burns sugar through glycolysis and the TCA cycle, and makes ATP with an electron transport chain on its folded inner membrane (cristae). Also part of the photorespiration relay.',
      stats: (m) => [['Respiration (cell)', `${U.fmt(m.f.resp, 2)} pmol C/h`], ['ATP made', `${U.fmt(m.f.atpMito, 1)} pmol/h`]],
    },
    perox: {
      title: 'Peroxisome', inset: 'photoresp',
      text: 'Converts glycolate to glycine during photorespiration. The hydrogen peroxide this makes is destroyed by catalase, which often forms a crystal in plant peroxisomes.',
      stats: (m) => [['Rubisco oxygenation', `${U.fmt(m.f.Vo, 1)} µmol m⁻² s⁻¹`], ['C lost to photorespiration', `${Math.round(m.f.prLossFrac * 100)}%`]],
    },
    golgi: {
      title: 'Golgi stack', inset: 'expression',
      text: 'Plant cells have many small mobile Golgi stacks. They build pectin and hemicellulose for the wall and sort membrane proteins into vesicles.',
      stats: (m) => [['Wall synthesis', `${U.fmt(m.f.wallSyn, 2)} pmol C/h`]],
    },
    nucleus: {
      title: 'Nucleus', inset: 'expression',
      text: 'Holds the genome and decides which genes are on. Sugar, light and nitrogen signals change the mix of proteins the cell makes.',
      stats: (m) => [['Cell-cycle phase', m.s.phase], ['DNA content', `${U.fmt(m.s.dna, 1)}C`], ['Protein to photosynthesis', `${Math.round(m.s.phi.photo * 100)}%`], ['Protein synthesis', `${U.fmt(m.f.protSynActual, 2)} pmol N/h`]],
    },
    vacuole: {
      title: 'Central vacuole', inset: 'growth',
      text: 'A water-filled store of potassium, nitrate, sugars and other solutes. Its osmotic pull draws in water, building the turgor pressure that drives growth.',
      stats: (m) => [['Osmotic pressure', `${U.fmt(m.f.pi, 2)} MPa`], ['Turgor', `${U.fmt(m.f.P, 2)} MPa`], ['Stored nitrate', `${U.fmt(m.s.no3v, 2)} pmol`], ['Stored sugar', `${U.fmt(m.s.vsug, 1)} pmol C`]],
    },
    wall: {
      title: 'Cell wall', inset: 'growth',
      text: 'Cellulose microfibrils in a matrix of pectin and hemicellulose. Acidified by proton pumps, expansins loosen it so turgor can stretch it.',
      stats: (m) => [['Wall pH', U.fmt(m.s.pH, 1)], ['Thickness vs. target', `${Math.round(m.f.wallRatio * 100)}%`], ['Growth rate', `${U.fmt(m.f.rgr * 100, 2)} %/h`]],
    },
    pm: {
      title: 'Plasma membrane', inset: 'nitrogen',
      text: 'Studded with transporters: H⁺-ATPases (orange-red), aquaporins (blue), K⁺ channels (pink), nitrate transporters (violet), sugar transporters (orange) and cellulose synthase rosettes (cream). Zoom in to see them.',
      stats: (m) => [['Nitrate uptake', `${U.fmt(m.f.nUptake, 2)} pmol/h`], ['K⁺ uptake', `${U.fmt(m.f.Kup, 2)} pmol/h`], ['Water in', `${U.fmt(m.f.dV, 0)} µm³/h`]],
    },
    plasmodesma: {
      title: 'Plasmodesma', inset: 'allocation',
      text: 'A membrane-lined channel through the wall that joins this cell’s cytoplasm to its neighbour’s. Sucrose moves through these on its way to the veins.',
      stats: (m) => [['Sugar export', `${U.fmt(m.f.export, 1)} pmol C/h`]],
    },
    cytosol: {
      title: 'Cytosol', inset: 'allocation',
      text: 'The fluid where sucrose is made, amino acids and proteins are assembled, and sugar is shared out among competing uses.',
      stats: (m) => [['Cytosolic sugar', `${U.fmt(m.s.suc, 1)} pmol C`], ['Amino acids', `${U.fmt(m.s.aa, 2)} pmol N`], ['Cytosol ATP level', `${Math.round(m.s.atpC * 100)}%`]],
    },
    air: {
      title: 'Intercellular air space', inset: 'calvin',
      text: 'Connected to the outside through stomata. CO₂ diffuses in and O₂ and water vapour diffuse out.',
      stats: (m) => [['CO₂ outside leaf', `${m.env.co2} ppm`], ['CO₂ in leaf', `${U.fmt(m.f.Ci, 0)} ppm`], ['O₂ released', `${U.fmt(m.f.o2, 1)} pmol/h`]],
    },
    neighbor: { title: 'Neighbouring cell', inset: null, text: 'Another mesophyll cell running the same program. Sugar and signals pass between cells through plasmodesmata.', stats: () => [] },
    sister: { title: 'Sister cell', inset: 'cycle', text: 'Born from the same division as the focal cell. Each daughter inherited about half of the organelles, proteins and stores.', stats: (m) => [['Generation', String(m.s.gen)]] },
  };

  class App {
    constructor() {
      this.model = new VC.Model();
      this.scene = new VC.Scene(this.model);
      this.particles = new VC.Particles(this.scene);
      this.renderer = new VC.Renderer($('cell'), this.scene, this.model, this.particles);
      this.charts = new VC.Charts($('vitals'), this.model);
      this.story = new VC.Story(this);
      this.speed = 1;
      this.paused = false;
      this.currentInset = null;
      this.userGroups = { ...this.particles.enabled };
      this.uiTick = 0;
      this.insetCv = $('inset');
      this.insetCtx = this.insetCv.getContext('2d');
      this.scene.onDivided = () => {
        this.particles.clear();
        const r = this.renderer;
        const fit = r.fitCell(this.story.active && this.story.beat.cam === 'cell' ? 1.25 : 1.6);
        r.cam.x = fit.x; r.cam.y = fit.y; r.cam.z = fit.z; r.cam.anim = null;
      };
      this.model.onEvent = () => { this.diaryDirty = true; };
      this._ui();
      this._fitInsetCanvas();
      this._updateUI();
      for (const k in this.renderer.safe) this.renderer.safe[k] = this.renderer.safeTarget[k];
      this.renderer.cam.x = 0; this.renderer.cam.y = 0;
      const wide = this.renderer.fitCell(2.3);
      this.renderer.cam.z = wide.z;
      this.story.start(0);
      this.last = performance.now();
      requestAnimationFrame((t) => this.loop(t));
    }

    // ---------- story hooks ----------
    setInset(name) {
      this.currentInset = name || null;
      const box = $('insetBox');
      if (!name) { box.hidden = true; $('insetPick').value = ''; return; }
      box.hidden = false;
      $('insetTitle').textContent = VC.Insets.list[name].title;
      $('insetPick').value = name;
    }

    setGroups(groups) {
      this.storyGroups = groups;
      for (const g in this.particles.enabled) {
        this.particles.enabled[g] = groups ? groups.includes(g) && this.userGroups[g] : this.userGroups[g];
      }
      this._legendState();
    }

    setSpeed(s, fromStory) {
      this.speed = U.clamp(s, SPEED_MIN, SPEED_MAX);
      $('sSpeed').value = speedToSlider(this.speed);
      this._speedLabel();
    }

    flashNote(text) {
      const t = $('toast');
      t.textContent = text;
      t.hidden = false;
      clearTimeout(this._toastT);
      this._toastT = setTimeout(() => { t.hidden = true; }, 2600);
    }

    onStoryChange() {
      const st = this.story;
      $('chapNum').textContent = `Chapter ${st.ci + 1} of ${st.chapters.length}`;
      $('chapTitle').textContent = st.chapters[st.ci].title;
      const el = $('narrText');
      el.textContent = st.text();
      el.classList.remove('fade'); void el.offsetWidth; el.classList.add('fade');
      this._lastText = el.textContent;
      $('btnPlay').textContent = st.playing ? '❚❚' : '▶';
      $('btnPlay').setAttribute('aria-label', st.playing ? 'Pause story' : 'Play story');
      [...$('chapterDots').children].forEach((b, i) => { b.classList.toggle('on', i === st.ci); b.classList.toggle('done', i < st.ci); });
    }

    // ---------- UI ----------
    _ui() {
      // Mode switch.
      $('modeStory').onclick = () => this.setMode('story');
      $('modeExplore').onclick = () => this.setMode('explore');
      // Story controls.
      $('btnPlay').onclick = () => {
        const st = this.story;
        if (!st.active) { this.setMode('story'); return; }
        st.playing = !st.playing;
        if (st.playing && st.beat.end && st.t > st.duration()) st.goto(0, 0);
        this.onStoryChange();
      };
      $('btnNext').onclick = () => { this.story.next(); };
      $('btnPrev').onclick = () => { this.story.prev(); };
      const dots = $('chapterDots');
      this.story.chapters.forEach((c, i) => {
        const b = document.createElement('button');
        b.textContent = String(i + 1);
        b.title = c.title;
        b.onclick = () => { if (!this.story.active) this.setMode('story', i); else { this.story.playing = true; this.story.goto(i, 0); } };
        dots.appendChild(b);
      });
      // Legend.
      const legend = $('legend');
      const groupColor = { light: '#ffe680', carbon: '#ff9419', photoresp: '#ff6fb5', energy: '#fff59d', nitrogen: '#b98cff', genes: '#ff5a5a', water: '#4f9dff' };
      for (const [g, name] of Object.entries(VC.Particles.GROUPS)) {
        const b = document.createElement('button');
        b.dataset.group = g;
        b.innerHTML = `<i style="background:${groupColor[g]}"></i>${name}`;
        b.title = 'Show or hide these molecules';
        b.onclick = () => {
          this.userGroups[g] = !this.userGroups[g];
          this.setGroups(this.storyGroups);
        };
        legend.appendChild(b);
      }
      // Environment sliders.
      const env = this.model.env;
      const bind = (id, out, key, fmt, parse = parseFloat) => {
        const el = $(id);
        el.value = env[key];
        const upd = () => { env[key] = parse(el.value); $(out).textContent = fmt(env[key]); };
        el.addEventListener('input', upd);
        upd();
      };
      bind('sLight', 'vLight', 'lightMax', (v) => `${v} µmol m⁻² s⁻¹`);
      bind('sDay', 'vDay', 'dayLength', (v) => `${v} h`);
      bind('sCo2', 'vCo2', 'co2', (v) => `${v} ppm`);
      bind('sTemp', 'vTemp', 'temp', (v) => `${v} °C`);
      bind('sNo3', 'vNo3', 'nitrate', (v) => `${v.toFixed(1)} mM`);
      bind('sWater', 'vWater', 'water', (v) => `${v.toFixed(2)} MPa`);
      $('cConst').onchange = (e) => { env.constantLight = e.target.checked; };
      $('sSpeed').addEventListener('input', (e) => { this.speed = sliderToSpeed(+e.target.value); this._speedLabel(); });
      $('btnPause').onclick = () => {
        this.paused = !this.paused;
        $('btnPause').textContent = this.paused ? '▶' : '❚❚';
        $('btnPause').setAttribute('aria-label', this.paused ? 'Resume simulation' : 'Pause simulation');
      };
      $('btnReset').onclick = () => {
        this.model.reset();
        this.scene.seed += 3;
        this.scene._build();
        this.particles.clear();
        this.diaryDirty = true;
        const f = this.renderer.fitCell(1.25);
        this.renderer.cam.flyTo(f.x, f.y, f.z, 1);
        if (this.story.active) this.story.goto(0, 0);
      };
      $('insetPick').onchange = (e) => this.setInset(e.target.value || null);
      $('insetClose').onclick = () => this.setInset(null);
      // View controls.
      const zoomBy = (k) => { const c = this.renderer.cam; c.flyTo(c.x, c.y, U.clamp(c.z * k, 0.4, 40), 0.4); };
      $('zoomIn').onclick = () => zoomBy(1.6);
      $('zoomOut').onclick = () => zoomBy(1 / 1.6);
      $('zoomFit').onclick = () => { const f = this.renderer.fitCell(1.25); this.renderer.cam.flyTo(f.x, f.y, f.z, 0.8); };
      $('labelsBtn').onclick = (e) => { this.renderer.showLabels = !this.renderer.showLabels; e.currentTarget.classList.toggle('on', this.renderer.showLabels); };

      // Canvas interaction: drag to pan, wheel to zoom, hover to name, click for details.
      const cv = $('cell');
      let drag = null;
      cv.addEventListener('pointerdown', (e) => {
        drag = { x: e.clientX, y: e.clientY, cx: this.renderer.cam.x, cy: this.renderer.cam.y, moved: false };
        cv.setPointerCapture(e.pointerId);
      });
      cv.addEventListener('pointermove', (e) => {
        const r = cv.getBoundingClientRect();
        if (drag) {
          const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
          if (Math.abs(dx) + Math.abs(dy) > 4) {
            drag.moved = true;
            cv.classList.add('dragging');
            const c = this.renderer.cam;
            c.anim = null;
            c.x = drag.cx - dx / this.renderer.S;
            c.y = drag.cy - dy / this.renderer.S;
            this.userCam = true;
          }
          return;
        }
        this._hover(e.clientX - r.left, e.clientY - r.top);
      });
      cv.addEventListener('pointerup', (e) => {
        const r = cv.getBoundingClientRect();
        cv.classList.remove('dragging');
        if (drag && !drag.moved) this._click(e.clientX - r.left, e.clientY - r.top);
        drag = null;
      });
      cv.addEventListener('pointerleave', () => { this.renderer.hover = null; });
      cv.addEventListener('wheel', (e) => {
        e.preventDefault();
        const r = cv.getBoundingClientRect();
        const c = this.renderer.cam;
        const before = this.renderer.toWorld(e.clientX - r.left, e.clientY - r.top);
        c.anim = null;
        c.z = U.clamp(c.z * Math.exp(-e.deltaY * 0.0015), 0.4, 40);
        const after = this.renderer.toWorld(e.clientX - r.left, e.clientY - r.top);
        c.x += before.x - after.x; c.y += before.y - after.y;
      }, { passive: false });
      window.addEventListener('resize', () => { this.renderer.resize(); this._fitInsetCanvas(); });
      document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
        if (e.key === ' ') { e.preventDefault(); $('btnPlay').click(); }
        if (e.key === 'ArrowRight') this.story.next();
        if (e.key === 'ArrowLeft') this.story.prev();
      });
    }

    setMode(mode, chapter = 0) {
      const explore = mode === 'explore';
      document.body.classList.toggle('explore', explore);
      $('modeStory').classList.toggle('on', !explore);
      $('modeExplore').classList.toggle('on', explore);
      $('modeStory').setAttribute('aria-selected', String(!explore));
      $('modeExplore').setAttribute('aria-selected', String(explore));
      if (explore) {
        this.story.stop();
        this.setSpeed(10);
        const f = this.renderer.fitCell(1.25);
        this.renderer.cam.flyTo(f.x, f.y, f.z, 1);
        if (!this.currentInset) this.setInset('allocation');
      } else {
        $('info').hidden = true;
        this.story.start(chapter);
      }
    }

    _hover(sx, sy) {
      const hit = this.renderer.pick(sx, sy);
      const info = hit && INFO[hit.kind];
      this.renderer.hover = info && hit.kind !== 'air' && hit.kind !== 'neighbor' ? { label: { x: hit.obj.x, y: hit.obj.y, text: info.title } } : null;
    }

    _click(sx, sy) {
      const hit = this.renderer.pick(sx, sy);
      if (!hit) return;
      const info = INFO[hit.kind];
      if (!info) return;
      const box = $('info');
      this.infoKind = hit.kind;
      box.hidden = false;
      box.innerHTML = `<h3>${info.title}</h3><p>${info.text}</p><dl id="infoStats"></dl><div class="row">${info.inset ? '<button class="btn" id="infoInset">Show close-up</button>' : ''}<button class="btn" id="infoZoom">Zoom here</button><button class="btn" id="infoClose">Close</button></div>`;
      this._infoStats();
      if (info.inset) $('infoInset').onclick = () => this.setInset(info.inset);
      $('infoZoom').onclick = () => { const c = this.renderer.cam; c.flyTo(hit.obj.x, hit.obj.y, Math.max(c.z * 2.2, 5), 1); };
      $('infoClose').onclick = () => { box.hidden = true; this.infoKind = null; };
    }

    _infoStats() {
      if (!this.infoKind || $('info').hidden) return;
      const dl = $('infoStats');
      if (!dl) return;
      const rows = INFO[this.infoKind].stats(this.model);
      dl.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    }

    _legendState() {
      for (const b of $('legend').children) {
        const g = b.dataset.group;
        b.classList.toggle('off', !this.userGroups[g]);
        b.classList.toggle('dim', this.userGroups[g] && !this.particles.enabled[g]);
      }
    }

    _speedLabel() {
      const s = this.speed;
      $('vSpeed').textContent = s < 1 ? `${Math.round(s * 60)} sim-s per s` : s < 60 ? `${U.fmt(s, s < 10 ? 1 : 0)} sim-min per s` : `${U.fmt(s / 60, 1)} sim-h per s`;
    }

    _fitInsetCanvas() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.insetCv.width = Math.round(VC.Insets.W * dpr);
      this.insetCv.height = Math.round(VC.Insets.H * dpr);
      this.insetDpr = dpr;
    }

    _drawInset(time) {
      if (!this.currentInset) return;
      const ins = VC.Insets.list[this.currentInset];
      const g = this.insetCtx;
      g.setTransform(this.insetDpr, 0, 0, this.insetDpr, 0, 0);
      g.clearRect(0, 0, VC.Insets.W, VC.Insets.H);
      g.fillStyle = '#0a1719';
      g.fillRect(0, 0, VC.Insets.W, VC.Insets.H);
      this.model._cpVisible = this.scene.layout.chloroplasts.length;
      ins.draw(g, time, this.model);
    }

    _updateUI() {
      const m = this.model;
      // Keep the camera's subject clear of the narration card and the close-up.
      const r = this.renderer, narr = $('narration'), ins = $('insetBox');
      const wide = r.cw > 760;
      r.safeTarget.b = this.story.active && narr.offsetHeight ? narr.offsetHeight + 20 : 0;
      r.safeTarget.r = wide && !ins.hidden ? (ins.offsetWidth + 24) * 0.8 : 0;
      r.safeTarget.t = !wide && !ins.hidden ? ins.offsetHeight + 10 : 0;
      const c = U.fmtClock(m.s.t);
      $('clockText').textContent = `Day ${c.day} · ${c.text}`;
      $('sky').classList.toggle('night', (m.f.I || 0) < 2);
      const sub = m.mSubphase();
      $('phaseChip').textContent = sub ? `M · ${sub.name}` : m.s.phase === 'G1' ? 'G1 · growing' : m.s.phase === 'S' ? 'S · copying DNA' : 'G2 · preparing';
      const lim = { light: 'light-limited', rubisco: 'Rubisco-limited', sink: 'sink-limited', dark: 'dark: living on starch' }[m.f.limiter];
      $('limChip').textContent = lim;
      $('gAtpS').style.width = `${Math.round(m.s.atpS * 100)}%`;
      $('gNadph').style.width = `${Math.round(m.s.nadph * 100)}%`;
      $('gAtpC').style.width = `${Math.round(m.s.atpC * 100)}%`;
      this.charts.draw();
      this._infoStats();
      if (this.story.active) {
        const p = this.story.progress();
        $('narrBar').style.width = `${Math.round(p * 100)}%`;
        const txt = this.story.text();
        if (txt !== this._lastText) { $('narrText').textContent = txt; this._lastText = txt; }
      }
      if (this.diaryDirty) {
        this.diaryDirty = false;
        const ev = m.events.slice(-30).reverse();
        $('diary').innerHTML = ev.map((e) => { const cc = U.fmtClock(e.t); return `<li class="${e.kind}"><time>D${cc.day} ${cc.text}</time><span>${e.text}</span></li>`; }).join('');
      }
    }

    loop(now) {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      const running = !this.paused;
      if (running) this.model.advance((this.speed * dt) / 60);
      this.scene.update(running ? dt : 0);
      if (running) {
        this.particles.spawn(dt, this.model);
        this.particles.update(dt, now / 1000);
      }
      this.story.update(dt);
      this.renderer.draw(dt);
      this._drawInset(now / 1000);
      this.uiTick += dt;
      if (this.uiTick > 0.2) { this.uiTick = 0; this._updateUI(); }
      requestAnimationFrame((t) => this.loop(t));
    }
  }

  window.addEventListener('DOMContentLoaded', () => { VC.app = new App(); });
})(window.VC);
