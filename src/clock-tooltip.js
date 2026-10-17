export function attachClockTooltips(clock, tooltip) {
  let activeSlice = null,
    dismissedSlice = null,
    hoverDismissed = false,
    hideTimer;

  function hide() {
    clearTimeout(hideTimer);
    activeSlice?.removeAttribute('aria-describedby');
    activeSlice = null;
    tooltip.hidden = true;
  }

  function show(slice) {
    if (
      !slice ||
      slice === dismissedSlice ||
      clock.classList.contains('dragging-bird') ||
      clock.closest('.orbiting')
    )
      return;
    hide();
    activeSlice = slice;
    tooltip.textContent = slice.getAttribute('aria-label');
    tooltip.hidden = false;
    tooltip.style.left = '0px';
    tooltip.style.top = '0px';
    slice.setAttribute('aria-describedby', tooltip.id);

    const anchor = slice.querySelector('.bird-image').getBoundingClientRect();
    const bounds = tooltip.getBoundingClientRect();
    const margin = 12;
    const left = anchor.left + anchor.width / 2 - bounds.width / 2;
    const above = anchor.top - bounds.height - margin;
    const top = above >= margin ? above : anchor.bottom + margin;
    tooltip.style.left = `${Math.max(margin, Math.min(left, innerWidth - bounds.width - margin))}px`;
    tooltip.style.top = `${Math.max(margin, Math.min(top, innerHeight - bounds.height - margin))}px`;
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (!activeSlice?.matches(':focus-visible')) hide();
    }, 120);
  }

  clock.addEventListener('pointerover', (event) => {
    if (event.pointerType === 'touch' || hoverDismissed) return;
    const slice = event.target.closest('.clock-slice');
    if (!slice || slice.contains(event.relatedTarget)) return;
    show(slice);
  });
  clock.addEventListener('pointerout', (event) => {
    const slice = event.target.closest('.clock-slice');
    if (!slice || slice.contains(event.relatedTarget)) return;
    if (dismissedSlice === slice) dismissedSlice = null;
    if (tooltip.contains(event.relatedTarget)) return;
    scheduleHide();
  });
  clock.addEventListener('focusin', (event) => {
    const slice = event.target.closest('.clock-slice');
    if (slice?.matches(':focus-visible')) show(slice);
  });
  clock.addEventListener('focusout', () => {
    dismissedSlice = null;
    scheduleHide();
  });
  tooltip.addEventListener('pointerenter', () => clearTimeout(hideTimer));
  tooltip.addEventListener('pointerleave', scheduleHide);
  document.addEventListener('pointermove', (event) => {
    if (!hoverDismissed || event.pointerType === 'touch') return;
    hoverDismissed = false;
    if (clock.contains(event.target))
      show(event.target.closest('.clock-slice'));
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || tooltip.hidden) return;
    dismissedSlice = activeSlice;
    // Hiding the tooltip can expose another slice under a stationary pointer.
    // Wait for pointer movement before showing another hover tooltip.
    hoverDismissed = true;
    hide();
    event.preventDefault();
  });
  document.addEventListener('pointerdown', (event) => {
    if (!clock.contains(event.target) && !tooltip.contains(event.target))
      hide();
  });
  window.addEventListener('resize', hide);
  window.addEventListener('scroll', hide, true);
  window.addEventListener('blur', hide);

  return { hide };
}
