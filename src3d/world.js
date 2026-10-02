// The 3-D scene: a cut-away mesophyll cell inside leaf tissue.
//
// Sizes are close to real (µm): the cell is ~44 × 26 × 26 µm at birth,
// chloroplasts ~5.5 × 3.4 × 1.8 µm, mitochondria ~1.6 × 0.6 µm, the nucleus
// ~9 µm across. Molecules (in flows.js) are drawn far larger than life.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundBox, roundBoxGeometry, blobGeometry, capsuleGeometry, alignY, rng, clamp, lerp } from './geom.js';
import { drawChloroplastSection, drawMitoSection } from './textures.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

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
      color: 0xc9d6bf, map: t.wallColor, normalMap: t.wallNormal, normalScale: new THREE.Vector2(0.15, 0.15),
      roughness: 0.75, transparent: true, opacity: 0.45, depthWrite: false, envMapIntensity: 0.5,
    });
    const cpGeo = blobGeometry(2.75, 0.9, 1.7, 3, 0.05, 20);
    const cpMat = new THREE.MeshStandardMaterial({ color: 0x3c8a32, roughness: 0.6, emissive: 0x0c2a0a, emissiveIntensity: 0.1 });
    this.neighborCp = cpMat;
    const spec = [
      [-50, 4, -3, 20, 12, 12], [44.8, 0, 0, 21, 13, 12], [-4, 34, -6, 23, 12, 11], [6, -34, -3, 22, 12, 12],
      [-54, 36, -9, 19, 11, 11], [52, 34, -6, 20, 11, 12], [-52, -34, -5, 20, 12, 12], [52, -36, -4, 21, 12, 12],
      [-24, 4, -35, 22, 13, 12], [26, -2, -36, 22, 13, 12], [0, 36, -38, 22, 12, 12], [2, -34, -37, 21, 12, 12],
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
      g.userData.size = new THREE.Vector3(hx, hy, hz);
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
      color: 0xdfe4d4, map: t.wallColor, normalMap: t.wallNormal, normalScale: new THREE.Vector2(0.15, 0.15),
      roughness: 0.7, transparent: true, opacity: 0.42, depthWrite: false,
      side: THREE.DoubleSide, clippingPlanes: clip, envMapIntensity: 0.7,
    });
    t.wallColor.repeat.set(2, 1.3); t.wallNormal.repeat.set(2, 1.3);
    this.wallOuter = new THREE.Mesh(roundBoxGeometry(this.box, WALL), wallMat);
    this.wallOuter.receiveShadow = true;
    this.wallOuter.userData.kind = 'wall';
    this.envelope.add(this.wallOuter);

    // Plasma membrane: thin, glossy, slightly golden.
    const pmMat = new THREE.MeshPhysicalMaterial({
      color: 0xf1f7d8, roughness: 0.45, transparent: true, opacity: 0.16, side: THREE.DoubleSide,
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
      color: 0xd6eef5, roughness: 0.12, transmission: 0.95, thickness: 6, ior: 1.33, transparent: true, opacity: 0.3,
      clearcoat: 0.2, side: THREE.DoubleSide, clippingPlanes: clip, depthWrite: false, envMapIntensity: 1.2,
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
      color: 0xa79bbd, roughness: 0.55, transparent: true, opacity: 0.55,
      clearcoat: 0.1, normalMap: t.bumpNormal, normalScale: new THREE.Vector2(0.4, 0.4), clippingPlanes: clip, envMapIntensity: 0.8,
    }));
    env.castShadow = true;
    env.userData.kind = 'nucleus';
    this.nucEnv = env;
    this.nucleus.add(env);
    const nucleolus = new THREE.Mesh(new THREE.SphereGeometry(1.5, 32, 20), new THREE.MeshStandardMaterial({ color: 0x6f5a8e, roughness: 0.7, clippingPlanes: clip }));
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
    this.chromatin = new THREE.Points(cg, new THREE.PointsMaterial({ color: 0x4a3c66, size: 0.3, map: t.sprite, transparent: true, opacity: 0.7, depthWrite: false, clippingPlanes: clip }));
    this.nucleus.add(this.chromatin);
    // Nuclear pores.
    const poreGeo = new THREE.TorusGeometry(0.075, 0.03, 6, 12);
    const pores = new THREE.InstancedMesh(poreGeo, new THREE.MeshStandardMaterial({ color: 0x9a8fb0, roughness: 0.6, clippingPlanes: clip }), 500);
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
      color: 0x4f9e3c, map: t.cpColor, roughness: 0.58, clearcoat: 0.12, clearcoatRoughness: 0.5,
      sheen: 0.5, sheenColor: new THREE.Color(0x9ee880),
      emissive: 0x1a3a12, emissiveIntensity: 0.05, clippingPlanes: clip, envMapIntensity: 0.6,
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
    this.mitoMat = new THREE.MeshPhysicalMaterial({ color: 0xc8784a, roughness: 0.6, clearcoat: 0.1, sheen: 0.5, sheenColor: new THREE.Color(0xffc49a), emissive: 0x3a1206, emissiveIntensity: 0.3, clippingPlanes: clip });
    this.mitos = [];
    for (let i = 0; i < 90; i++) this.mitos.push(this._newWalker(rand, 0.6 + rand() * 1.6, 1.8 + rand() * 1.8));
    this.mitoInst = new THREE.InstancedMesh(this.mitoGeo, this.mitoMat, this.mitos.length);
    this.mitoInst.castShadow = true;
    this.mitoInst.userData.kind = 'mito';
    this.org.add(this.mitoInst);

    // Peroxisomes sit next to chloroplasts.
    this.peroxMat = new THREE.MeshPhysicalMaterial({ color: 0xa996d0, roughness: 0.55, clearcoat: 0.1, emissive: 0x2a1a50, emissiveIntensity: 0.4, clippingPlanes: clip });
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
    this.golgiMat = new THREE.MeshPhysicalMaterial({ color: 0xe0bc6a, roughness: 0.55, clearcoat: 0.1, emissive: 0x3d2a05, emissiveIntensity: 0.3, side: THREE.DoubleSide, clippingPlanes: clip });
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
    this.erMat = new THREE.MeshPhysicalMaterial({ color: 0x7fbfb0, roughness: 0.55, transparent: true, opacity: 0.45, emissive: 0x0b3a34, emissiveIntensity: 0.15, clippingPlanes: clip });
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
    const pdGeo = new THREE.CylinderGeometry(0.05, 0.05, WALL + 0.15, 8); // ~0.1 µm channels (drawn ~2× real width)
    const pdMat = new THREE.MeshStandardMaterial({ color: 0x3f7f72, emissive: 0x0a2a24, roughness: 0.6, clippingPlanes: clip });
    const faces = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, -1)];
    this.pds = [];
    for (const f of faces) for (let k = 0; k < 16; k++) {
      // A pit field: a small grid of channels about 0.3 µm apart.
      const u = new THREE.Vector3(f.y !== 0 ? 1 : 0, f.y !== 0 ? 0 : 1, 0).projectOnPlane(f).normalize();
      const v = new THREE.Vector3().crossVectors(f, u);
      const p = f.clone().multiply(BASE).addScaledVector(u, ((k % 4) - 1.5) * 0.32).addScaledVector(v, (Math.floor(k / 4) - 1.5) * 0.32);
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
    // A chloroplast on the back wall, low and near the middle, sliced through
    // its long axis so the section face shows grana, lamellae and starch.
    const cand = this.chloroplasts.filter((c) => c.n.z < -0.9 && c.pos.y < -2 && c.pos.y > -9 && c.pos.x > -4 && c.pos.x < 10);
    const hero = cand[0] || this.chloroplasts[0];
    this.heroCp = hero;
    hero.hidden = true;
    const g = new THREE.Group();
    this.hero = g;
    const planes = [this.cut, this.heroCut];
    // Lower half of the body (the cut-away removes the half facing the camera).
    const body = new THREE.Mesh(this.cpGeo, new THREE.MeshPhysicalMaterial({
      color: 0x4f9c3e, map: this.tex.cpColor, roughness: 0.55, sheen: 0.4, sheenColor: new THREE.Color(0xa8f090),
      clippingPlanes: planes, side: THREE.DoubleSide,
    }));
    g.add(body);
    // Section face: local XY plane (local z → world y, the cut direction).
    this.cpSectionCanvas = document.createElement('canvas');
    this.cpSectionCanvas.width = 1024; this.cpSectionCanvas.height = 340;
    drawChloroplastSection(this.cpSectionCanvas, 0.1);
    this.cpSectionTex = new THREE.CanvasTexture(this.cpSectionCanvas);
    this.cpSectionTex.colorSpace = THREE.SRGBColorSpace;
    this.cpSectionTex.anisotropy = 8;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(2 * 2.75, 2 * 0.9), new THREE.MeshStandardMaterial({
      map: this.cpSectionTex, roughness: 0.75, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, clippingPlanes: [this.cut],
    }));
    face.position.z = -0.004;
    g.add(face);
    this.cpFace = face;
    this.lastStarchDrawn = -1;
    // Reference points on the section for labels and camera aims (local coords).
    this.granaPos = [V3(-1.4, 0.3, 0), V3(-0.4, -0.25, 0), V3(0.6, 0.2, 0), V3(1.5, -0.2, 0), V3(-0.9, 0.1, 0), V3(0.2, 0.3, 0)];
    this.starchLocal = [V3(-0.42 * 2.71, 0.05 * 0.86, 0), V3(0.12 * 2.71, 0.12 * 0.86, 0)];
    this.starchGrains = this.starchLocal.map((p) => { const o = new THREE.Object3D(); o.position.copy(p); g.add(o); return o; });
    g.traverse((m) => { if (m.isMesh) m.userData.kind = 'chloroplast'; });
    this.org.add(g);
  }

  _heroMito() {
    // A mitochondrion (~2 µm) parked beside the hero chloroplast, sliced lengthwise.
    const g = new THREE.Group();
    this.heroMitoG = g;
    const planes = [this.cut, this.mitoCut];
    const L = 2.0, R = 0.36;
    const body = new THREE.Mesh(capsuleGeometry(L, R, 28), new THREE.MeshPhysicalMaterial({ color: 0xc8784a, roughness: 0.55, sheen: 0.4, sheenColor: new THREE.Color(0xffc49a), side: THREE.DoubleSide, clippingPlanes: planes }));
    g.add(body);
    const cv = document.createElement('canvas');
    cv.width = 600; cv.height = 216;
    drawMitoSection(cv);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(L, 2 * R), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, clippingPlanes: [this.cut] }));
    face.rotation.x = -Math.PI / 2; // lie in the local XZ plane (the cut)
    face.position.y = -0.004;
    g.add(face);
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
    // Plant spindle: barrel-shaped, with broad poles (no centrosomes).
    const sp = [];
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * Math.PI * 2;
      const py = Math.cos(a), pz = Math.sin(a);
      for (const sx of [-1, 1]) {
        const pts = [];
        for (let j = 0; j <= 8; j++) {
          const u = j / 8; // 0 at pole, 1 at equator
          const rad = 1.4 + 1.8 * Math.sin((u * Math.PI) / 2);
          pts.push(new THREE.Vector3(sx * 5 * (1 - u), py * rad, pz * rad));
        }
        for (let j = 0; j < 8; j++) sp.push(pts[j].x, pts[j].y, pts[j].z, pts[j + 1].x, pts[j + 1].y, pts[j + 1].z);
      }
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    const mtMat = new THREE.LineBasicMaterial({ color: 0x9fe9f5, transparent: true, opacity: 0.5, clippingPlanes: clip });
    this.spindle = new THREE.LineSegments(sg, mtMat);
    this.spindle.visible = false;
    this.cell.add(this.spindle);
    // Preprophase band: a ring of cortical microtubules marking the future wall.
    const ring = [];
    const N = 160;
    for (let k = 0; k < N; k++) {
      for (const dx of [-0.6, -0.2, 0.2, 0.6]) {
        const a0 = (k / N) * Math.PI * 2, a1 = ((k + 1) / N) * Math.PI * 2;
        const p0 = this.box.project(new THREE.Vector3(dx, Math.cos(a0) * 20, Math.sin(a0) * 20), 0.25);
        const p1 = this.box.project(new THREE.Vector3(dx, Math.cos(a1) * 20, Math.sin(a1) * 20), 0.25);
        ring.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
      }
    }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(ring, 3));
    this.ppb = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0x9fe9f5, transparent: true, opacity: 0.9, clippingPlanes: clip }));
    this.ppb.visible = false;
    this.cell.add(this.ppb);
    // Phragmoplast: short antiparallel microtubules at the growing edge of the plate.
    const ph = [];
    for (let k = 0; k < 120; k++) {
      const a = (k / 120) * Math.PI * 2;
      for (const sx of [-1, 1]) ph.push(0, Math.cos(a), Math.sin(a), sx * 1.2, Math.cos(a) * 0.96, Math.sin(a) * 0.96);
    }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(ph, 3));
    this.phragmoplast = new THREE.LineSegments(pg, mtMat.clone());
    this.phragmoplast.visible = false;
    this.cell.add(this.phragmoplast);
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
      if (i === 1 && s.gen > 1) {
        // The sister cell from the last division sits against the new wall.
        const sz = n.userData.size;
        n.scale.set(this.h.x / sz.x, this.h.y / sz.y, this.h.z / sz.z);
        n.position.set(2 * this.h.x + 2 * WALL, 0, 0);
        return;
      }
      n.position.x = Math.abs(x0) > 30 ? x0 + Math.sign(x0) * (this.h.x - BASE.x) : x0 * (this.h.x / BASE.x);
    });
    // Cut plane.
    this.cut.constant = this.cutZ;

    // Light.
    const I = f.I || 0, day = clamp(I / 1100, 0, 1);
    this.sun.intensity = 0.05 + 3.0 * day;
    this.sun.color.setHSL(0.11, 0.6, 0.55 + 0.35 * day);
    this.hemi.intensity = 0.12 + 0.8 * day;
    this.hemi.color.setHSL(lerp(0.62, 0.42, day), 0.45, lerp(0.45, 0.8, day)); // moonlit blue at night
    this.rim.intensity = 0.25 + 0.55 * day;
    this.shafts.children.forEach((p, i) => { p.material.opacity = 0.03 + 0.13 * day * (0.8 + 0.2 * Math.sin(this.time * 0.3 + i)); });
    this.cpMat.emissiveIntensity = 0.03 + 0.07 * day;
    this.neighborCp.emissiveIntensity = 0.05 + 0.25 * day;
    this.mitoMat.emissiveIntensity = 0.2 + clamp((f.resp || 0) / 2.2, 0, 1) * 0.6;
    this.fill.intensity = 1 + 10 * day;

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
    // Sliced open only when we look from inside the cell; whole from outside.
    this.heroCut.constant = this.heroOpen === false ? 1e4 : hc.pos.y;
    this.cpFace.visible = this.heroOpen !== false;
    this.heroCut.normal.set(0, -1, 0);
    // Starch grains scale with the per-chloroplast starch store.
    // Redraw the section when the starch store has changed noticeably.
    const starchK = clamp(s.starch / 150, 0.03, 1.2);
    if (Math.abs(starchK - this.lastStarchDrawn) > 0.04) {
      this.lastStarchDrawn = starchK;
      drawChloroplastSection(this.cpSectionCanvas, starchK);
      this.cpSectionTex.needsUpdate = true;
    }

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
    const side = new THREE.Vector3(1, 0, 0).projectOnPlane(hc.n).normalize();
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
    const centre = new THREE.Vector3(0, 0, -2.5); // cell axis, just behind the cut
    let k = 0;
    if (sub) k = sub.name === 'preprophase' ? sub.prog : 1;
    this.nucleus.position.lerpVectors(this.nucHome.clone().multiply(new THREE.Vector3(this.h.x / BASE.x, 1, 1)), centre, k * k * (3 - 2 * k));
    this.pocket.position.copy(this.nucleus.position).add(new THREE.Vector3(0, 0, -0.8));
    const envVis = !sub || ['preprophase', 'prophase'].includes(sub.name) ? 1 : sub.name === 'prometaphase' ? 1 - sub.prog : 0;
    this.nucEnv.material.opacity = 0.55 * envVis;
    this.nucEnv.visible = envVis > 0.02;
    this.nucleolus.visible = !sub || sub.name === 'preprophase';
    this.chromatin.visible = !sub || ['preprophase', 'prophase'].includes(sub.name);
    const showCh = sub && !['preprophase'].includes(sub.name);
    this.chromosomes.visible = !!showCh;
    this.spindle.visible = !!sub && ['prometaphase', 'metaphase', 'anaphase'].includes(sub.name);
    this.spindle.position.copy(this.nucleus.position);
    this.plate.visible = !!sub && ['telophase', 'cytokinesis'].includes(sub.name);
    this.ppb.visible = !!sub && ['preprophase', 'prophase'].includes(sub.name);
    this.ppb.scale.set(1, 1, 1);
    this.ppb.material.opacity = sub ? (sub.name === 'preprophase' ? 0.3 + 0.6 * sub.prog : 0.9 - 0.7 * sub.prog) : 0;
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
      this.plate.position.set(0, 0, -2.5);
      const R = 0.5 + reach * (this.h.y + 0.5);
      this.plate.scale.set(R, R * (this.h.z / this.h.y), 1);
      // The phragmoplast rides the plate's growing rim.
      this.phragmoplast.visible = true;
      this.phragmoplast.position.copy(this.plate.position);
      this.phragmoplast.scale.set(1, R, R * (this.h.z / this.h.y));
    } else if (this.phragmoplast) this.phragmoplast.visible = false;
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
