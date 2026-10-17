# Loading performance

Measured on October 17, 2026. These are synthetic mobile measurements, not field data from visitors.

## Reproduce

```sh
npm ci
npm run build
npm run perf -- https://ben-keller.github.io/birdclock/ /tmp/birdclock-performance.json
```

The script takes the median of three fresh Chrome contexts at 390 × 844, 2× device pixel ratio, 4× CPU slowdown, 150 ms latency, and 200,000 bytes/second download throughput. HTTP cache is disabled. Connection and CDN conditions can still vary. The full JSON includes each run and resource timings.

## Published GitHub Pages results

| Measurement              | Previous live site | Optimized live site |
| ------------------------ | -----------------: | ------------------: |
| Largest contentful paint |             3.18 s |              1.02 s |
| Clock controls ready     |             1.92 s |              0.92 s |
| Page load event          |             7.13 s |              2.99 s |
| Transferred bytes        |          1,343,165 |             346,035 |
| Network requests         |                 33 |                  27 |
| Cumulative layout shift  |             0.0012 |                   0 |

The optimized site transferred 74% less data, reached LCP 68% sooner, and completed loading 58% sooner in this comparison. Individual optimized load times ranged from 2.41 to 4.54 seconds. First contentful paint varied from 0.86 to 1.08 seconds after the change; its median was 1.02 seconds versus 0.83 seconds before, so it did not improve in this run. No layout shift was recorded in the median optimized run.

Raw results: [before](performance/2026-10-17-before.json) and [after](performance/2026-10-17-after.json). The before commit is `c4f1a0b`; the optimized commit is `b99304a`.

A separate Chrome DevTools trace of the old live site, using its Slow 4G preset and 4× CPU throttling, measured LCP at 5.25 s and a critical dependency chain ending at 8.47 s. The clock texture was not requested until 3.47 s. With the same DevTools preset after deployment, LCP was 1.86 s and the critical chain ended at 3.57 s. These settings differ from the repeatable script, so the two comparisons should not be mixed. The remaining stylesheet was assigned zero estimated render-blocking savings; a 60 ms unattributed reflow had no identified application call site.

## Changes

- Bundled and minified startup JavaScript, with the catalogue included and shared modules preloaded. Optional field-guide and bird-download code loads when opened.
- Minified CSS and content-hashed script/style URLs, so updated code does not reuse an old cached asset URL.
- 256 px display illustrations and 384 px variants for enlarged birds. Original bird and wood files remain unchanged and are used for downloads and 2,400 px PNG exports.
- Compact wood previews, early texture preloads, and a 96 px logo instead of loading a full-size illustration in the header.
- WOFF2 fonts with separate Latin and extended-Latin subsets; extended glyphs load when visible.
- Reserved clock space during startup and selection updates that preserve the rendered SVG instead of rebuilding it.
- Recovery UI for failed optional module downloads, with saved designs retained through a reload.

The browser suite enforces a 450 kB startup resource budget even on the uncompressed development server, verifies that original images/fonts and optional panel assets are absent from startup requests, and checks that exports retain original dimensions and WebP bytes. `npm run build:check` verifies that committed production files match their source.

GitHub Pages controls its own HTTP caching headers (observed `max-age=600`). No service worker or extra hosting service is required.
