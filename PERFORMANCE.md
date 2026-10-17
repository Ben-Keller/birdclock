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

## Clock thumbnail follow-up

The first pass's clock-ready metric measured SVG controls being inserted, not the completion of the bird image downloads. That distinction hid a visible delay after the empty clock appeared.

The clock, selected-bird card, and picker now use dedicated 128 px WebPs, each under 7 kB. The default twelve total 59,078 bytes instead of 184,814 bytes (68% smaller). A small build-inlined script starts requests directly from the document head, using the same configuration validation for default, saved, and shared designs. It requests only the current twelve catalogue birds. Custom artwork stays embedded in its saved design. Fullscreen still uses larger previews; downloads and PNG exports keep original artwork.

The benchmark now records the first clock-artwork request, the last image response, and the later of image completion and SVG insertion. The last metric indicates when both the clock DOM and downloaded artwork are available; it is not a directly measured paint or decode event. A normal LCP measurement alone does not tell us when every SVG bird has appeared.

Three-run live comparison using the same synthetic mobile settings:

| Measurement                                     | Before thumbnails | After thumbnails |
| ----------------------------------------------- | ----------------: | ---------------: |
| First bird request                              |            1.51 s |           0.60 s |
| All twelve birds downloaded                     |            2.90 s |           1.47 s |
| Clock DOM and downloaded artwork both available |            2.90 s |           1.64 s |
| Clock artwork bytes                             |           184,814 |           59,078 |
| Total transferred bytes                         |           346,203 |          223,301 |
| Page load event                                 |            2.92 s |           2.32 s |
| Largest contentful paint                        |            1.56 s |           1.70 s |

All twelve bird images finished downloading **before the clock DOM was inserted in all three after runs**, removing the empty-bird waiting stage. Bird download completion was 49% sooner; the clock and its artwork were available together 43% sooner. LCP and the controls-only metric did not improve in this comparison: prioritizing artwork shifts bandwidth earlier, and the clock can now appear complete. The before runs included an 11.30 s image-completion outlier; after runs ranged from 1.22 to 1.62 s. These are lab results on a throttled connection, not an instant-load guarantee.

Raw results: [thumbnail baseline](performance/2026-10-17-clock-thumbnails-before.json) and [thumbnail result](performance/2026-10-17-clock-thumbnails-after.json). A separate DevTools Slow 4G trace also confirmed requests for the new clock-specific WebPs and reduced LCP from 6.09 to 2.76 s, but that single trace uses different conditions from the three-run benchmark.

## Self-contained first clock frame

The default clock now renders directly from the HTML response using embedded 128 px birds, compact 192 px wood textures, a 4 kB numeral-only font, and inline styling. It does not wait for the editor module, external stylesheets, full web fonts, or separate clock-image requests. The clock is revealed after its images decode, and the editor adopts that SVG instead of replacing it. Larger field-guide illustrations and original exports are unchanged.

A bounded, versioned artwork cache stores only additional catalogue thumbnails used in a customized clock. Return visits can paint that exact arrangement without refetching its birds. A first visit to an uncached shared arrangement still needs its missing thumbnails; those requests start in the document head. Blocked/full browser storage is handled without affecting saved-design or editing behavior.

The benchmark's `clockFirstFrame` mark is taken two animation frames after decoded artwork is revealed; `studioInteractive` separately records when editing becomes available. Browser tests also hold the editor module indefinitely and block image/font requests to verify that the complete cached clock is visible and correctly arranged, rather than treating an empty SVG as ready. Full web-font requests are asserted to start after the first clock frame. Use `--unthrottled` after the output path to measure without synthetic network/CPU slowdown.

Published commit `9f9b660` was measured in three fresh contexts under the same synthetic mobile conditions:

| Measurement                  | Previous thumbnail version |     Self-contained clock |
| ---------------------------- | -------------------------: | -----------------------: |
| All twelve birds downloaded  |                     1.47 s |                   0.98 s |
| Clock and artwork ready      |    1.64 s (DOM + download) | 1.03 s (decode + reveal) |
| Separate clock-bird requests |                         12 |                        0 |
| Total startup requests       |                         27 |                       10 |
| Total transferred bytes      |                    223,301 |                  186,919 |
| Largest contentful paint     |                     1.70 s |                   1.04 s |

The clock-ready measurements differ: the new mark waits for image decoding and reveal, while the previous metric only checked DOM insertion and downloaded bytes. The new clock appeared in 1.02–2.70 s across the three throttled runs. The editor became interactive at a median 2.12 s and the page load event was 3.99 s; those metrics did not improve in this sample. Clock rendering is now independent of those later editor/font requests.

Without synthetic throttling, cold visits measured **1.11 s** for the complete clock (range 0.58–1.47 s), with only 31–46 ms between the complete HTML response and the clock mark. A separately measured cached return visit was **52 ms** (range 45–134 ms). The cached test primes a normal visit, navigates to a blank page, then returns with HTTP caching enabled; it does not represent a hard reload or a first visit. Network/CDN variability remains visible in cold loads, so an instant first visit is not guaranteed.

Raw results: [throttled cold](performance/2026-10-17-first-frame-mobile.json), [normal cold](performance/2026-10-17-first-frame-normal.json), and [normal cached](performance/2026-10-17-first-frame-cached.json). Reproduce the cached case with `npm run perf -- https://ben-keller.github.io/birdclock/ /tmp/birdclock-cached.json --unthrottled --warm`. The published layout and customization actions also passed at 1440, 390, and 320 px, alongside 20 unit tests and 36 browser tests locally.

## Changes

- Bundled and minified startup JavaScript, with the catalogue included and shared modules preloaded. Optional field-guide and bird-download code loads when opened.
- Minified CSS and content-hashed script/style URLs, so updated code does not reuse an old cached asset URL.
- 128 px clock/picker thumbnails (under 7 kB each); 256/384 px previews load in fullscreen. Original bird and wood files remain unchanged and are used for downloads and 2,400 px PNG exports.
- Embedded compact wood textures and a 96 px logo instead of separate image requests during the initial render.
- An embedded numeral-only font for the clock; full Latin and extended-Latin WOFF2 fonts load after the clock appears.
- Reserved clock space during startup and selection updates that preserve the rendered SVG instead of rebuilding it.
- Recovery UI for failed optional module downloads, with saved designs retained through a reload.

The browser suite now enforces a 350 kB total startup budget, including the HTML document, even on the uncompressed development server, verifies that original images/fonts and optional panel assets are absent from startup requests, and checks that exports retain original dimensions and WebP bytes. `npm run build:check` verifies that committed production files match their source.

GitHub Pages controls its own HTTP caching headers (observed `max-age=600`). No service worker or extra hosting service is required.

## On-demand recordings

Bird playback adds no audio or credit-manifest requests to startup, or when browsing fullscreen profiles. A tiny availability/type/duration index is bundled with the editor after the independent first clock frame. The first Play gesture creates one media element, fetches that bird's local MP3, and fetches the credit manifest; subsequent plays reuse the manifest. Every clip is below 100 kB; the 46 files total 3,929,000 bytes on disk, which is not a startup download. Switching birds, closing the profile, or hiding the page stops and releases the active media element. Browser tests enforce these request boundaries and the existing 350 kB total startup budget.
