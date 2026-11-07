import React, { useState } from 'react';
import * as api from '../api.js';
import { LIMITS, plural } from '../format.js';
import { useApp, useDebounced, useResource } from '../hooks.js';
import { Empty, Field, LoadError, Loading, Page, Skills, Zone } from '../ui.jsx';

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

export function PersonBadge({ person }) {
  const initials = person.name.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]?.toLocaleUpperCase()).join('');
  const accent = parseInt(person.id.slice(-1), 16) % 4;
  return <div className={`person-badge badge-${accent}`} aria-hidden="true"><span>{initials}</span></div>;
}

function PeopleIndex({ people }) {
  const [selected, setSelected] = useState(null);
  const person = people.find(item => item.id === selected) ?? people[0];
  return (
    <div className="people-index">
      <ul className="people-index-list" aria-label="Choose a teammate">
        {people.map((item, index) => (
          <li key={item.id}>
            <button type="button" aria-controls="people-record" aria-pressed={item.id === person.id} onClick={() => setSelected(item.id)}>
              <span className="people-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
              <span>{item.name}</span><span aria-hidden="true">↗</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="people-record" id="people-record" aria-live="polite">
        <PersonBadge person={person} />
        <div className="people-record-copy" key={person.id}>
          <p className="eyebrow">{person.sample ? 'Sample participant' : 'Available teammate'}</p>
          <h3><a href={`#/people/${person.id}`}>{person.name}</a></h3>
          <p className="people-reason">{person.reason}</p>
          <Skills skills={person.skills} label={`Skills of ${person.name}`} />
          <p><Zone zone={person.timezone} /></p>
          {person.lookingFor && <p className="people-looking">{person.lookingFor}</p>}
          <a className="button button-primary" href={`#/people/${person.id}`}>View profile <span aria-hidden="true">↗</span></a>
        </div>
      </div>
    </div>
  );
}

export function PeoplePage() {
  const { teamId } = useApp();
  const [query, setQuery] = useState('');
  const q = useDebounced(query.trim(), 300);
  const people = useSuggestions(q);
  return (
    <Page
      title="People"
      intro={teamId
        ? 'People without a team, ranked by the skills your team lacks and how close their time zone is to yours'
        : 'People without a team, ranked by the skills you lack and how close their time zone is to yours'}
    >
      <form className="people-search" role="search" onSubmit={event => event.preventDefault()}>
        <Field label="Search people" hint="Name or skill">
          {field => <input {...field} type="search" value={query} maxLength={LIMITS.query} onChange={event => setQuery(event.target.value)} />}
        </Field>
      </form>
      {people.error && <LoadError error={people.error} onRetry={people.retry} />}
      {people.loading && !people.data && <Loading label="Finding people" />}
      {people.data && (people.data.length
        ? <section aria-labelledby="people-count"><h2 id="people-count">{plural(people.data.length, 'suggestion')}</h2><PeopleIndex people={people.data} /></section>
        : <Empty title={q ? 'No people match this search' : 'No suggestions right now'} />)}
      <p className="muted">
        {teamId ? <>Leaders can share an invite code from <a href={`#/teams/${teamId}`}>their team</a> in the event chat.</> : 'Meet in the event chat, then exchange an invite code.'}
      </p>
    </Page>
  );
}
