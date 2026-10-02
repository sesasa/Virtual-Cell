// What each structure is, shown when you click it in the 3-D view.
const f1 = (x) => (isFinite(x) ? x.toFixed(1) : '–');
const f2 = (x) => (isFinite(x) ? x.toFixed(2) : '–');

export const INFO = {
  chloroplast: {
    title: 'Chloroplast', inset: 'thylakoid', dist: 7,
    text: 'Captures light, splits water and fixes CO₂ into sugar. Grana (stacks of thylakoid membranes) hold the light machinery; Rubisco works in the stroma around them. Starch grains store sugar for the night.',
    stats: (m) => [['CO₂ fixed (whole cell)', `${f1(m.f.fixC)} pmol C/h`], ['Limited by', m.f.limiter], ['Starch store', `${f1(m.s.starch)} pmol C`]],
  },
  mito: {
    title: 'Mitochondrion', inset: 'mito', dist: 4,
    text: 'Burns pyruvate from sugar in the TCA cycle and makes ATP on its folded inner membrane (cristae). Also handles a step of photorespiration.',
    stats: (m) => [['Respiration', `${f2(m.f.resp)} pmol C/h`], ['ATP made', `${f1(m.f.atpMito)} pmol/h`]],
  },
  perox: {
    title: 'Peroxisome', inset: 'photoresp', dist: 4,
    text: 'Turns glycolate into glycine during photorespiration and destroys the hydrogen peroxide this makes, using catalase.',
    stats: (m) => [['C lost to photorespiration', `${Math.round(m.f.prLossFrac * 100)}%`]],
  },
  golgi: {
    title: 'Golgi stack', inset: 'expression', dist: 5,
    text: 'Builds pectin and hemicellulose for the wall and sorts membrane proteins into vesicles. Plant cells have many small Golgi stacks that move with the cytoplasm.',
    stats: (m) => [['Wall building', `${f2(m.f.wallSyn)} pmol C/h`]],
  },
  er: {
    title: 'Endoplasmic reticulum', inset: 'expression', dist: 6,
    text: 'A network of membrane tubes. Ribosomes on the rough ER make membrane and secreted proteins; the ER also makes lipids.',
    stats: (m) => [['Protein synthesis', `${f2(m.f.protSynActual)} pmol N/h`]],
  },
  nucleus: {
    title: 'Nucleus', inset: 'expression', dist: 14,
    text: 'Holds the genome and decides which genes are on. mRNA leaves through nuclear pores; the nucleolus makes ribosomes.',
    stats: (m) => [['Cell-cycle phase', m.s.phase], ['DNA content', `${f1(m.s.dna)}C`], ['New protein to photosynthesis', `${Math.round(m.s.phi.photo * 100)}%`]],
  },
  vacuole: {
    title: 'Central vacuole', inset: 'growth', dist: 30,
    text: 'A sac of water, potassium, nitrate, sugars and acids. Its osmotic pull draws water in and builds the turgor pressure that drives growth.',
    stats: (m) => [['Turgor', `${f2(m.f.P)} MPa`], ['Osmotic pressure', `${f2(m.f.pi)} MPa`], ['Stored nitrate', `${f2(m.s.no3v)} pmol`]],
  },
  wall: {
    title: 'Cell wall', inset: 'growth', dist: 14,
    text: 'Cellulose fibres in a gel of pectin and hemicellulose. Proton pumps acidify it so expansins can loosen it and turgor can stretch it.',
    stats: (m) => [['Wall pH', f1(m.s.pH)], ['Growth rate', `${f2(m.f.rgr * 100)} % per hour`]],
  },
  pm: {
    title: 'Plasma membrane', inset: 'nitrogen', dist: 10,
    text: 'The cell’s outer membrane, packed with pumps, channels and transporters: aquaporins for water, K⁺ channels, nitrate and sugar transporters, and cellulose synthase.',
    stats: (m) => [['Nitrate uptake', `${f2(m.f.nUptake)} pmol/h`], ['Water in', `${Math.round(m.f.dV)} µm³/h`]],
  },
  plasmodesma: {
    title: 'Plasmodesmata', inset: 'allocation', dist: 6,
    text: 'Channels through the wall that join neighbouring cells. Sucrose passes through them on its way to the veins.',
    stats: (m) => [['Sugar export', `${f1(m.f.export)} pmol C/h`]],
  },
  neighbor: {
    title: 'Neighbouring cell', inset: null, dist: 40,
    text: 'Another mesophyll cell running the same programme. Cells share sugar and signals through plasmodesmata.',
    stats: () => [],
  },
};
