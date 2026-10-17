import { escapeHTML } from './clock.js';
import { createZip } from './zip.js';

export const BIRD_FORMATS = {
  png: { label: 'PNG', mime: 'image/png', note: 'Transparent · easy to use' },
  jpeg: {
    label: 'JPEG',
    mime: 'image/jpeg',
    note: 'White background · print & share',
  },
  webp: {
    label: 'WebP',
    mime: 'image/webp',
    note: 'Transparent · compact file',
  },
  svg: {
    label: 'SVG',
    mime: 'image/svg+xml',
    note: 'Embedded image · design apps',
  },
};

export {
  safeFilename,
  download,
  loadImage,
  blobDataURL,
  dataURL,
  canvasBlob,
} from './file-utils.js';
import {
  safeFilename,
  download,
  loadImage,
  blobDataURL,
  dataURL,
  canvasBlob,
} from './file-utils.js';

export function birdsForDownload(config, birds, scope, selectedId) {
  if (scope === 'library') return [...birds];
  const ids =
    scope === 'clock'
      ? [...new Set(config.slices.map((slice) => slice.bird))]
      : [selectedId];
  return ids.map((id) => {
    const bird = birds.find((item) => item.id === id);
    if (!bird)
      throw new Error(
        'This bird is no longer available. Reopen the download panel.',
      );
    return bird;
  });
}

export function birdSVG(bird, source, width, height) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">
  <title id="title">${escapeHTML(bird.name)}</title>
  <desc id="description">${escapeHTML(bird.scientificName)}. Original raster illustration embedded at its native resolution; not vector paths.</desc>
  <image width="${width}" height="${height}" href="${escapeHTML(source)}"/>
</svg>`;
}

export async function encodeBird(bird, format) {
  const settings = BIRD_FORMATS[format];
  if (!settings) throw new Error('Choose a supported image format.');
  const source = await dataURL(bird.asset),
    image = await loadImage(source);
  const width = image.naturalWidth,
    height = image.naturalHeight;
  let blob;
  if (format === 'svg') {
    // PNG inside SVG is widely supported by illustration and layout software.
    let embedded = source;
    if (!source.startsWith('data:image/png;')) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(image, 0, 0);
      embedded = await blobDataURL(await canvasBlob(canvas, 'image/png'));
    }
    blob = new Blob([birdSVG(bird, embedded, width, height)], {
      type: settings.mime,
    });
  } else if (source.startsWith(`data:${settings.mime};`)) {
    // Preserve the original bytes when the artwork already uses this format.
    blob = await (await fetch(source)).blob();
  } else {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context)
      throw new Error('Image export is unavailable in this browser.');
    if (format === 'jpeg') {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(image, 0, 0);
    blob = await canvasBlob(canvas, settings.mime);
  }
  const base =
    safeFilename(bird.name) +
    (bird.id.startsWith('custom-') ? `-${bird.id}` : '');
  return {
    blob,
    name: `${base}.${format === 'jpeg' ? 'jpg' : format}`,
    width,
    height,
  };
}

export async function birdDownload({
  birds,
  config,
  scope,
  selectedId,
  format,
  signal,
  onProgress = () => {},
}) {
  const selection = birdsForDownload(config, birds, scope, selectedId);
  const files = [],
    manifest = [];
  for (const [index, bird] of selection.entries()) {
    signal?.throwIfAborted();
    onProgress(`Preparing ${index + 1} of ${selection.length}: ${bird.name}…`);
    const file = await encodeBird(bird, format);
    signal?.throwIfAborted();
    if (scope === 'single') return file;
    files.push({ name: `birds/${file.name}`, blob: file.blob });
    manifest.push({
      id: bird.id,
      name: bird.name,
      scientificName: bird.scientificName,
      file: `birds/${file.name}`,
      width: file.width,
      height: file.height,
      hours: config.slices.flatMap((slice, index) =>
        slice.bird === bird.id ? [index + 1] : [],
      ),
    });
  }
  files.push({
    name: 'birds.json',
    blob: new Blob(
      [
        JSON.stringify(
          { design: config.name, format, birds: manifest },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    ),
  });
  files.push({
    name: 'README.txt',
    blob: new Blob(
      [
        'WOODLAND HOURS — BIRD ILLUSTRATIONS\n\n',
        `${selection.length} illustrations in ${BIRD_FORMATS[format].label} format, at their original stored dimensions.\n`,
        'Bird artwork only: clock placement, wood, rotation, and flipping are not applied.\n',
        'PNG and WebP preserve existing transparency. JPEG uses a white background.\n',
        'SVG files embed the raster illustration; they are not vector paths or cutting templates.\n',
        'Bundled birds are AI-generated illustrations, not authoritative taxonomic plates.\n',
        'Uploaded artwork is the stored, resized copy (at most 512 px). Use images you have permission to share.\n\n',
        'birds.json lists filenames, dimensions, species, and assigned clock hours.\n',
        'This bundle contains artwork. Export a design configuration separately to reopen the clock.\n',
      ],
      { type: 'text/plain' },
    ),
  });
  onProgress('Packing your bird files…');
  const blob = await createZip(files);
  signal?.throwIfAborted();
  const base =
    scope === 'library'
      ? 'woodland-hours-library'
      : `${safeFilename(config.name)}-birds`;
  return { blob, name: `${base}-${format}.zip` };
}
