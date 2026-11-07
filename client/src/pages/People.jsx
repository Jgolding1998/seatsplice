import React, { useRef, useState } from 'react';
import * as api from '../api.js';
import { LIMITS, plural } from '../format.js';
import { useApp, useDebounced, useResource } from '../hooks.js';
import { Empty, Field, LoadError, Page, Skills, Zone } from '../ui.jsx';
import { useGalleryDrag } from './useGalleryDrag.js';

export function PersonList({ people }) {
  return (
    <ul className="people">
      {people.map(person => (
        <li key={person.id} className="person">
          <div className="person-head">
            <h3><a href={`#/people/${person.id}`}>{person.name}</a></h3>
            {person.sample && <span className="sample-label">Sample</span>}
          </div>
          <p className="person-reason">{person.reason}</p>
          <Skills skills={person.skills} label={`Skills of ${person.name}`} />
          <p className="muted"><Zone zone={person.timezone} /></p>
        </li>
      ))}
    </ul>
  );
}

export function useSuggestions(q = '') {
  const { user, teamId } = useApp();
  return useResource(signal => api.getSuggestions(signal, q), JSON.stringify([q, user.skills, user.timezone, teamId]), 0, { keepData: true });
}

const filmSequence = [0, 1, 4, 2, 3, 5, 2, 4];

function Film({ person, index }) {
  return <span className="people-film" data-art={filmSequence[index % filmSequence.length]} aria-hidden="true">
    <span>{String(index + 1).padStart(2, '0')}</span>
    <strong>{person.name}</strong>
  </span>;
}

function PeopleGallery({ people, memory }) {
  const [selected, setSelected] = useState(() => memory.current.selected);
  const region = useRef(null);
  const count = people.length;
  const active = Math.max(0, people.findIndex(person => person.id === selected));
  const person = people[active];

  function select(id) {
    setSelected(id);
    memory.current.selected = id;
  }

  const step = direction => select(people[(active + direction + count) % count].id);
  const drag = useGalleryDrag(step, count);
  function onKeys(event) {
    if (event.altKey || event.ctrlKey || event.metaKey || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home' || event.key === 'End') select(people[event.key === 'Home' ? 0 : count - 1].id);
    else step(event.key === 'ArrowLeft' ? -1 : 1);
    if (event.target.closest('a')) region.current?.focus({ preventScroll: true });
  }

  return (
    <div className="people-gallery" ref={region} role="region" aria-label="People gallery"
      aria-roledescription="carousel" tabIndex={0} onKeyDown={onKeys}>
      <div className="people-stage" {...drag}>
        <span className="people-stage-label" aria-hidden="true">FIELD NOTES / {String(active + 1).padStart(2, '0')}</span>
        {people.map((item, index) => {
          const relative = (index - active + count) % count;
          const slot = relative > count / 2 ? relative - count : relative;
          const hidden = Math.abs(slot) > 3;
          return <div className="people-frame" key={item.id} data-slot={hidden ? 'off' : slot} aria-hidden={hidden || undefined}>
            {index === active
              ? <a className="people-frame-control" href={`#/people/${item.id}`} aria-label={`Open ${item.name}’s profile`}><Film person={item} index={index} /></a>
              : <button type="button" className="people-frame-control" tabIndex={-1} disabled={hidden}
                  aria-label={`Show ${item.name}`} onClick={() => { select(item.id); region.current?.focus({ preventScroll: true }); }}><Film person={item} index={index} /></button>}
          </div>;
        })}
      </div>
      <div className="people-record" id="people-record">
        <div className="people-record-copy" key={person.id}>
          <p className="eyebrow"><span>{person.sample ? 'Sample participant' : 'Available teammate'}</span> <span aria-hidden="true">/</span> <Zone zone={person.timezone} /></p>
          <h3><a href={`#/people/${person.id}`}>{person.name}</a></h3>
          <Skills skills={person.skills} label={`Skills of ${person.name}`} />
          <p className="people-reason">{person.lookingFor || person.reason}</p>
        </div>
        <div className="people-actions">
          <a className="button button-primary gallery-link" href={`#/people/${person.id}`}>View profile <span aria-hidden="true">↗</span></a>
          {count > 1 && <div className="people-arrows">
            <button type="button" className="crew-nav-button" aria-label="Previous person" onClick={() => step(-1)}><span aria-hidden="true">←</span></button>
            <button type="button" className="crew-nav-button" aria-label="Next person" onClick={() => step(1)}><span aria-hidden="true">→</span></button>
          </div>}
        </div>
      </div>
      {count > 1 && <ul className="people-index-list" aria-label="Choose a teammate">
        {people.map((item, index) => (
          <li key={item.id}><button type="button" aria-label={item.name} aria-controls="people-record"
            aria-pressed={index === active} onClick={() => select(item.id)}>{String(index + 1).padStart(2, '0')}</button></li>
        ))}
      </ul>}
      <span className="visually-hidden" role="status">{person.name}, {active + 1} of {count}</span>
    </div>
  );
}

function PeoplePlaceholder() {
  return <div className="people-gallery people-loading" role="status" aria-label="Finding people">
    <div className="people-stage" aria-hidden="true">
      {[-2, -1, 0, 1, 2].map(slot => <span key={slot} className="people-frame" data-slot={slot}><span className="people-film skeleton-line" /></span>)}
    </div>
    <div className="people-record" aria-hidden="true"><span className="skeleton-line skeleton-title" /></div>
  </div>;
}

export function PeoplePage() {
  const { teamId, peopleMemory } = useApp();
  const [query, setQuery] = useState(() => peopleMemory.current.query);
  const q = useDebounced(query.trim(), 300);
  const people = useSuggestions(q);
  return (
    <Page title="People" eyebrow="Hack4Hack / Teammate directory" intro="Find someone to build with.">
      <form className="people-search" role="search" onSubmit={event => event.preventDefault()}>
        <Field label="Search people">
          {field => <input {...field} type="search" placeholder="Search by name or skill" value={query} maxLength={LIMITS.query}
            onChange={event => { peopleMemory.current.query = event.target.value; setQuery(event.target.value); }} />}
        </Field>
      </form>
      {people.error && <LoadError error={people.error} onRetry={people.retry} />}
      {people.loading && !people.data && <PeoplePlaceholder />}
      {people.data && (people.data.length
        ? <section aria-labelledby="people-count"><h2 className="visually-hidden" id="people-count">{plural(people.data.length, 'suggestion')}</h2><PeopleGallery people={people.data} memory={peopleMemory} /></section>
        : <Empty title={q ? 'No people match this search' : 'No suggestions right now'} />)}
      <p className="muted people-footer">
        {teamId ? <>Leaders can share an invite code from <a href={`#/teams/${teamId}`}>their team</a> in the event chat.</> : 'Meet in the event chat, then exchange an invite code.'}
      </p>
    </Page>
  );
}
