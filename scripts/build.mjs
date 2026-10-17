import { build, transform } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ORIGINAL_BIRDS, WOODS } from '../src/model.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const result = await build({
  absWorkingDir: root,
  entryPoints: ['src/app.js'],
  outdir: 'dist',
  entryNames: '[name]-[hash]',
  chunkNames: '[name]-[hash]',
  bundle: true,
  splitting: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  metafile: true,
  write: false,
});
const outputs = result.metafile.outputs;
const entry = Object.keys(outputs).find(
  (name) => outputs[name].entryPoint === 'src/app.js',
);
const preloads = new Set();
function preloadImports(file) {
  for (const item of outputs[file]?.imports || []) {
    if (
      item.kind !== 'import-statement' ||
      item.external ||
      preloads.has(item.path)
    )
      continue;
    preloads.add(item.path);
    preloadImports(item.path);
  }
}
preloadImports(entry);
const sourceCSS = await readFile(path.join(root, 'styles.css'), 'utf8');
const fontRules = sourceCSS.match(/@font-face\s*\{[^}]*\}/g).join('\n');
const fonts = (
  await transform(fontRules.replaceAll("url('assets/", "url('../assets/"), {
    loader: 'css',
    minify: true,
  })
).code;
const fontName = `dist/fonts-${createHash('sha256').update(fonts).digest('hex').slice(0, 12)}.css`;
const numeralFont = (
  await readFile(path.join(root, 'assets/fonts/clock-numerals.woff2'))
).toString('base64');
const css = (
  await transform(
    `@font-face{font-family:'Clock numerals';src:url(data:font/woff2;base64,${numeralFont}) format('woff2');font-weight:500;font-display:swap}` +
      sourceCSS.replace(/@font-face\s*\{[^}]*\}/g, ''),
    {
      loader: 'css',
      minify: true,
      target: 'es2022',
    },
  )
).code;
const template = await readFile(path.join(root, 'src/index.html'), 'utf8');
const catalogue = JSON.parse(
  await readFile(path.join(root, 'assets/birds.json'), 'utf8'),
);
const thumbnailBytes = await Promise.all(
  catalogue.map((bird) => readFile(path.join(root, bird.clockPreview))),
);
const artworkRevision = createHash('sha256')
  .update(Buffer.concat(thumbnailBytes))
  .digest('hex')
  .slice(0, 16);
const embeddedArtwork = Object.fromEntries(
  catalogue.flatMap((bird, i) =>
    ORIGINAL_BIRDS.includes(bird.id)
      ? [
          [
            bird.id,
            `data:image/webp;base64,${thumbnailBytes[i].toString('base64')}`,
          ],
        ]
      : [],
  ),
);
const embeddedWoods = Object.fromEntries(
  await Promise.all(
    WOODS.map(async (wood) => [
      wood.id,
      `data:image/webp;base64,${(await readFile(path.join(root, `assets/previews/clock-woods/${wood.id}.webp`))).toString('base64')}`,
    ]),
  ),
);
const artworkPreload = await build({
  absWorkingDir: root,
  entryPoints: ['src/preload.js'],
  bundle: true,
  format: 'iife',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  write: false,
  define: {
    ARTWORK_REVISION: JSON.stringify(artworkRevision),
    EMBEDDED_BIRDS: JSON.stringify(ORIGINAL_BIRDS),
    CLOCK_THUMBNAILS: JSON.stringify(
      Object.fromEntries(catalogue.map((bird) => [bird.id, bird.clockPreview])),
    ),
  },
});
const bootClock = await build({
  absWorkingDir: root,
  entryPoints: ['src/boot-clock.js'],
  bundle: true,
  format: 'iife',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  write: false,
  define: {
    EMBEDDED_ARTWORK: JSON.stringify(embeddedArtwork),
    EMBEDDED_WOODS: JSON.stringify(embeddedWoods),
    BOOT_CATALOGUE: JSON.stringify(
      catalogue.map(({ id, name, clockPreview }) => ({
        id,
        name,
        clockPreview,
      })),
    ),
    FONT_STYLESHEET: JSON.stringify(fontName),
    ARTWORK_REVISION: JSON.stringify(artworkRevision),
  },
});
const html = template
  .replace(
    '<!-- clock-artwork-preloads -->',
    `<script>${artworkPreload.outputFiles[0].text.trim()}</script>`,
  )
  .replace(
    '<!-- clock-bootstrap -->',
    `<script>${bootClock.outputFiles[0].text.trim()}</script>`,
  )
  .replace(
    '<link rel="stylesheet" href="styles.css" />',
    `<style>${css}</style>`,
  )
  .replace(
    'src="assets/brand-bird.webp"',
    `src="data:image/webp;base64,${(await readFile(path.join(root, 'assets/brand-bird.webp'))).toString('base64')}"`,
  )
  .replace('src="src/app.js"', `src="${entry}"`)
  .replace(
    '<!-- module-preloads -->',
    [...preloads]
      .map((file) => `<link rel="modulepreload" href="${file}" />`)
      .join('\n    '),
  );

const generated = new Map(
  result.outputFiles.map((file) => [file.path, file.contents]),
);
generated.set(path.join(root, fontName), Buffer.from(fonts));
generated.set(path.join(root, 'index.html'), Buffer.from(html));
if (process.argv.includes('--check')) {
  const stale = [];
  for (const [file, contents] of generated) {
    const current = await readFile(file).catch(() => null);
    if (!current?.equals(Buffer.from(contents)))
      stale.push(path.relative(root, file));
  }
  if (stale.length)
    throw new Error(
      `Production files are stale. Run npm run build: ${stale.join(', ')}`,
    );
  console.log('Production files match their sources.');
  process.exit(0);
}

// Only this directory is generated. Keep the checked-in production files ready
// for GitHub Pages, with content hashes to avoid stale script/style caches.
await mkdir(path.join(root, 'dist'), { recursive: true });
for (const name of await readdir(path.join(root, 'dist')))
  await rm(path.join(root, 'dist', name));
await Promise.all(
  result.outputFiles.map((file) => writeFile(file.path, file.contents)),
);
await writeFile(path.join(root, fontName), fonts);
await writeFile(path.join(root, 'index.html'), html);
console.log(
  `Built ${result.outputFiles.length} JavaScript files; the first clock frame is self-contained and fonts load afterward.`,
);
