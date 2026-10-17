const CACHE_KEY = 'birdclock.clock-artwork.v1';
const EMPTY = { birds: {}, woods: {} };

export const displayAssets = () => globalThis.__birdClockDisplay || EMPTY;
export const birdThumbnail = (bird) =>
  displayAssets().birds[bird?.id] ||
  bird?.clockPreview ||
  bird?.preview ||
  bird?.asset ||
  '';

export function readCachedArtwork(revision, ids) {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw || raw.length > 650000) return {};
    const cache = JSON.parse(raw);
    if (cache.revision !== revision) return {};
    return Object.fromEntries(
      ids.flatMap((id) => {
        const image = cache.birds?.[id];
        return typeof image === 'string' &&
          image.length < 12000 &&
          /^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(image)
          ? [[id, image]]
          : [];
      }),
    );
  } catch {
    return {};
  }
}

const pending = new Map();
export function cacheClockArtwork(config, catalogue) {
  const assets = displayAssets();
  if (!assets.revision) return;
  for (const id of new Set(config.slices.map((slice) => slice.bird))) {
    const bird = catalogue.find((bird) => bird.id === id);
    if (!bird?.clockPreview || assets.birds[id] || pending.has(id)) continue;
    const job = (async () => {
      // Reuse the image request/cache already used by the rendered clock.
      const image = new Image();
      image.src = bird.clockPreview;
      await image.decode();
      const response = await fetch(bird.clockPreview, { cache: 'force-cache' });
      if (!response.ok) return;
      const blob = await response.blob();
      if (blob.size > 8500 || blob.type !== 'image/webp') return;
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      assets.birds[id] = data;
      try {
        const birds = Object.fromEntries(
          Object.entries(assets.birds).filter(
            ([id]) => !assets.embedded.includes(id),
          ),
        );
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ revision: assets.revision, birds }),
        );
      } catch {
        /* The design remains usable when browser storage is full. */
      }
    })()
      .catch(() => {})
      .finally(() => pending.delete(id));
    pending.set(id, job);
  }
}
