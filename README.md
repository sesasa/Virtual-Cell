# Virtual Leaf Cell

A narrated, simulated digital twin of a photosynthetic plant cell: a mesophyll
cell from a young, expanding leaf. It shows the organelles, membranes and
transporters at work, and tells the story of one cell's day: sunrise, carbon
fixation, photorespiration, how sugar is shared out, nitrogen assimilation, gene
expression, water uptake and growth, the night on stored starch, and finally
mitosis and cytokinesis into two daughter cells.

Open `index.html` in a browser for the **3-D tour**, or `schematic.html` for
the **2-D schematic view**. Both run from the files directly; nothing to install.

## 3-D tour (`index.html`)

A cut-away mesophyll cell sits among its neighbours inside a leaf, rendered in
real time with physically based materials, environment lighting, soft shadows,
bloom, depth of field and a light film grade. Organelles are close to true size:
about 120 chloroplasts line the wall, mitochondria and Golgi stacks stream through
the cytoplasm, the ER network spreads from a nucleus covered in pores, and a large
clear vacuole fills the middle. One chloroplast is cut open to show its grana
(stacks of thylakoid discs) and starch grains; one mitochondrion shows its cristae.

The narrated tour (26 stops, about 8½ minutes) follows the energy:

1. **Into the leaf**: the tissue, then the cell cut open.
2. **It starts with light**: a chloroplast, its grana, water splitting, ATP and NADPH.
3. **Sugar is made**: CO₂ arrives, Rubisco fixes it, starch is stored, triose phosphate leaves.
4. **Where the sugar goes**: to mitochondria (ATP), to Golgi and the wall, to the vacuole (turgor), and through plasmodesmata to the rest of the plant.
5. **Costs and supplies**: photorespiration, and nitrogen coming in.
6. **The instructions**: genes, mRNA through nuclear pores, proteins back to the chloroplasts.
7. **Night**: starch is drawn down at a clock-set pace.
8. **Growth and division**: a time-lapse of elongation, mitosis and the cell plate.

**Voice narration**: press *Voice* to have the tour read aloud in an unhurried
nature-documentary style. It uses the browser's built-in speech voices (a British
male voice is preferred where the device has one), and the tour waits for each
passage to finish. The schematic view has the same button.

Molecules flowing between organelles are driven by the simulation, so their
numbers and routes change with the time of day and conditions. **Explore** mode
lets you orbit freely, click any structure to identify it, and change light, CO₂,
temperature, nitrate and water. On slow GPUs the page switches to a lighter
rendering mode automatically (or add `?low` to the URL).

The 3-D code lives in `src3d/` and is bundled with Three.js into
`dist/tour3d.js`. To rebuild after editing: `npm install && npm run build`.

## Schematic view (`schematic.html`)

A 2-D cross-section with more molecular detail and the full dashboard:

- **Story**: eleven chapters with a guiding camera, spotlight, labels and
  step-by-step molecular close-ups. `Space` pauses; arrow keys step.
- **Explore**: change light, day length, CO₂, temperature, nitrate and soil
  water; watch sparklines, the carbon budget and the cell diary; click any
  structure for live readings; zoom in to see transporters and ribosomes.

## What is simulated

All pools are per cell (picomoles of C or N, µm³, MPa). The model is in
`js/model.js`.

| Process | Model |
| --- | --- |
| Light reactions and CO₂ fixation | Farquhar–von Caemmerer–Berry, with Bernacchi temperature responses and a triose-phosphate-use (sink) limit |
| Photorespiration | Rubisco oxygenation/carboxylation ratio 2Γ*/Cᵢ; half a CO₂ and half an NH₃ released per oxygenation |
| Excess light | non-photochemical quenching from unused excitation; chloroplast avoidance movement in strong light |
| Day partitioning | triose phosphate split between starch and sucrose, with sugar feedback and day-length adjustment |
| Night | starch broken down at (store − 5% reserve) ÷ hours to dawn, the clock-controlled rate seen in Arabidopsis |
| Sugar use | respiration first, then growth (wall, amino-acid skeletons, membranes, RNA), then vacuolar storage and export |
| Nitrogen | NRT uptake, nitrate reductase (light-activated), nitrite reductase, GS/GOGAT, vacuolar nitrate bank |
| Proteome allocation | new protein divided between photosynthesis, ribosomes, metabolism/transport and housekeeping, steered by sugar, light and nitrogen signals |
| Water and growth | van 't Hoff osmotic pressure from vacuolar solutes; Lockhart expansion `dV/dt = φ·V·(P − Y)` with acid growth and wall-integrity feedback; anisotropic elongation |
| Cell cycle | sugar- and size-gated G1→S, 6 h S phase, size/protein-gated G2→M, then preprophase band, mitosis, phragmoplast and cell plate |

Leaf-level rates (µmol m⁻² s⁻¹) are converted to per-cell rates assuming about
2×10⁹ mesophyll cells per m² of leaf. With default settings a cell fixes about
15 µmol CO₂ m⁻² s⁻¹ at midday, puts about 40% of new carbon into starch, has
about 5% of it left at dawn, keeps turgor at 0.6–0.9 MPa and divides about every
30 hours.

## How the code is organised

| File | Role |
| --- | --- |
| `js/model.js` | physiology engine |
| `js/geometry.js` | cell outline, cytoplasm band and organelle layout (positions in perimeter/depth coordinates so they follow growth) |
| `js/scene.js` | links model and geometry: streaming, chloroplast division, neighbours, nuclear migration, cell division |
| `js/particles.js` | molecular traffic; spawn rates follow model fluxes and routes follow real cell geography |
| `js/render.js` | canvas renderer with camera, level of detail, spotlight and callouts |
| `js/insets.js` | animated molecular close-ups (thylakoid, Calvin cycle, photorespiration, carbon budget, respiration, nitrogen, gene expression, growth, starch clock, cell cycle) |
| `js/story.js` | chapters and beats of the guided story |
| `js/charts.js`, `js/main.js` | dashboard and app controller |

## Simplifications

This is a teaching model, not a research model. Concentrations are coarse,
regulatory networks are reduced to a few signals, and the 2-D section stands in
for a 3-D cell. Organelles are close to true size; transporters and molecules
are drawn much larger than life so they can be seen, and each moving molecule
stands for very many. Molecules move in real time while the clock runs faster. Growth (about 2–3% per hour) and the cell cycle run roughly twice as fast as in a typical leaf so that a division fits in the story.
