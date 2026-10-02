// The guided 3-D tour. Each stop flies the camera somewhere, narrates what
// happens there (quoting the live simulation), and lights up the relevant
// molecular traffic. The order follows the energy: light → sugar → where the
// sugar goes → what it pays for → night → growth and division.
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const pct = (x) => `${Math.round(x * 100)}%`;
const lim = (m) => ({ light: 'the amount of light', rubisco: 'how fast Rubisco can work', sink: 'how fast sugar can be used', dark: 'darkness' }[m.f.limiter]);

// Camera helpers in terms of world objects.
const cp = (w) => w.heroCp.pos;
const around = (target, off) => ({ target: target.clone(), pos: target.clone().add(off) });
const sinkShare = (m, v) => v / Math.max(1e-6, Object.values(m.carbonFlows().sinks).reduce((a, b) => a + b, 0));

export const STOPS = [
  // ------------------------------------------------------------------ A
  {
    ch: 'Into the leaf', speed: 0.4, cut: 'closed',
    cam: () => ({ pos: V(62, 34, 92), target: V(0, -2, -6) }), fly: 0.1,
    text: 'We begin in the air spaces inside a leaf. Every green-studded box around us is a living cell. We will follow one of them through a day and see what it does with light.',
  },
  {
    ch: 'Into the leaf', speed: 0.6, cut: 'open',
    cam: (w) => ({ pos: V(10, 9, 58 + (w.h.x - 22)), target: V(0, -2, -5) }), fly: 4,
    text: 'Let’s cut it open. Under the wall is a thin film of living cytoplasm. Most of the volume is one clear sac of water, the vacuole. Chloroplasts line the walls, and the nucleus sits in a pocket at the back.',
    labels: (w) => [
      { p: V(w.h.x - 0.5, w.h.y - 2, 0), text: 'Cell wall', sub: 'cellulose' },
      { p: V(3, 1, -3), text: 'Vacuole', sub: 'water, salts, sugar' },
      { p: w.nucleus.position.clone(), text: 'Nucleus' },
      { p: cp(w).clone(), text: 'Chloroplast' },
    ],
  },
  // ------------------------------------------------------------------ B
  {
    ch: 'It starts with light', speed: 1.5, inset: 'thylakoid', step: 'antenna',
    cam: (w) => around(cp(w), V(2.5, 4.5, 11)), fly: 4, focus: (w) => ({ p: cp(w), r: 14 }),
    text: (m) => `It all starts here, in a chloroplast. Sunlight falling through the leaf (${Math.round(m.f.I)} µmol photons per m² per second right now) is absorbed by chlorophyll, and the chloroplast comes alive.`,
    labels: (w) => [{ p: cp(w).clone(), text: 'Chloroplast', sub: '~5 µm long' }],
  },
  {
    ch: 'It starts with light', speed: 1.5, inset: 'thylakoid', step: 'antenna',
    cam: (w) => around(cp(w), V(0.4, 4.6, 1.6)), fly: 3.5, focus: (w) => ({ p: cp(w), r: 8 }),
    text: 'Inside are stacks of membrane discs called grana, joined by flat sheets. These thylakoid membranes carry the light-harvesting machinery. The pale fluid around them is the stroma.',
    labels: (w) => [
      { p: w.hero.localToWorld(w.granaPos[4].clone()), text: 'Granum', sub: 'stack of thylakoids' },
      { p: w.hero.localToWorld(V(-2.2, -0.1, 0.9)), text: 'Stroma' },
      { p: w.hero.localToWorld(V(2.6, 0, -0.4)), text: 'Double envelope' },
    ],
  },
  {
    ch: 'It starts with light', speed: 1.5, inset: 'thylakoid', step: 'psii', emph: ['o2'], tag: 'o2',
    cam: (w) => ({ target: w.hero.localToWorld(w.granaPos[5].clone()), pos: w.hero.localToWorld(w.granaPos[5].clone()).add(V(-0.3, 1.9, 0.9)) }), fly: 3,
    focus: (w) => ({ p: cp(w), r: 8 }),
    text: 'In these membranes, light splits water. Photosystem II pulls electrons out of water molecules and releases oxygen, which drifts out of the cell. The oxygen you breathe was released this way.',
  },
  {
    ch: 'It starts with light', speed: 1.5, inset: 'thylakoid', step: 'atp',
    cam: null, focus: (w) => ({ p: cp(w), r: 8 }),
    text: (m) => `The electrons’ energy is captured in two carriers, ATP and NADPH. Protons rushing through ATP synthase turn it like a turbine. Electrons are flowing at ${Math.round(m.f.J)} µmol per m² of leaf per second.`,
  },
  // ------------------------------------------------------------------ C
  {
    ch: 'Sugar is made', speed: 2, inset: 'calvin', step: 'co2', emph: ['co2'], tag: 'co2',
    cam: (w) => around(cp(w), V(3, 2.5, 6.5)), fly: 3, focus: (w) => ({ p: cp(w), r: 10 }),
    text: (m) => `Meanwhile carbon dioxide diffuses in from the air spaces, through the wall and into the chloroplast. Air holds only about ${m.env.co2} CO₂ molecules per million, so the cell has to work hard to catch it.`,
  },
  {
    ch: 'Sugar is made', speed: 2, inset: 'calvin', step: 'rubisco', emph: ['co2', 'triose'],
    cam: (w) => around(cp(w), V(-1.0, 3.2, 1.4)), fly: 3, focus: (w) => ({ p: cp(w), r: 8 }),
    text: 'In the stroma, the enzyme Rubisco grabs each CO₂ and fixes it onto a five-carbon sugar. ATP and NADPH from the thylakoids then turn the product into a three-carbon sugar: triose phosphate. This is the first sugar.',
    labels: (w) => [{ p: w.hero.localToWorld(V(-1.6, 0.2, -0.5)), text: 'Rubisco', sub: 'in the stroma, ~3 CO₂ per second each' }],
  },
  {
    ch: 'Sugar is made', speed: 2, inset: 'calvin', step: 'reduce',
    cam: null, focus: (w) => ({ p: cp(w), r: 8 }),
    text: (m) => `Right now this leaf fixes ${m.f.netA.toFixed(1)} µmol of CO₂ per m² every second, limited by ${lim(m)}. Three CO₂ make one triose phosphate; the rest of the cycle’s sugar is recycled to keep Rubisco supplied.`,
  },
  {
    ch: 'Sugar is made', speed: 2.5, inset: 'allocation',
    cam: (w) => ({ target: w.starchGrains[0].getWorldPosition(V()), pos: w.starchGrains[0].getWorldPosition(V()).add(V(0.3, 2.0, 0.9)) }), fly: 3,
    focus: (w) => ({ p: cp(w), r: 8 }),
    text: (m) => `Some of the new sugar stays put, packed into starch grains that swell through the day. It is a lunchbox for the night. Right now ${pct(m.f.fs)} of the new carbon goes into starch.`,
    labels: (w) => [{ p: w.starchGrains[0].getWorldPosition(V()), text: 'Starch grain', sub: 'grows by day, shrinks by night' }],
  },
  {
    ch: 'Sugar is made', speed: 2.5, inset: 'allocation', emph: ['triose', 'sugar'], tag: 'triose',
    cam: (w) => around(cp(w), V(1.5, 1.4, 6.5)), fly: 3, focus: (w) => ({ p: cp(w), r: 9 }),
    text: 'The rest leaves through a transporter in the chloroplast envelope, swapped for phosphate. Out in the cytosol, triose phosphate is built into sucrose, the sugar a plant moves around.',
  },
  // ------------------------------------------------------------------ D
  {
    ch: 'Where the sugar goes', speed: 2.5, inset: 'mito', emph: ['sugar', 'atp'], tag: 'sugar',
    cam: (w) => around(w.heroMitoG.position, V(0.3, 3.0, 1.3)), fly: 3.5, focus: (w) => ({ p: w.heroMitoG.position, r: 10 }),
    text: 'From here sucrose is carried to several destinations. Some goes to mitochondria like this one, cut open to show its folded inner membranes. There it is burned with oxygen to make ATP, the cell’s spendable energy.',
    labels: (w) => [{ p: w.heroMitoG.position.clone(), text: 'Mitochondrion', sub: 'cristae: folded inner membrane' }],
  },
  {
    ch: 'Where the sugar goes', speed: 2.5, inset: 'mito', emph: ['atp'], tag: 'atp',
    cam: (w) => around(w.heroMitoG.position, V(3, 4, 9)), fly: 3, focus: (w) => ({ p: w.heroMitoG.position, r: 14 }),
    text: (m) => `ATP (pale yellow) spreads through the cytosol to power protein building, pumps and wall making. Even in daylight, mitochondria burn about ${m.f.resp.toFixed(1)} pmol of sugar carbon per hour in this one cell.`,
  },
  {
    ch: 'Where the sugar goes', speed: 2.5, inset: 'expression', emph: ['vesicle', 'sugar'], tag: 'vesicle',
    cam: (w) => around(w.nucleus.position.clone().add(V(6, 2, 3)), V(3, 5, 12)), fly: 4, focus: (w) => ({ p: w.nucleus.position.clone().add(V(5, 0, 2)), r: 12 }),
    text: 'Some sugar becomes building material. Golgi stacks (gold) turn it into pectin and hemicellulose and ship them in vesicles to the cell surface, while enzymes in the membrane spin cellulose fibres straight into the wall.',
    labels: (w) => { const g = w.golgi.reduce((a, b) => (b.pos.distanceTo(w.nucleus.position) < a.pos.distanceTo(w.nucleus.position) ? b : a)); return [{ p: g.pos.clone(), text: 'Golgi stack' }, { p: w.nucleus.position.clone().add(V(4.4, 2.5, 2)), text: 'Endoplasmic reticulum' }]; },
  },
  {
    ch: 'Where the sugar goes', speed: 2.5, inset: 'growth', emph: ['h2o', 'k'], tag: 'h2o',
    cam: (w) => ({ pos: V(4, 4, 30), target: V(2, -2, -4) }), fly: 4, focus: () => ({ p: V(0, 0, -4), r: 30 }),
    text: (m) => `Some sugar, with salts like potassium, is stored in the vacuole. These solutes draw water in through aquaporin channels, and the swelling vacuole presses on the wall at ${m.f.P.toFixed(2)} MPa, about three times a car tyre. That pressure drives growth.`,
  },
  {
    ch: 'Where the sugar goes', speed: 2.5, inset: 'allocation', emph: ['sugar'], tag: 'sugar',
    cam: (w) => ({ pos: V(w.h.x - 9, 4, 7), target: V(w.h.x, -1, -4) }), fly: 4, focus: (w) => ({ p: V(w.h.x - 2, 0, -4), r: 14 }),
    text: (m) => `And much of it leaves. Plasmodesmata, tiny channels through the wall, pass sucrose into neighbouring cells on its way to the veins and the rest of the plant. Right now ${pct(sinkShare(m, m.f.export))} of the carbon this cell uses is exported.`,
    labels: (w) => [{ p: w.pdPoint().p, text: 'Plasmodesmata', sub: 'channels to the next cell' }],
  },
  // ------------------------------------------------------------------ E
  {
    ch: 'Costs and supplies', speed: 2.5, inset: 'photoresp', emph: ['glycolate'], tag: 'glycolate',
    cam: (w) => around(cp(w).clone().add(V(1.5, 0, 0)), V(1.5, 5, 9)), fly: 3.5, focus: (w) => ({ p: cp(w), r: 9 }),
    text: (m) => `Rubisco is not perfect. For every 100 CO₂ it fixes, it grabs about ${Math.round(m.f.voRatio * 100)} O₂ by mistake. Cleaning up takes a relay through a peroxisome (violet) and a mitochondrion, and loses ${pct(m.f.prLossFrac)} of the fixed carbon.`,
    labels: (w) => { const px = w.perox.reduce((a, b) => (b.pos && b.pos.distanceTo(cp(w)) < a.pos.distanceTo(cp(w)) ? b : a)); return [{ p: px.pos.clone(), text: 'Peroxisome' }]; },
  },
  {
    ch: 'Costs and supplies', speed: 2.5, inset: 'nitrogen', emph: ['nitrate', 'aa'], tag: 'nitrate',
    cam: (w) => ({ pos: V(-4, -w.h.y + 7, 14), target: V(-2, -w.h.y + 1, -3) }), fly: 4, focus: (w) => ({ p: V(-2, -w.h.y + 1, -3), r: 16 }),
    text: 'Sugar alone cannot build proteins: they also need nitrogen. Nitrate from the roots crosses the membrane on transporter proteins. Inside the chloroplasts it is reduced to ammonium with energy from light, then built into amino acids (green).',
  },
  // ------------------------------------------------------------------ F
  {
    ch: 'The instructions', speed: 2.5, inset: 'expression', emph: ['mrna'], tag: 'mrna',
    cam: (w) => around(w.nucleus.position, V(2.5, 3, 11)), fly: 4, focus: (w) => ({ p: w.nucleus.position, r: 10 }),
    text: 'All of this is directed from the nucleus. Light and sugar levels switch genes on and off, and messenger RNA (red) leaves through thousands of pores in the nuclear envelope.',
    labels: (w) => [{ p: w.nucleus.position.clone().add(V(0, 4.2, 1.5)), text: 'Nuclear pores' }, { p: w.nucleolus.getWorldPosition(V()), text: 'Nucleolus', sub: 'makes ribosomes' }],
  },
  {
    ch: 'The instructions', speed: 2.5, inset: 'expression', emph: ['protein', 'mrna'], tag: 'protein',
    cam: (w) => ({ pos: w.nucleus.position.clone().add(V(9, 6, 16)), target: w.nucleus.position.clone().add(V(9, 0, 0)) }), fly: 4, focus: (w) => ({ p: w.nucleus.position.clone().add(V(8, 0, 0)), r: 16 }),
    text: (m) => `Ribosomes translate the messages into proteins. Many are imported back into the chloroplasts, including the small subunit of Rubisco. Right now ${pct(m.s.phi.photo)} of new protein goes to photosynthesis.`,
  },
  // ------------------------------------------------------------------ G
  {
    ch: 'Night', speed: 12, inset: 'starch', until: (m) => m.f.I < 1, maxWait: 40,
    cam: (w) => ({ pos: V(10, 9, 58 + (w.h.x - 22)), target: V(0, -2, -5) }), fly: 4,
    text: 'The day wears on. As the sun sets, the light reactions stop and the chloroplasts dim. The starch grains are now at their largest.',
  },
  {
    ch: 'Night', speed: 6, inset: 'starch', emph: ['maltose', 'sugar'], tag: 'maltose',
    cam: (w) => around(cp(w), V(0.4, 4.4, 1.8)), fly: 4, focus: (w) => ({ p: cp(w), r: 10 }),
    text: (m) => `Now the starch is broken down, at a pace set by the circadian clock so the store lasts until dawn, about ${Math.max(1, Math.round(m.f.hoursToDawn || 10))} hours away. Maltose leaves the chloroplasts and keeps the mitochondria and growth going all night.`,
  },
  // ------------------------------------------------------------------ H
  {
    ch: 'Growth and division', speed: 30, inset: 'cycle', until: (m) => m.s.phase === 'M', untilNow: true, maxWait: 60,
    enter: (app) => { app.model.cycleHold = false; },
    cam: (w) => ({ pos: V(14, 12, 66 + 1.3 * (w.h.x - 22)), target: V(0, -1, -5) }), fly: 4, follow: 'cell',
    text: 'Time-lapse. Over the next day the cell keeps growing, mostly by filling its vacuole with water, so it lengthens along one axis. It copies its DNA and doubles its organelles.',
  },
  {
    ch: 'Growth and division', speed: 1.6, inset: 'cycle', until: (m) => { const s = m.mSubphase(); return !s || s.name === 'telophase'; }, maxWait: 60,
    cam: (w) => around(V(0, 0, -w.h.z * 0.25), V(4, 6, 24)), fly: 3,
    text: 'When it is large enough, it divides. The nucleus moves to the middle, the chromosomes condense, and spindle fibres pull the two copies of each chromosome apart.',
  },
  {
    ch: 'Growth and division', speed: 2, inset: 'cycle', until: (m) => m.s.phase !== 'M', maxWait: 60,
    cam: (w) => around(V(0, 0, -w.h.z * 0.1), V(10, 8, 34)), fly: 3,
    text: 'A plant cell cannot pinch in two, because of its wall. Instead it builds a new wall, the cell plate, from the middle outward until it meets the old one.',
  },
  {
    ch: 'Growth and division', speed: 3, inset: 'allocation', end: true,
    cam: (w) => ({ pos: V(40, 26, 80), target: V(0, -2, -6) }), fly: 5,
    text: 'Two cells, each starting again. This is how a leaf is built: sunlight into sugar, sugar into the next cell. Now explore freely: drag to look around, scroll to zoom, and click anything to learn what it does.',
  },
];

export class Tour {
  constructor(app) {
    this.app = app;
    this.stops = STOPS;
    this.i = 0;
    this.t = 0;
    this.playing = false;
    this.active = false;
    this.chapters = [...new Set(STOPS.map((s) => s.ch))];
  }

  get stop() { return this.stops[this.i]; }

  start(i = 0) {
    this.active = true;
    this.playing = true;
    this.app.model.cycleHold = true;
    this.goto(i);
  }

  stopTour() {
    this.active = false;
    this.playing = false;
    this.app.model.cycleHold = false;
    this.app.setEmphasis(null, null);
  }

  goto(i) {
    this.i = Math.max(0, Math.min(this.stops.length - 1, i));
    this.t = 0;
    const s = this.stop, app = this.app;
    if (s.enter) s.enter(app);
    if (s.cut === 'closed') app.setCut(false, 0.1);
    else if (s.cut === 'open' || this.i > 1) app.setCut(true, s.cut === 'open' ? 3.5 : 0.1);
    if (s.cam) { const c = s.cam(app.world); app.flyTo(c.pos, c.target, s.fly || 3); }
    app.setInset(s.inset || null, s.step || null);
    app.setSpeed(s.speed || 2);
    app.setEmphasis(s.emph || null, s.tag || null);
    app.onTourChange();
  }

  text() { const s = this.stop; return typeof s.text === 'function' ? s.text(this.app.model) : s.text; }
  duration() { return Math.max(7, this.text().split(/\s+/).length / 3 + 3 + (this.stop.fly || 0) * 0.5); }

  update(dt) {
    if (!this.active) return;
    const s = this.stop, w = this.app.world;
    w.focus = s.focus ? s.focus(w) : null;
    this.app.flows.focus = w.focus;
    this.app.setLabels(s.labels ? s.labels(w) : []);
    if (s.follow === 'cell' && !this.app.camAnim) {
      const c = s.cam(w);
      this.app.drift(c.pos, c.target, dt);
    }
    if (!this.playing) return;
    this.t += dt;
    const minT = this.duration();
    let ready = this.t >= minT;
    if (s.until) {
      const ok = s.until(this.app.model);
      ready = (ok && (this.t >= minT || s.untilNow)) || this.t > minT + (s.maxWait || 30);
    }
    if (ready && !s.end) this.next();
    else if (ready && s.end && this.t > minT + 3) { this.playing = false; this.app.onTourChange(); }
  }

  progress() { return Math.min(1, this.t / this.duration()); }
  next() { if (this.i < this.stops.length - 1) this.goto(this.i + 1); }
  prev() { if (this.i > 0) this.goto(this.i - 1); }
  gotoChapter(name) { this.goto(this.stops.findIndex((s) => s.ch === name)); }
}
