import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  defaultConfig,
  validateConfig,
  conflicts,
  shuffleWoods,
  assignWood,
  encodeConfig,
  decodeConfig,
  storageAdapter,
  WOODS,
  clone,
} from '../src/model.js';
import { clockSVG, handsMarkup } from '../src/clock.js';
const birds = JSON.parse(
  fs.readFileSync(new URL('../assets/birds.json', import.meta.url)),
);
const ids = birds.map((b) => b.id);

test('original design preserves requested hours and circular wood rule', () => {
  const c = defaultConfig();
  assert.equal(c.slices[2].bird, 'osprey');
  assert.equal(c.slices[8].bird, 'common-loon');
  assert.deepEqual(conflicts(c.slices), []);
  assert.deepEqual(validateConfig(c, ids), c);
});
test('1000 random arrangements have four of each wood and no circular neighbors', () => {
  for (let i = 0; i < 1000; i++) {
    const woods = shuffleWoods();
    assert.deepEqual(conflicts(woods.map((wood) => ({ wood }))), []);
    for (const w of WOODS)
      assert.equal(woods.filter((x) => x === w.id).length, 4);
  }
});
test('every manual wood choice is honored and resolves the circular rule', () => {
  for (let run = 0; run < 50; run++) {
    const slices = shuffleWoods().map((wood) => ({ wood }));
    for (let i = 0; i < 12; i++)
      for (const wood of WOODS) {
        const result = assignWood(slices, i, wood.id);
        assert.equal(result[i], wood.id);
        assert.deepEqual(conflicts(result.map((wood) => ({ wood }))), []);
        assert.ok(result.filter((w, j) => w !== slices[j].wood).length <= 3);
      }
  }
});
test('wood rule can be disabled and re-enabled on a monochrome clock', () => {
  const c = defaultConfig();
  c.slices.forEach((s) => (s.wood = 'maple'));
  const fixed = assignWood(c.slices, 11, 'maple');
  assert.deepEqual(conflicts(fixed.map((wood) => ({ wood }))), []);
  assert.equal(fixed[11], 'maple');
  assert.deepEqual(assignWood(c.slices, 0, 'cherry', false), [
    'cherry',
    ...Array(11).fill('maple'),
  ]);
});
test('imports reject unknown birds, invalid woods, duplicates, and malformed slices', () => {
  for (const mutate of [
    (c) => c.slices.pop(),
    (c) => (c.version = 2),
    (c) => (c.slices[0].bird = 'missing'),
    (c) => (c.slices[0].wood = 'oak'),
    (c) => (c.slices[0].bird = c.slices[1].bird),
    (c) => (c.slices[0].wood = c.slices[1].wood),
  ]) {
    const c = defaultConfig();
    mutate(c);
    assert.throws(() => validateConfig(c, ids));
  }
});
test('imports normalize bounds and reject unsafe artwork', () => {
  const c = defaultConfig();
  c.slices[0].x = 10000;
  c.face.handColor = 'url(javascript:alert(1))';
  c.face.time = '99:99';
  c.face.hands = false;
  c.face.live = false;
  const v = validateConfig(c, ids);
  assert.equal(v.slices[0].x, 65);
  assert.equal(v.face.handColor, defaultConfig().face.handColor);
  assert.equal(v.face.time, '10:05');
  assert.equal(v.face.hands, true);
  assert.equal(v.face.live, true);
  c.customBirds = [
    { id: 'custom-1', asset: 'https://untrusted.example/bird.svg' },
  ];
  assert.throws(() => validateConfig(c, ids));
});
test('Unicode share URLs and JSON configurations round trip', () => {
  const c = defaultConfig();
  c.name = 'Kōkako & Anna’s — 森';
  assert.deepEqual(decodeConfig(encodeConfig(c)), c);
  assert.deepEqual(validateConfig(JSON.parse(JSON.stringify(c)), ids), c);
  assert.throws(() => decodeConfig('x'.repeat(20001)));
});
test('browser storage failure remains recoverable', () => {
  const bad = storageAdapter({
    getItem() {
      throw Error();
    },
    setItem() {
      throw Error();
    },
    removeItem() {
      throw Error();
    },
  });
  assert.deepEqual(bad.get('x', []), []);
  assert.equal(bad.set('x', {}), false);
  assert.equal(bad.remove('x'), false);
  const data = new Map(),
    good = storageAdapter({
      getItem: (k) => data.get(k),
      setItem: (k, v) => data.set(k, v),
      removeItem: (k) => data.delete(k),
    });
  assert.ok(good.set('draft', defaultConfig()));
  assert.deepEqual(good.get('draft'), defaultConfig());
});
test('SVGs have 12 editable hours and isolated pattern/filter IDs', () => {
  const c = defaultConfig(),
    a = clockSVG(c, birds, { selected: 2 }),
    b = clockSVG(c, birds, { interactive: false });
  assert.equal((a.match(/role="button"/g) || []).length, 12);
  assert.equal((a.match(/tabindex="0"/g) || []).length, 1);
  assert.match(a, /3 o’clock: Osprey/);
  const first = new Set([...a.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
  const second = [...b.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(second.every((id) => !first.has(id)));
  for (const m of a.matchAll(/url\(#([^)]+)\)/g))
    assert.ok(first.has(m[1]), m[1]);
  const hands = handsMarkup(c.face, new Date(2026, 9, 17, 10, 15, 30), 'test-');
  assert.match(hands, /url\(#test-handShadow\)/);
  assert.match(hands, /rotate\(307\.5 520 520\)/);
  assert.match(hands, /rotate\(93 520 520\)/);
});
test('catalogue and packaged textures/fonts are complete local assets', () => {
  assert.equal(birds.length, 48);
  assert.equal(new Set(ids).size, 48);
  for (const b of birds) {
    assert.ok(b.name && b.scientificName && b.region && b.group);
    assert.ok(/^assets\/birds\/[a-z0-9-]+\.webp$/.test(b.asset));
    assert.ok(
      fs.statSync(new URL('../' + b.asset, import.meta.url)).size > 1000,
    );
  }
  for (const w of WOODS)
    assert.ok(
      fs.statSync(new URL('../assets/woods/' + w.id + '.webp', import.meta.url))
        .size > 1000,
    );
  for (const font of [
    'cormorant-400',
    'cormorant-500',
    'cormorant-600',
    'inter-400',
    'inter-500',
    'inter-600',
  ])
    assert.ok(
      fs.statSync(new URL('../assets/fonts/' + font + '.ttf', import.meta.url))
        .size > 10000,
    );
});
