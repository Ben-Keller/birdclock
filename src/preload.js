import { defaultConfig, decodeConfig, validateConfig } from './model.js';
import { readCachedArtwork } from './display-assets.js';

// Read the current design early. Embedded and cached birds need no requests;
// preload only missing thumbnails for a new saved/shared arrangement.
const thumbnails = CLOCK_THUMBNAILS;
const ids = Object.keys(thumbnails);
const readDraft = (storage) => {
  try {
    return JSON.parse(window[storage].getItem('woodland-hours.draft.v1'));
  } catch {
    return null;
  }
};
let config;
try {
  const shared = new URLSearchParams(location.hash.slice(1)).get('design');
  if (shared) config = validateConfig(decodeConfig(shared), ids);
} catch {}
if (!config) {
  const stored = readDraft('sessionStorage') || readDraft('localStorage');
  try {
    if (stored) config = validateConfig(stored, ids);
  } catch {}
}
config ||= defaultConfig();
const cached = readCachedArtwork(ARTWORK_REVISION, ids);
globalThis.__birdClockBoot = { config, cached };
for (const id of new Set(config.slices.map((slice) => slice.bird))) {
  if (
    !Object.hasOwn(thumbnails, id) ||
    EMBEDDED_BIRDS.includes(id) ||
    cached[id]
  )
    continue;
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'image';
  link.href = thumbnails[id];
  link.fetchPriority = 'high';
  document.head.append(link);
}
