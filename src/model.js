export const WOODS = [
  {
    id: 'maple',
    name: 'Maple',
    color: '#ddc69a',
    ink: '#432c21',
    note: 'Light · fine, quiet grain',
  },
  {
    id: 'mahogany',
    name: 'Mahogany',
    color: '#6e3c2f',
    ink: '#f4dfc0',
    note: 'Dark · warm ribbon grain',
  },
  {
    id: 'cherry',
    name: 'Cherry',
    color: '#b77952',
    ink: '#432c21',
    note: 'Medium · soft copper tones',
  },
];
export const ORIGINAL_BIRDS = [
  'northern-flicker',
  'american-goldfinch',
  'osprey',
  'annas-hummingbird',
  'wood-duck',
  'bittern',
  'mourning-dove',
  'kokako',
  'common-loon',
  'bald-eagle',
  'pileated-woodpecker',
  'great-horned-owl',
];
const ORIGINAL_WOODS = [
  'maple',
  'mahogany',
  'maple',
  'cherry',
  'maple',
  'cherry',
  'maple',
  'mahogany',
  'cherry',
  'maple',
  'cherry',
  'mahogany',
];
export const clone = (value) => JSON.parse(JSON.stringify(value));
export function defaultConfig() {
  return {
    version: 1,
    name: 'Twelve woodland hours',
    noAdjacent: true,
    uniqueBirds: true,
    customBirds: [],
    slices: ORIGINAL_BIRDS.map((bird, i) => ({
      bird,
      wood: ORIGINAL_WOODS[i],
      scale: 1,
      rotation: 0,
      x: 0,
      y: 0,
      flip: false,
      grain: 0,
    })),
    face: {
      shape: 'polygon',
      numbers: 'arabic',
      numberSize: 29,
      birdScale: 1,
      grain: 0.48,
      seam: 1,
      rim: 5,
      rimColor: '#493425',
      handColor: '#292c24',
      hubColor: '#bb9856',
      hands: true,
      seconds: false,
      time: '10:05',
      live: true,
      background: '#f4f0e6',
    },
  };
}
export function conflicts(slices) {
  return slices.flatMap((s, i) =>
    s.wood === slices[(i + 1) % 12].wood ? [[i, (i + 1) % 12]] : [],
  );
}
export function woodAllowed(slices, index, wood) {
  return (
    slices[(index + 11) % 12].wood !== wood &&
    slices[(index + 1) % 12].wood !== wood
  );
}
export function assignWood(slices, index, wood, avoid = true) {
  const before = slices.map((s) => s.wood);
  if (!avoid) {
    before[index] = wood;
    return before;
  }
  let best = null,
    cost = Infinity;
  const seq = [];
  function visit(i, changes) {
    if (changes >= cost) return;
    if (i === 12) {
      if (seq[11] !== seq[0]) {
        best = [...seq];
        cost = changes;
      }
      return;
    }
    const candidates =
      i === index
        ? [wood]
        : [before[i], ...WOODS.map((w) => w.id).filter((w) => w !== before[i])];
    for (const w of candidates) {
      if (seq.at(-1) === w || (i === 11 && seq[0] === w)) continue;
      seq.push(w);
      visit(i + 1, changes + (w !== before[i] ? 1 : 0));
      seq.pop();
    }
  }
  visit(0, 0);
  return best || before;
}
export function shuffleArray(list, random = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function shuffleWoods(random = Math.random) {
  const out = [],
    counts = { maple: 4, mahogany: 4, cherry: 4 };
  function place() {
    if (out.length === 12) return out[11] !== out[0];
    for (const w of shuffleArray(Object.keys(counts), random)) {
      if (!counts[w] || out.at(-1) === w || (out.length === 11 && out[0] === w))
        continue;
      out.push(w);
      counts[w]--;
      if (place()) return true;
      counts[w]++;
      out.pop();
    }
    return false;
  }
  if (!place()) throw new Error('Could not arrange woods');
  return out;
}
const num = (n, lo, hi, fallback) =>
  Number.isFinite(Number(n)) ? Math.min(hi, Math.max(lo, Number(n))) : fallback;
const oneOf = (v, a, d) => (a.includes(v) ? v : d);
const hex = (v, d) =>
  typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : d;
export function validateConfig(input, birdIds) {
  if (
    !input ||
    typeof input !== 'object' ||
    input.version !== 1 ||
    !Array.isArray(input.slices) ||
    input.slices.length !== 12
  )
    throw new Error(
      'Choose a Woodland Hours configuration with exactly 12 hours.',
    );
  const d = defaultConfig(),
    custom = Array.isArray(input.customBirds) ? input.customBirds : [];
  if (custom.length > 8)
    throw new Error('A design can include up to 8 uploaded birds.');
  const seen = new Set(birdIds);
  d.customBirds = custom.map((b) => {
    if (
      !b ||
      !/^custom-[a-z0-9-]{1,60}$/.test(b.id) ||
      seen.has(b.id) ||
      typeof b.asset !== 'string' ||
      b.asset.length > 350000 ||
      !/^data:image\/(png|webp|jpeg);base64,[A-Za-z0-9+/=]+$/.test(b.asset)
    )
      throw new Error('An uploaded bird is invalid or too large.');
    seen.add(b.id);
    return {
      id: b.id,
      name: String(b.name || 'My bird').slice(0, 70),
      asset: b.asset,
      scientificName: 'Your illustration',
      region: 'Custom',
      group: 'Custom',
    };
  });
  d.name = String(input.name || d.name).slice(0, 80);
  d.noAdjacent = input.noAdjacent !== false;
  d.uniqueBirds = input.uniqueBirds !== false;
  d.slices = input.slices.map((s, i) => {
    if (!s || !seen.has(s.bird) || !WOODS.some((w) => w.id === s.wood))
      throw new Error('A bird or wood in this design is unavailable.');
    return {
      bird: s.bird,
      wood: s.wood,
      scale: num(s.scale, 0.55, 1.5, 1),
      rotation: num(s.rotation, -180, 180, 0),
      x: num(s.x, -65, 65, 0),
      y: num(s.y, -65, 65, 0),
      flip: !!s.flip,
      grain: num(s.grain, -90, 90, 0),
    };
  });
  if (d.noAdjacent && conflicts(d.slices).length)
    throw new Error(
      'This design has matching neighboring woods. Turn off that rule before exporting it.',
    );
  if (d.uniqueBirds && new Set(d.slices.map((s) => s.bird)).size !== 12)
    throw new Error(
      'This design repeats birds while the unique-birds rule is enabled.',
    );
  const f = input.face || {};
  d.face = {
    shape: oneOf(f.shape, ['polygon', 'circle'], 'polygon'),
    numbers: oneOf(f.numbers, ['arabic', 'roman', 'dots', 'none'], 'arabic'),
    numberSize: num(f.numberSize, 18, 42, 29),
    birdScale: num(f.birdScale, 0.65, 1.25, 1),
    grain: num(f.grain, 0, 1, 0.48),
    seam: num(f.seam, 0, 4, 1),
    rim: num(f.rim, 0, 12, 5),
    rimColor: hex(f.rimColor, d.face.rimColor),
    handColor: hex(f.handColor, d.face.handColor),
    hubColor: hex(f.hubColor, d.face.hubColor),
    // Older drafts and imports now show hands using the current local time.
    hands: true,
    seconds: !!f.seconds,
    time:
      typeof f.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(f.time)
        ? f.time
        : '10:05',
    live: true,
    background: hex(f.background, d.face.background),
  };
  return d;
}
export function encodeConfig(config) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(config))))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}
export function decodeConfig(value) {
  if (value.length > 20000)
    throw new Error(
      'This share link is too large. Import a JSON file instead.',
    );
  return JSON.parse(
    decodeURIComponent(
      escape(atob(value.replaceAll('-', '+').replaceAll('_', '/'))),
    ),
  );
}
export function storageAdapter(storage) {
  return {
    get(key, fallback = null) {
      try {
        return JSON.parse(storage.getItem(key)) ?? fallback;
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        storage.setItem(key, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    },
    remove(key) {
      try {
        storage.removeItem(key);
        return true;
      } catch {
        return false;
      }
    },
  };
}
