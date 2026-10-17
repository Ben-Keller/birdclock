import { clockSVG, escapeHTML, point } from './clock.js';

// A solid board built from a live SVG front and actual planes in CSS 3D space.
// Exports continue to use clockSVG directly, independent of the viewing angle.
export function clockViewMarkup(config, birds, options = {}) {
  const count = config.face.shape === 'circle' ? 96 : 12;
  const vertices = Array.from({ length: count }, (_, i) =>
    point(15 + (i * 360) / count, 500 + config.face.rim),
  );
  const percent = (v) => ((v / 1040) * 100).toFixed(5);
  const outline = vertices
    .map(([x, y]) => `${percent(x)}% ${percent(y)}%`)
    .join(',');
  const edges = vertices
    .map((a, i) => {
      const b = vertices[(i + 1) % count];
      const angle = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
      const wood = config.slices[Math.floor(i / (count / 12))].wood;
      return `<div class="clock-edge" data-edge-angle="${angle}" aria-hidden="true" style="left:${percent((a[0] + b[0]) / 2)}%;top:${percent((a[1] + b[1]) / 2)}%;width:calc(${percent(Math.hypot(b[0] - a[0], b[1] - a[1]))}% + .4px);background-image:linear-gradient(#21170c33,#21170c55),url('assets/previews/woods/${escapeHTML(wood)}.webp');transform:translate(-50%,-50%) translateZ(calc(var(--clock-depth) / -2)) rotateZ(${angle}deg) rotateX(90deg)"></div>`;
    })
    .join('');
  return `<div class="clock-object"><div class="clock-back" aria-hidden="true" style="clip-path:polygon(${outline})"></div>${edges}<div class="clock-face">${clockSVG(config, birds, options)}</div></div>`;
}

export function attachClockView(surface, clock, { onStart = () => {} } = {}) {
  const events = new AbortController();
  const { signal } = events;
  let pitch = 0,
    yaw = 0,
    gesture = null,
    frame = 0,
    suppressClick = false;
  const clamp = (value) => Math.max(-65, Math.min(65, value));
  surface.classList.add('clock-orbit-surface');

  function paint() {
    cancelAnimationFrame(frame);
    frame = 0;
    clock.style.setProperty('--view-pitch', `${pitch}deg`);
    clock.style.setProperty('--view-yaw', `${yaw}deg`);
    const rx = (pitch * Math.PI) / 180,
      ry = (yaw * Math.PI) / 180;
    clock.querySelectorAll('.clock-edge').forEach((edge) => {
      const angle = (Number(edge.dataset.edgeAngle) * Math.PI) / 180;
      const nx = Math.sin(angle),
        ny = -Math.cos(angle);
      const light =
        -0.4 * nx * Math.cos(ry) -
        0.6 * (ny * Math.cos(rx) + nx * Math.sin(ry) * Math.sin(rx)) +
        0.7 * (ny * Math.sin(rx) - nx * Math.sin(ry) * Math.cos(rx));
      edge.style.setProperty(
        '--edge-light',
        (0.65 + Math.max(0, light) * 0.55).toFixed(3),
      );
    });
  }
  function announce() {
    const status = surface.querySelector('[data-view-status]');
    if (status)
      status.textContent =
        pitch || yaw
          ? `Clock perspective: ${Math.round(pitch)} degrees vertical, ${Math.round(yaw)} degrees horizontal.`
          : 'Clock view reset to the front.';
  }
  function finish(restore = false) {
    const previous = gesture;
    gesture = null;
    surface.classList.remove('orbiting');
    if (previous?.dragging) {
      suppressClick = true;
      if (restore) {
        pitch = previous.pitch;
        yaw = previous.yaw;
      }
      paint();
      announce();
    }
    if (previous && surface.hasPointerCapture(previous.id))
      surface.releasePointerCapture(previous.id);
  }
  const cancel = () => finish(true);
  function reset() {
    cancel();
    pitch = yaw = 0;
    paint();
    announce();
  }
  surface.addEventListener(
    'pointerdown',
    (event) => {
      suppressClick = false;
      if (!event.isPrimary || event.button !== 0 || gesture) return;
      if (
        event.target.closest(
          'button, a, input, select, summary, .clock-slice, .clock-rim, .clock-edge, .clock-back',
        )
      )
        return;
      gesture = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        pitch,
        yaw,
        dragging: false,
      };
      surface.setPointerCapture(event.pointerId);
    },
    { signal },
  );
  surface.addEventListener(
    'pointermove',
    (event) => {
      if (!gesture || gesture.id !== event.pointerId) return;
      const dx = event.clientX - gesture.x,
        dy = event.clientY - gesture.y;
      if (!gesture.dragging && Math.hypot(dx, dy) < 5) return;
      if (!gesture.dragging) {
        gesture.dragging = true;
        onStart();
        surface.classList.add('orbiting');
      }
      event.preventDefault();
      const sensitivity = 120 / Math.max(300, clock.clientWidth);
      pitch = clamp(gesture.pitch - dy * sensitivity);
      yaw = clamp(gesture.yaw + dx * sensitivity);
      if (!frame) frame = requestAnimationFrame(paint);
    },
    { signal },
  );
  surface.addEventListener(
    'pointerup',
    (event) => {
      if (gesture?.id === event.pointerId) finish();
    },
    { signal },
  );
  surface.addEventListener(
    'pointercancel',
    (event) => {
      if (gesture?.id === event.pointerId) cancel();
    },
    { signal },
  );
  surface.addEventListener(
    'lostpointercapture',
    (event) => {
      if (event.target === surface && gesture?.id === event.pointerId) cancel();
    },
    { signal },
  );
  surface.addEventListener(
    'click',
    (event) => {
      if (!suppressClick || !event.detail) return;
      suppressClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    { capture: true, signal },
  );
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape' && gesture) {
        cancel();
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    { capture: true, signal },
  );
  surface.addEventListener(
    'keydown',
    (event) => {
      if (event.target !== surface) return;
      if (event.key === 'Home') {
        event.preventDefault();
        reset();
        return;
      }
      if (
        !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)
      )
        return;
      event.preventDefault();
      onStart();
      pitch = clamp(
        pitch +
          (event.key === 'ArrowUp' ? 5 : event.key === 'ArrowDown' ? -5 : 0),
      );
      yaw = clamp(
        yaw +
          (event.key === 'ArrowRight' ? 5 : event.key === 'ArrowLeft' ? -5 : 0),
      );
      paint();
      announce();
    },
    { signal },
  );
  window.addEventListener('blur', cancel, { signal });
  window.addEventListener('resize', cancel, { signal });
  window.addEventListener('scroll', cancel, { capture: true, signal });
  paint();
  return {
    reset,
    cancel,
    refresh: paint,
    destroy() {
      cancel();
      events.abort();
      cancelAnimationFrame(frame);
    },
  };
}
