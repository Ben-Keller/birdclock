import { build, transform } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

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
const css = (
  await transform(sourceCSS.replaceAll("url('assets/", "url('../assets/"), {
    loader: 'css',
    minify: true,
    target: 'es2022',
  })
).code;
const cssName = `dist/styles-${createHash('sha256').update(css).digest('hex').slice(0, 12)}.css`;
const template = await readFile(path.join(root, 'src/index.html'), 'utf8');
const html = template
  .replace('href="styles.css"', `href="${cssName}"`)
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
generated.set(path.join(root, cssName), Buffer.from(css));
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
await writeFile(path.join(root, cssName), css);
await writeFile(path.join(root, 'index.html'), html);
console.log(
  `Built ${result.outputFiles.length} JavaScript files and ${cssName}; optional panels load on demand.`,
);
