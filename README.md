# Virtual Leaf Cell

A narrated, simulated digital twin of a photosynthetic plant cell: a mesophyll
cell from a young, expanding leaf. It shows the organelles, membranes and
transporters at work, and tells the story of one cell's day: sunrise, carbon
fixation, photorespiration, how sugar is shared out, nitrogen assimilation, gene
expression, water uptake and growth, the night on stored starch, and finally
mitosis and cytokinesis into two daughter cells.

Open `index.html` in a browser. There is no build step and nothing to install.

## Two ways to watch

- **Story**: eleven chapters with a guiding camera, spotlight, labels and
  molecular close-ups. The narration quotes the cell's live numbers. Use
  `Space` to pause and the arrow keys to step.
- **Explore**: the simulation runs freely. Change light, day length, CO₂,
  temperature, nitrate and soil water and watch the cell reallocate. Click
  any structure for a description and live readings; drag to pan and scroll to
  zoom (zoom in to see membrane transporters, ribosomes and cristae).

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
stands for very many. Molecules move in real time while the clock runs faster.
