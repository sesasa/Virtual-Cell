// The physiology engine: a whole-cell model of a photosynthetic plant
// (mesophyll) cell from a young, expanding leaf.
//
// Units
//   time            sim hours (t = 0 is midnight of day 1)
//   carbon pools    pmol C per cell
//   nitrogen pools  pmol N per cell
//   K+              pmol per cell
//   volume          µm³
//   pressure        MPa
//   leaf-level      µmol m⁻² s⁻¹ (photosynthesis is reported the way a gas-exchange
//                   instrument would, then converted to per-cell fluxes)
//
// Main ingredients (each is a published, widely used model, simplified):
//   - Farquhar–von Caemmerer–Berry (1980) photosynthesis with Bernacchi (2001)
//     temperature responses and a triose-phosphate-utilisation (sink) limit.
//   - Photorespiration from the Rubisco oxygenation/carboxylation ratio 2Γ*/Ci.
//   - Day-time starch/sucrose partitioning with sugar feedback; night-time starch
//     breakdown paced by the circadian clock so ~95 % is used by dawn
//     (Graf et al. 2010; Smith & Stitt 2007).
//   - Nitrate uptake → nitrate reductase → nitrite reductase → GS/GOGAT.
//   - Coarse-grained proteome allocation (photosynthesis / ribosomes / metabolism /
//     housekeeping) regulated by sugar, light and nitrogen signals.
//   - Lockhart (1965) cell expansion: dV/dt = φ·V·(P − Y), with acid growth and
//     wall-integrity feedback; turgor from vacuolar osmolytes (van 't Hoff).
//   - A size- and sugar-gated cell cycle (G1/S/G2/M) ending in cytokinesis.
(function (VC) {
  'use strict';
  const U = VC.U;
  const R = 8.314; // J mol⁻¹ K⁻¹

  const arr = (Ea, Tk) => Math.exp((Ea * (Tk - 298.15)) / (298.15 * R * Tk));
  const peaked = (Ea, Tk, Hd = 200000, S = 650) =>
    (arr(Ea, Tk) * (1 + Math.exp((S * 298.15 - Hd) / (R * 298.15)))) / (1 + Math.exp((S * Tk - Hd) / (R * Tk)));

  // Mitosis sub-phases and their durations (h).
  const M_PHASES = [
    ['preprophase', 0.45],
    ['prophase', 0.35],
    ['prometaphase', 0.25],
    ['metaphase', 0.35],
    ['anaphase', 0.2],
    ['telophase', 0.3],
    ['cytokinesis', 0.9],
  ];
  const M_TOTAL = M_PHASES.reduce((a, b) => a + b[1], 0);

  class Model {
    constructor() {
      this.p = {
        Vcmax25: 62, // µmol m⁻² s⁻¹
        Jmax25: 125,
        alpha: 0.3, // quantum efficiency of electron transport (e⁻/photon absorbed by leaf)
        theta: 0.7,
        TPU25: 8.5,
        cellConv: 1.8, // pmol C h⁻¹ per µmol m⁻² s⁻¹  (≈2×10⁹ mesophyll cells per m² leaf)
        Pphoto0: 3.0, Pribo0: 0.7, Pmet0: 1.5,
        rm: 0.0085, // maintenance respiration, h⁻¹ of structural C at 25 °C
        growthResp: 0.28, // C respired per C built into biomass
        Y: 0.3, // wall yield threshold (MPa)
        phi0: 0.085, // wall extensibility (MPa⁻¹ h⁻¹)
        Ptarget: 0.62,
        kTL: 0.36, // translation, pmol N protein per pmol N ribosomal protein per h
        Umax: 0.75, // nitrate uptake capacity, pmol N h⁻¹
        NRmax: 0.6,
        kexp: 1.6, // phloem/plasmodesmal export coefficient h⁻¹
        CperN: 3.7, // C atoms per N in average amino acid / protein
      };
      this.env = {
        lightMax: 1100, // peak PAR at noon (µmol photons m⁻² s⁻¹)
        dayLength: 14, // h
        co2: 420, // ppm
        temp: 24, // °C
        nitrate: 2.0, // mM in apoplast
        water: -0.15, // apoplast / soil water potential (MPa)
        auxin: 1.0, // relative
        constantLight: false,
      };
      this.reset();
    }

    reset() {
      this.V0 = 30000;
      this.s = {
        t: 4.0,
        V: this.V0,
        Vb: this.V0,
        wall: 42, lipid: 10, nucl: 6.2,
        Pphoto: 3.0, Pribo: 0.7, Pmet: 1.5, Phouse: 1.3,
        protB: 6.5,
        starch: 14, suc: 3.2, vsug: 5, aa: 2.2, no3c: 0.35, no3v: 1.7, K: 3.05,
        atpS: 0.15, nadph: 0.1, atpC: 0.55, npq: 0, pH: 5.6,
        phi: { photo: 0.42, ribo: 0.12, met: 0.26, house: 0.2 },
        phase: 'G1', phaseT: 0, sProg: 0, dna: 2, gen: 1,
        starchDusk: 80, wasLight: false, starving: false,
        cpDivisions: 0, chloroplastsTarget: 12,
      };
      this.f = {};
      this.hist = [];
      this.events = [];
      this.lastSample = -1;
      this.budget = this._emptyBudget();
      this.compute(0); // fill fluxes
    }

    _emptyBudget() {
      return { fix: 0, photoresp: 0, resp: 0, starchIn: 0, starchOut: 0, growth: 0, export: 0, nAssim: 0, water: 0 };
    }

    hour() { return this.s.t % 24; }
    sunrise() { return 12 - this.env.dayLength / 2; }
    sunset() { return 12 + this.env.dayLength / 2; }
    isDay() { const h = this.hour(); return h > this.sunrise() && h < this.sunset(); }

    event(kind, text) {
      this.events.push({ t: this.s.t, kind, text });
      if (this.events.length > 80) this.events.shift();
      if (this.onEvent) this.onEvent(kind, text);
    }

    mSubphase() {
      if (this.s.phase !== 'M') return null;
      let acc = 0;
      for (const [name, d] of M_PHASES) {
        if (this.s.phaseT < acc + d) return { name, prog: (this.s.phaseT - acc) / d, total: this.s.phaseT / M_TOTAL };
        acc += d;
      }
      return { name: 'cytokinesis', prog: 1, total: 1 };
    }

    // Advance by dt hours, in ≤1-minute sub-steps.
    advance(dt) {
      const n = Math.max(1, Math.ceil(dt / (1 / 60)));
      const h = dt / n;
      for (let i = 0; i < n; i++) this.compute(h);
    }

    compute(dt) {
      const s = this.s, e = this.env, p = this.p, f = this.f;
      const h = s.t % 24;
      const sr = this.sunrise(), ss = this.sunset();

      // ---------- Light ----------
      let I = 0;
      if (e.constantLight) I = e.lightMax;
      else if (h > sr && h < ss) I = e.lightMax * Math.sin((Math.PI * (h - sr)) / e.dayLength);
      I = Math.max(0, I);
      f.I = I;
      const light = I > 2;

      // ---------- Photosynthesis (FvCB) ----------
      const Tk = e.temp + 273.15;
      const capP = s.Pphoto / p.Pphoto0;
      const Vcmax = p.Vcmax25 * peaked(65330, Tk);
      const Jmax = p.Jmax25 * peaked(43540, Tk);
      const gStar = 42.75 * arr(37830, Tk);
      const Kc = 404.9 * arr(79430, Tk);
      const Ko = 278.4 * arr(36380, Tk);
      const O = 210;
      const Ci = e.co2 * (light ? 0.7 : 0.95);
      const aI = p.alpha * I;
      const J = (aI + Jmax - Math.sqrt(Math.max(0, (aI + Jmax) ** 2 - 4 * p.theta * aI * Jmax))) / (2 * p.theta);
      const Wc = (Vcmax * Ci) / (Ci + Kc * (1 + O / Ko));
      const Wj = (J * Ci) / (4 * Ci + 8 * gStar);
      const sinkF = 1 / (1 + Math.pow(s.suc / 16, 3)); // sucrose build-up starves the chloroplast of Pi
      const TPU = p.TPU25 * peaked(53100, Tk) * sinkF;
      const Wp = (3 * TPU) / Math.max(0.05, 1 - gStar / Ci);
      let Vc = 0, limiter = 'dark';
      if (light) {
        Vc = Math.min(Wc, Wj, Wp);
        limiter = Vc === Wj ? 'light' : Vc === Wc ? 'rubisco' : 'sink';
        if (Ci <= gStar) Vc = 0;
      }
      const Vo = Vc * (2 * gStar) / Ci;
      f.J = J; f.Wc = Wc; f.Wj = Wj; f.Wp = Wp; f.Vc = Vc; f.Vo = Vo; f.Ci = Ci; f.gStar = gStar;
      f.limiter = limiter;
      f.voRatio = Vc > 0 ? Vo / Vc : 0;
      f.prLossFrac = Vc > 0 ? (0.5 * Vo) / Vc : 0;

      // Excess excitation → non-photochemical quenching (heat dissipation).
      const used = 4 * (Vc + Vo);
      const npqT = light ? U.clamp((aI - used) / Math.max(1, aI), 0, 0.95) : 0;
      // Stromal ATP / NADPH status relaxes quickly toward a supply/demand balance.
      const rS = light ? J / Math.max(1, used) : 0;
      const atpST = light ? U.clamp(0.42 + 0.32 * Math.tanh(1.6 * (rS - 1)) + 0.18 * (I / (I + 150)), 0.08, 0.95) : 0.12;
      const nadT = light ? U.clamp(0.38 + 0.38 * Math.tanh(1.6 * (rS - 1)) + 0.18 * (I / (I + 150)), 0.06, 0.95) : 0.08;
      const kF = 1 - Math.exp(-dt / 0.06);
      s.atpS += (atpST - s.atpS) * kF;
      s.nadph += (nadT - s.nadph) * kF;
      s.npq += (npqT - s.npq) * (1 - Math.exp(-dt / 0.15));

      // Per-cell carbon fluxes (pmol C h⁻¹)
      const k = p.cellConv * capP;
      const fixC = Vc * k;
      const prCO2 = 0.5 * Vo * k;
      const netC = Math.max(0, fixC - prCO2);
      f.fixC = fixC; f.prCO2 = prCO2; f.netC = netC;
      f.o2 = (J / 4) * k * (light ? 1 : 0); // O₂ evolution (pmol h⁻¹)

      // ---------- Day: partition triose phosphate between starch & sucrose ----------
      const sN = s.suc / (s.suc + 4); // sugar signal
      const fs = U.clamp(0.27 + 0.035 * (14 - e.dayLength) + 0.4 * (sN - 0.45), 0.08, 0.72);
      f.fs = netC > 0 ? fs : 0;
      const starchSyn = netC * fs;
      const sucSyn = netC - starchSyn;

      // ---------- Night: clock-paced starch degradation ----------
      if (light && !s.wasLight) {
        this.event('dawn', 'Sunrise — light reactions start');
      }
      if (!light && s.wasLight) {
        s.starchDusk = s.starch;
        this.event('dusk', `Sunset — ${s.starch.toFixed(0)} pmol C of starch banked for the night`);
      }
      s.wasLight = light;
      let starchDeg = 0;
      if (!light) {
        let hd = (sr - h + 24) % 24;
        if (e.constantLight) hd = 12;
        hd = Math.max(0.3, hd);
        starchDeg = Math.max(0, s.starch - 0.05 * s.starchDusk) / hd;
      } else if (s.suc < 0.6 && s.starch > 0.5) {
        starchDeg = 0.15 * s.starch; // emergency mobilisation in very low light
      }
      f.starchSyn = starchSyn; f.starchDeg = starchDeg; f.sucSyn = sucSyn;
      f.hoursToDawn = light ? 0 : (sr - h + 24) % 24;

      // ---------- Proteome allocation (targets, smoothed) ----------
      const Lsig = I / (I + 200);
      const nN = s.aa / (s.aa + 1.5);
      const tRibo = U.clamp(0.05 + 0.17 * sN * nN, 0.05, 0.24);
      const tPhoto = U.clamp(0.4 + 0.12 * (Lsig - 0.35) - 0.24 * (sN - 0.5) + 0.1 * (nN - 0.5), 0.2, 0.6);
      const tHouse = 0.2;
      const tMet = Math.max(0.08, 1 - tRibo - tPhoto - tHouse);
      const kPhi = 1 - Math.exp(-dt / 2.5);
      s.phi.ribo += (tRibo - s.phi.ribo) * kPhi;
      s.phi.photo += (tPhoto - s.phi.photo) * kPhi;
      s.phi.house += (tHouse - s.phi.house) * kPhi;
      s.phi.met += (tMet - s.phi.met) * kPhi;

      // ---------- Nitrogen ----------
      const nitr = Math.max(0, e.nitrate);
      const metCap = s.Pmet / p.Pmet0;
      const uptake = p.Umax * metCap * (nitr / (nitr + 0.4)) * (1 / (1 + Math.pow(s.aa / 5, 2))) * (0.4 + 0.6 * s.atpC);
      const NRact = light ? 1 : 0.22; // NR is inactivated by phosphorylation + 14-3-3 in the dark
      const NR = p.NRmax * metCap * NRact * (s.no3c / (s.no3c + 0.25)) * U.clamp(s.suc / 1.2, 0, 1);
      let vacN = 0.8 * (s.no3c - 0.3); // >0: store in vacuole, <0: remobilise
      if (vacN < 0) vacN = -Math.min(-vacN, 0.35 * s.no3v);
      const prNH3 = 0.5 * Vo * k; // photorespiratory NH₃ (re-fixed by GS2/Fd-GOGAT)
      f.nUptake = uptake; f.NR = NR; f.vacN = vacN; f.prNH3 = prNH3;

      // ---------- Protein synthesis & turnover ----------
      const starving = s.suc < 0.35 && s.starch < 0.6;
      if (starving && !s.starving) this.event('warn', 'Carbon starvation — autophagy recycles proteins for fuel');
      s.starving = starving;
      // Protein density feedback keeps cytoplasm composition stable across generations.
      const dens = (s.Pphoto + s.Pribo + s.Pmet + s.Phouse) / (6.5 * Math.pow(s.V / this.V0, 0.9));
      const densF = U.clamp(1.6 - dens, 0.05, 1);
      const protSyn = densF * p.kTL * s.Pribo * (s.aa / (s.aa + 0.9)) * (0.3 + 0.7 * s.atpC) * (starving ? 0.15 : 1);
      const turnover = 0.0022 * (s.Pphoto + s.Pribo + s.Pmet + s.Phouse);
      const autophagy = starving ? 0.02 * (s.Pphoto + s.Pmet) : 0;
      f.protSyn = protSyn; f.autophagy = autophagy;

      // ---------- Biosynthesis demands (C) ----------
      const rel = s.V / s.Vb;
      const area = Math.pow(s.V / this.V0, 2 / 3);
      const wallTarget = 42 * area;
      const protC = (s.Pphoto + s.Pribo + s.Pmet + s.Phouse) * p.CperN;
      const lipidTarget = 0.4 * protC;
      const nuclTarget = 4.6 * (s.Pribo / p.Pribo0) * 0.75 + 1.6 * (s.dna / 2);
      const suA = s.suc / (s.suc + 1.2);
      let wallSyn = (0.3 * Math.max(0, wallTarget * 1.04 - s.wall) + 0.03) * suA * (0.4 + 0.6 * s.atpC);
      let lipidSyn = 0.25 * Math.max(0, lipidTarget - s.lipid) * suA;
      let nuclSyn = 0.3 * Math.max(0, nuclTarget - s.nucl) * suA;
      let aaC = NR * p.CperN; // carbon skeletons (2-oxoglutarate) for new amino acids

      // ---------- Respiration ----------
      const Bstruct = s.wall + s.lipid + s.nucl + protC;
      const rmT = p.rm * Bstruct * arr(46390, Tk) * (light ? 0.65 : 1); // light inhibits day respiration (Kok effect)

      // ---------- Water, osmotica, turgor ----------
      const RT = 0.008314 * Tk; // L·MPa mol⁻¹
      const osm = 2 * s.K + s.no3v + s.no3c + s.vsug / 6 + s.suc / 12 + 0.6 * s.aa; // pmol osmoles
      const pi = (osm * 1000) / s.V * RT; // MPa (pmol / µm³ = 1000 mol L⁻¹ ... scaled)
      const P = Math.max(0, pi + e.water);
      const hatp = U.clamp(0.35 + 0.45 * e.auxin * s.atpC + 0.15 * (light ? 1 : 0), 0, 1.6);
      const Kup = 0.75 * metCap * s.atpC * U.clamp((p.Ptarget - P) / 0.12, 0, 1) * Math.sqrt(area) + 0.004 * area;
      // Acid growth: wall pH falls with H⁺-ATPase activity; expansins become active.
      const pHT = U.clamp(6.2 - 1.3 * hatp, 4.5, 6.5);
      s.pH += (pHT - s.pH) * (1 - Math.exp(-dt / 0.3));
      const acid = U.clamp((6.1 - s.pH) / 1.0, 0.1, 1.4);
      const wallRatio = s.wall / wallTarget;
      const wallF = U.clamp((wallRatio - 0.9) / 0.1, 0, 1);
      const cycleF = s.phase === 'M' ? 0.1 : 1;
      const phiL = p.phi0 * acid * wallF * cycleF * arr(30000, Tk);
      let dV = phiL * s.V * Math.max(0, P - p.Y); // µm³ h⁻¹
      f.pi = pi; f.P = P; f.phiL = phiL; f.acid = acid; f.hatp = hatp; f.Kup = Kup;
      f.wallRatio = wallRatio; f.dV = dV; f.rgr = dV / s.V;

      // ---------- Sugar budget, with priority to respiration ----------
      const growthC = wallSyn + lipidSyn + nuclSyn + aaC;
      let respC = rmT + p.growthResp * growthC;
      let exportC = p.kexp * Math.max(0, s.suc - 2.5) * (0.6 + 0.4 * sN);
      let vacSug = 0.3 * (s.suc * 1.3 - s.vsug); // exchange with vacuole
      if (vacSug < 0) vacSug = -Math.min(-vacSug, 0.25 * s.vsug);
      const inflow = sucSyn + starchDeg + autophagy * p.CperN;
      const avail = s.suc / Math.max(dt, 1e-6) + inflow;
      let demand = respC + growthC + exportC + Math.max(0, vacSug);
      if (demand > avail * 0.95 && demand > 0) {
        // Respiration first, then growth, then storage and export.
        let left = avail * 0.95;
        respC = Math.min(respC, left); left -= respC;
        const gScale = growthC > 0 ? Math.min(1, left / growthC) : 1;
        wallSyn *= gScale; lipidSyn *= gScale; nuclSyn *= gScale; aaC *= gScale;
        left -= growthC * gScale;
        const rest = exportC + Math.max(0, vacSug);
        const rScale = rest > 0 ? U.clamp(left / rest, 0, 1) : 1;
        exportC *= rScale; if (vacSug > 0) vacSug *= rScale;
      }
      const NRactual = aaC / p.CperN;
      f.wallSyn = wallSyn; f.lipidSyn = lipidSyn; f.nuclSyn = nuclSyn; f.aaC = aaC; f.NRactual = NRactual;
      f.resp = respC; f.export = exportC; f.vacSug = vacSug; f.rm = rmT;
      f.atpMito = respC * 4.5; // ~27 ATP per glucose (6 C)
      f.co2Resp = respC;
      f.netA = Vc - 0.5 * Vo - respC / k; // leaf-equivalent net assimilation (µmol m⁻² s⁻¹)
      if (!isFinite(f.netA)) f.netA = 0;

      // Cytosolic ATP status.
      const atpCT = U.clamp(0.25 + 0.55 * (s.suc / (s.suc + 1.0)) + (light ? 0.12 : 0) - (starving ? 0.25 : 0), 0.05, 0.95);
      s.atpC += (atpCT - s.atpC) * (1 - Math.exp(-dt / 0.2));

      // ---------- Integrate ----------
      if (dt > 0) {
        s.t += dt;
        s.starch = Math.max(0, s.starch + (starchSyn - starchDeg) * dt);
        s.suc = Math.max(0, s.suc + (inflow - respC - wallSyn - lipidSyn - nuclSyn - aaC - exportC - vacSug) * dt);
        s.vsug = Math.max(0, s.vsug + vacSug * dt);
        s.wall += wallSyn * dt;
        s.lipid += lipidSyn * dt;
        s.nucl += nuclSyn * dt;
        s.no3c = Math.max(0, s.no3c + (uptake - NRactual - vacN) * dt);
        s.no3v = Math.max(0, s.no3v + vacN * dt);
        const totP = s.Pphoto + s.Pribo + s.Pmet + s.Phouse;
        const syn = Math.min(protSyn, s.aa / dt);
        s.aa = Math.max(0, s.aa + (NRactual + turnover + autophagy - syn) * dt);
        // Autophagy: amino-acid carbon is respired, N is retained.
        for (const key of ['Pphoto', 'Pribo', 'Pmet', 'Phouse']) {
          const frac = s[key] / totP;
          s[key] -= turnover * frac * dt;
        }
        if (autophagy > 0) {
          const a = autophagy * dt;
          const sumPM = s.Pphoto + s.Pmet;
          s.Pphoto -= (a * s.Pphoto) / sumPM;
          s.Pmet -= (a * s.Pmet) / sumPM;
        }
        s.Pphoto += syn * s.phi.photo * dt;
        s.Pribo += syn * s.phi.ribo * dt;
        s.Pmet += syn * s.phi.met * dt;
        s.Phouse += syn * s.phi.house * dt;
        f.protSynActual = syn;
        s.K += Kup * dt;
        s.V += dV * dt;

        // Budget accumulators (for the 'today' summary).
        const b = this.budget;
        b.fix += fixC * dt; b.photoresp += prCO2 * dt; b.resp += respC * dt;
        b.starchIn += starchSyn * dt; b.starchOut += starchDeg * dt;
        b.growth += (wallSyn + lipidSyn + nuclSyn + aaC) * dt; b.export += exportC * dt;
        b.nAssim += NRactual * dt; b.water += dV * dt;

        this._cellCycle(dt, sN);

        // Chloroplast biogenesis: count follows photosynthetic protein.
        const cpT = Math.round(12 * (s.Pphoto / p.Pphoto0));
        if (cpT > s.chloroplastsTarget) {
          s.chloroplastsTarget = cpT;
          s.cpDivisions++;
          this.event('cp', 'A chloroplast divides (FtsZ ring constriction)');
          if (this.onChloroplastDivision) this.onChloroplastDivision();
        }

        if (s.t - this.lastSample >= 0.1) {
          this.lastSample = s.t;
          this.hist.push({
            t: s.t, I, A: f.netA, starch: s.starch, suc: s.suc + s.vsug, aa: s.aa,
            P, V: s.V, atpS: s.atpS, nadph: s.nadph, rgr: f.rgr, resp: respC,
          });
          if (this.hist.length > 720) this.hist.shift();
        }
      }
      // Track P crossing below yield.
      if (P < p.Y + 0.01 && !s.lowTurgor) { s.lowTurgor = true; this.event('warn', 'Turgor below yield threshold — expansion stalls'); }
      if (P > p.Y + 0.08) s.lowTurgor = false;
      if (limiter === 'sink' && light && !s.sinkWarn && s.suc > 10) { s.sinkWarn = true; this.event('info', 'Sugar is piling up: photosynthesis now sink-limited'); }
      if (s.suc < 6) s.sinkWarn = false;
    }

    _cellCycle(dt, sN) {
      const s = this.s;
      const rel = s.V / s.Vb;
      s.phaseT += dt;
      if (s.phase === 'G1') {
        // CYCD3 (cyclin D) is induced by sucrose: sugar gates the G1/S transition.
        if (rel >= 1.3 && sN > 0.3) this._enter('S', 'DNA replication begins (G1 → S)');
      } else if (s.phase === 'S') {
        s.sProg = Math.min(1, s.sProg + (dt / 6) * (sN > 0.15 ? 1 : 0.2));
        s.dna = 2 + 2 * s.sProg;
        if (s.sProg >= 1) this._enter('G2', 'Genome duplicated: 4C DNA (S → G2)');
      } else if (s.phase === 'G2') {
        const protN = s.Pphoto + s.Pribo + s.Pmet + s.Phouse;
        if (rel >= 1.85 && protN >= 1.7 * s.protB) this._enter('M', 'Mitosis begins: preprophase band forms');
      } else if (s.phase === 'M') {
        const sub = this.mSubphase();
        if (sub && sub.name !== s.lastSub) {
          s.lastSub = sub.name;
          if (this.onSubphase) this.onSubphase(sub.name);
        }
        if (s.phaseT >= M_TOTAL) this._divide();
      }
    }

    _enter(phase, text) {
      this.s.phase = phase;
      this.s.phaseT = 0;
      this.event('cycle', text);
    }

    _divide() {
      const s = this.s;
      for (const key of ['V', 'wall', 'lipid', 'nucl', 'Pphoto', 'Pribo', 'Pmet', 'Phouse', 'starch', 'suc', 'vsug', 'aa', 'no3c', 'no3v', 'K', 'starchDusk']) {
        s[key] /= 2;
      }
      s.Vb = s.V;
      // Each daughter keeps half the parent wall plus its half of the new cell plate.
      s.wall = Math.max(s.wall, 42 * Math.pow(s.V / this.V0, 2 / 3) * 0.98);
      s.protB = s.Pphoto + s.Pribo + s.Pmet + s.Phouse;
      s.dna = 2; s.sProg = 0; s.gen += 1; s.lastSub = null;
      s.chloroplastsTarget = Math.round(12 * (s.Pphoto / this.p.Pphoto0));
      this._enter('G1', `Cytokinesis complete — generation ${s.gen} begins`);
      if (this.onDivide) this.onDivide();
    }

    // Convenience accessors for the UI.
    get proteinN() { const s = this.s; return s.Pphoto + s.Pribo + s.Pmet + s.Phouse; }
    get cycleFraction() {
      const s = this.s, rel = s.V / s.Vb;
      if (s.phase === 'G1') return 0.42 * U.clamp((rel - 1) / 0.3, 0, 1);
      if (s.phase === 'S') return 0.42 + 0.25 * s.sProg;
      if (s.phase === 'G2') return 0.67 + 0.2 * U.clamp((rel - 1.55) / 0.3, 0, 1);
      return 0.87 + 0.13 * Math.min(1, s.phaseT / M_TOTAL);
    }

    // Carbon flows for the Sankey diagram (pmol C h⁻¹).
    carbonFlows() {
      const f = this.f;
      return {
        sources: { 'CO₂ fixed': f.fixC || 0, 'Starch broken down': f.starchDeg || 0 },
        photoresp: f.prCO2 || 0,
        sinks: {
          'Starch store': f.starchSyn || 0,
          'Respiration': f.resp || 0,
          'Cell wall': f.wallSyn || 0,
          'Amino acids': f.aaC || 0,
          'Membranes & RNA': (f.lipidSyn || 0) + (f.nuclSyn || 0),
          'Vacuole store': Math.max(0, f.vacSug || 0),
          'Export to plant': f.export || 0,
        },
      };
    }
  }
  Model.M_PHASES = M_PHASES;
  Model.M_TOTAL = M_TOTAL;
  VC.Model = Model;
})(window.VC);
