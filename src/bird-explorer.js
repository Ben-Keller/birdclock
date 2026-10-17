import { escapeHTML as esc } from './clock.js';
import { attachClockView, clockViewMarkup } from './clock-view.js';

let profileRequest;
export function loadBirdProfiles() {
  if (!profileRequest) {
    profileRequest = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch('assets/bird-profiles.json', {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Profiles unavailable');
        const data = await response.json();
        if (data.version !== 1 || !data.profiles)
          throw new Error('Invalid profiles');
        return data;
      } finally {
        clearTimeout(timer);
      }
    })().catch((error) => {
      profileRequest = null;
      throw error;
    });
  }
  return profileRequest;
}

const link = (url, text) =>
  `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(text)} <span aria-hidden="true">↗</span></a>`;
export const measurementText = (m) =>
  `${m.min === m.max ? '≈ ' : ''}${m.min.toLocaleString('en-US')}${m.min !== m.max ? `–${m.max.toLocaleString('en-US')}` : ''} ${m.unit}`;
const chips = (items) =>
  `<ul class="profile-tags">${items.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`;
const dateText = (date) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
const project = (lon, lat) => {
  const radians = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
  return [
    (lon + 180) * 2,
    (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) * 360,
  ];
};
export function mapViewBox(bounds) {
  const [west, south, east, north] = bounds;
  const a = project(west, north),
    b = project(east, south);
  return [a[0], a[1], b[0] - a[0], b[1] - a[1]]
    .map((v) => v.toFixed(3))
    .join(' ');
}

function mapLayers(map) {
  const tiles = map.regionalTiles || [];
  return `<image class="occurrence-layer" href="${esc(map.asset)}" width="720" height="720" ${tiles.length ? 'style="display:none"' : ''}/><g class="regional-occurrences">${tiles
    .map((tile) => {
      const size = 720 / 2 ** tile.zoom;
      return `<image href="${esc(tile.asset)}" x="${tile.x * size}" y="${tile.y * size}" width="${size}" height="${size}"/>`;
    })
    .join('')}</g>`;
}

function sizeComparison(bird, profile, data, birds) {
  const measure = profile.measurements.find((m) => m.label === 'Length');
  if (!measure) return '';
  const referenceId =
    bird.id === 'american-robin' ? 'american-goldfinch' : 'american-robin';
  const reference = data.profiles[referenceId];
  const other = reference?.measurements.find((m) => m.label === 'Length');
  const otherBird = birds.find((b) => b.id === referenceId);
  if (!other || !otherBird) return '';
  const maximum = Math.ceil(Math.max(measure.max, other.max) / 10) * 10;
  const bar = (name, m, isReference = false) =>
    `<div class="size-row ${isReference ? 'size-reference' : ''}"><div><span>${esc(name)}</span><strong>${measurementText(m)}</strong></div><div class="size-track"><span class="size-solid" style="width:${(m.min / maximum) * 100}%"></span><span class="size-range" style="left:${(m.min / maximum) * 100}%;width:${((m.max - m.min) / maximum) * 100}%"></span></div></div>`;
  return `<figure class="size-comparison"><figcaption>How big is it?</figcaption>${bar(bird.name, measure)}${bar(otherBird.name, other, true)}<div class="size-axis"><span>0</span><span>Length · ${maximum} cm</span></div><p class="profile-caption">Bill-to-tail reference lengths; the lighter end shows the reported range. ${link(reference.sources.find((s) => s.supports.includes('Length')).url, 'Comparison source')}</p></figure>`;
}

function conservationMarkup(c) {
  const categories = [
    ['LC', 'Least Concern'],
    ['NT', 'Near Threatened'],
    ['VU', 'Vulnerable'],
    ['EN', 'Endangered'],
    ['CR', 'Critically Endangered'],
    ['EW', 'Extinct in the Wild'],
    ['EX', 'Extinct'],
  ];
  return `<div class="conservation-summary"><span class="conservation-badge ${['VU', 'EN', 'CR'].includes(c.code) || c.label === 'Nationally Critical' ? 'conservation-threatened' : ''}">${esc(c.label)}</span><span>${esc(c.scope)}</span></div>${c.code ? `<ol class="conservation-scale" aria-label="IUCN category: ${esc(c.label)}">${categories.map(([code, label]) => `<li class="${code === c.code ? 'current' : ''}" ${code === c.code ? 'aria-current="true"' : ''} title="${label}"><abbr title="${label}">${code}</abbr></li>`).join('')}</ol>` : ''}<p class="profile-caption">${link(c.url, c.system)}${c.note ? `<br>${esc(c.note)}` : ''}</p>`;
}

export function birdProfileMarkup(bird, profile, data, birds) {
  const hero = `<header class="profile-hero"><div><p class="profile-kicker">${esc(profile ? profile.taxonomy.family : 'Your illustration')}</p><h2 id="bird-profile-title" tabindex="-1">${esc(bird.name)}</h2><p class="profile-latin">${esc(bird.scientificName || 'Custom artwork')}</p></div><figure><img src="${esc(bird.asset)}" alt="${esc(bird.name)} illustration" width="220" height="220"><figcaption>${profile ? 'Studio illustration' : 'Your uploaded artwork'}</figcaption></figure></header>`;
  if (!profile)
    return `${hero}<p class="profile-lead">This is your own artwork. A researched species profile isn’t attached to uploaded images.</p><p class="profile-caption">Choose another slice or browse the collection to read a bird’s field guide.</p>`;
  const measurements = profile.measurements;
  return `${hero}
    <p class="profile-lead">${esc(profile.shortDescription)}</p>
    ${measurements.length ? `<dl class="profile-measurements">${measurements.map((m) => `<div><dt>${esc(m.label)}</dt><dd>${measurementText(m)}</dd>${m.note ? `<small>${esc(m.note)}</small>` : ''}</div>`).join('')}</dl>` : ''}
    <div class="profile-story">${profile.longDescription.map((text) => `<p>${esc(text)}</p>`).join('')}</div>
    <section class="profile-section" aria-labelledby="bird-map-heading"><div class="profile-section-head"><h3 id="bird-map-heading">Where it’s found</h3><div class="map-controls" role="group" aria-label="Map view"><button type="button" data-map-view="regional" aria-pressed="true">Regional</button><button type="button" data-map-view="world" aria-pressed="false">World</button></div></div>
      <p class="profile-range">${esc(profile.range)}</p>
      <figure class="bird-map"><svg viewBox="${mapViewBox(profile.map.focusBounds)}" role="img" aria-label="Published occurrence records for ${esc(bird.name)}; not a species range map" preserveAspectRatio="xMidYMid meet"><rect width="720" height="720" fill="#edf0e8"/><image href="assets/maps/world.svg" width="720" height="720"/>${mapLayers(profile.map)}</svg><figcaption><span class="map-legend"><i aria-hidden="true"></i> Published records · all years</span>${link(profile.map.url, 'Explore on GBIF')}</figcaption></figure>
      <p class="profile-caption">${esc(data.mapNote)} Map snapshot: ${dateText(data.mapDate)}. Base map: ${link('https://www.naturalearthdata.com/about/terms-of-use/', 'Natural Earth')}.</p>
    </section>
    <section class="profile-section ecology-grid" aria-label="Habitat and diet"><div><h3>Habitat</h3>${chips(profile.habitat)}</div><div><h3>On the menu</h3>${chips(profile.diet)}</div></section>
    ${sizeComparison(bird, profile, data, birds)}
    <section class="profile-section"><h3>Life in the wild</h3><dl class="profile-facts"><div><dt>Seasonal movement</dt><dd>${esc(profile.movement)}</dd></div><div><dt>Nesting</dt><dd>${esc(profile.nesting)}</dd></div><div><dt>Order</dt><dd>${esc(profile.taxonomy.order)}</dd></div><div><dt>Family</dt><dd>${esc(profile.taxonomy.family)}</dd></div></dl>${profile.taxonomyNote ? `<p class="profile-caption">${esc(profile.taxonomyNote)}</p>` : ''}</section>
    <section class="profile-section"><h3>Conservation</h3>${conservationMarkup(profile.conservation)}${profile.regionalConservation ? `<div class="regional-conservation">${conservationMarkup(profile.regionalConservation)}</div>` : ''}</section>
    <details class="profile-sources"><summary>Sources & field notes <span>Reviewed ${dateText(profile.reviewedAt)}</span></summary><p>${esc(data.measurementNote)}</p><ul>${profile.sources.map((s) => `<li>${link(s.url, s.label)}<small>${esc(s.supports.join(' · '))}</small></li>`).join('')}</ul><p>Original summaries prepared for Bird Clock from the linked references. Conservation systems and geographic scope are shown alongside each assessment. The review date is not an assessment date.</p></details>`;
}

export function openBirdExplorer({
  config,
  birds,
  selected,
  showModal,
  modalHeader,
  isOpen,
}) {
  let hour = selected,
    currentId = config.slices[selected].bird,
    data,
    focusWhenReady = false;
  const byId = new Map(birds.map((b) => [b.id, b]));
  showModal(
    'fullscreen',
    `${modalHeader('', 'Bird field guide')}
    <div class="bird-explorer"><div class="explorer-clock-pane" tabindex="0" role="group" aria-label="Clock perspective" aria-describedby="explorer-help"><p id="explorer-help">Choose a slice to meet its bird.<span class="sr-only"> Drag the space around the clock to change perspective. With the view focused, arrow keys tilt and Home resets the view. With a slice focused, arrow keys move between hours and Enter opens its profile.</span></p><div class="fullscreen-clock">${clockViewMarkup(config, birds, { selected, detailedBirds: true, label: 'Explore the birds on your clock', helpId: 'explorer-help' })}</div><div class="explorer-navigation"><button class="mini-button" type="button" data-explorer-step="-1" aria-label="Previous bird on the clock">←</button><p id="explorer-current"></p><button class="mini-button" type="button" data-explorer-step="1" aria-label="Next bird on the clock">→</button><button class="mini-button" type="button" data-view-reset aria-label="Reset clock perspective" title="Reset view">↺</button></div><span class="sr-only" data-view-status role="status"></span><label class="explorer-browse">Browse the collection<select id="explorer-bird" aria-label="Browse the bird collection">${[
      ...birds,
    ]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(
        (b) =>
          `<option value="${esc(b.id)}" ${b.id === currentId ? 'selected' : ''}>${esc(b.name)}</option>`,
      )
      .join(
        '',
      )}</select></label></div><article id="bird-profile" class="bird-profile" aria-labelledby="bird-profile-title" aria-busy="true"><p class="profile-loading" role="status">Opening the field guide…</p></article><span id="explorer-announcement" class="sr-only" role="status"></span></div>`,
  );
  const root = document.querySelector('.bird-explorer');
  const article = root.querySelector('#bird-profile');
  const clockView = attachClockView(
    root.querySelector('.explorer-clock-pane'),
    root.querySelector('.fullscreen-clock'),
  );
  const active = () => root.isConnected && isOpen();
  function updateSelection() {
    root.querySelector('#explorer-bird').value = currentId;
    root.querySelector('#explorer-current').textContent =
      hour >= 0
        ? `Hour ${hour + 1} · ${byId.get(currentId).name}`
        : 'From the collection';
    root.querySelectorAll('.clock-slice').forEach((slice) => {
      const index = +slice.dataset.hour;
      slice.classList.toggle('selected', index === hour);
      slice.setAttribute('aria-pressed', String(index === hour));
      slice.setAttribute(
        'tabindex',
        index === (hour < 0 ? selected : hour) ? '0' : '-1',
      );
    });
  }
  function renderProfile({ focus = false } = {}) {
    if (!active()) return;
    if (!data) {
      focusWhenReady = focus;
      return;
    }
    focus ||= focusWhenReady;
    focusWhenReady = false;
    const bird = byId.get(currentId);
    article.innerHTML = birdProfileMarkup(
      bird,
      data.profiles[currentId],
      data,
      birds,
    );
    article.setAttribute('aria-busy', 'false');
    article.scrollTop = 0;
    root.querySelector('#explorer-announcement').textContent =
      `${bird.name} profile opened`;
    if (focus) article.querySelector('h2').focus({ preventScroll: true });
    if (focus && matchMedia('(max-width: 800px)').matches)
      article.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
  function choose(index, focus = false) {
    hour = (index + 12) % 12;
    currentId = config.slices[hour].bird;
    updateSelection();
    renderProfile({ focus });
  }
  async function fetchProfiles() {
    article.setAttribute('aria-busy', 'true');
    try {
      data = await loadBirdProfiles();
      renderProfile();
    } catch {
      if (!active()) return;
      article.setAttribute('aria-busy', 'false');
      article.innerHTML =
        '<div class="profile-loading"><h2 id="bird-profile-title">The field guide couldn’t load.</h2><p>Check your connection and try again.</p><button class="button" type="button" data-profile-retry>Try again</button></div>';
    }
  }
  root.addEventListener('click', (event) => {
    if (event.target.closest('[data-view-reset]')) return clockView.reset();
    const slice = event.target.closest('.clock-slice');
    if (slice) return choose(+slice.dataset.hour, true);
    const step = event.target.closest('[data-explorer-step]');
    if (step)
      return choose((hour < 0 ? selected : hour) + +step.dataset.explorerStep);
    if (event.target.closest('[data-profile-retry]')) return fetchProfiles();
    const view = event.target.closest('[data-map-view]');
    if (view && data?.profiles[currentId]) {
      const regional = view.dataset.mapView === 'regional';
      const bounds = regional
        ? data.profiles[currentId].map.focusBounds
        : [-180, -60, 180, 85];
      article
        .querySelector('.bird-map svg')
        .setAttribute('viewBox', mapViewBox(bounds));
      article.querySelector('.occurrence-layer').style.display =
        regional && data.profiles[currentId].map.regionalTiles?.length
          ? 'none'
          : '';
      article.querySelector('.regional-occurrences').style.display = regional
        ? ''
        : 'none';
      article
        .querySelectorAll('[data-map-view]')
        .forEach((button) =>
          button.setAttribute('aria-pressed', String(button === view)),
        );
    }
  });
  root.addEventListener('change', (event) => {
    if (event.target.id !== 'explorer-bird') return;
    currentId = event.target.value;
    hour = config.slices.findIndex((s) => s.bird === currentId);
    updateSelection();
    renderProfile({ focus: true });
  });
  root.addEventListener('keydown', (event) => {
    const slice = event.target.closest('.clock-slice');
    if (!slice) return;
    const index = +slice.dataset.hour;
    if (
      [
        'ArrowLeft',
        'ArrowUp',
        'ArrowRight',
        'ArrowDown',
        'Home',
        'End',
      ].includes(event.key)
    ) {
      event.preventDefault();
      choose(
        event.key === 'Home'
          ? 11
          : event.key === 'End'
            ? 10
            : index +
              (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1),
      );
      root
        .querySelector(`[data-hour="${hour}"]`)
        .focus({ preventScroll: true });
    } else if (['Enter', ' '].includes(event.key)) {
      event.preventDefault();
      choose(index, true);
    }
  });
  updateSelection();
  fetchProfiles();
  return () => clockView.destroy();
}
