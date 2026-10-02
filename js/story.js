// The guided story. Chapters are sequences of beats; each beat sets the
// camera, spotlight, labels, molecular inset, clock speed and narration.
// The simulation keeps running underneath, so the numbers quoted in the
// narration are the cell's live values.
(function (VC) {
  'use strict';
  const U = VC.U;

  // ---------- picking subjects ----------
  const pick = {
    // A chloroplast on the upper face, right of centre: lit and easy to see.
    cp(app) {
      const L = app.scene.layout, o = app.scene.outline;
      const top = L.chloroplasts.filter((c) => c.y < o.cy - o.H * 0.6 && c.divide === 0);
      const arr = top.length ? top : L.chloroplasts;
      return arr.reduce((a, b) => (Math.abs(b.x - o.cx - o.W * 0.25) < Math.abs(a.x - o.cx - o.W * 0.25) ? b : a));
    },
    mito(app, near) {
      const L = app.scene.layout;
      if (!near) return L.mitochondria[0];
      return app.scene.nearestOf('mito', near.x, near.y);
    },
    perox(app, near) { return app.scene.nearestOf('perox', near.x, near.y); },
    golgi(app) {
      const n = app.scene.nucleus;
      return app.scene.nearestOf('golgi', n.x, n.y);
    },
    pmPoint(app, t) { const p = app.scene.outline.pm(t); return { x: p.x, y: p.y, t }; },
  };

  const lab = (o, text, sub, extra = {}) => (o ? { x: o.x, y: o.y, text, sub, ...extra } : null);
  const view = (obj, w) => ({ obj, w });

  // Shortcuts for live values in narration.
  const pct = (x) => `${Math.round(x * 100)}%`;
  const limText = (m) => ({ light: 'light — the electron transport chain can’t keep up', rubisco: 'Rubisco — the enzyme is working flat out', sink: 'sugar use — sucrose is backing up', dark: 'darkness' }[m.f.limiter]);

  const CHAPTERS = [
    {
      id: 'meet', title: 'A cell in a leaf', start: { hour: 4.2, window: [3.9, 4.6] },
      beats: [
        {
          cam: 'wide', speed: 1,
          text: 'This is a single living cell from inside a young leaf: a mesophyll cell, about 45 micrometres long. Around it are its neighbours, and between them are air spaces that carry gases in and out of the leaf.',
          labels: (a) => [lab({ x: a.scene.outline.cx + a.scene.outline.W + 150, y: a.scene.outline.cy - a.scene.outline.H - 30 }, 'Air space', 'CO₂ in, O₂ out')],
        },
        {
          cam: (a) => view(pick.pmPoint(a, 0.75), 260), speed: 1,
          focus: (a) => [{ ...pick.pmPoint(a, 0.75), r: 90 }],
          text: 'The outer box is the cell wall: cables of cellulose embedded in a gel of pectin and hemicellulose. It holds back an internal pressure about three times that of a car tyre. Narrow channels called plasmodesmata cross it and connect the cell to its neighbours.',
          labels: (a) => {
            const pd = a.scene.layout.plasmodesmata.find((p) => Math.abs(p.t - 0.75) < 0.02) || a.scene.layout.plasmodesmata[0];
            const q = a.scene.outline.pm(pd.t);
            const w = a.scene.outline.pm(0.73);
            return [lab({ x: w.x, y: w.y - 4 }, 'Cell wall', 'cellulose + pectin', { dy: -1 }), lab(q, 'Plasmodesma', 'channel to neighbour', { dy: 1 })];
          },
        },
        {
          cam: 'cell', speed: 1,
          focus: (a) => [{ x: a.scene.outline.cx + 40, y: a.scene.outline.cy, r: a.scene.outline.H * 0.9 }],
          text: 'Most of the inside is one water-filled compartment, the central vacuole. It stores water, salts, sugars and nitrate, and it presses the living cytoplasm into a thin layer against the wall.',
          labels: (a) => [lab({ x: a.scene.outline.cx + 40, y: a.scene.outline.cy }, 'Central vacuole', 'water, ions, sugar, nitrate'), lab(a.scene.outline.at(0.12, 0.5), 'Cytoplasm', 'a thin living layer', { dy: 1 })],
        },
        {
          cam: (a) => view(a.scene.nucleus, 300), speed: 1,
          focus: (a) => [{ x: a.scene.nucleus.x, y: a.scene.nucleus.y, r: 80 }],
          text: 'The nucleus holds the genome: about 27,000 protein-coding genes in the model plant Arabidopsis. It sits in a pocket of thicker cytoplasm, tied to the far side of the cell by strands that cross the vacuole.',
          labels: (a) => [lab(a.scene.nucleus, 'Nucleus', 'genome, ~27,000 genes'), lab({ x: a.scene.nucleus.x + 12, y: a.scene.nucleus.y - 8 }, 'Nucleolus', 'ribosome factory', { dx: 1, dy: 1 })],
          inset: null,
        },
        {
          cam: (a) => view(pick.cp(a), 230), speed: 1, ref: (a) => ({ cp: pick.cp(a) }),
          focus: (a, r) => [{ x: r.cp.x, y: r.cp.y, r: 55 }],
          text: 'Lining the edges are chloroplasts, the cell’s solar-powered sugar factories. They descend from a cyanobacterium taken in more than a billion years ago, and they still carry their own small genome. The white grains inside are starch.',
          labels: (a, r) => [lab(r.cp, 'Chloroplast', 'photosynthesis'), lab({ x: r.cp.x + Math.cos(r.cp.a) * 10, y: r.cp.y + Math.sin(r.cp.a) * 10 }, 'Starch grain', 'yesterday’s savings', { dy: 1 })],
        },
        {
          cam: (a, r) => view(r.mi, 220), follow: true, speed: 1,
          ref: (a) => { const cp = pick.cp(a); const mi = pick.mito(a, cp); return { cp, mi, px: pick.perox(a, mi) }; },
          focus: (a, r) => [{ x: r.mi.x, y: r.mi.y, r: 40 }, { x: r.px.x, y: r.px.y, r: 30 }],
          text: 'Smaller organelles drift past: mitochondria, which burn sugar for energy, and peroxisomes, which clean up after a costly side reaction of photosynthesis. Everything is carried along tracks of actin. This cytoplasmic streaming is shown at real speed, a few micrometres per second.',
          labels: (a, r) => [lab(r.mi, 'Mitochondrion', 'respiration'), lab(r.px, 'Peroxisome', 'photorespiration, detox', { dy: 1 })],
        },
        {
          cam: (a, r) => view(r.g, 200), follow: true, speed: 1, ref: (a) => ({ g: pick.golgi(a) }),
          focus: (a, r) => [{ x: r.g.x, y: r.g.y, r: 60 }],
          text: 'The endoplasmic reticulum forms a membrane network through the cytoplasm. Next to it, small Golgi stacks package proteins and wall materials into vesicles and send them to the surface.',
          labels: (a, r) => {
            const n = a.scene.layout.er.nodes.find((q) => q.rough) || a.scene.layout.er.nodes[0];
            const p = a.scene.outline.at(n.t, n.d);
            return [lab(r.g, 'Golgi stack', 'packaging & shipping'), lab(p, 'Endoplasmic reticulum', 'membrane network', { dy: 1 })];
          },
        },
        {
          cam: 'cell', speed: 6, until: (m) => m.f.I > 5, maxWait: 40,
          text: (m) => `It is ${U.fmtClock(m.s.t).text}. The chloroplasts are dark. Overnight the cell has lived on starch saved the day before, and the grains are nearly used up. Dawn is coming.`,
        },
      ],
    },
    {
      id: 'light', title: 'First light', start: { hour: 5.2, window: [4.95, 9] },
      beats: [
        {
          cam: 'cell', speed: 4, until: (m) => m.f.I > 200, maxWait: 25,
          text: 'Sunrise. Photons start to stream into the leaf. Most pass straight through the clear vacuole and are absorbed by chloroplasts.',
          groups: ['light'],
        },
        {
          cam: (a, r) => view(r.cp, 120), speed: 1.5, ref: (a) => ({ cp: pick.cp(a) }), inset: 'thylakoid', groups: ['light'],
          focus: (a, r) => [{ x: r.cp.x, y: r.cp.y, r: 50 }],
          text: 'Inside each chloroplast are stacks of flattened membrane sacs called thylakoids. Pigment antennas catch the light and pass its energy to Photosystem II.',
          labels: (a, r) => [lab({ x: r.cp.x + Math.cos(r.cp.a) * r.cp.grana[1].u * r.cp.len / 2, y: r.cp.y + Math.sin(r.cp.a) * r.cp.grana[1].u * r.cp.len / 2 }, 'Granum', 'stack of thylakoids')],
        },
        {
          cam: null, speed: 1.5, inset: 'thylakoid', groups: ['light'],
          text: 'Photosystem II does something remarkable: it splits water. Two water molecules give up four electrons and four protons and release one O₂. The oxygen you breathe was set free this way.',
        },
        {
          cam: null, speed: 1.5, inset: 'thylakoid', groups: ['light'],
          text: 'The electrons travel down a chain, from plastoquinone to cytochrome b₆f to plastocyanin, pumping protons into the thylakoid as they go. Photosystem I re-energises them, and they end up in NADPH.',
        },
        {
          cam: null, speed: 1.5, inset: 'thylakoid', groups: ['light'],
          text: (m) => `Protons rush back out through ATP synthase and spin it like a turbine, making ATP. Light energy is now chemical energy. Right now electrons flow at ${U.fmt(m.f.J, 0)} µmol per m² of leaf per second.`,
        },
        {
          cam: 'cell', speed: 4, inset: 'thylakoid', groups: ['light'],
          text: 'Oxygen leaves the cell and diffuses out through the air spaces. As the sun climbs, the ATP and NADPH gauges in the inset fill up.',
        },
      ],
    },
    {
      id: 'calvin', title: 'Fixing carbon', start: { hour: 7.5, window: [6.5, 12] },
      beats: [
        {
          cam: (a, r) => view({ x: r.cp.x, y: r.cp.y - 50 }, 300), speed: 2, ref: (a) => ({ cp: pick.cp(a) }), groups: ['carbon'],
          focus: (a, r) => [{ x: r.cp.x, y: r.cp.y - 40, r: 110 }],
          text: (m) => `Carbon dioxide drifts in from the air spaces. Air holds about ${m.env.co2} CO₂ molecules per million. They dissolve in the wall water and cross the membranes into the chloroplast.`,
          labels: (a, r) => [lab({ x: r.cp.x - 20, y: r.cp.y - 60 }, 'CO₂', 'from the air space')],
        },
        {
          cam: (a, r) => view(r.cp, 130), speed: 2, ref: (a) => ({ cp: pick.cp(a) }), inset: 'calvin', groups: ['carbon'],
          focus: (a, r) => [{ x: r.cp.x, y: r.cp.y, r: 50 }],
          text: 'In the chloroplast’s fluid interior waits Rubisco, the most abundant protein on Earth. It is slow, handling about three CO₂ molecules per second, so the cell makes huge amounts of it: up to half of all the soluble protein in a leaf.',
        },
        {
          cam: null, speed: 2, inset: 'calvin', groups: ['carbon'],
          text: 'Rubisco attaches CO₂ to a five-carbon sugar called RuBP. ATP and NADPH from the light reactions turn the products into a three-carbon sugar, triose phosphate. For every three CO₂ fixed, one triose phosphate is profit; the other five are recycled to keep the cycle turning.',
        },
        {
          cam: 'cell', speed: 3, inset: 'calvin', groups: ['carbon'],
          text: (m) => `Right now, photosynthesis is limited by ${limText(m)}. Net uptake is ${U.fmt(m.f.netA, 1)} µmol CO₂ per m² of leaf per second, a typical value for a healthy leaf.`,
        },
      ],
    },
    {
      id: 'photoresp', title: 'A costly mistake', start: { hour: 10, window: [9, 15] },
      beats: [
        {
          cam: (a, r) => view(r.mid, 260), speed: 1.5, inset: 'photoresp', groups: ['photoresp'],
          ref: (a) => { const cp = pick.cp(a); const px = pick.perox(a, cp); const mi = pick.mito(a, px); return { cp, px, mi, mid: { x: (cp.x + px.x + mi.x) / 3, y: (cp.y + px.y + mi.y) / 3 } }; },
          focus: (a, r) => [{ x: r.cp.x, y: r.cp.y, r: 45 }, { x: r.px.x, y: r.px.y, r: 30 }, { x: r.mi.x, y: r.mi.y, r: 30 }],
          labels: (a, r) => [lab(r.cp, 'Chloroplast'), lab(r.px, 'Peroxisome', null, { dy: 1 }), lab(r.mi, 'Mitochondrion', null, { dx: 1 })],
          text: (m) => `Rubisco can’t fully tell CO₂ from O₂. Right now it grabs oxygen in about ${Math.round(m.f.voRatio * 100)} of every 100 reactions, which makes a two-carbon by-product that poisons the Calvin cycle.`,
        },
        {
          cam: null, speed: 1.5, inset: 'photoresp', groups: ['photoresp'],
          text: 'Salvaging it takes a relay through three organelles: chloroplast, peroxisome, mitochondrion, peroxisome and back to the chloroplast. Follow the pink molecules. Along the way the cell releases CO₂ and ammonia, and the ammonia has to be captured again.',
        },
        {
          cam: null, speed: 1.5, inset: 'photoresp', groups: ['photoresp'],
          text: (m) => `The salvage costs energy and loses carbon: ${pct(m.f.prLossFrac)} of what Rubisco fixes leaves again as CO₂. Hot days make it worse, because oxygenation rises faster with temperature than carboxylation.`,
        },
      ],
    },
    {
      id: 'allocate', title: 'Where should the sugar go?', start: { hour: 11, window: [10, 16] },
      beats: [
        {
          cam: (a, r) => view(r.cp, 150), speed: 2, ref: (a) => ({ cp: pick.cp(a) }), inset: 'allocation', groups: ['carbon'],
          focus: (a, r) => [{ x: r.cp.x, y: r.cp.y, r: 70 }],
          text: 'Every new triose phosphate faces a choice. It can leave the chloroplast through the triose-phosphate/phosphate translocator and be built into sucrose in the cytosol…',
        },
        {
          cam: null, speed: 3, inset: 'allocation', groups: ['carbon'],
          text: (m) => `…or it can stay in the chloroplast and be stored as starch. Watch the starch grains swell through the day. Right now ${pct(m.f.fs)} of new carbon is going into starch, saved for the night.`,
        },
        {
          cam: 'cell', speed: 3, inset: 'allocation', groups: ['carbon', 'energy'],
          text: 'In the cytosol, sucrose is shared among competing demands: fuel for the mitochondria, building blocks for the wall and for proteins, osmotic storage in the vacuole, and export to the rest of the plant through plasmodesmata. Follow the orange molecules.',
        },
        {
          cam: null, speed: 3, inset: 'allocation', groups: ['carbon'],
          text: (m) => `The split changes with conditions. When sugar piles up, it signals the nucleus to turn down photosynthesis genes and sends more carbon to starch. When sugar runs short, the reverse happens. Right now ${pct(m.f.export / Math.max(1e-6, m.f.sucSyn + m.f.starchDeg))} of the sugar leaves to feed growing parts of the plant.`,
        },
      ],
    },
    {
      id: 'mito', title: 'Power plants', start: { hour: 12, window: [11, 17] },
      beats: [
        {
          cam: (a, r) => view(r.mi, 90), follow: true, speed: 2, ref: (a) => ({ mi: pick.mito(a, pick.cp(a)) }), inset: 'mito', groups: ['energy', 'carbon'],
          focus: (a, r) => [{ x: r.mi.x, y: r.mi.y, r: 28 }],
          labels: (a, r) => [lab(r.mi, 'Mitochondrion', 'cristae = folded inner membrane')],
          text: 'Mitochondria break sugar down through glycolysis and the Krebs (TCA) cycle. The electrons they strip off run down a second transport chain to oxygen, pumping protons, and ATP synthase turns that gradient into ATP.',
        },
        {
          cam: null, follow: true, speed: 2, inset: 'mito', groups: ['energy'],
          text: 'Plant mitochondria have an escape valve, the alternative oxidase (AOX). It hands electrons straight to oxygen without pumping, so the energy is released as heat. This protects the cell when the chain is overloaded, for example under stress.',
        },
        {
          cam: 'cell', speed: 3, inset: 'mito', groups: ['energy'],
          text: (m) => `Yellow sparks are ATP leaving mitochondria to power protein synthesis, pumps and wall building. Mitochondria keep working by day, burning ${U.fmt(m.f.resp, 1)} pmol of sugar carbon per hour. After dark they are the cell’s only power source.`,
        },
      ],
    },
    {
      id: 'nitrogen', title: 'Bringing in nitrogen', start: { hour: 13, window: [12, 17.5] },
      beats: [
        {
          cam: (a) => view(pick.pmPoint(a, 0.82), 220), speed: 2, inset: 'nitrogen', groups: ['nitrogen'],
          focus: (a) => [{ ...pick.pmPoint(a, 0.82), r: 90 }],
          labels: (a) => { const p = a.scene.layout.pmProteins.find((q) => q.type === 'nrt' && q.t > 0.7) || a.scene.layout.pmProteins[3]; return [lab(a.scene.outline.pm(p.t), 'NRT1.1 nitrate transporter', 'co-transports 2 H⁺', { dy: -1 })]; },
          text: 'Sugar alone can’t build a cell: proteins and DNA also need nitrogen. It arrives from the roots as nitrate, which NRT transporters pull across the membrane together with protons.',
        },
        {
          cam: 'cell', speed: 2, inset: 'nitrogen', groups: ['nitrogen'],
          text: 'Nitrate reductase in the cytosol turns nitrate into nitrite. In the chloroplast, nitrite reductase uses electrons straight from the light reactions to make ammonium. Leaves do much of their nitrogen work in the light for this reason.',
        },
        {
          cam: null, speed: 2, inset: 'nitrogen', groups: ['nitrogen'],
          text: 'Ammonium is toxic, so it is captured immediately by two enzymes, GS and GOGAT, which build it into glutamine and glutamate. From these, the cell makes all its other amino acids (the green squares). Spare nitrate is stored in the vacuole for later.',
        },
      ],
    },
    {
      id: 'genes', title: 'From gene to protein', start: { hour: 14, window: [12.5, 18] },
      beats: [
        {
          cam: (a) => view(a.scene.nucleus, 280), speed: 2, inset: 'expression', groups: ['genes'],
          focus: (a) => [{ x: a.scene.nucleus.x, y: a.scene.nucleus.y, r: 95 }],
          labels: (a) => [lab(a.scene.nucleus, 'Nucleus', 'transcription')],
          text: 'Inside the nucleus, light has switched on hundreds of genes. RNA polymerase copies them into messenger RNA (red), which leaves through nuclear pores.',
        },
        {
          cam: null, speed: 2, inset: 'expression', groups: ['genes', 'nitrogen'],
          text: 'Ribosomes read the mRNA and join amino acids into proteins at about five to ten per second. Proteins for the membrane and the wall are made on the rough ER, then travel through the Golgi and leave in vesicles.',
        },
        {
          cam: (a, r) => view(r.cp, 220), speed: 2, ref: (a) => ({ cp: pick.cp(a) }), inset: 'expression', groups: ['genes'],
          focus: (a, r) => [{ x: r.cp.x, y: r.cp.y, r: 60 }],
          text: 'Most chloroplast proteins are made outside the chloroplast and imported through the TOC and TIC gates. Rubisco itself is a joint project: its small subunits come from nuclear genes, its large subunits from the chloroplast’s own DNA.',
        },
        {
          cam: 'cell', speed: 3, inset: 'expression', groups: ['genes'],
          text: (m) => `Deciding how to divide protein-making capacity, the proteome, is the cell’s most important allocation decision. Right now ${pct(m.s.phi.photo)} of new protein goes to photosynthesis, ${pct(m.s.phi.ribo)} to new ribosomes and ${pct(m.s.phi.met)} to metabolism and transport.`,
        },
      ],
    },
    {
      id: 'growth', title: 'Water, pressure and growth', start: { hour: 15, window: [13, 18.5] },
      beats: [
        {
          cam: (a) => view(pick.pmPoint(a, 0.68), 220), speed: 2, inset: 'growth', groups: ['water'],
          focus: (a) => [{ ...pick.pmPoint(a, 0.68), r: 90 }],
          labels: (a) => { const p = a.scene.layout.pmProteins.find((q) => q.type === 'aquaporin' && q.t > 0.6) || a.scene.layout.pmProteins[0]; return [lab(a.scene.outline.pm(p.t), 'Aquaporin', 'water channel', { dy: -1 })]; },
          text: (m) => `Plant cells grow mainly by taking up water. Solutes in the vacuole draw water in through aquaporin channels, and the swelling vacuole pushes outward. This is turgor pressure, now ${U.fmt(m.f.P, 2)} MPa.`,
        },
        {
          cam: null, speed: 2, inset: 'growth', groups: ['water'],
          text: 'The wall resists. The cell grows only when turgor exceeds a yield threshold and the wall is loosened. Proton pumps acidify the wall, which activates expansin proteins that let the cellulose cables slip past each other.',
        },
        {
          cam: null, speed: 2, inset: 'growth', groups: ['water', 'carbon'],
          text: 'Just under the membrane, cellulose synthase complexes move along microtubule tracks and spin out new cellulose fibres. The fibres wrap around the cell like barrel hoops, so it grows longer instead of rounder.',
        },
        {
          cam: 'cell', speed: 12, inset: 'growth', groups: ['water'],
          text: (m) => `Filling the vacuole with water is cheap compared with making new cytoplasm, so a plant cell can grow large at low cost. Watch the outline lengthen: the volume is now ${U.fmt(m.s.V / 1000, 1)} thousand µm³, ${U.fmt(m.s.V / m.s.Vb, 2)}× its size at birth.`,
        },
      ],
    },
    {
      id: 'night', title: 'The night shift', start: { hour: 18, window: [17.5, 18.9] },
      beats: [
        {
          cam: 'cell', speed: 8, until: (m) => m.f.I < 1, maxWait: 30, inset: 'starch',
          text: 'Evening. The light fades, the Calvin cycle slows to a stop and the chloroplasts go quiet. The starch grains are now at their largest.',
        },
        {
          cam: (a, r) => view(r.cp, 160), speed: 6, ref: (a) => ({ cp: pick.cp(a) }), inset: 'starch', groups: ['carbon'],
          focus: (a, r) => [{ x: r.cp.x, y: r.cp.y, r: 60 }],
          text: (m) => {
            const hrs = m.f.I > 1 ? 24 - m.env.dayLength : Math.max(1, Math.round(m.f.hoursToDawn));
            return `Now the starch is drawn down. The circadian clock sets the pace: the store is divided by the ${hrs} hours left until dawn, so that about 5% remains at sunrise. In effect, the plant does a division sum.`;
          },
        },
        {
          cam: 'cell', speed: 25, inset: 'starch', groups: ['carbon', 'energy'], until: (m) => m.f.I > 1, maxWait: 40,
          text: 'Maltose (pale yellow) leaves the chloroplasts and is rebuilt into sucrose, which keeps the mitochondria, protein synthesis and growth going through the night. Many leaves grow fastest around dawn.',
        },
      ],
    },
    {
      id: 'divide', title: 'Two from one', start: null,
      beats: [
        {
          cam: 'cellwide', speed: 70, inset: 'cycle', until: (m) => m.s.phase === 'M', maxWait: 80,
          text: 'Time-lapse. Over the next day, the cell keeps growing, copies its DNA and doubles its organelles. Chloroplasts divide by pinching in two, squeezed by a ring of FtsZ protein inherited from their bacterial ancestors.',
        },
        {
          cam: (a) => view({ x: a.scene.outline.cx, y: a.scene.outline.cy }, a.scene.outline.H * 3.2), speed: 2, inset: 'cycle',
          until: (m) => { const s = m.mSubphase(); return !s || s.name === 'prometaphase'; }, maxWait: 60,
          focus: (a) => [{ x: a.scene.nucleus.x, y: a.scene.nucleus.y, r: 90 }],
          text: 'Mitosis begins. The nucleus moves to the middle of the cell, and a band of microtubules (cyan) marks where the new wall will form. This preprophase band is unique to plants. The chromosomes condense.',
        },
        {
          cam: null, speed: 1.5, inset: 'cycle', until: (m) => { const s = m.mSubphase(); return !s || s.name === 'telophase'; }, maxWait: 60,
          focus: (a) => [{ x: a.scene.nucleus.x, y: a.scene.nucleus.y, r: 100 }],
          text: 'The nuclear envelope breaks down. Spindle fibres line up the chromosomes in the middle, then pull the two copies of each one to opposite poles.',
        },
        {
          cam: null, speed: 2.2, inset: 'cycle', until: (m) => m.s.phase !== 'M', maxWait: 70,
          focus: (a) => [{ x: a.scene.outline.cx, y: a.scene.outline.cy, r: a.scene.outline.H * 1.2 }],
          text: 'A plant cell can’t pinch in two, because the wall is in the way. Instead, Golgi vesicles gather in the middle of a structure called the phragmoplast and fuse into a new wall, the cell plate. It grows outward until it meets the parent wall.',
        },
        {
          cam: 'wide', speed: 3, inset: 'cycle',
          text: (m) => `Two cells. This one, generation ${m.s.gen}, will grow and divide again. Repeated millions of times, this is how a leaf is built.`,
          labels: (a) => { const r = a.scene.neighbors.find((n) => n.sister); return r ? [lab({ x: r.outline.cx, y: r.outline.cy }, 'Sister cell')] : []; },
        },
        {
          cam: 'cell', speed: 10, inset: 'allocation',
          text: 'Now explore on your own. Change light, CO₂, temperature, water or nitrate in the controls, and watch the cell reallocate its resources. Click any structure to find out what it is doing.',
          end: true,
        },
      ],
    },
  ];

  class Story {
    constructor(app) {
      this.app = app;
      this.chapters = CHAPTERS;
      this.ci = 0; this.bi = 0;
      this.t = 0;
      this.playing = false;
      this.active = false;
      this.refs = {};
    }

    get beat() { return this.chapters[this.ci].beats[this.bi]; }

    start(ci = 0) {
      this.active = true;
      this.playing = true;
      this.goto(ci, 0);
    }

    stop() {
      this.active = false;
      this.playing = false;
      const r = this.app.renderer;
      r.focus = null; r.labels = [];
      this.app.setInset(null);
      this.app.setGroups(null);
    }

    goto(ci, bi) {
      this.ci = U.clamp(ci, 0, this.chapters.length - 1);
      this.bi = bi;
      const ch = this.chapters[this.ci];
      if (bi === 0 && ch.start) this._warpTo(ch.start);
      this._enterBeat();
    }

    // Jumping into a chapter fast-forwards the clock to a fitting time of day.
    _warpTo(st) {
      const m = this.app.model;
      const inWin = (h) => (st.window[1] <= 24 ? h >= st.window[0] && h <= st.window[1] : h >= st.window[0] || h <= st.window[1] - 24);
      if (inWin(m.hour())) return;
      let guard = 0;
      while (!inWin(m.hour()) && guard < 2000) { m.advance(1 / 30); guard++; }
      this.app.particles.clear();
      this.app.flashNote(`Time-lapse to ${U.fmtClock(m.s.t).text}`);
    }

    _enterBeat() {
      const app = this.app, b = this.beat;
      this.t = 0;
      this.refs = b.ref ? b.ref(app) : this.refs;
      this._camFor(b, 2.2);
      app.setInset(b.inset !== undefined ? b.inset : app.currentInset);
      app.setGroups(b.groups || null);
      app.setSpeed(b.speed != null ? b.speed : 2, true);
      this._render();
      app.onStoryChange && app.onStoryChange();
    }

    _camFor(b, dur) {
      const app = this.app, r = app.renderer;
      if (!b.cam) return;
      let target;
      if (b.cam === 'cell') target = r.fitCell(1.25);
      else if (b.cam === 'cellwide') target = r.fitCell(1.6);
      else if (b.cam === 'wide') target = r.fitCell(2.3);
      else {
        const v = typeof b.cam === 'function' ? b.cam(app, this.refs) : b.cam;
        const z = r.zoomForWidth(v.w);
        target = { x: v.obj.x, y: v.obj.y, z };
      }
      r.cam.flyTo(target.x, target.y, target.z, dur);
    }

    text() {
      const b = this.beat;
      return typeof b.text === 'function' ? b.text(this.app.model) : b.text;
    }

    duration() {
      const words = this.text().split(/\s+/).length;
      return Math.max(6, words / 3.1 + 2.5);
    }

    _render() {
      const app = this.app, b = this.beat, r = app.renderer;
      try {
        r.focus = b.focus ? { targets: b.focus(app, this.refs).filter(Boolean) } : null;
        r.labels = b.labels ? b.labels(app, this.refs).filter(Boolean) : [];
      } catch (e) {
        r.focus = null; r.labels = [];
      }
    }

    update(dt) {
      if (!this.active) return;
      const b = this.beat;
      this._render();
      if (b.follow && !this.app.renderer.cam.anim) {
        const v = b.cam && typeof b.cam === 'function' ? b.cam(this.app, this.refs) : null;
        if (v) {
          const c = this.app.renderer.cam;
          const k = 1 - Math.exp(-dt * 2);
          c.x += (v.obj.x - c.x) * k; c.y += (v.obj.y - c.y) * k;
        }
      } else if (b.cam === 'cell' || b.cam === 'cellwide') {
        // Keep framing the cell as it grows.
        const c = this.app.renderer.cam;
        if (!c.anim) {
          const tgt = this.app.renderer.fitCell(b.cam === 'cell' ? 1.25 : 1.6);
          const k = 1 - Math.exp(-dt * 1.2);
          c.x += (tgt.x - c.x) * k; c.y += (tgt.y - c.y) * k; c.z += (tgt.z - c.z) * k;
        }
      }
      if (!this.playing) return;
      this.t += dt;
      const minT = this.duration();
      let ready = this.t >= minT;
      if (b.until) {
        const ok = b.until(this.app.model);
        ready = (ready && ok) || this.t > minT + (b.maxWait || 30);
        if (ok && this.t >= minT) ready = true;
      }
      if (ready && !b.end) this.next();
      else if (ready && b.end && this.t > minT + 4) { this.playing = false; this.app.onStoryChange && this.app.onStoryChange(); }
    }

    progress() {
      const b = this.beat;
      return U.clamp(this.t / this.duration(), 0, 1);
    }

    next() {
      const ch = this.chapters[this.ci];
      if (this.bi < ch.beats.length - 1) { this.bi++; this._enterBeat(); }
      else if (this.ci < this.chapters.length - 1) this.goto(this.ci + 1, 0);
      else { this.playing = false; this.app.onStoryChange && this.app.onStoryChange(); }
    }

    prev() {
      if (this.bi > 0) { this.bi--; this._enterBeat(); }
      else if (this.ci > 0) { this.ci--; this.bi = this.chapters[this.ci].beats.length - 1; this._enterBeat(); }
    }
  }

  VC.Story = Story;
  VC.CHAPTERS = CHAPTERS;
})(window.VC);
