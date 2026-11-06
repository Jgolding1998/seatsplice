import React, { useEffect, useId, useRef } from 'react';

const count = 4200;
const initialYaw = -.6;
const initialPitch = .263;
const radiusScale = .42;
const pitchLimit = 1.2;
const keyStep = .18;
const introDuration = 1100;
const coastDuration = 320;
const directions = { ArrowLeft: [-keyStep, 0], ArrowRight: [keyStep, 0],
  ArrowUp: [0, -keyStep], ArrowDown: [0, keyStep] };
const initialSin = Math.sin(initialYaw);
const initialCos = Math.cos(initialYaw);
const tiltSin = Math.sin(initialPitch);
const tiltCos = Math.cos(initialPitch);
const dot = { x: .8, y: .22, z: -Math.sqrt(1 - .8 ** 2 - .22 ** 2) };
let cloud;

const sourceArt = [
  '',
  '          .       *       .',
  '       .     .-------.       *',
  '            /  _      \\',
  '       *   |  (o)>     |   .',
  '           |  /_)~~~   |',
  '        .   \\         /       *',
  "             '-------'",
  '          The stowaway duck',
  ''
].join('\n');
function makePoint(_, i) {
  const a = i * 2.3999632297;
  const z = 1 - (2 * (i + .5)) / count;
  const ring = Math.sqrt(1 - z * z);
  const noise = Math.sin(i * 12.9898) * 43758.5453;
  const grain = noise - Math.floor(noise);
  const x = Math.cos(a) * ring;
  const y = Math.sin(a) * ring;
  const u = x * initialCos + z * initialSin;
  const v = y * tiltCos - (z * initialCos - x * initialSin) * tiltSin;
  const side = u + v * .55 >= 0 ? 1 : -1;
  const scatter = .87 + .25 * grain;
  // Place the split in the sphere itself so it turns with the particles.
  return [
    x * scatter + side * (.042 * initialCos + .018 * tiltSin * initialSin),
    y * scatter + side * .018 * tiltCos,
    z * scatter + side * (.042 * initialSin - .018 * tiltSin * initialCos),
    grain
  ];
}
const shades = ['#544760', '#866ea0', '#aa8ec8', '#ebc975', '#fff1b8'];
const clampPitch = angle => Math.max(-pitchLimit, Math.min(pitchLimit, angle));

export function SignalArt({ onOpenSignIn }) {
  const ref = useRef(null);
  const dotRef = useRef(null);
  const dotTouch = useRef(null);
  const helpId = useId();
  useEffect(() => {
    const control = ref.current;
    const canvas = control.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    const sourceComment = document.createComment(sourceArt);
    control.parentElement.prepend(sourceComment);
    const points = cloud ??= Array.from({ length: count }, makePoint);
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let introStart;
    let intro = true;
    let yaw = initialYaw;
    let pitch = initialPitch;
    let inView = false;
    let dirty = false;
    let drag = null;
    let coast = null;
    let suppressClick = false;
    let width = 0;
    let height = 0;

    function paint() {
      if (!width || !height) return;
      ctx.clearRect(0, 0, width, height);
      const radius = Math.min(width, height) * radiusScale;
      const sy = Math.sin(yaw);
      const cy = Math.cos(yaw);
      const sp = Math.sin(pitch);
      const cp = Math.cos(pitch);
      for (const [x, y, z, grain] of points) {
        if (width < 420 && grain < .5) continue;
        const u = x * cy + z * sy;
        const depth = z * cy - x * sy;
        const v = y * cp - depth * sp;
        const lit = Math.max(0, Math.min(.999, .30 + .20 * depth - .25 * v - .18 * u + .29 * grain));
        const px = width * .5 + u * radius + 5 * (grain - .5);
        const py = height * .5 + v * radius;
        const size = grain > .96 ? 1.9 : .65 + .75 * grain;
        ctx.globalAlpha = .20 + .80 * lit;
        ctx.fillStyle = shades[Math.floor(lit * shades.length)];
        ctx.fillRect(px, py, size, size);
      }
      ctx.globalAlpha = 1;
      const entry = dotRef.current;
      if (entry) {
        const horizontal = dot.x * cy + dot.z * sy;
        const depth = dot.z * cy - dot.x * sy;
        const vertical = dot.y * cp - depth * sp;
        const facesViewer = dot.y * sp + depth * cp > .26;
        const hide = !facesViewer && document.activeElement !== entry;
        if (entry.hidden !== hide) entry.hidden = hide;
        if (facesViewer) {
          entry.style.transform = `translate(${horizontal * radius}px, ${vertical * radius}px)`;
        }
      }
    }
    function step(now) {
      frame = 0;
      if (intro && !motion.matches) {
        introStart ??= now;
        const progress = Math.min(1, (now - introStart) / introDuration);
        yaw = initialYaw + .65 * (1 - (1 - progress) ** 2);
        intro = progress < 1;
        dirty = true;
      } else if (coast) {
        const progress = Math.min(1, (now - coast.start) / coastDuration);
        const eased = 1 - (1 - progress) ** 2;
        yaw = coast.yaw + coast.dx * eased;
        pitch = clampPitch(coast.pitch - coast.dy * eased);
        if (progress === 1) coast = null;
        dirty = true;
      }
      if (dirty) {
        dirty = false;
        paint();
      }
      sync();
    }
    function sync() {
      if (motion.matches || document.hidden || !inView) coast = null;
      const active = inView && !document.hidden && (dirty || (!motion.matches && (intro || coast)));
      if (active && !frame) frame = requestAnimationFrame(step);
      if (!active && frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    }

    function move(dx, dy) {
      yaw += dx;
      pitch = clampPitch(pitch - dy);
      dirty = true;
      sync();
    }

    function takeControl() {
      intro = false;
      coast = null;
    }

    function onPointerDown(event) {
      if (drag || !event.isPrimary || event.button !== 0) return;
      takeControl();
      suppressClick = false;
      const { pointerId, clientX, clientY, timeStamp } = event;
      const radiansPerPixel = 1 / Math.max(60, Math.min(width, height) * radiusScale);
      drag = { pointerId, x: clientX, y: clientY, timeStamp, radiansPerPixel, vx: 0, vy: 0 };
      control.setPointerCapture(pointerId);
    }

    function onPointerMove(event) {
      if (drag?.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (!suppressClick && Math.hypot(dx, dy) < 4) return;
      suppressClick = true;
      const elapsed = Math.max(8, event.timeStamp - drag.timeStamp);
      const rotationX = dx * drag.radiansPerPixel;
      const rotationY = dy * drag.radiansPerPixel;
      drag.x = event.clientX;
      drag.y = event.clientY;
      drag.timeStamp = event.timeStamp;
      drag.vx = rotationX / elapsed;
      drag.vy = rotationY / elapsed;
      move(rotationX, rotationY);
    }

    function onPointerEnd(event) {
      if (drag?.pointerId !== event.pointerId) return;
      const { vx, vy, timeStamp } = drag;
      drag = null;
      if (event.type !== 'pointerup') return;
      if (!suppressClick && event.pointerType === 'touch') {
        // Some touch browsers omit the click after pointer capture.
        suppressClick = true;
        move(.45, 0);
        return;
      }
      if (!suppressClick || motion.matches || event.timeStamp - timeStamp > 80) return;
      const distance = velocity => Math.max(-.85, Math.min(.85, velocity * coastDuration / 2));
      coast = { start: performance.now(), yaw, pitch, dx: distance(vx), dy: distance(vy) };
      sync();
    }

    function onClick(event) {
      if (suppressClick && event.detail !== 0) return;
      takeControl();
      move(.45, 0);
    }

    function onKeyDown(event) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key === 'Home') {
        event.preventDefault();
        takeControl();
        yaw = initialYaw;
        pitch = initialPitch;
        move(0, 0);
      } else if (Object.hasOwn(directions, event.key)) {
        event.preventDefault();
        takeControl();
        move(...directions[event.key]);
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
    const listeners = new AbortController();
    const options = { signal: listeners.signal };
    control.addEventListener('pointerdown', onPointerDown, options);
    control.addEventListener('pointermove', onPointerMove, options);
    control.addEventListener('pointerup', onPointerEnd, options);
    control.addEventListener('pointercancel', onPointerEnd, options);
    control.addEventListener('lostpointercapture', onPointerEnd, options);
    control.addEventListener('click', onClick, options);
    control.addEventListener('keydown', onKeyDown, options);
    dotRef.current?.addEventListener('focus', takeControl, options);
    dotRef.current?.addEventListener('pointerdown', takeControl, options);
    document.addEventListener('visibilitychange', sync, options);
    motion.addEventListener('change', sync, options);
    return () => {
      cancelAnimationFrame(frame);
      size.disconnect();
      observer.disconnect();
      listeners.abort();
      sourceComment.remove();
    };
  }, []);
  return (
    <div className="signal-stage">
      <button ref={ref} type="button" className="signal-control" aria-label="Rotate particle sphere" aria-describedby={helpId}>
        <canvas className="signal-art" aria-hidden="true" />
        <span className="signal-hint" aria-hidden="true">
          {onOpenSignIn ? 'Spin to find the gold dot' : 'Drag to spin'}
        </span>
        <span id={helpId} className="visually-hidden">
          Drag, swipe, or use the arrow keys to turn. Press Enter to spin or Home to reset.
          {onOpenSignIn && ' Find the gold dot to open sign-in.'}
        </span>
      </button>
      {onOpenSignIn && <button ref={dotRef} type="button" className="signal-entry"
        aria-label="Open sign-in" onClick={onOpenSignIn} hidden
        onPointerDown={event => {
          if (event.isPrimary && event.pointerType === 'touch') {
            dotTouch.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
          }
        }}
        onPointerCancel={() => { dotTouch.current = null; }}
        onPointerUp={event => {
          const tap = dotTouch.current;
          dotTouch.current = null;
          if (tap?.id === event.pointerId && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) < 12) {
            onOpenSignIn();
          }
        }} />}
    </div>
  );
}
