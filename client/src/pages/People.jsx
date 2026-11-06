import React from 'react';
import * as api from '../api.js';
import { plural } from '../format.js';
import { useApp, useResource } from '../hooks.js';
import { Empty, LoadError, Loading, Page, Skills, Zone } from '../ui.jsx';

export function PersonList({ people }) {
  return (
    <ul className="people">
      {people.map(person => (
        <li key={person.id} className="person">
          <div className="person-head">
            <h3>{person.name}</h3>
            <span className="figure muted">Score {person.score}</span>
          </div>
          <p className="person-reason">{person.reason}</p>
          <Skills skills={person.skills} label={`Skills of ${person.name}`} />
          <p className="muted"><Zone zone={person.timezone} /></p>
        </li>
      ))}
    </ul>
  );
}

export function useSuggestions() {
  return useResource(signal => api.getSuggestions(signal), 'suggestions');
}

export function PeoplePage() {
  const { teamId } = useApp();
  const people = useSuggestions();
  return (
    <Page
      title="People"
      intro={teamId
        ? 'People without a team, ranked by the skills your team lacks and how close their time zone is to yours'
        : 'People without a team, ranked by the skills you lack and how close their time zone is to yours'}
    >
      <p className="muted">
        Contact details stay private, so Crewboard does not message anyone for you.{' '}
        {teamId ? <>Leaders can share an invite code from <a href={`#/teams/${teamId}`}>their team</a> wherever the event chats.</> : 'Meet in the event chat, then exchange an invite code.'}
      </p>
      {people.error && <LoadError error={people.error} onRetry={people.retry} />}
      {people.loading && !people.data && <Loading label="Finding people" />}
      {people.data && (people.data.length
        ? <section aria-labelledby="people-count"><h2 id="people-count">{plural(people.data.length, 'suggestion')}</h2><PersonList people={people.data} /></section>
        : <Empty title="No suggestions right now"><p>Everyone else may already be on a team. Check back as more people sign up.</p></Empty>)}
    </Page>
  );
}
