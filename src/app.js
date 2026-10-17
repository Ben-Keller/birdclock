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
const $ = (s, root = document) => root.querySelector(s),
  $$ = (s, root = document) => [...root.querySelectorAll(s)];
const DRAFT = 'woodland-hours.draft.v1',
  SAVED = 'woodland-hours.saved.v1',
  RECOVERY = 'woodland-hours.recovery.v1';
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
  tab = 'slice',
  history = [],
  future = [],
  rangeBefore = null,
  nameBefore = null,
  modalKind = '',
  lastFocus = null,
  toastTimer,
  libraryQuery = '',
  libraryGroup = 'All birds';
let saved = local.get(SAVED, []);
if (!Array.isArray(saved)) saved = [];
const modal = $('#modal');
const allBirds = () => [...catalogue, ...config.customBirds];
const birdById = (id) => allBirds().find((b) => b.id === id);
const woodById = (id) => WOODS.find((w) => w.id === id);
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
const toggle = (label, key, checked, note = '') =>
  `<label class="toggle-row"><span>${label}${note ? `<small>${note}</small>` : ''}</span><input type="checkbox" data-key="${key}" ${checked ? 'checked' : ''}></label>`;
const selectField = (label, key, value, options) =>
  `<label class="select-field">${label}<select data-key="${key}" aria-label="${label}">${options.map(([id, name]) => `<option value="${id}" ${id === value ? 'selected' : ''}>${name}</option>`).join('')}</select></label>`;
const colorField = (label, key, value) =>
  `<label class="color-row"><span>${label}</span><input type="color" data-key="${key}" value="${value}" aria-label="${label}"></label>`;
const dot = (wood) =>
  `<i class="wood-dot" style="--wood:${woodById(wood).color};background-image:url('assets/woods/${wood}.webp')"></i>`;
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
  status.classList.toggle('error', !b);
  status.innerHTML = `<i></i>${b ? 'Saved in this browser' : a ? 'Saved for this session' : 'Storage unavailable — export your design'}`;
  status.title = b
    ? 'Your current design is saved automatically on this device.'
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
  $('#design-name').value = config.name;
  $('#undo-button').disabled = !history.length;
  $('#redo-button').disabled = !future.length;
  $('#saved-count').textContent = saved.length;
  $('#wood-summary').innerHTML = WOODS.map(
    (w) =>
      `<span>${dot(w.id)}${config.slices.filter((s) => s.wood === w.id).length} ${w.name}</span>`,
  ).join('');
}
function renderPanel() {
  $$('.editor-tabs button').forEach((b) => {
    const active = b.dataset.tab === tab;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', String(active));
    b.tabIndex = active ? 0 : -1;
  });
  $('#panel').setAttribute('aria-labelledby', `tab-${tab}`);
  const s = config.slices[selected],
    bird = birdById(s.bird),
    f = config.face;
  if (tab === 'slice')
    $('#panel').innerHTML =
      `<div class="panel-heading"><h2>Make an hour your own.</h2><span class="subtle">${String(selected + 1).padStart(2, '0')} / 12</span></div><div class="hour-grid" aria-label="Choose an hour">${config.slices.map((_, i) => `<button class="hour-button ${i === selected ? 'active' : ''}" data-select-hour="${i}" aria-label="Edit hour ${i + 1}" aria-pressed="${i === selected}">${i + 1}</button>`).join('')}</div><div class="field-label">THE BIRD <span>Hour ${selected + 1}</span></div><button class="bird-choice" data-action="library" aria-label="Change bird for hour ${selected + 1}"><img src="${esc(bird.asset)}" alt="${esc(bird.name)}"><span><span class="name">${esc(bird.name)}</span><span class="latin">${esc(bird.scientificName)}</span><span class="change">Explore ${allBirds().length} birds</span></span><span class="arrow" aria-hidden="true">↗</span></button><div class="bird-file-action"><span>Keep a little of the illustration.</span><button class="quiet-link" data-action="bird-downloads">Download bird <span aria-hidden="true">↓</span></button></div><section class="control-section"><div class="field-label">THE WOOD <span>${woodById(s.wood).note}</span></div><div class="wood-options">${WOODS.map((w) => `<button class="wood-option ${s.wood === w.id ? 'active' : ''}" data-wood="${w.id}" aria-label="Choose ${w.name} for hour ${selected + 1}" aria-pressed="${s.wood === w.id}"><span class="wood-swatch" style="--wood:${w.color};background-image:url('assets/woods/${w.id}.webp')"></span><strong>${w.name}</strong>${s.wood === w.id ? '<span class="check" aria-hidden="true">✓</span>' : ''}</button>`).join('')}</div>${toggle('Keep neighboring woods different', 'noAdjacent', config.noAdjacent)}<p class="hint">${config.noAdjacent ? 'Choose any wood. We’ll gently adjust a neighbor if needed, including the join between 12 and 1.' : 'Repeating woods are allowed. You can use any arrangement.'}</p></section><hr class="divider"><div class="field-label">THE COMPOSITION <span>This hour only</span></div>${range('Bird size', 'slice.scale', s.scale, 0.55, 1.5, 0.05, 'pct')}<div class="inline-actions"><button class="mini-button ${s.flip ? 'active' : ''}" data-action="flip" aria-pressed="${s.flip}">⇄ Flip bird</button><button class="mini-button" data-action="reset-bird">Reset placement</button></div><details class="advanced"><summary>Fine-tune placement & grain</summary>${range('Rotate bird', 'slice.rotation', s.rotation, -180, 180, 5, 'deg')}<div class="two-controls">${range('Horizontal', 'slice.x', s.x, -65, 65, 1, 'px')}${range('Vertical', 'slice.y', s.y, -65, 65, 1, 'px')}</div>${range('Grain direction', 'slice.grain', s.grain, -90, 90, 5, 'deg')}<p class="hint">Artwork stays inside its slice. Rotate and move it to find the right fit.</p></details>`;
  else if (tab === 'face')
    $('#panel').innerHTML =
      `<div class="panel-heading"><h2>The finishing touches.</h2></div><p class="hint" style="margin-top:0">Small details change the whole character of your clock.</p><div class="two-controls">${selectField(
        'Clock shape',
        'face.shape',
        f.shape,
        [
          ['polygon', 'Twelve-sided'],
          ['circle', 'Round'],
        ],
      )}${selectField('Hour markers', 'face.numbers', f.numbers, [
        ['arabic', 'Numbers'],
        ['roman', 'Roman numerals'],
        ['dots', 'Small dots'],
        ['none', 'Birds only'],
      ])}</div>${range('Marker size', 'face.numberSize', f.numberSize, 18, 42, 1, 'px')}${range('All bird sizes', 'face.birdScale', f.birdScale, 0.65, 1.25, 0.05, 'pct')}<hr class="divider"><div class="field-label">MATERIAL & FINISH</div>${range('Wood grain', 'face.grain', f.grain, 0, 1, 0.05, 'pct')}<div class="two-controls">${range('Seam width', 'face.seam', f.seam, 0, 4, 0.25, 'px')}${range('Outer edge', 'face.rim', f.rim, 0, 12, 1, 'px')}</div>${colorField('Edge & seam color', 'face.rimColor', f.rimColor)}${colorField('Backdrop', 'face.background', f.background)}<hr class="divider"><div class="field-label">THE HANDS</div>${toggle('Show clock hands', 'face.hands', f.hands)}${toggle('Use the current time', 'face.live', f.live)}<div class="two-controls"><label class="select-field">Preview time<input type="time" data-key="face.time" aria-label="Preview time" value="${f.time}" ${f.live ? 'disabled' : ''}></label>${selectField(
        'Second hand',
        'face.seconds',
        String(f.seconds),
        [
          ['false', 'Hidden'],
          ['true', 'Visible'],
        ],
      )}</div>${colorField('Hands', 'face.handColor', f.handColor)}${colorField('Center pin', 'face.hubColor', f.hubColor)}`;
  else
    $('#panel').innerHTML =
      `<div class="panel-heading"><h2>Your hour register.</h2><span class="subtle">12 / 12 birds</span></div><div class="register-list">${config.slices
        .map((s, i) => {
          const b = birdById(s.bird);
          return `<button class="register-item" data-select-hour="${i}" aria-label="Edit hour ${i + 1}, ${esc(b.name)}"><span class="hour">${String(i + 1).padStart(2, '0')}</span><img src="${esc(b.asset)}" alt=""><span><span class="register-name">${esc(b.name)}</span><small>${dot(s.wood)}${woodById(s.wood).name}</small></span><span class="arrow">↗</span></button>`;
        })
        .join(
          '',
        )}</div><hr class="divider">${toggle('A different bird at every hour', 'uniqueBirds', config.uniqueBirds, 'Choosing a bird already on the clock will swap the two.')}<div class="inline-actions"><button class="mini-button" data-action="shuffle-birds">Shuffle birds</button><button class="mini-button" data-action="shuffle-woods">Shuffle woods</button></div>`;
}
function chooseHour(i) {
  selected = (i + 12) % 12;
  tab = 'slice';
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
  `<div class="modal-head"><div><p class="eyebrow">${eyebrow}</p><h2 id="modal-title" tabindex="-1">${title}</h2></div><button class="modal-close" data-action="close" aria-label="Close dialog">×</button></div>`;
function openLibrary() {
  libraryQuery = '';
  libraryGroup = 'All birds';
  showModal(
    'library',
    `${modalHeader(`THE BIRD LIBRARY / HOUR ${selected + 1}`, 'Find your next feathered friend.')}<div class="modal-body"><div class="library-tools"><label class="search-field"><span class="sr-only">Search birds</span><input id="bird-search" type="search" placeholder="Search a bird, place, or scientific name…" aria-label="Search birds"></label><select id="bird-filter" aria-label="Filter birds"><option>All birds</option><option>Songbirds</option><option>Woodland</option><option>Raptors</option><option>Waterbirds</option><option>New Zealand</option><option>Custom</option></select></div><div class="library-meta"><span id="library-count" role="status"></span><button class="quiet-link" data-action="bird-downloads" data-scope="library">Download bird files ↓</button></div><div class="bird-grid" id="bird-grid"></div><div class="library-bottom"><span>${config.uniqueBirds ? 'Already on your clock? Selecting it swaps the two hours.' : 'Birds may appear at more than one hour.'}</span><button class="quiet-link" data-action="upload-bird">Add your own image ↗</button></div></div>`,
  );
  renderBirdGrid();
}
function renderBirdGrid() {
  const q = libraryQuery
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, ''),
    birds = allBirds().filter(
      (b) =>
        (libraryGroup === 'All birds' ||
          b.group === libraryGroup ||
          b.region === libraryGroup) &&
        `${b.name} ${b.scientificName} ${b.region}`
          .toLowerCase()
          .normalize('NFD')
          .replace(/\p{Diacritic}/gu, '')
          .includes(q),
    );
  $('#library-count').textContent = `${birds.length} birds to explore`;
  $('#bird-grid').innerHTML = birds.length
    ? birds
        .map((b) => {
          const used = config.slices.findIndex((s) => s.bird === b.id);
          return `<article class="bird-card ${config.slices[selected].bird === b.id ? 'current' : ''}"><button class="bird-card-select" data-bird="${esc(b.id)}" aria-label="Choose ${esc(b.name)}" aria-pressed="${config.slices[selected].bird === b.id}">${used >= 0 ? `<span class="used">${used === selected ? 'Selected' : `Hour ${used + 1}`}</span>` : ''}<img src="${esc(b.asset)}" alt="" loading="lazy"><strong>${esc(b.name)}</strong><small>${esc(b.region)}</small></button><button class="bird-card-download" data-action="bird-downloads" data-download-bird="${esc(b.id)}" aria-label="Download ${esc(b.name)}">Download <span aria-hidden="true">↓</span></button></article>`;
        })
        .join('')
    : '<p class="empty-state">No birds found. Try another name or filter.</p>';
}
function openExport() {
  showModal(
    'export',
    `${modalHeader('KEEP A LITTLE OF THE WOODS', 'Save it. Share it. Make it yours.')}<div class="modal-body"><div class="export-layout"><div><div class="mini-clock">${clockSVG(config, allBirds(), { interactive: false })}</div><p class="modal-note">${esc(config.name)}</p></div><div class="export-options"><button class="export-option" data-action="save-named"><span class="symbol">♡</span><span><strong>Save to my designs</strong><small>Keep this configuration in your browser</small></span><span class="arrow">↗</span></button><button class="export-option" data-action="share"><span class="symbol">↗</span><span><strong>Copy a design link</strong><small>Let someone open this exact arrangement</small></span><span class="arrow">↗</span></button><button class="export-option" data-action="png"><span class="symbol">↓</span><span><strong>Download clock image</strong><small>A 2,400 px PNG, ready to send or print</small></span><span class="arrow">↗</span></button><button class="export-option" data-action="bird-downloads" data-scope="clock"><span class="symbol">↓</span><span><strong>Download bird files</strong><small>PNG, JPEG, WebP or SVG · one bird or a ZIP collection</small></span><span class="arrow">↗</span></button><button class="export-option" data-action="json"><span class="symbol">⌘</span><span><strong>Download configuration</strong><small>JSON backup, including any uploaded birds</small></span><span class="arrow">↗</span></button></div></div><p class="modal-note">Your design is auto-saved on this device. A JSON download is the safest way to keep a portable copy. Wood textures and bird illustrations are visual references for a finished clock.</p><div id="export-feedback" role="status"></div></div>`,
  );
}
function openSaved() {
  const items = saved.filter((item) => {
    try {
      validateConfig(
        item.config,
        catalogue.map((b) => b.id),
      );
      return true;
    } catch {
      return false;
    }
  });
  showModal(
    'saved',
    `${modalHeader('YOUR COLLECTION', 'A few favorite hours.')}<div class="modal-body"><form id="save-form" class="save-form"><label>Name this design<input class="text-field" name="name" maxlength="80" required value="${esc(config.name)}"></label><button class="button primary" type="submit">Save a copy</button></form><div class="saved-grid">${items.length ? items.map((item) => `<article class="saved-card"><div class="saved-preview">${clockSVG(item.config, [...catalogue, ...item.config.customBirds], { interactive: false })}</div><h3>${esc(item.name)}</h3><p>${new Date(item.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p><div class="actions"><button class="mini-button" data-load="${esc(item.id)}">Open design</button><button class="mini-button danger" data-delete="${esc(item.id)}" aria-label="Delete saved design ${esc(item.name)}">×</button></div></article>`).join('') : '<p class="empty-state">Your favorites will live here. Save your first design above.</p>'}</div><p class="modal-note">Saved on this browser and device only. Export JSON for a backup or to move a design to another device.</p></div>`,
  );
}
function saveNamed(name) {
  const item = {
    id: crypto.randomUUID?.() || `design-${Date.now()}`,
    name: name.trim() || 'Untitled clock',
    updatedAt: new Date().toISOString(),
    config: clone(config),
  };
  item.config.name = item.name;
  const next = [item, ...saved];
  if (!local.set(SAVED, next)) {
    toast(
      'Browser storage is full or unavailable. Download a JSON backup instead.',
    );
    return false;
  }
  saved = next;
  $('#saved-count').textContent = saved.length;
  toast('Saved to your designs.');
  return true;
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
    `${modalHeader('A NOTE ON THE STUDIO', 'A small collection of possibilities.')}<div class="modal-body about-copy"><h3>Twelve birds. Three woods. Your arrangement.</h3><p>This studio began with a twelve-piece wooden clock: 30-degree triangular slices, maple, mahogany and cherry, with a different bird at every hour. The original design keeps the osprey at three and the loon at nine. Every hour is yours to change.</p><h3>Made to stay with you.</h3><p>Changes are saved automatically in this browser. Named designs stay on this device, with no account or server. A share link carries a built-in-bird configuration in the URL; uploaded illustrations travel in JSON backups instead.</p><h3>A visual design, ready to discuss.</h3><p>The birds are AI-generated natural-history illustrations, and the woods are generated texture studies. They are not taxonomic reference plates or exact timber samples. This is a design tool, not a fabrication drawing: confirm dimensions, joinery, material thickness and clock movement with your maker.</p><p>Keyboard tip: Tab to the clock, then use the arrow keys to move between hours. Ctrl/⌘ Z undoes your last change.</p></div>`,
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
  const hour = e.target.closest('[data-select-hour]');
  if (hour) {
    chooseHour(+hour.dataset.selectHour);
    return;
  }
  const slice = e.target.closest('.clock-slice');
  if (slice && $('#clock').contains(slice)) {
    chooseHour(+slice.dataset.hour);
    return;
  }
  const t = e.target.closest('[data-tab]');
  if (t) {
    tab = t.dataset.tab;
    renderPanel();
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
  const load = e.target.closest('[data-load]');
  if (load) {
    const item = saved.find((s) => s.id === load.dataset.load);
    try {
      const next = validateConfig(
        item.config,
        catalogue.map((b) => b.id),
      );
      commit(() => (config = next), 'Saved design opened.');
      closeModal();
    } catch (error) {
      toast(error.message);
    }
    return;
  }
  const del = e.target.closest('[data-delete]');
  if (del) {
    const id = del.dataset.delete,
      item = saved.find((s) => s.id === id);
    confirmAction(
      'Remove this saved design?',
      `“${item.name}” will be removed from this browser. Your current clock will stay as it is.`,
      () => {
        const next = saved.filter((s) => s.id !== id);
        if (local.set(SAVED, next)) {
          saved = next;
          openSaved();
          $('#saved-count').textContent = saved.length;
        } else toast('Could not update browser storage.');
      },
      'Remove design',
    );
    return;
  }
  const a = e.target.closest('[data-action]');
  if (!a) return;
  const action = a.dataset.action;
  if (action === 'bird-downloads')
    openBirdDownloads({
      config,
      birds: allBirds(),
      selectedId: a.dataset.downloadBird || config.slices[selected].bird,
      scope: a.dataset.scope || 'single',
      showModal,
      modalHeader,
      toast,
    });
  if (action === 'close') closeModal();
  if (action === 'library') openLibrary();
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
  if (action === 'save-named') openSaved();
  if (action === 'share') copyShare();
  if (action === 'json') exportJSON();
  if (action === 'png') exportPNG(a);
  if (action === 'upload-bird') $('#bird-input').click();
});
document.addEventListener('focusin', (e) => {
  if (e.target.id === 'design-name') nameBefore = clone(config);
  if (e.target.matches('input[type=range],input[type=color]'))
    rangeBefore = clone(config);
});
document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.id === 'bird-search') {
    libraryQuery = el.value;
    renderBirdGrid();
    return;
  }
  if (el.id === 'design-name') {
    config.name = el.value;
    autosave();
    return;
  }
  if (el.matches('input[type=range],input[type=color]') && el.dataset.key) {
    if (!rangeBefore) rangeBefore = clone(config);
    const value = el.type === 'range' ? +el.value : el.value;
    setValue(el.dataset.key, value);
    if (el.type === 'range')
      el.closest('.range-row').querySelector('output').textContent =
        settingLabel(value, el.dataset.format);
    renderClock();
    autosave();
  }
});
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.id === 'design-name') {
    config.name = el.value.trim() || 'Untitled clock';
    if (nameBefore) pushHistory(nameBefore);
    nameBefore = null;
    autosave();
    el.value = config.name;
    $('#undo-button').disabled = !history.length;
    $('#redo-button').disabled = !future.length;
    return;
  }
  if (el.id === 'bird-filter') {
    libraryGroup = el.value;
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
  if (el.matches('input[type=range],input[type=color]')) {
    if (rangeBefore) pushHistory(rangeBefore);
    rangeBefore = null;
    $('#undo-button').disabled = !history.length;
    $('#redo-button').disabled = !future.length;
    return;
  }
  let value = el.type === 'checkbox' ? el.checked : el.value;
  if (el.dataset.key === 'face.seconds') value = value === 'true';
  if (
    el.dataset.key === 'face.time' &&
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)
  ) {
    renderPanel();
    return;
  }
  commit(() => {
    setValue(el.dataset.key, value);
    if (el.dataset.key === 'noAdjacent' && value) {
      const next = assignWood(
        config.slices,
        selected,
        config.slices[selected].wood,
      );
      config.slices.forEach((s, i) => (s.wood = next[i]));
    }
    if (el.dataset.key === 'uniqueBirds' && value) {
      const used = new Set();
      for (const s of config.slices) {
        if (used.has(s.bird))
          s.bird =
            allBirds().find(
              (b) =>
                !used.has(b.id) && !config.slices.some((x) => x.bird === b.id),
            )?.id || allBirds().find((b) => !used.has(b.id)).id;
        used.add(s.bird);
      }
    }
  });
});
document.addEventListener('submit', (e) => {
  if (e.target.id === 'save-form') {
    e.preventDefault();
    const name = new FormData(e.target).get('name');
    if (saveNamed(String(name))) openSaved();
  }
});
document.addEventListener('keydown', (e) => {
  if (
    e.target.closest('.editor-tabs') &&
    ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)
  ) {
    e.preventDefault();
    const tabs = ['slice', 'face', 'register'];
    tab =
      e.key === 'Home'
        ? tabs[0]
        : e.key === 'End'
          ? tabs[2]
          : tabs[(tabs.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : 2)) % 3];
    renderPanel();
    $(`[data-tab="${tab}"]`).focus();
    return;
  }
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
$('#saved-button').onclick = openSaved;
$('#export-button').onclick = openExport;
$('#shuffle-button').onclick = shuffleWood;
$('#about-button').onclick = (e) => {
  e.preventDefault();
  openAbout();
};
$('#import-button').onclick = () => $('#json-input').click();
$('#reset-button').onclick = () =>
  confirmAction(
    'Begin with a fresh clock?',
    'Your current design will be replaced by the original twelve birds. You can undo this change or save a copy first.',
    () =>
      commit(() => {
        config = defaultConfig();
        selected = 2;
      }, 'Original clock restored.'),
    'Start fresh',
  );
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
      shared = false;
    const ids = catalogue.map((b) => b.id),
      hash = new URLSearchParams(location.hash.slice(1));
    if (hash.has('design')) {
      try {
        config = validateConfig(decodeConfig(hash.get('design')), ids);
        const prior = session.get(DRAFT) || local.get(DRAFT);
        if (prior) local.set(RECOVERY, prior);
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
    startupButtons.forEach((button) => (button.disabled = false));
    render();
    autosave();
    if (shared) {
      let recovered = false;
      const prior = local.get(RECOVERY);
      if (prior) {
        try {
          const valid = validateConfig(prior, ids),
            item = {
              id: `recovered-${Date.now()}`,
              name: `${valid.name} (before shared link)`,
              updatedAt: new Date().toISOString(),
              config: valid,
            };
          const next = [item, ...saved];
          if (local.set(SAVED, next)) {
            saved = next;
            recovered = true;
            local.remove(RECOVERY);
            $('#saved-count').textContent = saved.length;
          }
        } catch {}
      }
      toast(
        recovered
          ? 'Shared design opened. Your earlier draft is in My designs.'
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
  }
}
// Update only the hands, preserving editor focus and slice selection.
setInterval(() => {
  if (!config.face.live || document.hidden) return;
  const roots = [$('#clock svg')];
  if (modalKind === 'fullscreen') roots.push($('.fullscreen-clock svg'));
  for (const svg of roots) {
    const old = svg?.querySelector('.clock-hands');
    if (old)
      old.outerHTML = handsMarkup(config.face, new Date(), svg.dataset.prefix);
  }
}, 1000);
const startupButtons = $$('button');
startupButtons.forEach((button) => (button.disabled = true));
init();
