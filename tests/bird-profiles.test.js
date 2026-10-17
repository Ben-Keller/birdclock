import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { birdProfileMarkup, mapViewBox } from '../src/bird-explorer.js';
const birds = JSON.parse(
  fs.readFileSync(new URL('../assets/birds.json', import.meta.url)),
);
const data = JSON.parse(
  fs.readFileSync(new URL('../assets/bird-profiles.json', import.meta.url)),
);
const manifest = JSON.parse(
  fs.readFileSync(new URL('../assets/maps/manifest.json', import.meta.url)),
);

test('every catalogue bird has original short/long copy, cited metadata and a real local map', () => {
  assert.deepEqual(
    Object.keys(data.profiles).sort(),
    birds.map((b) => b.id).sort(),
  );
  for (const bird of birds) {
    const p = data.profiles[bird.id];
    assert.ok(p.shortDescription.length >= 60, bird.id);
    assert.equal(p.longDescription.length, 2, bird.id);
    assert.ok(p.longDescription.join(' ').split(/\s+/).length >= 70, bird.id);
    for (const key of ['habitat', 'diet', 'sources'])
      assert.ok(p[key].length, `${bird.id}: ${key}`);
    for (const key of ['range', 'movement', 'nesting', 'reviewedAt'])
      assert.ok(p[key], `${bird.id}: ${key}`);
    assert.ok(p.taxonomy.family && p.taxonomy.order);
    assert.ok(
      p.conservation.label && p.conservation.system && p.conservation.scope,
    );
    assert.equal(new URL(p.conservation.url).protocol, 'https:');
    for (const source of p.sources) {
      assert.equal(new URL(source.url).protocol, 'https:');
      assert.ok(source.supports.length);
    }
    for (const m of p.measurements)
      assert.ok(m.min > 0 && m.max >= m.min && ['cm', 'g'].includes(m.unit));
    const map = manifest.birds[bird.id];
    assert.equal(p.map.taxonKey, map.taxonKey);
    assert.equal(map.matchedName, bird.scientificName);
    const bytes = fs.readFileSync(
      new URL('../' + p.map.asset, import.meta.url),
    );
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
    assert.ok(bytes.length > 1000, bird.id);
    for (const tile of p.map.regionalTiles || []) {
      assert.ok(tile.zoom > 0 && tile.zoom <= 3);
      assert.ok(tile.x >= 0 && tile.x < 2 ** tile.zoom);
      assert.ok(tile.y >= 0 && tile.y < 2 ** tile.zoom);
      const png = fs.readFileSync(new URL('../' + tile.asset, import.meta.url));
      assert.equal(png.subarray(1, 4).toString(), 'PNG');
      assert.ok(map.regionalTiles.some((entry) => entry.asset === tile.asset));
    }
    const [x, y, width, height] = mapViewBox(p.map.focusBounds)
      .split(' ')
      .map(Number);
    assert.ok([x, y, width, height].every(Number.isFinite));
    assert.ok(width > 0 && height > 0 && x >= 0 && y >= 0);
    const markup = birdProfileMarkup(bird, p, data, birds);
    assert.ok(
      markup.includes('Where it’s found') &&
        markup.includes('Sources & field notes'),
    );
  }
});

test('threatened birds and taxonomic splits are not flattened into generic labels', () => {
  for (const id of [
    'bittern',
    'african-grey-parrot',
    'grey-crowned-crane',
    'secretarybird',
  ])
    assert.equal(data.profiles[id].conservation.code, 'EN');
  for (const id of ['snowy-owl', 'atlantic-puffin', 'red-crowned-crane'])
    assert.equal(data.profiles[id].conservation.code, 'VU');
  assert.equal(data.profiles.bittern.regionalConservation.scope, 'New Zealand');
  assert.equal(
    birds.find((b) => b.id === 'barn-owl').scientificName,
    'Tyto furcata',
  );
  assert.ok(data.profiles['barn-owl'].taxonomyNote);
});

test('uploaded artwork has an honest fallback and escaped user-provided names', () => {
  const markup = birdProfileMarkup(
    {
      id: 'custom',
      name: '<img onerror=alert(1)>',
      scientificName: '"Custom"',
      asset: 'data:image/png;base64,AA==',
    },
    null,
    data,
    birds,
  );
  assert.ok(markup.includes('&lt;img onerror=alert(1)&gt;'));
  assert.ok(markup.includes('isn’t attached to uploaded images'));
  assert.ok(!markup.includes('occurrence-layer'));
});
