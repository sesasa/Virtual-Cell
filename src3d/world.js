// The 3-D scene: a cut-away mesophyll cell inside leaf tissue.
//
// Sizes are close to real (µm): the cell is ~44 × 26 × 26 µm at birth,
// chloroplasts ~5.5 × 3.4 × 1.8 µm, mitochondria ~1.6 × 0.6 µm, the nucleus
// ~9 µm across. Molecules (in flows.js) are drawn far larger than life.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundBox, roundBoxGeometry, blobGeometry, capsuleGeometry, alignY, rng, clamp, lerp } from './geom.js';

const BASE = new THREE.Vector3(22, 13, 13);
const RADIUS = 6;
const WALL = 0.9;
const CYTO = 3.0; // cytoplasm thickness between plasma membrane and tonoplast

export class World {
  constructor(model, tex) {
    this.model = model;
    this.tex = tex;
    this.scene = new THREE.Scene();
    this.box = new RoundBox(BASE, RADIUS);
    this.h = BASE.clone();
    this.rand = rng(7);
    // Cut-away: keeps z ≤ cutZ. Starts closed (beyond the cell) and opens in the tour.
    this.cutZ = BASE.z + 3;
    this.cut = new THREE.Plane(new THREE.Vector3(0, 0, -1), this.cutZ);
    this.heroCut = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    this.mitoCut = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    this.time = 0;
    this.labels = {};
    this._lights();
    this._backdrop();
    this._tissue();
    this._cell();
    this._organelles();
    this._heroChloroplast();
    this._heroMito();
    this._mitosisProps();
  }

  // ---------------------------------------------------------------- lighting
  _lights() {
    const s = this.scene;
    s.fog = new THREE.FogExp2(0x0a1a16, 0.0065);
    this.hemi = new THREE.HemisphereLight(0xbfe8d0, 0x10241a, 0.9);
    s.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff1d0, 2.6);
    this.sun.position.set(14, 70, 30);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 10; sc.far = 160;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    s.add(this.sun);
    this.rim = new THREE.DirectionalLight(0x8fd8ff, 0.8);
    this.rim.position.set(-40, 10, -30);
    s.add(this.rim);
    this.fill = new THREE.PointLight(0xc8ffd0, 12, 50, 1.6);
    this.fill.position.set(0, 0, 8);
    s.add(this.fill);
  }

  _backdrop() {
    const g = new THREE.SphereGeometry(400, 32, 16);
    const m = new THREE.MeshBasicMaterial({ map: this.tex.backdrop, side: THREE.BackSide, fog: false, depthWrite: false });
    this.sky = new THREE.Mesh(g, m);
    this.scene.add(this.sky);
    // Light shafts falling through the leaf.
    this.shafts = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ map: this.tex.shaft, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    for (let i = 0; i < 7; i++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(10 + i * 2, 120), mat.clone());
      p.position.set(-60 + i * 22, 30, -10 - (i % 3) * 18);
      p.rotation.set(0, (i % 2 ? 0.4 : -0.3), 0.18);
      this.shafts.add(p);
    }
    this.scene.add(this.shafts);
  }

  // ---------------------------------------------------------------- neighbouring cells
  _tissue() {
    const t = this.tex;
    this.neighbors = new THREE.Group();
    const wallMat = new THREE.MeshPhysicalMaterial({
      color: 0x9fc4ad, map: t.wallColor, normalMap: t.wallNormal, normalScale: new THREE.Vector2(0.25, 0.25),
      roughness: 0.6, transparent: true, opacity: 0.5, depthWrite: false, sheen: 0.4, sheenColor: new THREE.Color(0xbff5c0), envMapIntensity: 0.5,
    });
    const cpGeo = blobGeometry(2.75, 0.9, 1.7, 3, 0.05, 20);
    const cpMat = new THREE.MeshStandardMaterial({ color: 0x2f7a32, roughness: 0.5, emissive: 0x0c2a0a });
    this.neighborCp = cpMat;
    const spec = [
      [-48, 2, -2, 20, 12, 12], [48, -3, 0, 21, 13, 12], [0, 31, -4, 23, 13, 12], [3, -31, -2, 22, 12, 12],
      [-46, 30, -6, 19, 12, 11], [46, 30, -4, 20, 11, 12], [-45, -30, -3, 20, 12, 12], [46, -32, -2, 21, 12, 12],
      [-22, 2, -32, 22, 13, 13], [24, 0, -33, 22, 13, 13], [0, 30, -34, 22, 12, 12], [0, -30, -33, 21, 12, 12],
    ];
    const rand = rng(11);
    for (const [x, y, z, hx, hy, hz] of spec) {
      const box = new RoundBox(new THREE.Vector3(hx, hy, hz), 6);
      const g = new THREE.Group();
      g.position.set(x, y, z);
      const w = new THREE.Mesh(roundBoxGeometry(box, WALL * 0.6, [28, 18, 18]), wallMat);
      w.receiveShadow = true;
      g.add(w);
      const n = 70;
      const inst = new THREE.InstancedMesh(cpGeo, cpMat, n);
      const o = new THREE.Object3D();
      for (let i = 0; i < n; i++) {
        const { p, n: nn } = box.sample(rand);
        o.position.copy(p).addScaledVector(nn, -1.2);
        alignY(o, nn, rand() * 6.28);
        o.updateMatrix();
        inst.setMatrixAt(i, o.matrix);
      }
      inst.castShadow = true;
      g.add(inst);
      g.userData.kind = 'neighbor';
      this.neighbors.add(g);
    }
    this.scene.add(this.neighbors);
  }

  // ---------------------------------------------------------------- focal cell envelope
  _cell() {
    const t = this.tex, clip = [this.cut];
    this.cell = new THREE.Group();
    this.scene.add(this.cell);
    this.envelope = new THREE.Group(); // scaled for growth
    this.cell.add(this.envelope);

    const wallMat = new THREE.MeshPhysicalMaterial({
      color: 0xb4cfbd, map: t.wallColor, normalMap: t.wallNormal, normalScale: new THREE.Vector2(0.9, 0.9),
      roughness: 0.55, transparent: true, opacity: 0.5, depthWrite: false,
      sheen: 0.6, sheenColor: new THREE.Color(0xd8ffe0), clearcoat: 0.3, clearcoatRoughness: 0.4,
      side: THREE.DoubleSide, clippingPlanes: clip, envMapIntensity: 0.7,
    });
    t.wallColor.repeat.set(2, 1.3); t.wallNormal.repeat.set(2, 1.3);
    this.wallOuter = new THREE.Mesh(roundBoxGeometry(this.box, WALL), wallMat);
    this.wallOuter.receiveShadow = true;
    this.wallOuter.userData.kind = 'wall';
    this.envelope.add(this.wallOuter);

    // Plasma membrane: thin, glossy, slightly golden.
    const pmMat = new THREE.MeshPhysicalMaterial({
      color: 0xf1f7d8, roughness: 0.15, transparent: true, opacity: 0.22, clearcoat: 1, side: THREE.DoubleSide,
      normalMap: t.bumpNormal, normalScale: new THREE.Vector2(0.3, 0.3), clippingPlanes: clip, depthWrite: false,
    });
    this.pm = new THREE.Mesh(roundBoxGeometry(this.box, 0), pmMat);
    this.pm.userData.kind = 'pm';
    this.envelope.add(this.pm);

    // Cytoplasm: a translucent granular layer lining the wall.
    const cytoMat = new THREE.MeshPhysicalMaterial({
      color: 0x6f8f62, roughness: 0.8, transparent: true, opacity: 0.32, side: THREE.BackSide,
      normalMap: t.bumpNormal, normalScale: new THREE.Vector2(0.8, 0.8), clippingPlanes: clip, depthWrite: false,
    });
    this.cytoMat = cytoMat;
    this.cytoLayer = new THREE.Mesh(roundBoxGeometry(this.box, -0.15), cytoMat);
    this.envelope.add(this.cytoLayer);

    // Tonoplast and vacuole: a clear, watery compartment.
    const vacMat = new THREE.MeshPhysicalMaterial({
      color: 0xbfe6ff, roughness: 0.05, transmission: 0.95, thickness: 6, ior: 1.33, transparent: true, opacity: 0.35,
      clearcoat: 1, side: THREE.DoubleSide, clippingPlanes: clip, depthWrite: false, envMapIntensity: 1.2,
      attenuationColor: new THREE.Color(0x9fdcff), attenuationDistance: 60,
    });
    this.vacMat = vacMat;
    this.vacuole = new THREE.Mesh(roundBoxGeometry(new RoundBox(BASE.clone().subScalar(CYTO), RADIUS - CYTO), 0, [40, 26, 26]), vacMat);
    this.vacuole.userData.kind = 'vacuole';
    this.envelope.add(this.vacuole);

    // Cell plate (only during cytokinesis).
    const plateMat = new THREE.MeshPhysicalMaterial({ color: 0xeaffd8, emissive: 0x6aa860, emissiveIntensity: 0.4, roughness: 0.4, transparent: true, opacity: 0.85, side: THREE.DoubleSide, clippingPlanes: clip });
    this.plate = new THREE.Mesh(new THREE.CircleGeometry(1, 48), plateMat);
    this.plate.rotation.y = Math.PI / 2;
    this.plate.visible = false;
    this.cell.add(this.plate);
  }

  // ---------------------------------------------------------------- organelles
  _organelles() {
    const t = this.tex, clip = [this.cut], rand = this.rand, box = this.box;
    this.org = new THREE.Group();
    this.cell.add(this.org);

    // Nucleus in a pocket of cytoplasm against the back-left wall.
    this.nucHome = new THREE.Vector3(-12, -1.5, -BASE.z + 5.6);
    const pocket = new THREE.Mesh(blobGeometry(8.2, 7.2, 5.2, 5, 0.07, 48), new THREE.MeshPhysicalMaterial({
      color: 0x7e9a6c, roughness: 0.7, transparent: true, opacity: 0.28, normalMap: t.bumpNormal, clippingPlanes: clip, depthWrite: false,
    }));
    pocket.position.copy(this.nucHome).add(new THREE.Vector3(0, 0, -0.8));
    this.pocket = pocket;
    this.org.add(pocket);

    this.nucleus = new THREE.Group();
    this.nucleus.position.copy(this.nucHome);
    const env = new THREE.Mesh(blobGeometry(4.6, 4.1, 3.8, 9, 0.04, 64), new THREE.MeshPhysicalMaterial({
      color: 0x7a63c9, roughness: 0.35, transparent: true, opacity: 0.8,
      clearcoat: 0.6, normalMap: t.bumpNormal, normalScale: new THREE.Vector2(0.4, 0.4), clippingPlanes: clip, envMapIntensity: 0.8,
    }));
    env.castShadow = true;
    env.userData.kind = 'nucleus';
    this.nucEnv = env;
    this.nucleus.add(env);
    const nucleolus = new THREE.Mesh(new THREE.SphereGeometry(1.5, 32, 20), new THREE.MeshStandardMaterial({ color: 0xc6a8ff, emissive: 0x3a2270, roughness: 0.5, clippingPlanes: clip }));
    nucleolus.position.set(1.1, 0.6, 0.8);
    this.nucleolus = nucleolus;
    this.nucleus.add(nucleolus);
    // Chromatin.
    const cg = new THREE.BufferGeometry(), cp = [];
    for (let i = 0; i < 1600; i++) {
      const v = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1);
      if (v.length() > 1) { i--; continue; }
      cp.push(v.x * 4.0, v.y * 3.6, v.z * 3.3);
    }
    cg.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
    this.chromatin = new THREE.Points(cg, new THREE.PointsMaterial({ color: 0xb6a2ff, size: 0.22, map: t.sprite, transparent: true, opacity: 0.55, depthWrite: false, clippingPlanes: clip }));
    this.nucleus.add(this.chromatin);
    // Nuclear pores.
    const poreGeo = new THREE.TorusGeometry(0.075, 0.03, 6, 12);
    const pores = new THREE.InstancedMesh(poreGeo, new THREE.MeshStandardMaterial({ color: 0xf0e8ff, emissive: 0x4a3a80, roughness: 0.4, clippingPlanes: clip }), 500);
    const o = new THREE.Object3D();
    for (let i = 0; i < 500; i++) {
      const v = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize();
      o.position.set(v.x * 4.62, v.y * 4.12, v.z * 3.82);
      o.lookAt(o.position.clone().multiplyScalar(2));
      o.updateMatrix();
      pores.setMatrixAt(i, o.matrix);
    }
    this.nucleus.add(pores);
    this.pores = pores;
    this.org.add(this.nucleus);

    // Transvacuolar strands from the nuclear pocket.
    const strandMat = new THREE.MeshPhysicalMaterial({ color: 0x8aa877, roughness: 0.7, transparent: true, opacity: 0.4, clippingPlanes: clip, depthWrite: false });
    this.strands = [];
    const ends = [new THREE.Vector3(14, 8, -8), new THREE.Vector3(16, -9, -6), new THREE.Vector3(4, 10, -10)];
    for (const e of ends) {
      const a = this.nucHome.clone().add(new THREE.Vector3(3, 0, 1));
      const mid = a.clone().lerp(e, 0.5).add(new THREE.Vector3(0, 0, 3));
      const curve = new THREE.CatmullRomCurve3([a, mid, e]);
      const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.45, 8), strandMat);
      this.org.add(m);
      this.strands.push(curve);
    }

    // Chloroplasts appressed to the cell periphery (dart throwing for spacing).
    this.cpGeo = blobGeometry(2.75, 0.9, 1.7, 21, 0.05, 32);
    this.cpMat = new THREE.MeshPhysicalMaterial({
      color: 0x58b34a, map: t.cpColor, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.35,
      sheen: 0.6, sheenColor: new THREE.Color(0xb8ff98),
      emissive: 0x1e5a14, emissiveIntensity: 0.2, clippingPlanes: clip, envMapIntensity: 0.6,
    });
    const cps = [];
    let tries = 0;
    while (cps.length < 120 && tries < 6000) {
      tries++;
      const { p, n } = box.sample(rand);
      if (p.distanceTo(this.nucHome) < 8.5) continue;
      if (cps.some((c) => c.p.distanceTo(p) < 4.6)) continue;
      cps.push({ p, n, spin: rand() * 6.28 });
    }
    this.chloroplasts = cps.map((c, i) => ({
      i, norm: c.p.clone().divide(BASE), n: c.n.clone(), spin: c.spin, depth: 1.25,
      pos: c.p.clone().addScaledVector(c.n, -1.25), flash: 0,
    }));
    this.cpInst = new THREE.InstancedMesh(this.cpGeo, this.cpMat, this.chloroplasts.length);
    this.cpInst.castShadow = true;
    this.cpInst.receiveShadow = true;
    this.cpInst.userData.kind = 'chloroplast';
    this.org.add(this.cpInst);

    // Mitochondria wander through the cytoplasm (streaming).
    this.mitoGeo = capsuleGeometry(1.7, 0.33, 14);
    this.mitoMat = new THREE.MeshPhysicalMaterial({ color: 0xd9824e, roughness: 0.45, clearcoat: 0.5, sheen: 0.5, sheenColor: new THREE.Color(0xffc49a), emissive: 0x3a1206, emissiveIntensity: 0.3, clippingPlanes: clip });
    this.mitos = [];
    for (let i = 0; i < 90; i++) this.mitos.push(this._newWalker(rand, 0.6 + rand() * 1.6, 1.8 + rand() * 1.8));
    this.mitoInst = new THREE.InstancedMesh(this.mitoGeo, this.mitoMat, this.mitos.length);
    this.mitoInst.castShadow = true;
    this.mitoInst.userData.kind = 'mito';
    this.org.add(this.mitoInst);

    // Peroxisomes sit next to chloroplasts.
    this.peroxMat = new THREE.MeshPhysicalMaterial({ color: 0xb59cf0, roughness: 0.3, clearcoat: 0.7, emissive: 0x2a1a50, emissiveIntensity: 0.4, clippingPlanes: clip });
    this.perox = [];
    for (let i = 0; i < 40; i++) {
      const c = this.chloroplasts[(i * 7) % this.chloroplasts.length];
      const side = new THREE.Vector3().randomDirection().projectOnPlane(c.n).normalize().multiplyScalar(2.6);
      this.perox.push({ cp: c, off: side, depth: 1.9 });
    }
    this.peroxInst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.55, 20, 14), this.peroxMat, this.perox.length);
    this.peroxInst.userData.kind = 'perox';
    this.org.add(this.peroxInst);

    // Golgi stacks: cup-shaped cisternae.
    const cisGeo = new THREE.SphereGeometry(1.1, 24, 8, 0, Math.PI * 2, 0, 0.55);
    cisGeo.scale(1, 0.35, 1);
    this.golgiMat = new THREE.MeshPhysicalMaterial({ color: 0xf2c766, roughness: 0.35, clearcoat: 0.6, emissive: 0x3d2a05, emissiveIntensity: 0.3, side: THREE.DoubleSide, clippingPlanes: clip });
    this.golgi = [];
    for (let i = 0; i < 18; i++) {
      let p;
      if (i < 8) p = this.nucHome.clone().add(new THREE.Vector3(rand() * 14 - 4, rand() * 12 - 6, 2 + rand() * 2));
      else p = box.sample(rand).p;
      this.golgi.push(this._newWalker(rand, 1.4 + rand() * 0.8, 0.6, p));
    }
    this.golgiInst = new THREE.InstancedMesh(cisGeo, this.golgiMat, this.golgi.length * 5);
    this.golgiInst.userData.kind = 'golgi';
    this.org.add(this.golgiInst);

    // Endoplasmic reticulum: a tubular network spreading from the nuclear envelope.
    const tubes = [];
    for (let i = 0; i < 46; i++) {
      const a = i < 22 ? this.nucHome.clone().add(new THREE.Vector3().randomDirection().multiplyScalar(4.4)) : box.project(box.sample(rand).p, 1.2);
      const dir = new THREE.Vector3().randomDirection();
      const b = box.project(a.clone().addScaledVector(dir, 6 + rand() * 9), 0.8 + rand() * 1.6);
      const curve = box.shellPath(a, b, 1.0 + rand() * 1.2, 6);
      tubes.push(new THREE.TubeGeometry(curve, 24, 0.09, 6));
    }
    this.erMat = new THREE.MeshPhysicalMaterial({ color: 0x5cc7b8, roughness: 0.3, transparent: true, opacity: 0.75, clearcoat: 0.5, emissive: 0x0b3a34, emissiveIntensity: 0.4, clippingPlanes: clip });
    this.er = new THREE.Mesh(mergeGeometries(tubes), this.erMat);
    this.er.userData.kind = 'er';
    this.org.add(this.er);

    // Ribosomes and cytoplasmic granules.
    const gp = [], gc = [];
    for (let i = 0; i < 9000; i++) {
      const s = box.sample(rand);
      const d = 0.2 + rand() * (CYTO - 0.4);
      const q = s.p.clone().addScaledVector(s.n, -d);
      gp.push(q.x, q.y, q.z);
      const ribo = rand() < 0.6;
      gc.push(ribo ? 1 : 0.85, ribo ? 0.72 : 0.95, ribo ? 0.66 : 0.82);
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
    gg.setAttribute('color', new THREE.Float32BufferAttribute(gc, 3));
    this.granBase = Float32Array.from(gp);
    this.granules = new THREE.Points(gg, new THREE.PointsMaterial({ size: 0.16, map: this.tex.sprite, vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false, clippingPlanes: clip }));
    this.org.add(this.granules);

    // Plasmodesmata: channels through the wall in pit fields where neighbours touch.
    const pdGeo = new THREE.CylinderGeometry(0.12, 0.12, WALL + 0.6, 10);
    const pdMat = new THREE.MeshStandardMaterial({ color: 0x5cc7b8, emissive: 0x0e4a40, roughness: 0.4, clippingPlanes: clip });
    const faces = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, -1)];
    this.pds = [];
    for (const f of faces) for (let k = 0; k < 14; k++) {
      const p = f.clone().multiply(BASE).add(new THREE.Vector3((rand() - 0.5) * 3, (rand() - 0.5) * 3, (rand() - 0.5) * 3).projectOnPlane(f));
      const q = box.project(p, -WALL / 2);
      this.pds.push({ norm: q.clone().divide(BASE), n: f.clone() });
    }
    this.pdInst = new THREE.InstancedMesh(pdGeo, pdMat, this.pds.length);
    this.pdInst.userData.kind = 'plasmodesma';
    this.org.add(this.pdInst);

    // Actin cables (thin glints) for streaming.
    const ap = [];
    for (let i = 0; i < 26; i++) {
      const a = box.sample(rand).p, b = box.sample(rand).p;
      const c = box.shellPath(a, b, 1.6, 14).getPoints(40);
      for (let k = 0; k < c.length - 1; k++) ap.push(c[k].x, c[k].y, c[k].z, c[k + 1].x, c[k + 1].y, c[k + 1].z);
    }
    const ag = new THREE.BufferGeometry();
    ag.setAttribute('position', new THREE.Float32BufferAttribute(ap, 3));
    this.actin = new THREE.LineSegments(ag, new THREE.LineBasicMaterial({ color: 0xe8c890, transparent: true, opacity: 0.18, clippingPlanes: clip }));
    this.org.add(this.actin);

    this._placeStatic();
  }

  _newWalker(rand, depth, speed, start) {
    const box = this.box;
    const a = start ? box.project(start, depth) : box.project(box.sample(rand).p, depth);
    return { pos: a.clone(), from: a.clone(), to: null, curve: null, u: 1, speed, depth, spin: rand() * 6.28, hl: 0 };
  }

  _stepWalker(w, dt) {
    if (w.frozen) return;
    if (w.u >= 1 || !w.curve) {
      const dir = new THREE.Vector3().randomDirection().multiplyScalar(5 + Math.random() * 7);
      const b = this.box.project(w.pos.clone().add(dir), w.depth);
      w.curve = this.box.shellPath(w.pos.clone(), b, w.depth, 4);
      w.len = w.curve.getLength();
      w.u = 0;
    }
    w.u = Math.min(1, w.u + (w.speed * dt) / Math.max(0.5, w.len));
    w.curve.getPointAt(w.u, w.pos);
    w.tan = w.curve.getTangentAt(w.u);
  }

  _placeStatic() {
    const o = new THREE.Object3D();
    this.pds.forEach((p, i) => {
      o.position.copy(p.norm).multiply(this.h);
      alignY(o, p.n);
      o.updateMatrix();
      this.pdInst.setMatrixAt(i, o.matrix);
    });
    this.pdInst.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- hero organelles (cut open)
  _heroChloroplast() {
    // Choose a chloroplast on the back wall, low and left of centre.
    const cand = this.chloroplasts.filter((c) => c.n.z < -0.9 && c.pos.y < -2 && c.pos.y > -9 && c.pos.x > -4 && c.pos.x < 10);
    const hero = cand[0] || this.chloroplasts[0];
    this.heroCp = hero;
    hero.hidden = true;
    const g = new THREE.Group();
    this.hero = g;
    const planes = [this.cut, this.heroCut];
    const env = new THREE.MeshPhysicalMaterial({ color: 0x7fd86a, roughness: 0.3, transparent: true, opacity: 0.2, clearcoat: 0.6, side: THREE.DoubleSide, clippingPlanes: planes, depthWrite: false });
    const outer = new THREE.Mesh(this.cpGeo, env);
    const inner = new THREE.Mesh(this.cpGeo, env.clone());
    inner.scale.setScalar(0.94);
    g.add(outer, inner);
    const stroma = new THREE.Mesh(this.cpGeo, new THREE.MeshPhysicalMaterial({ color: 0x1d4f1a, roughness: 0.8, transparent: true, opacity: 0.75, side: THREE.BackSide, clippingPlanes: planes }));
    stroma.scale.setScalar(0.92);
    g.add(stroma);
    // Grana: stacks of thylakoid discs (edge-on in the cut).
    const disc = new THREE.CylinderGeometry(0.26, 0.26, 0.042, 28);
    const nStacks = 11, nDisc = 9;
    this.granaMat = new THREE.MeshPhysicalMaterial({ color: 0x8ff06a, roughness: 0.3, clearcoat: 0.7, emissive: 0x4fdc32, emissiveIntensity: 0.5, clippingPlanes: [this.cut] });
    const grana = new THREE.InstancedMesh(disc, this.granaMat, nStacks * nDisc);
    const o = new THREE.Object3D();
    const r = rng(3);
    this.granaPos = [];
    for (let s = 0; s < nStacks; s++) {
      const x = -2.1 + (4.2 * (s + 0.5)) / nStacks + (r() - 0.5) * 0.2;
      const z = (r() - 0.5) * 0.12; // centred on the cut so each stack is bisected
      const yc = -0.1 + (r() - 0.5) * 0.15;
      this.granaPos.push(new THREE.Vector3(x, yc, z));
      for (let k = 0; k < nDisc; k++) {
        o.position.set(x, yc - 0.32 + k * 0.08, z);
        o.updateMatrix();
        grana.setMatrixAt(s * nDisc + k, o.matrix);
      }
    }
    g.add(grana);
    // Stroma lamellae linking the stacks.
    const lam = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.022, 0.14), new THREE.MeshStandardMaterial({ color: 0x9cf07c, emissive: 0x2a8a20, transparent: true, opacity: 0.8, clippingPlanes: [this.cut] }));
    for (const y of [-0.28, -0.05, 0.18]) { const l = lam.clone(); l.position.y = y; g.add(l); }
    // Starch grains (size follows the model).
    this.starchGrains = [];
    const sMat = new THREE.MeshPhysicalMaterial({ color: 0xfaf3df, roughness: 0.3, clearcoat: 0.8, sheen: 0.5, clippingPlanes: [this.cut] });
    for (const [x, z] of [[-1.25, 0.05], [0.45, -0.08], [1.55, 0.1]]) {
      const m = new THREE.Mesh(blobGeometry(0.55, 0.3, 0.42, x * 10 + 50, 0.06, 24), sMat);
      m.position.set(x, 0.12, z);
      g.add(m);
      this.starchGrains.push(m);
    }
    // Plastoglobuli and Rubisco-rich stroma speckle.
    const pg = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffd36b, emissive: 0x5a3a00, clippingPlanes: [this.cut] }), 14);
    for (let i = 0; i < 14; i++) { o.position.set((r() - 0.5) * 4.4, (r() - 0.5) * 0.9, (r() - 0.5) * 2.4); o.updateMatrix(); pg.setMatrixAt(i, o.matrix); }
    g.add(pg);
    const sp = [];
    for (let i = 0; i < 1400; i++) {
      const v = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1);
      if (v.x * v.x + v.y * v.y + v.z * v.z > 0.8) { i--; continue; }
      sp.push(v.x * 2.6, v.y * 0.8, v.z * 1.55);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.rubisco = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xd8ffc8, size: 0.05, transparent: true, opacity: 0.5, clippingPlanes: [this.cut, this.heroCut], depthWrite: false }));
    g.add(this.rubisco);
    g.traverse((m) => { if (m.isMesh) m.userData.kind = 'chloroplast'; });
    this.org.add(g);
  }

  _heroMito() {
    // A mitochondrion parked beside the hero chloroplast, cut open to show cristae.
    const g = new THREE.Group();
    this.heroMitoG = g;
    const planes = [this.cut, this.mitoCut];
    const outer = new THREE.Mesh(capsuleGeometry(2.4, 0.5, 28), new THREE.MeshPhysicalMaterial({ color: 0xe8935a, roughness: 0.35, clearcoat: 0.8, transparent: true, opacity: 0.55, side: THREE.DoubleSide, clippingPlanes: planes, depthWrite: false }));
    const inner = new THREE.Mesh(capsuleGeometry(2.25, 0.44, 28), new THREE.MeshPhysicalMaterial({ color: 0xa8481e, roughness: 0.6, side: THREE.BackSide, clippingPlanes: planes }));
    g.add(outer, inner);
    const crista = new THREE.BoxGeometry(0.028, 0.62, 0.5);
    const cm = new THREE.MeshPhysicalMaterial({ color: 0xffbf8a, roughness: 0.4, emissive: 0x5a2008, emissiveIntensity: 0.6, clippingPlanes: [this.cut] });
    for (let k = 0; k < 13; k++) {
      const c = new THREE.Mesh(crista, cm);
      c.position.x = -0.95 + k * 0.16;
      c.scale.set(1, 0.5 + (k % 2) * 0.35, 1);
      c.position.y = (k % 2 ? 0.12 : -0.12);
      g.add(c);
    }
    g.traverse((m) => { if (m.isMesh) m.userData.kind = 'mito'; });
    this.org.add(g);
  }

  _mitosisProps() {
    const clip = [this.cut];
    this.chromosomes = new THREE.Group();
    const cols = [0xff9ad5, 0xb89cff, 0x7fd8ff, 0xffd27f, 0x9cf0b0];
    for (let i = 0; i < 10; i++) {
      const pair = new THREE.Group();
      for (const s of [-1, 1]) {
        const arm = new THREE.Mesh(capsuleGeometry(1.4, 0.16, 8), new THREE.MeshStandardMaterial({ color: cols[i % 5], emissive: cols[i % 5], emissiveIntensity: 0.25, roughness: 0.5, clippingPlanes: clip }));
        arm.rotation.z = Math.PI / 2 + s * 0.35;
        arm.userData.side = s;
        pair.add(arm);
      }
      this.chromosomes.add(pair);
    }
    this.chromosomes.visible = false;
    this.cell.add(this.chromosomes);
    const sp = [];
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * Math.PI * 2, r = 3;
      sp.push(-5, 0, 0, 0, Math.cos(a) * r, Math.sin(a) * r, 5, 0, 0, 0, Math.cos(a) * r, Math.sin(a) * r);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.spindle = new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: 0x7fe7fa, transparent: true, opacity: 0.55, clippingPlanes: clip }));
    this.spindle.visible = false;
    this.cell.add(this.spindle);
  }

  // ---------------------------------------------------------------- per-frame update
  update(dt) {
    this.time += dt;
    const m = this.model, s = m.s, f = m.f;
    // Growth: elongation along x.
    const r = s.V / m.V0;
    this.h.set(BASE.x * Math.pow(r, 0.8), BASE.y * Math.pow(r, 0.1), BASE.z * Math.pow(r, 0.1));
    this.box.h.copy(this.h);
    this.envelope.scale.set(this.h.x / BASE.x, this.h.y / BASE.y, this.h.z / BASE.z);
    // Neighbours make room.
    this.neighbors.children.forEach((n, i) => {
      if (n.userData.x0 === undefined) n.userData.x0 = n.position.x;
      const x0 = n.userData.x0;
      n.position.x = Math.abs(x0) > 30 ? x0 + Math.sign(x0) * (this.h.x - BASE.x) : x0 * (this.h.x / BASE.x);
    });
    // Cut plane.
    this.cut.constant = this.cutZ;

    // Light.
    const I = f.I || 0, day = clamp(I / 1100, 0, 1);
    this.sun.intensity = 0.25 + 3.0 * day;
    this.sun.color.setHSL(0.11, 0.6, 0.55 + 0.35 * day);
    this.hemi.intensity = 0.45 + 0.6 * day;
    this.shafts.children.forEach((p, i) => { p.material.opacity = 0.03 + 0.13 * day * (0.8 + 0.2 * Math.sin(this.time * 0.3 + i)); });
    this.cpMat.emissiveIntensity = 0.1 + 0.45 * day;
    this.granaMat.emissiveIntensity = 0.15 + 0.8 * day * (0.85 + 0.15 * Math.sin(this.time * 3));
    this.neighborCp.emissiveIntensity = 0.3 + day;
    this.mitoMat.emissiveIntensity = 0.2 + clamp((f.resp || 0) / 2.2, 0, 1) * 0.6;
    this.fill.intensity = 4 + 10 * day;

    const o = new THREE.Object3D();
    // Chloroplasts (+ subtle light-avoidance tilt and flash).
    const avoid = clamp((I - 700) / 600, 0, 1);
    for (const c of this.chloroplasts) {
      c.pos.copy(c.norm).multiply(this.h).addScaledVector(c.n, -c.depth);
      c.flash = Math.max(0, c.flash - dt * 2);
      if (c.hidden) { o.position.copy(c.pos); o.scale.setScalar(0.0001); }
      else {
        o.position.copy(c.pos);
        alignY(o, c.n, c.spin);
        if (avoid > 0 && Math.abs(c.n.y) > 0.8) o.rotateZ(avoid * 0.6); // turn edge-on to strong light
        o.scale.setScalar(1 + c.flash * 0.04);
      }
      o.updateMatrix();
      this.cpInst.setMatrixAt(c.i, o.matrix);
    }
    this.cpInst.instanceMatrix.needsUpdate = true;
    // Hero chloroplast follows its slot.
    const hc = this.heroCp;
    this.hero.position.copy(hc.pos);
    alignY(this.hero, hc.n, 0);
    this.heroCut.constant = hc.pos.y; // cut through the hero's middle (keeps y ≤ centre)
    this.heroCut.normal.set(0, -1, 0);
    // Starch grains scale with the per-chloroplast starch store.
    const starchK = clamp(s.starch / 150, 0.03, 1.2);
    this.starchGrains.forEach((g, i) => g.scale.setScalar(Math.pow(starchK, 0.45) * (1 - i * 0.15)));
    this.rubisco.material.opacity = 0.25 + 0.4 * day;

    // Streaming organelles.
    const stream = s.phase === 'M' ? 0.3 : 1;
    this.mitos.forEach((w, i) => {
      this._stepWalker(w, dt * stream);
      o.position.copy(w.pos);
      if (w.tan) o.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), w.tan); else o.quaternion.identity();
      o.scale.setScalar(1);
      o.updateMatrix();
      this.mitoInst.setMatrixAt(i, o.matrix);
    });
    this.mitoInst.instanceMatrix.needsUpdate = true;
    // Hero mitochondrion parked beside the hero chloroplast.
    const side = new THREE.Vector3(1, 0.3, 0).projectOnPlane(hc.n).normalize();
    this.heroMitoG.position.copy(hc.pos).addScaledVector(side, 4.4).addScaledVector(hc.n, -0.6);
    this.heroMitoG.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), side);
    this.mitoCut.normal.set(0, -1, 0);
    this.mitoCut.constant = this.heroMitoG.position.y;
    this.perox.forEach((p, i) => {
      o.position.copy(p.cp.pos).add(p.off).addScaledVector(p.cp.n, -0.5);
      o.quaternion.identity(); o.scale.setScalar(1); o.updateMatrix();
      this.peroxInst.setMatrixAt(i, o.matrix);
      p.pos = o.position.clone();
    });
    this.peroxInst.instanceMatrix.needsUpdate = true;
    this.golgi.forEach((w, i) => {
      this._stepWalker(w, dt * stream);
      const n = this.box.normal(w.pos);
      for (let k = 0; k < 5; k++) {
        o.position.copy(w.pos).addScaledVector(n, -0.17 * k);
        alignY(o, n, w.spin);
        o.scale.setScalar(1 - Math.abs(k - 2) * 0.1);
        o.updateMatrix();
        this.golgiInst.setMatrixAt(i * 5 + k, o.matrix);
      }
    });
    this.golgiInst.instanceMatrix.needsUpdate = true;
    this._placeStatic();

    // Granule shimmer (Brownian jiggle).
    const gp = this.granules.geometry.attributes.position;
    const sx = this.h.x / BASE.x;
    for (let i = 0; i < gp.count; i += 3) {
      const k = i * 3;
      gp.array[k] = this.granBase[k] * sx + Math.sin(this.time * 2 + i) * 0.05;
    }
    gp.needsUpdate = true;
    this.er.scale.set(sx, 1, 1);
    this.actin.scale.set(sx, 1, 1);

    this._mitosis(dt);
  }

  _mitosis() {
    const m = this.model, sub = m.mSubphase();
    const centre = new THREE.Vector3(0, 0, -this.h.z * 0.25);
    let k = 0;
    if (sub) k = sub.name === 'preprophase' ? sub.prog : 1;
    this.nucleus.position.lerpVectors(this.nucHome.clone().multiply(new THREE.Vector3(this.h.x / BASE.x, 1, 1)), centre, k * k * (3 - 2 * k));
    this.pocket.position.copy(this.nucleus.position).add(new THREE.Vector3(0, 0, -0.8));
    const envVis = !sub || ['preprophase', 'prophase'].includes(sub.name) ? 1 : sub.name === 'prometaphase' ? 1 - sub.prog : 0;
    this.nucEnv.material.opacity = 0.8 * envVis;
    this.nucEnv.visible = envVis > 0.02;
    this.nucleolus.visible = !sub || sub.name === 'preprophase';
    this.chromatin.visible = !sub || ['preprophase', 'prophase'].includes(sub.name);
    const showCh = sub && !['preprophase'].includes(sub.name);
    this.chromosomes.visible = !!showCh;
    this.spindle.visible = !!sub && ['prometaphase', 'metaphase', 'anaphase'].includes(sub.name);
    this.spindle.position.copy(this.nucleus.position);
    this.plate.visible = !!sub && ['telophase', 'cytokinesis'].includes(sub.name);
    if (showCh) {
      const P = this.nucleus.position;
      this.chromosomes.children.forEach((pair, i) => {
        const y = -3.2 + (i * 6.4) / 9;
        let x = 0, sep = 0, scat = 0;
        if (sub.name === 'prophase') { scat = 1; }
        else if (sub.name === 'prometaphase') scat = 1 - sub.prog;
        else if (sub.name === 'anaphase') sep = sub.prog;
        else if (sub.name === 'telophase' || sub.name === 'cytokinesis') sep = 1;
        const a = (i / 10) * Math.PI * 2;
        pair.position.set(P.x + Math.cos(a) * 2.2 * scat, P.y + lerp(y, Math.sin(a) * 2, scat), P.z + Math.sin(a * 2) * 1.2 * scat);
        pair.children.forEach((arm) => { arm.position.x = arm.userData.side * sep * 5; arm.rotation.z = Math.PI / 2 + arm.userData.side * (0.35 - sep * 0.35); });
        pair.visible = !(sub.name === 'cytokinesis' && sub.prog > 0.4);
      });
    }
    if (this.plate.visible) {
      const reach = sub.name === 'cytokinesis' ? sub.prog : 0.1;
      this.plate.position.set(0, 0, -this.h.z * 0.1);
      const R = 0.5 + reach * (this.h.y + 0.5);
      this.plate.scale.set(R, R * (this.h.z / this.h.y), 1);
    }
  }

  // Positions the tour and flows need.
  visibleChloroplasts() { return this.chloroplasts.filter((c) => !c.hidden && c.pos.z < this.cutZ - 0.5); }
  pmPoint(rand = Math.random) {
    for (let i = 0; i < 20; i++) { const s = this.box.sample(rand); if (s.p.z < this.cutZ - 1) return s; }
    return this.box.sample(rand);
  }
  vacuolePoint() {
    const h = this.h;
    return new THREE.Vector3((Math.random() - 0.5) * (h.x - 6) * 1.6, (Math.random() - 0.5) * (h.y - 6) * 1.6, -h.z * 0.6 + Math.random() * Math.min(h.z * 0.6, this.cutZ + h.z * 0.4));
  }
  nuclearPore() {
    const v = new THREE.Vector3().randomDirection();
    if (v.z < 0) v.z = -v.z; // the side facing the cell interior
    return this.nucleus.position.clone().add(v.multiply(new THREE.Vector3(4.6, 4.1, 3.8)));
  }
  pdPoint() {
    const p = this.pds[Math.floor(Math.random() * this.pds.length)];
    return { p: p.norm.clone().multiply(this.h), n: p.n };
  }
}
