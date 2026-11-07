import React, { useEffect, useId, useRef } from 'react';

const count = 4200;
const initialYaw = -.6;
const initialPitch = .263;
const radiusScale = .42;
const keyStep = .18;
const introDuration = 1100;
const coastDuration = 760;
const directions = { ArrowLeft: [-keyStep, 0], ArrowRight: [keyStep, 0],
  ArrowUp: [0, -keyStep], ArrowDown: [0, keyStep] };
const initialSin = Math.sin(initialYaw);
const initialCos = Math.cos(initialYaw);
const tiltSin = Math.sin(initialPitch);
const tiltCos = Math.cos(initialPitch);
const dot = { x: -.27, y: -.42, z: -Math.sqrt(1 - .27 ** 2 - .42 ** 2) };
const initialRotation = [0, 0, 0, 1];
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
  return [u * scatter + .042 * side, v * scatter + .018 * side,
    (y * tiltSin + (z * initialCos - x * initialSin) * tiltCos) * scatter, grain];
}
const shades = ['#544760', '#866ea0', '#aa8ec8', '#ebc975', '#fff1b8'];

// Compose each gesture in screen coordinates so the rotation never hits a pole.
function turn(rotation, dx, dy, twist = 0) {
  const angle = Math.hypot(dx, dy, twist);
  if (!angle) return rotation;
  const factor = Math.sin(angle / 2) / angle;
  const ax = -dy * factor;
  const ay = dx * factor;
  const az = twist * factor;
  const aw = Math.cos(angle / 2);
  const [x, y, z, w] = rotation;
  return [
    aw * x + ax * w + ay * z - az * y,
    aw * y - ax * z + ay * w + az * x,
    aw * z + ax * y - ay * x + az * w,
    aw * w - ax * x - ay * y - az * z
  ];
}

function matrix([x, y, z, w]) {
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)
  ];
}

const dotDepth = dot.z * initialCos - dot.x * initialSin;
const dotPosition = [
  dot.x * initialCos + dot.z * initialSin,
  dot.y * tiltCos - dotDepth * tiltSin,
  dot.y * tiltSin + dotDepth * tiltCos
];

export function signalGeometry(width, height, opening) {
  if (opening) return { x: width / 2, y: height / 2, radius: Math.min(height * .44, width * .95) };
  const wide = window.innerWidth >= 900;
  return {
    x: width * (wide ? .56 : .655), y: height * (wide ? .36 : .505),
    radius: Math.min(width * (wide ? .9 : .69), height * (wide ? .62 : .99)) * radiusScale
  };
}

export function SignalArt({ artRef, onOpenSignIn }) {
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
    let rotation = initialRotation;
    let zoom = 1;
    let inView = false;
    let dirty = false;
    let drag = null;
    let pinch = null;
    const pointers = new Map();
    let coast = null;
    let suppressClick = false;
    let width = 0;
    let height = 0;

    function paint() {
      if (!width || !height) return;
      ctx.clearRect(0, 0, width, height);
      const { x: centerX, y: centerY, radius: baseRadius } = signalGeometry(width, height, Boolean(dotRef.current));
      const radius = baseRadius * zoom;
      const pointScale = baseRadius / Math.max(1, signalGeometry(window.innerWidth, window.innerHeight, true).radius);
      const [a, b, c, d, e, f, g, h, i] = matrix(rotation);
      const compact = window.innerWidth < 600;
      for (const [x, y, z, grain] of points) {
        if (compact && grain < .5) continue;
        const u = a * x + b * y + c * z;
        const v = d * x + e * y + f * z;
        const depth = g * x + h * y + i * z;
        const lit = Math.max(0, Math.min(.999, .30 + .20 * depth - .25 * v - .18 * u + .29 * grain));
        const px = centerX + u * radius + 5 * pointScale * (grain - .5);
        const py = centerY + v * radius;
        const size = (grain > .96 ? 1.9 : .65 + .75 * grain) * pointScale * Math.min(zoom, 1.8);
        ctx.globalAlpha = .20 + .80 * lit;
        ctx.fillStyle = shades[Math.floor(lit * shades.length)];
        ctx.fillRect(px, py, size, size);
      }
      ctx.globalAlpha = 1;
      const entry = dotRef.current;
      if (entry) {
        const [x, y, z] = dotPosition;
        const horizontal = (a * x + b * y + c * z) * radius;
        const vertical = (d * x + e * y + f * z) * radius;
        const closeness = (1 + g * x + h * y + i * z) / 2;
        entry.style.transform = `translate(${horizontal}px, ${vertical}px)`;
        entry.style.setProperty('--entry-opacity', .50 + .50 * closeness);
        entry.style.setProperty('--entry-scale', .55 + .45 * closeness);
        entry.tabIndex = Math.abs(horizontal) < width / 2 - 12 && Math.abs(vertical) < height / 2 - 12 ? 0 : -1;
        entry.hidden = false;
      }
    }
    function step(now) {
      frame = 0;
      if (intro && !motion.matches) {
        introStart ??= now;
        const progress = Math.min(1, (now - introStart) / introDuration);
        rotation = turn(initialRotation, .65 * (1 - (1 - progress) ** 2), 0);
        intro = progress < 1;
        dirty = true;
      } else if (coast) {
        const progress = Math.min(1, (now - coast.start) / coastDuration);
        const eased = 1 - (1 - progress) ** 3;
        rotation = turn(coast.rotation, coast.dx * eased, coast.dy * eased);
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

    function move(dx, dy, twist = 0) {
      rotation = turn(rotation, dx, dy, twist);
      dirty = true;
      sync();
    }

    function scale(factor) {
      zoom = Math.max(.55, Math.min(2.8, zoom * factor));
      dirty = true;
      sync();
    }

    function takeControl() {
      intro = false;
      coast = null;
    }

    function onPointerDown(event) {
      if (pointers.size >= 2 || event.button !== 0) return;
      if (pointers.size && (event.pointerType !== 'touch' || pointers.values().next().value.type !== 'touch')) return;
      takeControl();
      const point = { x: event.clientX, y: event.clientY, timeStamp: event.timeStamp, type: event.pointerType };
      pointers.set(event.pointerId, point);
      control.setPointerCapture(event.pointerId);
      if (pointers.size === 2) {
        pinch = pinchGeometry();
        suppressClick = true;
        drag = null;
      } else {
        suppressClick = false;
        drag = { ...point, vx: 0, vy: 0 };
      }
    }

    function pinchGeometry() {
      const [first, second] = pointers.values();
      const dx = second.x - first.x;
      const dy = second.y - first.y;
      return { distance: Math.max(1, Math.hypot(dx, dy)), angle: Math.atan2(dy, dx) };
    }

    function onPointerMove(event) {
      const point = pointers.get(event.pointerId);
      if (!point) return;
      point.x = event.clientX;
      point.y = event.clientY;
      point.timeStamp = event.timeStamp;
      if (pinch) {
        const next = pinchGeometry();
        scale(next.distance / pinch.distance);
        const twist = next.angle - pinch.angle;
        move(0, 0, Math.atan2(Math.sin(twist), Math.cos(twist)));
        pinch = next;
        return;
      }
      if (!drag) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (!suppressClick && Math.hypot(dx, dy) < 4) return;
      suppressClick = true;
      const elapsed = Math.max(8, event.timeStamp - drag.timeStamp);
      const radiansPerPixel = 1 / Math.max(60, signalGeometry(width, height, Boolean(dotRef.current)).radius * zoom);
      const rotationX = dx * radiansPerPixel;
      const rotationY = dy * radiansPerPixel;
      drag.x = event.clientX;
      drag.y = event.clientY;
      drag.timeStamp = event.timeStamp;
      drag.vx = .25 * drag.vx + .75 * rotationX / elapsed;
      drag.vy = .25 * drag.vy + .75 * rotationY / elapsed;
      move(rotationX, rotationY);
    }

    function onPointerEnd(event) {
      if (!pointers.delete(event.pointerId)) return;
      if (pinch) {
        pinch = null;
        const remaining = pointers.values().next().value;
        drag = remaining ? { ...remaining, timeStamp: event.timeStamp, vx: 0, vy: 0 } : null;
        return;
      }
      if (!drag) return;
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
      const speed = Math.hypot(vx, vy);
      if (speed < .0004) return;
      const travel = Math.min(coastDuration / 3, 10 / speed);
      coast = { start: performance.now(), rotation, dx: vx * travel, dy: vy * travel };
      sync();
    }

    function onClick(event) {
      if (suppressClick && event.detail !== 0) return;
      takeControl();
      move(.45, 0);
    }

    function onKeyDown(event) {
      if (event.altKey || event.ctrlKey || event.metaKey || (event.shiftKey && event.key !== '+')) return;
      if (event.key === 'Home') {
        event.preventDefault();
        takeControl();
        rotation = initialRotation;
        zoom = 1;
        move(0, 0);
      } else if (Object.hasOwn(directions, event.key)) {
        event.preventDefault();
        takeControl();
        move(...directions[event.key]);
      } else if (event.key === '+' || event.key === '=' || event.key === '-') {
        event.preventDefault();
        takeControl();
        scale(event.key === '-' ? 1 / 1.2 : 1.2);
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
        <canvas ref={artRef} className="signal-art" aria-hidden="true" />
        <span id={helpId} className="visually-hidden">
          Drag, swipe, or use the arrow keys to turn. Pinch or use plus and minus to zoom.
          Press Enter to spin or Home to reset.
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
