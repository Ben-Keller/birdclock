export function attachBirdDrag(clock, { onStart, onSwap }) {
  const preview = document.createElement('div');
  preview.className = 'bird-drag-preview';
  preview.hidden = true;
  preview.setAttribute('aria-hidden', 'true');
  const image = document.createElement('img');
  image.alt = '';
  image.draggable = false;
  const caption = document.createElement('span');
  preview.append(caption);
  document.body.append(preview);

  let gesture = null,
    target = null,
    suppressClick = false;

  function cancel() {
    const previous = gesture;
    gesture = null;
    target?.classList.remove('drop-target');
    target = null;
    previous?.slice.classList.remove('drag-source');
    clock.classList.remove('dragging-bird');
    preview.hidden = true;
    if (previous?.dragging) suppressClick = true;
    if (previous && clock.hasPointerCapture(previous.pointerId))
      clock.releasePointerCapture(previous.pointerId);
  }

  function updateTarget(event) {
    const hit = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest('.clock-slice');
    const next =
      hit && clock.contains(hit) && hit !== gesture.slice ? hit : null;
    if (next !== target) {
      target?.classList.remove('drop-target');
      target = next;
      target?.classList.add('drop-target');
    }
    caption.textContent = target
      ? `Swap with hour ${Number(target.dataset.hour) + 1}`
      : 'Drop on another hour';
    const bounds = preview.getBoundingClientRect();
    preview.style.left = `${Math.max(8, Math.min(event.clientX + 18, innerWidth - bounds.width - 8))}px`;
    preview.style.top = `${Math.max(8, Math.min(event.clientY + 18, innerHeight - bounds.height - 8))}px`;
  }

  document.addEventListener(
    'pointerdown',
    () => {
      suppressClick = false;
    },
    true,
  );
  clock.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0 || gesture) return;
    const slice = event.target.closest('.clock-slice');
    if (!slice) return;
    gesture = {
      slice,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      dragging: false,
    };
  });
  window.addEventListener(
    'pointermove',
    (event) => {
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      if (!gesture.dragging) {
        if (
          Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 7
        )
          return;
        gesture.dragging = true;
        onStart();
        clock.setPointerCapture(event.pointerId);
        clock.classList.add('dragging-bird');
        gesture.slice.classList.add('drag-source');
        image.src = gesture.slice
          .querySelector('.bird-image')
          .getAttribute('href');
        preview.prepend(image);
        preview.hidden = false;
      }
      event.preventDefault();
      updateTarget(event);
    },
    { passive: false },
  );
  window.addEventListener('pointerup', (event) => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const from = Number(gesture.slice.dataset.hour);
    if (gesture.dragging) updateTarget(event);
    const to = gesture.dragging && target ? Number(target.dataset.hour) : null;
    cancel();
    if (to !== null) onSwap(from, to);
  });
  window.addEventListener('pointercancel', (event) => {
    if (gesture?.pointerId === event.pointerId) cancel();
  });
  clock.addEventListener('lostpointercapture', (event) => {
    // Touch transfers implicit capture from the slice to this stable wrapper.
    if (event.target === clock && gesture?.pointerId === event.pointerId)
      cancel();
  });
  clock.addEventListener('dragstart', (event) => event.preventDefault());
  document.addEventListener(
    'click',
    (event) => {
      if (!suppressClick || !event.detail) return;
      suppressClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true,
  );
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || !gesture) return;
      cancel();
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true,
  );
  window.addEventListener('blur', cancel);
  window.addEventListener('resize', cancel);
  window.addEventListener('scroll', cancel, true);

  return { cancel };
}
