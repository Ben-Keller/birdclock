# Validation

The project has repeatable unit and browser tests. The app has no external runtime dependencies. Optimized production files are checked in; source changes are bundled with esbuild before publishing.

## Run checks

Use Node 20+, Python 3, and Google Chrome:

```sh
npm ci
npm run build
npm run build:check
npm test
npm run check
npm run test:browser
```

The browser suite uses Playwright with an isolated headless Chrome session. It starts and stops a local server on port 4173. To use Playwright's Chromium instead, install it with `npx playwright install chromium` and run `PLAYWRIGHT_CHANNEL=chromium npm run test:browser`.

## Automated coverage

- Circular wood adjacency, balanced shuffles, manual wood choices, default birds, import validation, current-time hands for older configurations, Unicode share links, storage failures, isolated SVG identifiers, and bundled asset completeness.
- Bird selection and deduplication, portable filenames, SVG metadata and dimensions, and ZIP checksum validation against an independent reader (Python's `zipfile`).
- Actual PNG, JPEG, WebP, and SVG downloads decoded back into images: native dimensions, nonempty pixels, transparent corners or white JPEG backgrounds, file signatures, unchanged WebP bytes, and embedded SVG artwork.
- Clock and full-library ZIP downloads, every archived image, species count, and hour assignments.
- Bird downloads without changing the clock, failed network request recovery, custom rectangular uploads, JSON export/import, and restoration after reload.
- Combined bird-group, region, and clock-use filters; empty-result recovery; accent and punctuation tolerant search; filtering uploaded artwork.
- Encoder fallback detection, cancellation when the download dialog closes, dialog keyboard focus, and fullscreen live-hand updates.
- Wood-selection undo/redo, bird swapping, automatic draft restoration, shared-link undo recovery, and the existing 2,400 px clock PNG export.
- Responsive editor, library, and download panel layout with screenshot artifacts in `test-results/`.
- Always-visible Bird and Wood & clock sections, paired composition sliders, and compact icon actions. Keyboard navigation, focus after edits, and layouts were checked at 1440, 390, and 320 px.
- Clock tooltips: hover persistence, keyboard navigation, Escape dismissal, updated wood names, and viewport bounds.
- Mouse and emulated touch bird swaps, placement preservation, unchanged wood patterns, same-hour/outside/cancelled drops, undo/redo, reload persistence, and keyboard swaps across hours 12 and 1.
- Complete profile coverage for all 48 species, sourced measurements and metadata, taxonomy/map consistency, valid bundled PNGs, threat-status distinctions, and an escaped custom-artwork fallback.
- Fullscreen profiles for every bird, local regional/world maps, keyboard and pointer selection, unchanged editor drafts and undo history, retry after failed profile loading, and late-response isolation after closing the dialog.
- Desktop and mobile field-guide layout, visible mobile close control, and collection browsing without altering the clock.
- Startup payload stays below 450 kB even on the uncompressed local server, optional panels and original artwork are not fetched at startup, and a failed lazy panel offers a working reload without losing the saved design.
- Reset view preserves the customized design, uploaded artwork, and existing edit history; only the camera returns to the front.
- Perspective dragging on desktop and emulated touch, keyboard tilt/reset, cancelled gestures, projected slice selection and bird swaps, both clock shapes, and fullscreen profile selection after tilting.

## Browser verification

All 20 unit tests and 32 browser scenarios passed on October 17, 2026, with syntax and formatting checks passing too. The browser suite ran locally in headless Google Chrome on macOS. Desktop and mobile-width screenshots have been inspected, including tilted clocks in both shapes, field-guide maps and profiles at 390 px, and editor layout checks at 320 px.

Research was checked against the linked species accounts. Automated tests validate coverage and consistency, not biological truth or future source changes. Map snapshots and research review dates are recorded separately; updating maps does not update the conservation assessments.

Safari, Firefox, physical mobile devices, operating-system download prompts, and real storage-quota exhaustion have not been tested. Browser tests exercise mobile viewport layout and Chrome's emulated touch input, not a physical phone. WebP originals download directly; custom images requiring WebP encoding produce a useful error if the browser lacks that encoder. Clipboard access and browser storage remain subject to each browser's permissions.
