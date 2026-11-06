import React, { useEffect, useRef } from 'react';

const count = 4200;
const cloud = Array.from({ length: count }, (_, i) => {
  const a = i * 2.3999632297;
  const z = 1 - (2 * (i + .5)) / count;
  const ring = Math.sqrt(1 - z * z);
  const noise = Math.sin(i * 12.9898) * 43758.5453;
  return [Math.cos(a) * ring, Math.sin(a) * ring, z, noise - Math.floor(noise)];
});
const shades = ['#544760', '#866ea0', '#aa8ec8', '#ebc975', '#fff1b8'];

export function SignalArt() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let started = 0;
    let last = 0;
    let angle = -.6;
    let inView = false;
    let done = false;
    let width = 0;
    let height = 0;

    function paint() {
      if (!width || !height) return;
      ctx.clearRect(0, 0, width, height);
      const radius = Math.min(width * .48, height * .48);
      const s = Math.sin(angle);
      const c = Math.cos(angle);
      for (let i = 0; i < cloud.length; i++) {
        if (width < 420 && i % 2) continue;
        const [x, y, z, grain] = cloud[i];
        const u = x * c + z * s;
        const depth = z * c - x * s;
        const v = y * .965 - depth * .26;
        const lit = Math.max(0, Math.min(.999, .35 + .24 * depth - .25 * v - .18 * u + .23 * grain));
        const scatter = .90 + .21 * grain;
        const px = width * .5 + u * radius * scatter;
        const py = height * .5 + v * radius * scatter;
        const size = grain > .96 ? 1.9 : .65 + .75 * grain;
        ctx.globalAlpha = .20 + .80 * lit;
        ctx.fillStyle = shades[Math.floor(lit * shades.length)];
        ctx.fillRect(px, py, size, size);
      }
      ctx.globalAlpha = 1;
    }
    function step(now) {
      frame = 0;
      if (!started) started = now;
      const progress = Math.min(1, (now - started) / 3800);
      if (now - last > 31 || progress === 1) {
        angle = -.6 + .65 * (1 - (1 - progress) ** 2);
        last = now;
        paint();
      }
      done = progress === 1;
      sync();
    }
    function sync() {
      const active = inView && !document.hidden && !motion.matches && !done;
      if (active && !frame) frame = requestAnimationFrame(step);
      if (!active && frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    }

    const size = new ResizeObserver(([entry]) => {
      width = entry.contentRect.width;
      height = entry.contentRect.height;
      const ratio = Math.min(2, devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      paint();
    });
    const observer = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; sync(); });
    size.observe(canvas);
    observer.observe(canvas);
    document.addEventListener('visibilitychange', sync);
    motion.addEventListener('change', sync);
    return () => {
      cancelAnimationFrame(frame);
      size.disconnect();
      observer.disconnect();
      document.removeEventListener('visibilitychange', sync);
      motion.removeEventListener('change', sync);
    };
  }, []);
  return <canvas ref={ref} className="signal-art" aria-hidden="true" />;
}
