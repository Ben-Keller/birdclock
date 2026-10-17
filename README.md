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

- Each of 12 hours: bird, maple/mahogany/cherry, bird size, position, rotation, flip, and grain direction.
- Choose among 32 realistic-style bird illustrations, with search and filters. Upload up to eight personal PNG, JPEG, or WebP images per design.
- Keep all birds different, or allow repeats. Choosing a bird already used swaps the two hours when uniqueness is enabled.
- Keep adjacent woods different, including the 12-to-1 join. Manual selection adjusts as few other pieces as possible. Shuffle produces four pieces of each wood with no matching neighbors.
- Twelve-sided triangular face or round face, number/dot styles, marker size, global bird scale, grain strength, seams, edge width/color, backdrop, hands, center pin, preview time, and live time.
- Undo/redo, fullscreen clock view, and hour overview.
- Automatic session and local-browser saving, portable JSON import/export, configuration links, and 2,400 px PNG image export.
- Individual bird downloads in PNG, JPEG, WebP, and SVG; ZIP collections for the birds on your clock or the entire library, including uploaded artwork.

The original arrangement keeps Osprey at 3 and Common loon at 9. The later twelve-bird list is the default; Mourning dove is available in the expanded library.

## Download bird artwork

Use **Download bird** beneath the selected bird, **Download** on any library card, or **Save & share → Download bird files**. Choose one bird, the birds on your clock, or the entire library, then choose a format:

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
- `src/downloads.js`: shared image conversion, file downloads, and collection metadata.
- `src/bird-downloads.js`: accessible bird download panel and progress/error handling.
- `src/zip.js`: small ZIP writer; no external runtime dependencies.
- `assets/birds.json`: 32-bird catalogue; add entries and corresponding artwork to extend it.
- `assets/birds`, `assets/woods`, `assets/fonts`: bundled artwork, textures, and fonts.
- `tests/*.test.js`: model and export tests, including independent ZIP validation with Python.
- `tests/browser/studio.spec.js`: real-browser checks for downloads, uploads, saves, editor interactions, and mobile layout.

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
