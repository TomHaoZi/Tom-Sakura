import { useEffect } from 'react';

// Pointer light is limited to a couple of small static chrome surfaces, never
// poster grids or video pixels. CSS owns the effect; pointer moves do not render React.
export default function useGlassLight(disabled) {
  useEffect(() => {
    if (disabled) return;
    let frame = 0, surface = null, point = null;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const clear = () => {
      cancelAnimationFrame(frame); frame = 0;
      surface?.style.removeProperty('--shine-x');
      surface?.style.removeProperty('--shine-y');
      surface = null;
    };
    const move = event => {
      if (reduced.matches || event.pointerType === 'touch') { clear(); return; }
      const next = event.target instanceof Element ? event.target.closest('[data-glass-light]') : null;
      if (!next) { clear(); return; }
      if (next !== surface) { clear(); surface = next; }
      point = [event.clientX, event.clientY];
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!surface?.isConnected || !point) return;
        const box = surface.getBoundingClientRect();
        if (!box.width || !box.height) return;
        const x = Math.max(0, Math.min(100, (point[0] - box.left) * 100 / box.width));
        const y = Math.max(0, Math.min(100, (point[1] - box.top) * 100 / box.height));
        surface.style.setProperty('--shine-x', `${x.toFixed(1)}%`);
        surface.style.setProperty('--shine-y', `${y.toFixed(1)}%`);
      });
    };
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('blur', clear);
    document.documentElement.addEventListener('pointerleave', clear);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('blur', clear);
      document.documentElement.removeEventListener('pointerleave', clear);
      clear();
    };
  }, [disabled]);
}
