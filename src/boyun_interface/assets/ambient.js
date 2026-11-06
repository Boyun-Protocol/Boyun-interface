/* Accessible ambient UI motion; no network requests. */
(() => {
  'use strict';
  const field = document.getElementById('ambient-field'); if (!field) return;
  const cursor = document.getElementById('cursor-light');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const fine = window.matchMedia('(pointer: fine)');
  let pointer = null, frame = null;
  function clear() {
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = null; pointer = null;
    if (cursor) cursor.dataset.active = 'false';
  }
  function paint() {
    frame = null;
    if (!pointer || !cursor || reduced.matches || !fine.matches || document.hidden) return;
    cursor.style.transform = `translate3d(${pointer.x - 160}px,${pointer.y - 160}px,0)`;
    cursor.dataset.active = 'true';
  }
  function pause() { field.dataset.paused = String(document.hidden); if (document.hidden || reduced.matches || !fine.matches) clear(); }
  document.addEventListener('pointermove', event => {
    if (!cursor || event.pointerType === 'touch' || !fine.matches || reduced.matches || document.hidden) return;
    pointer = { x: event.clientX, y: event.clientY };
    if (frame === null) frame = window.requestAnimationFrame(paint);
  }, { passive: true });
  document.addEventListener('pointerleave', clear);
  document.addEventListener('visibilitychange', pause);
  reduced.addEventListener('change', pause); fine.addEventListener('change', pause);
  pause();
})();
