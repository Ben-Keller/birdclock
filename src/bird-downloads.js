import { escapeHTML as esc } from './clock.js';
import {
  BIRD_FORMATS,
  birdsForDownload,
  birdDownload,
  download,
} from './downloads.js';

export function openBirdDownloads({
  config,
  birds,
  selectedId,
  scope = 'single',
  showModal,
  modalHeader,
  toast,
}) {
  // Work with the clock as it was when this panel opened.
  const snapshot = structuredClone(config);
  const controller = new AbortController();
  showModal(
    'bird-downloads',
    `${modalHeader('THE ILLUSTRATION COLLECTION', 'A little bird to take with you.')}
    <div class="modal-body">
      <form id="bird-download-form">
        <fieldset class="download-fields">
          <legend class="sr-only">Bird download options</legend>
          <div class="download-layout">
            <div class="download-preview-column">
              <div class="download-artwork" id="download-preview"></div>
              <p class="download-caption" id="download-caption"></p>
              <p class="download-dimensions" id="download-dimensions">Original image dimensions</p>
            </div>
            <div class="download-settings">
              <label class="field-label" for="download-scope">WHAT TO TAKE</label>
              <select class="text-field" id="download-scope" name="scope">
                <option value="single" ${scope === 'single' ? 'selected' : ''}>One bird</option>
                <option value="clock" ${scope === 'clock' ? 'selected' : ''}>Birds on this clock · ZIP</option>
                <option value="library" ${scope === 'library' ? 'selected' : ''}>Entire bird library · ZIP</option>
              </select>
              <label class="select-field" id="download-bird-label">Choose a bird
                <select id="download-bird" name="bird">${birds.map((bird) => `<option value="${esc(bird.id)}" ${bird.id === selectedId ? 'selected' : ''}>${esc(bird.name)}</option>`).join('')}</select>
              </label>
              <fieldset class="format-fieldset">
                <legend class="field-label">CHOOSE A FORMAT</legend>
                <div class="format-grid">${Object.entries(BIRD_FORMATS)
                  .map(
                    ([id, format]) => `<label class="format-option">
                  <input type="radio" name="format" value="${id}" ${id === 'png' ? 'checked' : ''}>
                  <span><strong>${format.label}</strong><small>${format.note}</small></span>
                </label>`,
                  )
                  .join('')}</div>
              </fieldset>
              <p class="download-format-note" id="download-format-note"></p>
            </div>
          </div>
          <div class="download-footer">
            <p id="download-summary"></p>
            <button class="button primary" id="download-birds-submit" type="submit">Download PNG <span aria-hidden="true">↓</span></button>
          </div>
        </fieldset>
        <p class="download-progress" id="download-progress" role="status" aria-live="polite"></p>
      </form>
      <p class="modal-note">Original illustrations, without clock placement or wood. ZIP files include a bird index with the hours in your design. Your uploaded birds are included as their saved copies.</p>
    </div>`,
  );

  const modal = document.querySelector('#modal');
  const form = document.querySelector('#bird-download-form');
  const fieldset = form.querySelector('.download-fields');
  const progress = form.querySelector('#download-progress');
  const button = form.querySelector('#download-birds-submit');
  const getOptions = () => ({
    scope: form.elements.scope.value,
    selectedId: form.elements.bird.value,
    format: form.elements.format.value,
  });
  const update = () => {
    const options = getOptions(),
      selection = birdsForDownload(
        snapshot,
        birds,
        options.scope,
        options.selectedId,
      );
    const single = options.scope === 'single',
      format = BIRD_FORMATS[options.format];
    const preview = form.querySelector('#download-preview');
    form.querySelector('#download-bird-label').hidden = !single;
    preview.classList.toggle('flock', !single);
    preview.classList.toggle('white-background', options.format === 'jpeg');
    preview.innerHTML = selection
      .slice(0, 9)
      .map((bird) => `<img src="${esc(bird.asset)}" alt="${esc(bird.name)}">`)
      .join('');
    form.querySelector('#download-caption').textContent = single
      ? selection[0].name
      : `${selection.length} birds, one little collection.`;
    const dimensions = form.querySelector('#download-dimensions');
    dimensions.textContent = 'Original image dimensions';
    if (single) {
      const image = preview.querySelector('img');
      const describe = () => {
        if (!image.isConnected) return;
        dimensions.textContent = `${image.naturalWidth} × ${image.naturalHeight} px · original size`;
      };
      if (image.complete && image.naturalWidth) describe();
      else image.addEventListener('load', describe, { once: true });
    }
    form.querySelector('#download-format-note').textContent =
      options.format === 'svg'
        ? 'A self-contained SVG with the original image embedded. This preserves the illustration; it does not create vector paths or a cutting template.'
        : options.format === 'jpeg'
          ? 'A high-quality image on white. JPEG does not support transparency.'
          : 'Keeps the illustration’s existing transparency at its original resolution. No upscaling or cropping.';
    form.querySelector('#download-summary').textContent = single
      ? `1 illustration · ${format.label}`
      : `${selection.length} illustrations · ${format.label} in a ZIP file`;
    button.innerHTML = `Download ${single ? format.label : 'ZIP'} <span aria-hidden="true">↓</span>`;
    progress.textContent = '';
    progress.classList.remove('error');
  };
  form.addEventListener('change', update);
  modal.addEventListener('close', () => controller.abort(), { once: true });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (fieldset.disabled) return;
    fieldset.disabled = true;
    form.setAttribute('aria-busy', 'true');
    progress.classList.remove('error');
    const label = button.innerHTML;
    button.textContent = 'Preparing files…';
    try {
      const file = await birdDownload({
        birds,
        config: snapshot,
        ...getOptions(),
        signal: controller.signal,
        onProgress: (message) => {
          progress.textContent = message;
        },
      });
      controller.signal.throwIfAborted();
      download(file.blob, file.name);
      progress.textContent =
        'Your download is ready. Enjoy your little piece of the woods.';
      toast('Bird files ready. Check your downloads.');
    } catch (error) {
      if (error.name !== 'AbortError') {
        progress.textContent =
          error.message ||
          'These files could not be prepared. Please try again.';
        progress.classList.add('error');
      }
    } finally {
      fieldset.disabled = false;
      form.removeAttribute('aria-busy');
      button.innerHTML = label;
    }
  });
  update();
}
