import {
  WOODS,
  clone,
  defaultConfig,
  validateConfig,
  storageAdapter,
  shuffleWoods,
  shuffleArray,
  assignWood,
  encodeConfig,
  decodeConfig,
} from './model.js';
import { clockSVG, handsMarkup, escapeHTML as esc } from './clock.js';
import { download, safeFilename, dataURL, canvasBlob } from './downloads.js';
import { openBirdDownloads } from './bird-downloads.js';
import { attachClockTooltips } from './clock-tooltip.js';
const $ = (s, root = document) => root.querySelector(s),
  $$ = (s, root = document) => [...root.querySelectorAll(s)];
const clockTooltip = attachClockTooltips($('#clock'), $('#clock-tooltip'));
const DRAFT = 'woodland-hours.draft.v1';
let local, session;
try {
  local = storageAdapter(window.localStorage);
} catch {
  local = storageAdapter(null);
}
try {
  session = storageAdapter(window.sessionStorage);
} catch {
  session = storageAdapter(null);
}
let catalogue = [],
  config = defaultConfig(),
  selected = 2,
  history = [],
  future = [],
  rangeBefore = null,
  modalKind = '',
  lastFocus = null,
  toastTimer,
  libraryQuery = '',
  libraryFilters = { group: '', region: '', use: '' };
const modal = $('#modal');
const allBirds = () => [...catalogue, ...config.customBirds];
const birdById = (id) => allBirds().find((b) => b.id === id);
const settingLabel = (value, type) =>
  type === 'pct'
    ? `${Math.round(value * 100)}%`
    : type === 'deg'
      ? `${value}°`
      : type === 'px'
        ? `${value}px`
        : String(value);
const range = (label, key, value, min, max, step = 1, type = '') =>
  `<label class="range-row"><span class="range-head"><span>${label}</span><output>${settingLabel(value, type)}</output></span><input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-key="${key}" data-format="${type}" aria-label="${label}"></label>`;
const selectField = (label, key, value, options) =>
  `<label class="select-field">${label}<select data-key="${key}" aria-label="${label}">${options.map(([id, name]) => `<option value="${id}" ${id === value ? 'selected' : ''}>${name}</option>`).join('')}</select></label>`;
function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 4000);
}
function autosave() {
  const a = session.set(DRAFT, config),
    b = local.set(DRAFT, config);
  const status = $('#save-status');
  status.hidden = b;
  status.textContent = b
    ? ''
    : a
      ? 'Saved for this session'
      : 'Storage unavailable — export your design';
  status.title = b
    ? ''
    : a
      ? 'Persistent storage is unavailable. Export JSON to keep this design.'
      : 'Your browser blocked local storage. Use Download JSON to save.';
}
function pushHistory(before) {
  if (JSON.stringify(before) === JSON.stringify(config)) return;
  history.push(before);
  if (history.length > 40) history.shift();
  future = [];
}
function commit(fn, message) {
  rangeBefore = null;
  const before = clone(config);
  fn();
  pushHistory(before);
  autosave();
  render();
  if (message) toast(message);
}
function renderClock() {
  clockTooltip.hide();
  const wrap = $('#clock');
  const hadFocus = wrap.contains(document.activeElement);
  wrap.innerHTML = clockSVG(config, allBirds(), { selected });
  $('#clock-stage').style.background = config.face.background;
  if (hadFocus)
    $(`[data-hour="${selected}"]`, wrap)?.focus({ preventScroll: true });
}
function render() {
  renderClock();
  renderPanel();
  $('#undo-button').disabled = !history.length;
  $('#redo-button').disabled = !future.length;
}
function renderPanel() {
  const s = config.slices[selected],
    bird = birdById(s.bird),
    f = config.face;
  $('#panel').innerHTML = `
    <div class="field-label">THE BIRD <span>Hour ${selected + 1}</span></div>
    <button class="bird-choice" data-action="library" aria-label="Change bird for hour ${selected + 1}">
      <img src="${esc(bird.asset)}" alt="${esc(bird.name)}">
      <span>
        <span class="name">${esc(bird.name)}</span>
        <span class="latin">${esc(bird.scientificName)}</span>
        <span class="change">Explore ${allBirds().length} birds</span>
      </span>
      <span class="arrow" aria-hidden="true">↗</span>
    </button>
    <section class="control-section">
      <div class="field-label">THE WOOD</div>
      <div class="wood-options">
        ${WOODS.map((w) => `<button class="wood-option ${s.wood === w.id ? 'active' : ''}" data-wood="${w.id}" aria-label="Choose ${w.name} for hour ${selected + 1}" aria-pressed="${s.wood === w.id}"><span class="wood-swatch" style="--wood:${w.color};background-image:url('assets/woods/${w.id}.webp')"></span><strong>${w.name}</strong>${s.wood === w.id ? '<span class="check" aria-hidden="true">✓</span>' : ''}</button>`).join('')}
      </div>
    </section>
    <hr class="divider">
    <div class="field-label">THE COMPOSITION</div>
    ${range('Bird size', 'slice.scale', s.scale, 0.55, 1.5, 0.05, 'pct')}
    <div class="inline-actions">
      <button class="mini-button ${s.flip ? 'active' : ''}" data-action="flip" aria-pressed="${s.flip}">⇄ Flip bird</button>
      <button class="mini-button" data-action="reset-bird">Reset placement</button>
    </div>
    <details class="advanced">
      <summary>Fine-tune placement</summary>
      ${range('Rotate bird', 'slice.rotation', s.rotation, -180, 180, 5, 'deg')}
      <div class="two-controls">
        ${range('Horizontal', 'slice.x', s.x, -65, 65, 1, 'px')}
        ${range('Vertical', 'slice.y', s.y, -65, 65, 1, 'px')}
      </div>
      <p class="hint">Artwork stays inside its slice. Rotate and move it to find the right fit.</p>
    </details>
    <section class="clock-details" aria-labelledby="clock-details-heading">
      <h3 id="clock-details-heading" class="field-label">THE CLOCK <span>All twelve hours</span></h3>
      <div class="two-controls">
        ${selectField('Clock shape', 'face.shape', f.shape, [
          ['polygon', 'Twelve-sided'],
          ['circle', 'Round'],
        ])}
        ${selectField('Hour markers', 'face.numbers', f.numbers, [
          ['arabic', 'Numbers'],
          ['roman', 'Roman numerals'],
          ['dots', 'Small dots'],
          ['none', 'Birds only'],
        ])}
      </div>
      ${range('Wood grain', 'face.grain', f.grain, 0, 1, 0.05, 'pct')}
      <div class="inline-actions">
        <button class="mini-button" data-action="shuffle-birds">Randomize birds</button>
        <button class="mini-button" data-action="shuffle-woods">Randomize woods</button>
      </div>
    </section>`;
}
function chooseHour(i) {
  selected = (i + 12) % 12;
  renderClock();
  renderPanel();
}
function setValue(key, value) {
  if (key.startsWith('slice.'))
    config.slices[selected][key.split('.')[1]] = value;
  else if (key.startsWith('face.')) config.face[key.split('.')[1]] = value;
  else config[key] = value;
}
function undo() {
  if (!history.length) return;
  future.push(clone(config));
  config = history.pop();
  autosave();
  render();
  toast('Change undone.');
}
function redo() {
  if (!future.length) return;
  history.push(clone(config));
  config = future.pop();
  autosave();
  render();
  toast('Change restored.');
}
function setWood(wood) {
  const old = config.slices.map((s) => s.wood),
    next = assignWood(config.slices, selected, wood, config.noAdjacent),
    changed = next.filter((w, i) => w !== old[i]).length;
  commit(
    () => config.slices.forEach((s, i) => (s.wood = next[i])),
    changed > 1
      ? 'Wood selected. A neighbor was adjusted to keep the pattern distinct.'
      : undefined,
  );
}
function shuffleWood() {
  commit(() => {
    const woods = shuffleWoods();
    config.slices.forEach((s, i) => (s.wood = woods[i]));
  }, 'A new wood arrangement. Four of each, with no matching neighbors.');
}
function selectBird(id) {
  if (!birdById(id)) return;
  const other = config.slices.findIndex(
    (s, i) => i !== selected && s.bird === id,
  );
  commit(
    () => {
      if (config.uniqueBirds && other >= 0)
        config.slices[other].bird = config.slices[selected].bird;
      config.slices[selected].bird = id;
    },
    config.uniqueBirds && other >= 0
      ? `Swapped birds with hour ${other + 1}.`
      : `${birdById(id).name} is now at ${selected + 1}.`,
  );
  closeModal();
}
function showModal(kind, html) {
  clockTooltip.hide();
  if (!modal.open) lastFocus = document.activeElement;
  modalKind = kind;
  $('#modal-content').innerHTML = html;
  if (!modal.open) modal.showModal();
  modal.scrollTop = 0;
  $('#modal-title')?.focus({ preventScroll: true });
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  modal.close();
}
modal.addEventListener('close', () => {
  document.body.style.overflow = '';
  modalKind = '';
  if (lastFocus?.isConnected) lastFocus.focus({ preventScroll: true });
  else $('.bird-choice')?.focus({ preventScroll: true });
});
modal.addEventListener('click', (e) => {
  if (e.target === modal) {
    const r = modal.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      closeModal();
  }
});
const modalHeader = (eyebrow, title) =>
  `<div class="modal-head"><div>${eyebrow ? `<p class="eyebrow">${eyebrow}</p>` : ''}<h2 id="modal-title" tabindex="-1">${title}</h2></div><button class="modal-close" data-action="close" aria-label="Close dialog">×</button></div>`;
const searchText = (value) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[’']/g, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim();
const libraryFilter = (label, key, options) =>
  `<label class="library-filter">${label}<select data-library-filter="${key}">${options.map(([value, name]) => `<option value="${esc(value)}">${esc(name)}</option>`).join('')}</select></label>`;
function openLibrary() {
  libraryQuery = '';
  libraryFilters = { group: '', region: '', use: '' };
  const birds = allBirds();
  const optionsFor = (key) =>
    [...new Set(birds.map((bird) => bird[key]).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b))
      .map((value) => [value, value]);
  showModal(
    'library',
    `${modalHeader(`THE BIRD LIBRARY / HOUR ${selected + 1}`, 'Find your next feathered friend.')}
    <div class="modal-body">
      <div class="library-tools">
        <label class="search-field"><span class="sr-only">Search birds</span><input id="bird-search" type="search" placeholder="Search birds, places, or scientific names…" aria-label="Search birds"></label>
        <button class="quiet-link" data-action="clear-bird-filters" id="clear-bird-filters" disabled>Clear filters</button>
      </div>
      <div class="library-filters">
        ${libraryFilter('Bird group', 'group', [['', 'All groups'], ...optionsFor('group')])}
        ${libraryFilter('Region', 'region', [['', 'All regions'], ...optionsFor('region')])}
        ${libraryFilter('On your clock', 'use', [
          ['', 'All birds'],
          ['used', 'Already on clock'],
          ['unused', 'Not on clock'],
        ])}
      </div>
      <div class="library-meta"><span id="library-count" role="status"></span></div>
      <div class="bird-grid" id="bird-grid"></div>
      <div class="library-bottom"><span>${config.uniqueBirds ? 'Already on your clock? Selecting it swaps the two hours.' : 'Birds may appear at more than one hour.'}</span><button class="quiet-link" data-action="upload-bird">Add your own image ↗</button></div>
    </div>`,
  );
  renderBirdGrid();
}
function clearBirdFilters() {
  libraryQuery = '';
  libraryFilters = { group: '', region: '', use: '' };
  $('#bird-search').value = '';
  $$('[data-library-filter]').forEach((select) => (select.value = ''));
  renderBirdGrid();
  $('#bird-search').focus();
}
function renderBirdGrid() {
  const words = searchText(libraryQuery).split(' ').filter(Boolean);
  const all = allBirds();
  const usedIds = new Set(config.slices.map((slice) => slice.bird));
  const birds = all.filter((bird) => {
    const text = searchText(
      `${bird.name} ${bird.scientificName} ${bird.region} ${bird.group}`,
    );
    return (
      (!libraryFilters.group || bird.group === libraryFilters.group) &&
      (!libraryFilters.region || bird.region === libraryFilters.region) &&
      (!libraryFilters.use ||
        usedIds.has(bird.id) === (libraryFilters.use === 'used')) &&
      words.every((word) => text.includes(word))
    );
  });
  $('#library-count').textContent = `${birds.length} of ${all.length} birds`;
  $('#clear-bird-filters').disabled =
    !libraryQuery && !Object.values(libraryFilters).some(Boolean);
  $('#bird-grid').scrollTop = 0;
  $('#bird-grid').innerHTML = birds.length
    ? birds
        .map((b) => {
          const used = config.slices.findIndex((s) => s.bird === b.id);
          return `<article class="bird-card ${config.slices[selected].bird === b.id ? 'current' : ''}"><button class="bird-card-select" data-bird="${esc(b.id)}" aria-label="Choose ${esc(b.name)}" aria-pressed="${config.slices[selected].bird === b.id}">${used >= 0 ? `<span class="used">${used === selected ? 'Selected' : `Hour ${used + 1}`}</span>` : ''}<img src="${esc(b.asset)}" alt="" loading="lazy"><strong>${esc(b.name)}</strong><small>${esc(b.region)}</small></button></article>`;
        })
        .join('')
    : '<div class="empty-state"><p>No birds match these filters.</p><button class="quiet-link" data-action="clear-bird-filters">Clear filters</button></div>';
}
function openExport() {
  showModal(
    'export',
    `${modalHeader('', 'Downloads')}<div class="modal-body"><div class="export-layout"><div><div class="mini-clock">${clockSVG(config, allBirds(), { interactive: false })}</div></div><div class="export-options"><button class="export-option" data-action="share"><span class="symbol">↗</span><span><strong>Copy a design link</strong><small>Let someone open this exact arrangement</small></span><span class="arrow">↗</span></button><button class="export-option" data-action="png"><span class="symbol">↓</span><span><strong>Download clock image</strong><small>A 2,400 px PNG, ready to send or print</small></span><span class="arrow">↗</span></button><button class="export-option" data-action="bird-downloads" data-scope="clock"><span class="symbol">↓</span><span><strong>Download bird files</strong><small>PNG, JPEG, WebP or SVG · one bird or a ZIP collection</small></span><span class="arrow">↗</span></button><button class="export-option" data-action="json"><span class="symbol">⌘</span><span><strong>Download configuration</strong><small>JSON backup, including any uploaded birds</small></span><span class="arrow">↗</span></button></div></div><div class="export-utilities" aria-label="More design actions"><button class="quiet-link" data-action="import-design">Import design</button><button class="quiet-link" data-action="start-fresh">Start fresh</button><button class="quiet-link" data-action="about">About the studio</button></div><div id="export-feedback" role="status"></div></div>`,
  );
}
function confirmAction(title, description, action, label = 'Continue') {
  showModal(
    'confirm',
    `${modalHeader('WOODLAND HOURS', title)}<div class="modal-body confirm-content"><p>${esc(description)}</p><div class="actions"><button class="button ghost" data-action="close">Cancel</button><button class="button primary" id="confirm-action">${esc(label)}</button></div></div>`,
  );
  $('#confirm-action').addEventListener(
    'click',
    () => {
      closeModal();
      action();
    },
    { once: true },
  );
}
function openAbout() {
  showModal(
    'about',
    `${modalHeader('A NOTE ON THE STUDIO', 'A small collection of possibilities.')}<div class="modal-body about-copy"><h3>Twelve birds. Three woods. Your arrangement.</h3><p>This studio began with a twelve-piece wooden clock: 30-degree triangular slices, maple, mahogany and cherry, with a different bird at every hour. The original design keeps the osprey at three and the loon at nine. Every hour is yours to change.</p><h3>Made to stay with you.</h3><p>Changes are saved automatically in this browser. A share link carries a built-in-bird configuration in the URL; uploaded illustrations travel in JSON backups instead.</p><h3>A visual design, ready to discuss.</h3><p>The birds are AI-generated natural-history illustrations, and the woods are generated texture studies. They are not taxonomic reference plates or exact timber samples. This is a design tool, not a fabrication drawing: confirm dimensions, joinery, material thickness and clock movement with your maker.</p><p>Keyboard tip: Tab to the clock, then use the arrow keys to move between hours. Ctrl/⌘ Z undoes your last change.</p></div>`,
  );
}
function exportJSON() {
  download(
    new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' }),
    `${safeFilename(config.name)}.json`,
  );
  toast('Configuration downloaded.');
}
async function copyShare() {
  if (config.customBirds.length) {
    toast(
      'This design includes uploaded artwork. Share its JSON file instead.',
    );
    return;
  }
  const data = encodeConfig(config);
  if (data.length > 18000) {
    toast('This design is too large for a link. Download its JSON instead.');
    return;
  }
  const url = new URL(location.href);
  url.hash = `design=${data}`;
  try {
    await navigator.clipboard.writeText(url.href);
    toast('Design link copied. Anyone with it can open this arrangement.');
  } catch {
    const feedback = $('#export-feedback');
    if (!feedback) return;
    feedback.innerHTML =
      '<p class="modal-note">Copy this design link:</p><input class="copy-field" aria-label="Design share link" readonly>';
    const input = $('.copy-field');
    input.value = url.href;
    input.select();
  }
}
async function exportPNG(button) {
  button.disabled = true;
  button.classList.add('busy');
  const snapshot = clone(config);
  const birds = allBirds();
  try {
    await document.fonts.ready;
    const birdData = {},
      textureData = {};
    await Promise.all(
      [...new Set(snapshot.slices.map((s) => s.bird))].map(
        async (id) =>
          (birdData[id] = await dataURL(
            birds.find((bird) => bird.id === id).asset,
          )),
      ),
    );
    await Promise.all(
      WOODS.map(
        async (w) =>
          (textureData[w.id] = await dataURL(`assets/woods/${w.id}.webp`)),
      ),
    );
    let svg = clockSVG(snapshot, birds, {
      interactive: false,
      birdData,
      textureData,
      background: true,
    });
    const font = await dataURL('assets/fonts/cormorant-500.ttf');
    svg = svg.replace(
      '<defs>',
      `<defs><style>@font-face{font-family:'Cormorant Garamond';src:url(${font}) format('truetype');font-weight:500}</style>`,
    );
    const img = new Image(),
      url = URL.createObjectURL(
        new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }),
      );
    try {
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () =>
          reject(
            new Error('Could not render this image. Try another browser.'),
          );
        img.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 2400;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, 2400, 2400);
      const blob = await canvasBlob(canvas, 'image/png');
      download(blob, `${safeFilename(snapshot.name)}.png`);
      toast('Your 2,400 px clock image is ready.');
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch (e) {
    toast(e.message || 'Could not export. Download JSON as a backup.');
  } finally {
    button.disabled = false;
    button.classList.remove('busy');
  }
}
async function importFile(file) {
  if (!file) return;
  if (file.size > 3000000) {
    toast('Choose a configuration file smaller than 3 MB.');
    return;
  }
  try {
    const next = validateConfig(
      JSON.parse(await file.text()),
      catalogue.map((b) => b.id),
    );
    commit(() => (config = next), 'Configuration imported.');
    closeModal();
  } catch (e) {
    toast(e.message || 'This file is not a valid configuration.');
  }
}
async function uploadBird(file) {
  if (!file) return;
  if (
    !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
    file.size > 10000000
  ) {
    toast('Choose a PNG, WebP, or JPEG smaller than 10 MB.');
    return;
  }
  if (config.customBirds.length >= 8) {
    toast(
      'This design already has 8 uploaded birds. Start a new design to add others.',
    );
    return;
  }
  let url;
  try {
    const image = new Image();
    url = URL.createObjectURL(file);
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = url;
    });
    const ratio = Math.min(
        1,
        512 / Math.max(image.naturalWidth, image.naturalHeight),
      ),
      canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    const asset = canvas.toDataURL('image/webp', 0.85);
    if (asset.length > 350000)
      throw new Error(
        'This image is too large after resizing. Try a smaller file.',
      );
    const b = {
      id: `custom-${crypto.randomUUID?.() || Date.now().toString(36)}`,
      name: file.name.replace(/\.[^.]+$/, '').slice(0, 70),
      asset,
      scientificName: 'Your illustration',
      region: 'Custom',
      group: 'Custom',
    };
    commit(() => {
      config.customBirds.push(b);
      config.slices[selected].bird = b.id;
    }, 'Your image has been added. Transparent PNG or WebP works best.');
    closeModal();
  } catch (e) {
    toast(e.message || 'This image could not be opened. Try a PNG or WebP.');
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}
document.addEventListener('click', (e) => {
  const slice = e.target.closest('.clock-slice');
  if (slice && $('#clock').contains(slice)) {
    chooseHour(+slice.dataset.hour);
    return;
  }
  const wood = e.target.closest('[data-wood]');
  if (wood) {
    setWood(wood.dataset.wood);
    return;
  }
  const bird = e.target.closest('[data-bird]');
  if (bird) {
    selectBird(bird.dataset.bird);
    return;
  }
  const a = e.target.closest('[data-action]');
  if (!a) return;
  const action = a.dataset.action;
  if (action === 'bird-downloads')
    openBirdDownloads({
      config,
      birds: allBirds(),
      selectedId: config.slices[selected].bird,
      scope: a.dataset.scope || 'single',
      showModal,
      modalHeader,
      toast,
    });
  if (action === 'close') closeModal();
  if (action === 'import-design') $('#json-input').click();
  if (action === 'start-fresh') startFresh();
  if (action === 'about') openAbout();
  if (action === 'library') openLibrary();
  if (action === 'clear-bird-filters') clearBirdFilters();
  if (action === 'flip')
    commit(
      () => (config.slices[selected].flip = !config.slices[selected].flip),
    );
  if (action === 'reset-bird')
    commit(
      () =>
        Object.assign(config.slices[selected], {
          scale: 1,
          rotation: 0,
          x: 0,
          y: 0,
          flip: false,
        }),
      'Bird placement reset.',
    );
  if (action === 'shuffle-woods') shuffleWood();
  if (action === 'shuffle-birds')
    commit(() => {
      const ids = shuffleArray(allBirds().map((b) => b.id)).slice(0, 12);
      config.slices.forEach((s, i) => (s.bird = ids[i]));
    }, 'A new flock for your clock.');
  if (action === 'share') copyShare();
  if (action === 'json') exportJSON();
  if (action === 'png') exportPNG(a);
  if (action === 'upload-bird') $('#bird-input').click();
});
document.addEventListener('focusin', (e) => {
  if (e.target.matches('input[type=range]')) rangeBefore = clone(config);
});
document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.id === 'bird-search') {
    libraryQuery = el.value;
    renderBirdGrid();
    return;
  }
  if (el.matches('input[type=range]') && el.dataset.key) {
    if (!rangeBefore) rangeBefore = clone(config);
    setValue(el.dataset.key, +el.value);
    el.closest('.range-row').querySelector('output').textContent = settingLabel(
      +el.value,
      el.dataset.format,
    );
    renderClock();
    autosave();
  }
});
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.libraryFilter) {
    libraryFilters[el.dataset.libraryFilter] = el.value;
    renderBirdGrid();
    return;
  }
  if (el.id === 'json-input') {
    importFile(el.files[0]);
    el.value = '';
    return;
  }
  if (el.id === 'bird-input') {
    uploadBird(el.files[0]);
    el.value = '';
    return;
  }
  if (!el.dataset.key) return;
  if (el.matches('input[type=range]')) {
    if (rangeBefore) pushHistory(rangeBefore);
    rangeBefore = null;
    $('#undo-button').disabled = !history.length;
    $('#redo-button').disabled = !future.length;
    return;
  }
  commit(() => setValue(el.dataset.key, el.value));
});
document.addEventListener('keydown', (e) => {
  if (e.target.closest('#clock .clock-slice')) {
    if (
      [
        'ArrowLeft',
        'ArrowUp',
        'ArrowRight',
        'ArrowDown',
        'Home',
        'End',
      ].includes(e.key)
    ) {
      e.preventDefault();
      chooseHour(
        e.key === 'Home'
          ? 11
          : e.key === 'End'
            ? 10
            : selected + (['ArrowRight', 'ArrowDown'].includes(e.key) ? 1 : -1),
      );
      $(`[data-hour="${selected}"]`, $('#clock')).focus();
    } else if (['Enter', ' '].includes(e.key)) {
      e.preventDefault();
      chooseHour(+e.target.closest('.clock-slice').dataset.hour);
      $('.bird-choice')?.focus();
    }
    return;
  }
  if (
    (e.ctrlKey || e.metaKey) &&
    e.key.toLowerCase() === 'z' &&
    !e.target.closest('input,textarea,select') &&
    !modal.open
  ) {
    e.preventDefault();
    e.shiftKey ? redo() : undo();
  }
});
$('#undo-button').onclick = undo;
$('#redo-button').onclick = redo;
$('#export-button').onclick = openExport;
function startFresh() {
  confirmAction(
    'Begin with a fresh clock?',
    'Your current design will be replaced by the original twelve birds. You can undo this change or download a configuration first.',
    () =>
      commit(() => {
        config = defaultConfig();
        selected = 2;
      }, 'Original clock restored.'),
    'Start fresh',
  );
}
$('#focus-button').onclick = () =>
  showModal(
    'fullscreen',
    `${modalHeader('YOUR CLOCK', esc(config.name))}<div class="modal-body fullscreen-clock">${clockSVG(config, allBirds(), { interactive: false })}</div>`,
  );
async function init() {
  try {
    const r = await fetch('assets/birds.json');
    if (!r.ok)
      throw new Error('The bird library could not be loaded. Please refresh.');
    catalogue = await r.json();
    let warning = '',
      shared = false,
      priorDraft = null;
    const ids = catalogue.map((b) => b.id),
      hash = new URLSearchParams(location.hash.slice(1));
    if (hash.has('design')) {
      try {
        config = validateConfig(decodeConfig(hash.get('design')), ids);
        const prior = session.get(DRAFT) || local.get(DRAFT);
        if (prior) {
          try {
            priorDraft = validateConfig(prior, ids);
          } catch {}
        }
        shared = true;
      } catch (e) {
        warning = `Could not open that link: ${e.message}`;
      }
    }
    if (!shared) {
      const stored = session.get(DRAFT) || local.get(DRAFT);
      if (stored) {
        try {
          config = validateConfig(stored, ids);
        } catch {
          warning =
            'Your previous browser draft could not be read. The original clock is open.';
        }
      }
    }
    if (shared && priorDraft) pushHistory(priorDraft);
    startupButtons.forEach((button) => (button.disabled = false));
    render();
    autosave();
    if (shared) {
      toast(
        history.length
          ? 'Shared design opened. Undo restores your previous draft.'
          : 'Shared design opened.',
      );
      window.history.replaceState(
        null,
        '',
        location.pathname + location.search,
      );
    }
    if (warning) toast(warning);
  } catch (e) {
    $('#clock').innerHTML =
      `<div class="empty-state"><h2>The studio couldn’t open.</h2><p>${esc(e.message)}</p><p>Run this folder through a local server or GitHub Pages, then refresh.</p></div>`;
    $('#save-status').textContent = 'Studio unavailable';
    $('#save-status').hidden = false;
  }
}
// Update only the hands, preserving editor focus and slice selection.
setInterval(() => {
  if (!config.face.live || document.hidden) return;
  const roots = [$('#clock svg')];
  if (modalKind === 'fullscreen') roots.push($('.fullscreen-clock svg'));
  if (modalKind === 'export') roots.push($('.mini-clock svg'));
  for (const svg of roots) {
    const old = svg?.querySelector('.clock-hands');
    if (old)
      old.outerHTML = handsMarkup(config.face, new Date(), svg.dataset.prefix);
  }
}, 1000);
const startupButtons = $$('button');
startupButtons.forEach((button) => (button.disabled = true));
init();
