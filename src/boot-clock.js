import { clockViewMarkup } from './clock-view.js';
import { defaultConfig } from './model.js';

const { config = defaultConfig(), cached = {} } =
  globalThis.__birdClockBoot || {};
globalThis.__birdClockDisplay = {
  birds: { ...cached, ...EMBEDDED_ARTWORK },
  woods: EMBEDDED_WOODS,
  revision: ARTWORK_REVISION,
  embedded: Object.keys(EMBEDDED_ARTWORK),
};
const clock = document.querySelector('#clock');
clock.innerHTML = clockViewMarkup(
  config,
  [...BOOT_CATALOGUE, ...config.customBirds],
  { selected: 2, idPrefix: 'clock-boot-' },
);
clock.inert = true;

// Decode the exact image URLs used by the SVG, including custom artwork.
// Reveal the complete face together; the editor and web fonts can follow.
const urls = [
  ...new Set(
    [...clock.querySelectorAll('image')].map((image) =>
      image.getAttribute('href'),
    ),
  ),
];
Promise.allSettled(
  urls.map((src) => {
    const image = new Image();
    image.src = src;
    return image.decode();
  }),
).then(() => {
  clock.removeAttribute('data-booting');
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      performance.mark('clock-first-frame');
      const fonts = document.createElement('link');
      fonts.rel = 'stylesheet';
      fonts.href = FONT_STYLESHEET;
      fonts.onload = () => {
        document.documentElement.dataset.fontsReady = 'true';
      };
      fonts.onerror = () => {
        document.documentElement.dataset.fontsReady = 'true';
      };
      document.head.append(fonts);
    }),
  );
});
