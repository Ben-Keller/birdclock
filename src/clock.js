import { WOODS } from './model.js';
export const escapeHTML = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
export const point = (degrees, r) => [
  520 + Math.sin((degrees * Math.PI) / 180) * r,
  520 - Math.cos((degrees * Math.PI) / 180) * r,
];
const fmt = (p) => p.map((n) => n.toFixed(3)).join(',');
const roman = [
  'I',
  'II',
  'III',
  'IV',
  'V',
  'VI',
  'VII',
  'VIII',
  'IX',
  'X',
  'XI',
  'XII',
];
export function slicePath(hour, shape = 'polygon', radius = 500) {
  const a = point(hour * 30 - 15, radius),
    b = point(hour * 30 + 15, radius);
  return `M520,520 L${fmt(a)} ${shape === 'circle' ? `A${radius},${radius} 0 0 1 ` : 'L'}${fmt(b)} Z`;
}
export function outline(shape, r = 500) {
  return shape === 'circle'
    ? `M520,${520 - r} A${r},${r} 0 1 1 519.999,${520 - r} Z`
    : `M${Array.from({ length: 12 }, (_, i) => fmt(point(i * 30 + 15, r))).join(' L')} Z`;
}
export function handsMarkup(face, now = new Date(), prefix = '') {
  if (!face.hands) return '';
  let [h, m] = face.time.split(':').map(Number),
    s = 0;
  if (face.live) {
    h = now.getHours();
    m = now.getMinutes();
    s = now.getSeconds();
  }
  const hour = (h % 12) * 30 + m * 0.5,
    minute = m * 6 + s * 0.1;
  return `<g class="clock-hands" pointer-events="none" filter="url(#${prefix}handShadow)"><path d="M514 544 L509 510 L515 319 L520 311 L525 319 L531 510 L526 544Z" fill="${face.handColor}" transform="rotate(${hour} 520 520)"/><path d="M516 548 L514 509 L517 265 L520 257 L523 265 L526 509 L524 548Z" fill="${face.handColor}" transform="rotate(${minute} 520 520)"/>${face.seconds ? `<path d="M519 564 L519 213 L521 213 L521 564Z" fill="${face.hubColor}" transform="rotate(${s * 6} 520 520)"/>` : ''}<circle cx="520" cy="520" r="18" fill="${face.hubColor}"/><circle cx="520" cy="520" r="10" fill="#ddc185"/><circle cx="520" cy="520" r="3" fill="#806138"/></g>`;
}
let svgSequence = 0;
export function clockSVG(
  config,
  birds,
  {
    selected = -1,
    interactive = true,
    label = 'Your customizable bird clock',
    helpId = 'clock-controls-help',
    textureData = {},
    birdData = {},
    detailedBirds = false,
    background = false,
  } = {},
) {
  const f = config.face,
    byId = new Map(birds.map((b) => [b.id, b])),
    parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1040 1040" width="1040" height="1040" ${interactive ? `aria-label="${escapeHTML(label)}" aria-describedby="${escapeHTML(helpId)}" role="group"` : 'role="img" aria-label="Bird clock design"'}><defs><filter id="clockShadow" x="-10%" y="-10%" width="120%" height="125%"><feDropShadow dx="0" dy="7" stdDeviation="9" flood-color="#443425" flood-opacity=".2"/></filter><filter id="handShadow" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="1" dy="2" stdDeviation="2" flood-opacity=".22"/></filter>`,
  );
  config.slices.forEach((s, i) =>
    parts.push(
      `<pattern id="grain-${i}" width="520" height="520" patternUnits="userSpaceOnUse" patternTransform="rotate(${(i + 1) * 30 + s.grain} 520 520)"><image href="${escapeHTML(textureData[s.wood] || `assets/previews/woods/${s.wood}.webp`)}" width="520" height="520" preserveAspectRatio="xMidYMid slice"/></pattern><clipPath id="clip-${i}"><path d="${slicePath(i + 1, f.shape)}"/></clipPath>`,
    ),
  );
  parts.push(
    `</defs>${background ? `<rect width="1040" height="1040" fill="${f.background}"/>` : ''}<path class="clock-rim" d="${outline(f.shape, 500 + f.rim)}" fill="${f.rimColor}" filter="url(#clockShadow)"/>`,
  );
  config.slices.forEach((s, i) => {
    const w = WOODS.find((w) => w.id === s.wood),
      bird = byId.get(s.bird),
      hour = i + 1,
      p = point(hour * 30, 352),
      np = point(hour * 30, 460),
      selectionPoint = point(hour * 30 + 8, 450),
      size = 168 * s.scale * f.birdScale,
      x = p[0] + s.x,
      y = p[1] + s.y,
      d = slicePath(hour, f.shape),
      label = `${hour} o’clock: ${bird?.name || 'Bird'}, ${w.name}`;
    parts.push(
      `<g class="clock-slice${selected === i ? ' selected' : ''}" data-hour="${i}" ${interactive ? `role="button" tabindex="${selected === i ? '0' : '-1'}" aria-label="${escapeHTML(label)}" aria-pressed="${selected === i}"` : ''}><path class="wood-base" d="${d}" fill="${w.color}"/><path d="${d}" fill="url(#grain-${i})" opacity="${f.grain}"/>${interactive ? `<path class="slice-highlight" d="${d}" fill="#fff6db" opacity="0"/>` : ''}<path d="${d}" fill="none" stroke="${f.rimColor}" stroke-width="${f.seam}"/>`,
    );
    parts.push(
      `<g clip-path="url(#clip-${i})"><image class="bird-image" href="${escapeHTML(birdData[s.bird] || (detailedBirds && ((size > 190 && bird?.previewLarge) || bird?.preview)) || bird?.clockPreview || bird?.preview || bird?.asset || '')}" x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet" transform="translate(${x} ${y}) rotate(${s.rotation}) scale(${s.flip ? -1 : 1} 1) translate(${-x} ${-y})"/></g>`,
    );
    if (f.numbers === 'dots')
      parts.push(
        `<circle cx="${np[0]}" cy="${np[1]}" r="3.5" fill="${w.ink}"/>`,
      );
    else if (f.numbers !== 'none')
      parts.push(
        `<text x="${np[0]}" y="${np[1]}" dy=".33em" text-anchor="middle" fill="${w.ink}" font-family="Cormorant Garamond, Georgia, serif" font-size="${f.numberSize}" font-weight="500">${f.numbers === 'roman' ? roman[i] : hour}</text>`,
      );
    if (interactive)
      parts.push(
        `<g class="selection-marker" aria-hidden="true" pointer-events="none"><circle class="selection-focus" cx="${selectionPoint[0]}" cy="${selectionPoint[1]}" r="13" fill="none" stroke="#fffaf0" stroke-width="3" opacity="0"/><circle class="selection-dot" cx="${selectionPoint[0]}" cy="${selectionPoint[1]}" r="7" fill="#46543c" stroke="#fffaf0" stroke-width="2.5" opacity="0"/></g><path class="slice-hit" d="${d}" fill="transparent"/>`,
      );
    parts.push('</g>');
  });
  parts.push(handsMarkup(f), '</svg>');
  const prefix = 'clock-' + ++svgSequence + '-';
  return parts
    .join('')
    .replace('<svg ', `<svg data-prefix="${prefix}" `)
    .replaceAll('id="', `id="${prefix}`)
    .replaceAll('url(#', `url(#${prefix}`);
}
