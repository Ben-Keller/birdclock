# Loading performance

Measured on October 17, 2026. These are synthetic mobile measurements, not field data from visitors.

## Reproduce

```sh
npm ci
npm run build
npm run perf -- https://ben-keller.github.io/birdclock/ /tmp/birdclock-performance.json
```

The script takes the median of three fresh Chrome contexts at 390 × 844, 2× device pixel ratio, 4× CPU slowdown, 150 ms latency, and 200,000 bytes/second download throughput. HTTP cache is disabled. Connection and CDN conditions can still vary. The full JSON includes each run and resource timings.

## Before deployment

| Measurement              | Previous live site | Optimized local build |
| ------------------------ | -----------------: | --------------------: |
| Largest contentful paint |             3.18 s |                1.23 s |
| Clock controls ready     |             1.92 s |                1.18 s |
| Page load event          |             7.13 s |                2.43 s |
| Transferred bytes        |          1,343,165 |               407,285 |
| Network requests         |                 33 |                    27 |
| Cumulative layout shift  |             0.0012 |                     0 |

The local server does not compress text resources. These preliminary numbers compare different servers; the published build will also be measured on GitHub Pages.

A separate Chrome DevTools trace of the old live site, using its Slow 4G preset and 4× CPU throttling, measured LCP at 5.25 s and a critical dependency chain ending at 8.47 s. The clock texture was not requested until 3.47 s. These settings differ from the repeatable script, so the results should not be mixed.

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
