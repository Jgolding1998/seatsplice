import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as api from '../api.js';
import { LIMITS, formatClock, plural } from '../format.js';
import { useApp, useDebounced, useResource } from '../hooks.js';
import { Button, Empty, Field, LoadError, Loading, Page, Seats, Skills, Zone } from '../ui.jsx';
import { GalleryPlaceholder, TeamGallery } from './TeamGallery.jsx';

function TeamRow({ team, position }) {
  return (
    <li className="board-row">
      <div className="board-main">
        <span className="board-index" aria-hidden="true">{String(position).padStart(2, '0')}</span>
        <h3><a href={`#/teams/${encodeURIComponent(team.id)}`}>{team.name}</a></h3>
        <p className="muted">Led by {team.leaderName} · <Zone zone={team.timezone} /></p>
        {team.description && <p className="board-description">{team.description}</p>}
      </div>
      <Skills skills={team.skills} label={`Skills for ${team.name}`} />
      <div>
        <p>{plural(team.maxSize - team.memberCount, 'open seat')}</p>
        <Seats team={team} />
      </div>
    </li>
  );
}

export function BoardPage({ initial }) {
  const { tick, teamId, boardMemory } = useApp();
  const [q, setQ] = useState(() => (initial.get('q') ?? '').slice(0, LIMITS.query));
  const [skill, setSkill] = useState(() => (initial.get('skill') ?? '').slice(0, LIMITS.skillLength));
  const [cursors, setCursors] = useState(() => {
    const initialFilters = JSON.stringify([q.trim(), skill.trim()]);
    return initialFilters === boardMemory.current.filters ? boardMemory.current.cursors : [null];
  });
  const [display, setDisplay] = useState(() => boardMemory.current.display);
  const [resultNotice, setResultNotice] = useState('');
  const results = useRef(null);
  const searchInput = useRef(null);
  const focusResults = useRef(false);
  const seenSkills = useRef(new Set());

  const searchedQ = useDebounced(q.trim(), 300);
  const searchedSkill = useDebounced(skill.trim(), 300);
  const filters = JSON.stringify([searchedQ, searchedSkill]);

  // Changing a filter makes the old cursors meaningless, so paging restarts in the same render.
  const [appliedFilters, setAppliedFilters] = useState(filters);
  let pageCursors = cursors;
  if (appliedFilters !== filters) {
    pageCursors = [null];
    setAppliedFilters(filters);
    setCursors(pageCursors);
  }
  const cursor = pageCursors[pageCursors.length - 1];
  const pageNumber = pageCursors.length;

  const board = useResource(
    signal => api.getBoard({ q: searchedQ, skill: searchedSkill, cursor }, signal),
    JSON.stringify([searchedQ, searchedSkill, cursor]),
    tick,
    { keepData: true }
  );
  const teams = useMemo(() => board.data?.teams ?? [], [board.data]);
  const nextCursor = board.data?.nextCursor ?? null;
  teams.forEach(team => team.skills?.forEach(item => seenSkills.current.add(item)));

  // Shareable filters; replaceState, because typing should not fill the back button history.
  useEffect(() => {
    const query = new URLSearchParams();
    if (searchedQ) query.set('q', searchedQ);
    if (searchedSkill) query.set('skill', searchedSkill);
    const text = query.toString();
    window.history.replaceState(null, '', text ? `#/board?${text}` : '#/board');
  }, [searchedQ, searchedSkill]);

  // Say what changed after a search or page change; live refreshes stay silent.
  const describedKey = useRef(null);
  const resultKey = JSON.stringify([filters, pageNumber]);
  useEffect(() => {
    boardMemory.current = { ...boardMemory.current, display, filters, cursors: pageCursors };
  }, [boardMemory, display, filters, pageCursors]);

  useEffect(() => {
    if (board.loading || !board.data) return;
    if (describedKey.current !== null && describedKey.current !== resultKey) {
      setResultNotice(`${plural(teams.length, 'team')} on page ${pageNumber}`);
    }
    describedKey.current = resultKey;
    if (focusResults.current) {
      focusResults.current = false;
      results.current?.focus();
    }
  }, [board.loading, board.data, resultKey, teams.length, pageNumber]);

  const filtered = Boolean(searchedQ || searchedSkill);
  const clearFilters = () => {
    setQ('');
    setSkill('');
    searchInput.current?.focus();
  };
  const goNext = () => {
    if (!nextCursor || board.loading) return;
    focusResults.current = true;
    setCursors([...pageCursors, nextCursor]);
  };
  const goPrevious = () => {
    if (pageNumber < 2 || board.loading) return;
    focusResults.current = true;
    setCursors(pageCursors.slice(0, -1));
  };

  return (
    <Page title="Find a team" intro="Find an open seat and ask to join.">
      <p className="visually-hidden" role="status">{resultNotice}</p>
      <form className="filters" role="search" onSubmit={event => event.preventDefault()}>
        <Field label="Search teams" hint="Name, description or skill">
          {field => <input {...field} ref={searchInput} type="search" value={q} maxLength={LIMITS.query} onChange={event => setQ(event.target.value)} />}
        </Field>
        <Field label="Needs skill">
          {field => (
            <>
              <input {...field} value={skill} list="board-skills" maxLength={LIMITS.skillLength} autoComplete="off" onChange={event => setSkill(event.target.value)} />
              <datalist id="board-skills">
                {[...seenSkills.current].sort().map(item => <option key={item} value={item} />)}
              </datalist>
            </>
          )}
        </Field>
        {(q || skill) && <Button onClick={clearFilters}>Clear filters</Button>}
      </form>

      <section aria-labelledby="board-results">
        <div className="section-head">
          <h2 id="board-results" ref={results} tabIndex={-1}>Open teams, page {pageNumber}</h2>
          <div className="row board-display" role="group" aria-label="Board view">
            <Button aria-pressed={display === 'gallery'} onClick={() => setDisplay('gallery')}>Gallery</Button>
            <Button aria-pressed={display === 'list'} onClick={() => setDisplay('list')}>List</Button>
          </div>
          {!teamId && <a className="button board-create" href="#/new">Create team <span aria-hidden="true">+</span></a>}
          {board.stale && board.updatedAt && <p className="muted">Could not refresh. Showing teams from {formatClock(board.updatedAt)}</p>}
        </div>

        {board.error && (
          <LoadError error={board.error} onRetry={board.retry}>
            {pageNumber > 1 && <Button onClick={() => setCursors([null])}>Back to first page</Button>}
          </LoadError>
        )}
        {!board.data && board.loading && (display === 'gallery'
          ? <GalleryPlaceholder />
          : <Loading label="Loading teams" kind="board" rows={4} />)}

        {board.data && teams.length === 0 && (
          filtered ? (
            <Empty title="No open teams match these filters">
              <Button onClick={clearFilters}>Clear filters</Button>
            </Empty>
          ) : (
            <Empty title="No team has an open seat right now">
              {!teamId && <p><a href="#/new">Start a team</a> and it will appear here.</p>}
            </Empty>
          )
        )}

        {teams.length > 0 && (display === 'gallery' ? (
          <TeamGallery key={resultKey} teams={teams} pageNumber={pageNumber}
            initialTeam={boardMemory.current.selected?.key === resultKey ? boardMemory.current.selected.id : null}
            rememberTeam={id => { boardMemory.current.selected = { key: resultKey, id }; }} />
        ) : (
          <ul className="board-list" aria-busy={board.loading}>
            {teams.map((team, index) => <TeamRow key={team.id} team={team} position={(pageNumber - 1) * 12 + index + 1} />)}
          </ul>
        ))}

        {(pageNumber > 1 || nextCursor) && (
          <nav className="row pager" aria-label="Board pages">
            {pageNumber > 1 && <Button onClick={goPrevious}>Previous page</Button>}
            {nextCursor && <Button onClick={goNext}>Next page</Button>}
          </nav>
        )}
      </section>
    </Page>
  );
}
