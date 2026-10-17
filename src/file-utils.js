export const safeFilename = (name) =>
  String(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 70) || 'woodland-hours';

export function download(blob, name) {
  const anchor = document.createElement('a'),
    url = URL.createObjectURL(blob);
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(
        new Error('This illustration could not be opened. Please try again.'),
      );
    image.src = src;
  });
}

export function blobDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () =>
      reject(new Error('The image file could not be read. Please try again.'));
    reader.readAsDataURL(blob);
  });
}

const imageCache = new Map();
export async function dataURL(src) {
  if (src.startsWith('data:')) return src;
  if (!imageCache.has(src)) {
    const pending = fetch(src)
      .then((response) => {
        if (!response.ok)
          throw new Error(
            'A bird or texture could not be loaded. Please try again.',
          );
        return response.blob();
      })
      .then(blobDataURL)
      .catch((error) => {
        imageCache.delete(src); // A temporary network failure must be retryable.
        throw error;
      });
    imageCache.set(src, pending);
  }
  return imageCache.get(src);
}

export function canvasBlob(canvas, mime, quality = 0.94) {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => {
        if (!blob)
          reject(
            new Error('The image could not be exported. Please try again.'),
          );
        else if (blob.type !== mime)
          reject(
            new Error(
              'This browser cannot export that format. Please choose PNG or JPEG.',
            ),
          );
        else resolve(blob);
      },
      mime,
      quality,
    ),
  );
}
