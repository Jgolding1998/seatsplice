import { useRef } from 'react';

export function useGalleryDrag(step, count) {
  const gesture = useRef(null);
  const swallowUntil = useRef(0);

  function finish(event, commit) {
    const drag = gesture.current;
    if (!drag || drag.id !== event.pointerId) return;
    gesture.current = null;
    const stage = event.currentTarget;
    stage.removeAttribute('data-dragging');
    stage.style.removeProperty('--gallery-drag');
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    const advance = commit && Math.abs(dx) > 42 && Math.abs(dx) > 1.25 * Math.abs(dy);
    if (drag.horizontal || advance) swallowUntil.current = performance.now() + 320;
    if (advance) step(dx < 0 ? 1 : -1);
  }

  return {
    onPointerDown(event) {
      if (count < 2 || gesture.current || event.button !== 0) return;
      swallowUntil.current = 0;
      gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, horizontal: false };
    },
    onPointerMove(event) {
      const drag = gesture.current;
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (!drag.horizontal) {
        if (Math.abs(dy) > 9 && Math.abs(dy) > Math.abs(dx)) {
          finish(event, false);
          return;
        }
        if (Math.abs(dx) < 8 || Math.abs(dx) <= 1.2 * Math.abs(dy)) return;
        drag.horizontal = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.setAttribute('data-dragging', '');
      }
      const limit = event.currentTarget.clientWidth * .24;
      event.currentTarget.style.setProperty('--gallery-drag', `${Math.max(-limit, Math.min(limit, dx * .78))}px`);
    },
    onPointerUp: event => finish(event, true),
    onPointerCancel: event => finish(event, false),
    onLostPointerCapture: event => finish(event, false),
    onPointerLeave(event) {
      if (!gesture.current?.horizontal) finish(event, false);
    },
    onDragStart: event => event.preventDefault(),
    onClickCapture(event) {
      if (event.detail > 0 && performance.now() < swallowUntil.current) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
  };
}
