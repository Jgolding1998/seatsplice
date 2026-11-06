import React, { useRef, useState } from 'react';
import { plural } from '../format.js';
import { SeatRow, Skills, Zone } from '../ui.jsx';
import './team-gallery.css';

const covers = [
  { theme: 'lemon', label: 'RUBBER DUCK DEBUGGING' },
  { theme: 'coral', label: 'STACK TRACE' },
  { theme: 'blue', label: 'NULL POINTER' },
  { theme: 'lilac', label: 'BOX MODEL' },
  { theme: 'mint', label: 'KEYBOARD SHORTCUT' },
  { theme: 'peach', label: 'CACHE HIT' }
];

function coverIndex(team) {
  const name = team.name.toLowerCase();
  const known = [/duck/, /stack/, /null/, /css/, /ctrl|key/, /cache/].findIndex(pattern => pattern.test(name));
  return known >= 0 ? known : parseInt(team.id.slice(-4), 16) % covers.length;
}

export function CoverArt({ index }) {
  return (
    <svg className="crew-art" viewBox="0 0 220 146" aria-hidden="true" focusable="false">
      {index === 0 && <>
        <path className="cover-guide" d="M16 108h188M39 122h142M63 134h94" />
        <ellipse cx="110" cy="122" rx="68" ry="9" fill="#d19e49" />
        <path d="M47 71c15 8 27 10 43 4-2-6-4-12-3-21 1-21 16-35 37-35 20 0 34 15 34 31 0 16-9 23-18 29 10 10 12 19 2 29-13 14-56 19-81 3-14-9-18-21-14-40Z" fill="#fef6b0" stroke="#28221d" strokeWidth="3" />
        <path d="M155 52c12 0 19 4 28 2-6 11-18 14-33 10Z" fill="#fa7951" stroke="#28221d" strokeWidth="3" strokeLinejoin="round" />
        <circle cx="141" cy="47" r="3.6" fill="#28221d" />
        <path d="M79 89c11 1 19-1 27-7-2 14-16 21-29 16" fill="none" stroke="#28221d" strokeWidth="2" strokeLinecap="round" />
        <path d="M47 37v17m-8-8h16m135 34v13m-7-7h14" stroke="#28221d" strokeWidth="2" />
      </>}
      {index === 1 && <>
        <path className="cover-guide" d="M18 128h183M28 18l160 112M71 10l131 92" />
        <path d="m42 88 89-22 46 25-89 24Z" fill="#211e24" stroke="#211e24" strokeWidth="3" />
        <path d="m42 69 89-22 46 25-89 24Z" fill="#f7e4cb" stroke="#211e24" strokeWidth="3" />
        <path d="m42 50 89-22 46 25-89 24Z" fill="#ffe185" stroke="#211e24" strokeWidth="3" />
        <path d="m92 53 16-12 2 9 16-4-15 15-2-9Z" fill="#211e24" />
        <path d="M32 24h17m-8-8v16m145 79h14m-7-7v14" stroke="#211e24" strokeWidth="2" />
      </>}
      {index === 2 && <>
        <circle cx="110" cy="73" r="59" className="cover-guide" />
        <circle cx="110" cy="73" r="45" className="cover-guide" />
        <path d="M21 73h178M110 9v128" className="cover-guide" />
        <path d="m100 32 36 75-25-9-14 19Z" fill="#eaf2ff" stroke="#202038" strokeWidth="3" strokeLinejoin="round" />
        <path d="M137 34h29m-14-14v28M49 98h20m-10-10v20" stroke="#202038" strokeWidth="2" />
        <circle cx="155" cy="98" r="4" fill="#202038" />
      </>}
      {index === 3 && <>
        <rect x="28" y="19" width="164" height="108" rx="4" className="cover-guide" />
        <path d="M110 18v111M28 73h164" className="cover-guide" />
        <rect x="50" y="35" width="120" height="76" fill="#efb0df" stroke="#30223f" strokeWidth="2" strokeDasharray="5 4" />
        <rect x="68" y="48" width="84" height="50" fill="#ffe082" stroke="#30223f" strokeWidth="2" />
        <path d="m94 64-10 9 10 9m32-18 10 9-10 9m-12-19-8 20" stroke="#30223f" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </>}
      {index === 4 && <>
        <path d="M26 30h168v91H26Z" className="cover-guide" />
        <g stroke="#20332c" strokeWidth="3">
          <rect x="32" y="65" width="51" height="50" rx="8" fill="#497868" />
          <rect x="84" y="38" width="51" height="50" rx="8" fill="#497868" />
          <rect x="136" y="65" width="51" height="50" rx="8" fill="#497868" />
          <rect x="32" y="58" width="51" height="49" rx="8" fill="#e5f4d6" />
          <rect x="84" y="31" width="51" height="49" rx="8" fill="#fff0a0" />
          <rect x="136" y="58" width="51" height="49" rx="8" fill="#e5f4d6" />
        </g>
        <path d="M50 87l8-9 8 9m35-28h17m-8-8v16m44 18h17" stroke="#20332c" strokeWidth="3" fill="none" strokeLinecap="round" />
      </>}
      {index === 5 && <>
        <path d="M26 117h170M36 35h147M58 21v109m105-109v109" className="cover-guide" />
        <path d="M60 50h86v32c0 23-19 36-43 36S60 104 60 82Z" fill="#fff0d5" stroke="#3b241e" strokeWidth="3" />
        <ellipse cx="103" cy="50" rx="43" ry="9" fill="#a24f3a" stroke="#3b241e" strokeWidth="3" />
        <path d="M146 57h8c21 0 22 28 2 30h-10M88 36c-9-6 10-11 4-19m15 19c-9-6 10-11 4-19m15 19c-9-6 10-11 4-19" stroke="#3b241e" strokeWidth="3" fill="none" strokeLinecap="round" />
      </>}
    </svg>
  );
}

function Cover({ team, position }) {
  const index = coverIndex(team);
  const cover = covers[index];
  return (
    <>
      <span className="crew-print" data-theme={cover.theme}>
        <span className="crew-print-number">SP—{String(position).padStart(2, '0')}</span>
        <CoverArt index={index} />
        <span className="crew-print-label" aria-hidden="true">{cover.label}</span>
      </span>
      <span className="crew-card-info">
        <strong>{team.name}</strong>
        <span>{plural(team.maxSize - team.memberCount, 'open seat')}</span>
      </span>
    </>
  );
}

export function GalleryPlaceholder() {
  return (
    <div className="crew-gallery crew-gallery-loading" role="status" aria-label="Loading teams">
      <div className="crew-stage" aria-hidden="true">
        <span className="crew-placeholder crew-placeholder-left" />
        <span className="crew-placeholder" />
        <span className="crew-placeholder crew-placeholder-right" />
      </div>
      <div className="crew-gallery-bar" aria-hidden="true"><span className="crew-placeholder-line" /></div>
    </div>
  );
}

export function TeamGallery({ teams, pageNumber, initialTeam, rememberTeam }) {
  const [selected, setSelected] = useState(initialTeam);
  function select(id) {
    setSelected(id);
    rememberTeam(id);
  }
  const region = useRef(null);
  const touch = useRef(null);
  const swallowClickUntil = useRef(0);
  const count = teams.length;
  const active = Math.max(0, teams.findIndex(team => team.id === selected));
  const team = teams[active];
  const position = (pageNumber - 1) * 12 + active + 1;
  const step = direction => select(teams[(active + direction + count) % count].id);

  function onKeys(event) {
    if (event.altKey || event.ctrlKey || event.metaKey || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home' || event.key === 'End') {
      select(teams[event.key === 'Home' ? 0 : count - 1].id);
    } else {
      step(event.key === 'ArrowLeft' ? -1 : 1);
    }
    if (event.target.closest('a')) region.current?.focus({ preventScroll: true });
  }

  function onPointerUp(event) {
    if (!touch.current || touch.current.id !== event.pointerId) return;
    const dx = event.clientX - touch.current.x;
    const dy = event.clientY - touch.current.y;
    touch.current = null;
    if (count > 1 && Math.abs(dx) > 42 && Math.abs(dx) > 1.25 * Math.abs(dy)) {
      swallowClickUntil.current = performance.now() + 400;
      step(dx < 0 ? 1 : -1);
    }
  }

  return (
    <div ref={region} className="crew-gallery" role="region" aria-label="Team gallery"
      aria-roledescription="carousel" tabIndex={0} onKeyDown={onKeys}>
      <div className="crew-stage" data-cover={covers[coverIndex(team)].theme}
        onPointerDown={event => {
          if (event.pointerType === 'touch' || event.pointerType === 'pen') {
            touch.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
          }
        }}
        onPointerUp={onPointerUp} onPointerCancel={() => { touch.current = null; }}
        onClickCapture={event => {
          if (event.detail > 0 && performance.now() < swallowClickUntil.current) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}>
        <div className="crew-watermark" aria-hidden="true">OPEN<br />SEATS</div>
        {teams.map((item, index) => {
          const relative = (index - active + count) % count;
          const offset = relative > count / 2 ? relative - count : relative;
          const hidden = Math.abs(offset) > 3;
          const content = <Cover team={item} position={(pageNumber - 1) * 12 + index + 1} />;
          return (
            <div className="crew-cover" data-slot={hidden ? 'off' : offset} key={item.id} aria-hidden={hidden || undefined}>
              {index === active ? (
                <a className="crew-card" href={`#/teams/${encodeURIComponent(item.id)}`} aria-label={item.name}>
                  {content}<span className="crew-card-arrow" aria-hidden="true">↗</span>
                </a>
              ) : (
                <button type="button" className="crew-card" tabIndex={-1} disabled={hidden}
                  aria-label={`Show ${item.name}`} onClick={() => {
                    select(item.id);
                    region.current?.focus({ preventScroll: true });
                  }}>{content}</button>
              )}
            </div>
          );
        })}
        {count > 1 && <span className="crew-stage-index" aria-hidden="true">SWIPE OR USE ARROWS</span>}
      </div>
      <div className="crew-gallery-bar">
        <div className="crew-gallery-caption">
          <span className="crew-caption-index" aria-hidden="true">{String(position).padStart(2, '0')}</span>
          <div>
            <h3>{team.name}</h3>
            <p>Led by {team.leaderName} · <Zone zone={team.timezone} /></p>
          </div>
        </div>
        <div className="crew-gallery-actions">
          <a className="crew-open-team" href={`#/teams/${encodeURIComponent(team.id)}`}>View team <span aria-hidden="true">↗</span></a>
          {count > 1 && <>
            <button className="crew-nav-button" type="button" aria-label="Previous team" onClick={() => step(-1)}>←</button>
            <span className="crew-count" aria-hidden="true">{active + 1}/{count}</span>
            <button className="crew-nav-button" type="button" aria-label="Next team" onClick={() => step(1)}>→</button>
          </>}
        </div>
      </div>
      <div className="crew-gallery-details">
        {team.description && <p>{team.description}</p>}
        <Skills skills={team.skills} />
        <span className="crew-open-count"><SeatRow {...team} /> {plural(team.maxSize - team.memberCount, 'open seat')}</span>
      </div>
      <span className="visually-hidden" aria-live="polite" aria-atomic="true">
        {team.name}, {plural(team.maxSize - team.memberCount, 'open seat')}, team {active + 1} of {count}
      </span>
    </div>
  );
}
