import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { defaultConfig } from '../src/model.js';
import {
  birdSVG,
  birdsForDownload,
  safeFilename,
  canvasBlob,
} from '../src/downloads.js';
import { crc32, createZip } from '../src/zip.js';

const birds = JSON.parse(
  fs.readFileSync(new URL('../assets/birds.json', import.meta.url)),
);

test('download selection preserves hour order and exports repeated birds only once', () => {
  const config = defaultConfig();
  config.slices[0].bird = config.slices[2].bird;
  const selection = birdsForDownload(config, birds, 'clock');
  assert.equal(selection.length, 11);
  assert.equal(selection[0].id, 'osprey');
  assert.equal(new Set(selection.map((bird) => bird.id)).size, 11);
  assert.equal(birdsForDownload(config, birds, 'library').length, 32);
  assert.equal(
    birdsForDownload(config, birds, 'single', 'common-loon')[0].name,
    'Common loon',
  );
  assert.throws(
    () => birdsForDownload(config, birds, 'single', 'missing'),
    /no longer available/,
  );
});

test('portable filenames normalize Unicode and remove path separators', () => {
  assert.equal(safeFilename('Kōkako / My Bird.png'), 'kokako-my-bird-png');
  assert.equal(safeFilename('../../'), 'woodland-hours');
  assert.equal(safeFilename('a'.repeat(100)).length, 70);
});

test('SVG is standalone, preserves rectangular dimensions, and escapes bird metadata', () => {
  const source = 'data:image/png;base64,YQ==';
  const svg = birdSVG(
    { name: 'A & B <bird>', scientificName: '"Example"' },
    source,
    400,
    200,
  );
  assert.match(svg, /viewBox="0 0 400 200"/);
  assert.match(svg, /A &amp; B &lt;bird&gt;/);
  assert.match(svg, /&quot;Example&quot;/);
  assert.match(svg, /href="data:image\/png;base64,YQ=="/);
  assert.match(svg, /not vector paths/);
});

test('CRC-32 matches the ZIP standard check value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  assert.equal(crc32(new Uint8Array()), 0);
});

test('unsupported browser encoders cannot silently return a mislabeled PNG', async () => {
  const fallbackCanvas = {
    toBlob(callback) {
      callback(new Blob(['png'], { type: 'image/png' }));
    },
  };
  await assert.rejects(
    canvasBlob(fallbackCanvas, 'image/webp'),
    /cannot export that format/,
  );
  await assert.rejects(
    canvasBlob(
      {
        toBlob(callback) {
          callback(null);
        },
      },
      'image/png',
    ),
    /could not be exported/,
  );
});

test('ZIP downloads open in Python zipfile with valid checksums, Unicode and binary bytes', async () => {
  const zip = await createZip([
    {
      name: 'birds/kōkako.webp',
      blob: new Blob([new Uint8Array([0, 1, 127, 255])]),
    },
    { name: 'birds.json', blob: new Blob(['{"birds":1}']) },
  ]);
  const result = execFileSync(
    'python3',
    [
      '-c',
      `
import io, json, sys, zipfile
with zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())) as archive:
    assert archive.testzip() is None
    assert archive.read('birds/kōkako.webp') == bytes([0, 1, 127, 255])
    assert json.loads(archive.read('birds.json')) == {'birds': 1}
    print(json.dumps(archive.namelist()))
`,
    ],
    { input: Buffer.from(await zip.arrayBuffer()) },
  );
  assert.deepEqual(JSON.parse(result), ['birds/kōkako.webp', 'birds.json']);
  assert.equal(zip.type, 'application/zip');
});

test('ZIP writer rejects paths outside the bundle and duplicate entries', async () => {
  for (const name of [
    '../bird.png',
    '/bird.png',
    'birds/../bird.png',
    'birds\\bird.png',
    '',
  ]) {
    await assert.rejects(createZip([{ name, blob: new Blob() }]), /invalid/);
  }
  await assert.rejects(
    createZip([
      { name: 'bird.png', blob: new Blob() },
      { name: 'bird.png', blob: new Blob() },
    ]),
    /duplicate/,
  );
});
