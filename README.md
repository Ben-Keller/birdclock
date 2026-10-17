# Woodland Hours

A browser-based studio for designing a twelve-piece wooden bird clock. Warm paper colors, natural-history bird illustrations, wood grain, and serif typography carry the original Figma design into a responsive editor.

## Launch on GitHub Pages

1. Create a GitHub repository. Upload this project's files to the repository root. `index.html`, `styles.css`, `src`, and `assets` must sit at the root; include `.nojekyll` when committing with Git. Leave out `node_modules`, `test-results`, and `playwright-report`.
2. Open **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, then **main** and **/(root)**. Save.
3. Wait for the Pages deployment to finish. GitHub displays your site URL on that page. Share that URL, or use **Save & share → Copy a design link** to share a particular clock.

No build step, API keys, paid service, package installation, or backend is required. Asset paths are relative, so project sites such as `https://username.github.io/woodland-hours/` work without edits.

Official instructions: [Creating a GitHub Pages site](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site).

## Run locally

From this folder:

```sh
python3 -m http.server 8080
```

Open `http://localhost:8080`. Serve the folder over HTTP; opening `index.html` directly with a `file:` URL cannot load the bird catalogue reliably.

## What you can customize

- Each of 12 hours: bird, maple/mahogany/cherry, bird size, position, rotation, and flip.
- Hover a clock slice or focus it with the keyboard to see its hour, bird, and wood. Press Escape to dismiss the tooltip.
- Drag a bird onto another hour to swap the two birds and their placement settings. Woods stay at their hours; a swap is saved automatically and can be undone. Drop outside the clock or press Escape to cancel. Keyboard users can focus an hour and press Shift + Left/Right Arrow to swap with a neighboring hour.
- Choose among 48 realistic-style bird illustrations. Combine bird-group, region, and clock-use filters; search common names, scientific names, regions, and groups, with accents and punctuation handled automatically. Upload up to eight personal PNG, JPEG, or WebP images per design.
- Choosing a bird already used swaps the two hours, keeping each bird distinct by default.
- Keep adjacent woods different, including the 12-to-1 join. Manual selection adjusts as few other pieces as possible. Shuffle produces four pieces of each wood with no matching neighbors.
- Twelve-sided triangular face or round face, hour-marker style, and wood-grain intensity. Clock hands always show the current local time, including when reopening older drafts or importing configurations.
- Two sections, collapsed by default: **Bird** contains bird selection and all composition controls; **Wood & clock** contains wood selection and clock appearance. Each keeps its randomize action alongside its settings. Expanded sections stay open as you edit or change hours, with undo/redo and a fullscreen clock view always available.
- **Reset view**, beside fullscreen, returns the 3D clock to its straight-on viewpoint without changing the design. Drag the empty space around the clock to tilt it; focus the view and use arrow keys for the same control, or Home to reset. The board has textured wooden edges for both clock shapes. Camera angles are temporary and do not affect saves, shares, or image exports. **Save & share → Start fresh** still restores the original design.
- A fullscreen bird field guide: choose a clock slice or browse all 48 species to read sourced descriptions, see occurrence maps, compare sizes, and explore habitat, diet, nesting, movement, taxonomy, and conservation.
- Automatic session and local-browser saving, portable JSON import/export, configuration links, and 2,400 px PNG image export.
- Individual bird downloads in PNG, JPEG, WebP, and SVG; ZIP collections for the birds on your clock or the entire library, including uploaded artwork.

The original arrangement keeps Osprey at 3 and Common loon at 9. The later twelve-bird list is the default; Mourning dove is available in the expanded library.

## Explore the birds

Open **View clock fullscreen**, then click a slice to open its bird profile. Arrow keys move between hours; Enter moves focus into the profile. Previous/next buttons and **Browse the collection** also work without changing your design or undo history. Drag around the fullscreen clock to tilt it; its reset button returns to the front. On phones, choosing a slice scrolls to the profile while the close button stays visible.

Each of the 48 species has an original short introduction and two-paragraph description, measurements where supported, natural-history facts, and linked sources with a review date. Length comparisons use the American robin as a reference (or American goldfinch for the robin). Conservation labels include their geographic scope and assessment system; regional labels are not presented as global IUCN assessments. Uploaded artwork has no invented species profile.

Maps show published GBIF occurrence records, not range boundaries, abundance, or current sightings. The regional/world buttons change the framing. Records span all years and may include captive, introduced, or misidentified birds, with uneven reporting coverage. Profiles, map tiles, and the Natural Earth base map are bundled locally; opening the field guide does not contact an external map service. Follow a source link for the original account or live GBIF map.

## Download bird artwork

Use **Save & share → Download bird files**. Choose one bird, the birds on your clock, or the entire library, then choose a format:

| Format | What you receive                                                                                                                                         |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PNG    | Original dimensions and existing transparency; useful for layouts and printing.                                                                          |
| JPEG   | A high-quality image with a white background.                                                                                                            |
| WebP   | A compact image with existing transparency. Bundled WebP artwork is downloaded unchanged.                                                                |
| SVG    | A standalone SVG with a PNG illustration embedded at its original dimensions. It contains raster artwork, not traced vector paths or a cutting template. |

Downloads preserve the artwork's stored dimensions and aspect ratio. They do not upscale, crop, rotate, or flip it, and do not include the clock's wood or hands. Uploaded artwork uses its saved copy, which is at most 512 px along its longest side. For the complete arrangement, use **Download clock image** instead.

Collections arrive as a single ZIP containing a `birds/` folder, `birds.json` with species, dimensions and assigned hours, and a short `README.txt`. Repeated birds appear once in the ZIP; their index entry lists every assigned hour. The entire-library option includes your uploaded images. A bird ZIP is an artwork collection; download the separate design JSON to reopen your configuration.

All conversion and packaging happens locally in the browser. If a browser cannot encode a requested format, the panel explains the problem and lets you choose PNG or JPEG. Closing the panel cancels an unfinished bird download.

## Keeping and sharing designs

Your current draft is saved to both `sessionStorage` and `localStorage`. No design is sent to a server. Storage belongs to the browser and website address; changing devices, switching domains, or clearing browser data does not carry it across. The save indicator reports when persistent storage is unavailable.

Download JSON for a portable backup. It contains all settings and any uploaded artwork. Configurations are versioned and validated before import. Share links contain the configuration in their URL fragment; anyone with the link can open it. Use JSON for designs with uploaded images. Opening a shared design keeps your previous draft in undo history for that visit.

Uploaded images are resized to at most 512 px and encoded locally. If browser storage fills, the save indicator asks you to download a backup. There is no analytics, account system, or remote font dependency.

## Project files

- `index.html`, `styles.css`: interface and responsive styling.
- `src/app.js`: interaction, storage, importing, sharing, and exporting.
- `src/model.js`: configuration validation and wood arrangement rules.
- `src/clock.js`: reusable SVG clock renderer.
- `src/clock-view.js`: 3D board geometry and pointer/keyboard perspective controls.
- `src/bird-explorer.js`: fullscreen field guide, map views, comparisons, and profile loading.
- `src/downloads.js`: shared image conversion, file downloads, and collection metadata.
- `src/bird-downloads.js`: accessible bird download panel and progress/error handling.
- `src/zip.js`: small ZIP writer; no external runtime dependencies.
- `assets/birds.json`: 48-bird catalogue; add entries and corresponding artwork to extend it.
- `assets/bird-profiles.json`: sourced short/long descriptions, metadata, measurements, conservation, and map references for all 48 birds.
- `assets/maps`: local GBIF occurrence tiles, provenance manifest, and Natural Earth base map.
- `scripts/update-bird-maps.py`: manual map refresh with exact species matching; see `ASSETS.md` before refreshing.
- `assets/bird-generation-2026-10.json`: prompt set and species references for the 16 new illustrations.
- `assets/birds`, `assets/woods`, `assets/fonts`: bundled artwork, textures, and fonts.
- `tests/*.test.js`: model and export tests, including independent ZIP validation with Python.
- `tests/browser/studio.spec.js`: real-browser checks for downloads, uploads, saves, editor interactions, and mobile layout.
- `tests/browser/explorer.spec.js`: all profiles and map assets, keyboard exploration, loading recovery, unchanged drafts, and responsive layout.

## Development checks

The site runs without installing packages or building. Development tooling requires Node 20+ and Python 3:

```sh
npm ci
npm test
npm run check
npm run test:browser
```

Browser tests use an isolated headless session of installed Google Chrome and start their own server on port 4173. Alternatively, run `npx playwright install chromium` and then `PLAYWRIGHT_CHANNEL=chromium npm run test:browser`. The formatter is available with `npm run format`. Development dependencies are never loaded by the site.

See `ASSETS.md` for artwork notes and `TESTING.md` for validation status. This is a visual configurator, with no physical sizing or fabrication template.
