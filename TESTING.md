# Validation

The project has repeatable unit and browser tests. The app itself has no runtime dependencies or build step.

## Run checks

Use Node 20+, Python 3, and Google Chrome:

```sh
npm ci
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
- Clock tooltips: hover persistence, keyboard navigation, Escape dismissal, updated wood names, and viewport bounds.
- Mouse and emulated touch bird swaps, placement preservation, unchanged wood patterns, same-hour/outside/cancelled drops, undo/redo, reload persistence, and keyboard swaps across hours 12 and 1.

## Browser verification

All 17 unit tests and 19 browser scenarios passed on October 17, 2026, with syntax and formatting checks passing too. The browser suite ran locally in headless Google Chrome on macOS. Desktop and mobile-width screenshots have been inspected, including layout checks at 390 px and 320 px. This replaces the earlier package's unverified browser pass.

Safari, Firefox, physical mobile devices, operating-system download prompts, and real storage-quota exhaustion have not been tested. Browser tests exercise mobile viewport layout and Chrome's emulated touch input, not a physical phone. WebP originals download directly; custom images requiring WebP encoding produce a useful error if the browser lacks that encoder. Clipboard access and browser storage remain subject to each browser's permissions.
