import React, { useEffect, useState } from 'react';
import * as api from '../api.js';
import { plural } from '../format.js';
import { useApp, useResource } from '../hooks.js';
import { Empty, LoadError, Loading, Page, Seats, Skills, Zone } from '../ui.jsx';
import { JoinForm } from './Join.jsx';
import { PersonList, useSuggestions } from './People.jsx';

const REQUEST_TEXT = {
  pending: 'Waiting for the leader',
  declined: 'Declined',
  approved: 'Approved',
  cancelled: 'Cancelled',
  withdrawn: 'Withdrawn'
};

function SentRequests() {
  const { user, tick } = useApp();
  const sent = useResource(api.getOwnRequests, user.id, tick, { keepData: true });
  if (sent.data?.length === 0 && !sent.error) return null;
  return (
    <section aria-labelledby="sent-heading" className="panel">
      <h2 id="sent-heading">Your requests</h2>
      {sent.loading && !sent.data && <Loading label="Checking your requests" />}
      {sent.error && <LoadError error={sent.error} onRetry={sent.retry} />}
      <ul className="plain-list">
        {sent.data?.map(({ id, teamId, teamName, status }) => (
          <li key={id} className="split">
            <a href={`#/teams/${encodeURIComponent(teamId)}`}>{teamName}</a>
            <span className="muted">{REQUEST_TEXT[status]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MyTeamPanel() {
  const { teamId, ownTeam, user } = useApp();
  const team = ownTeam.data;
  const inbox = team?.leaderId === user.id ? team.requests?.length ?? 0 : 0;
  return (
    <section aria-labelledby="my-team-heading" className="panel panel-lead">
      <h2 id="my-team-heading">My team</h2>
      {ownTeam.error && <LoadError error={ownTeam.error} onRetry={ownTeam.retry} />}
      {!team && ownTeam.loading && <Loading label="Loading your team" />}
      {team && (
        <>
          <p className="panel-title"><a href={`#/teams/${encodeURIComponent(teamId)}`}>{team.name}</a></p>
          <Seats team={team} />
          {team.leaderId === user.id && (
            <p className={inbox ? 'inbox-line' : 'muted'}>
              {inbox
                ? <a href={`#/teams/${encodeURIComponent(teamId)}`}>{plural(inbox, 'join request')} to review</a>
                : 'No join requests waiting'}
            </p>
          )}
        </>
      )}
    </section>
  );
}

function FindCrewPanel() {
  return (
    <section aria-labelledby="find-heading" className="panel panel-lead">
      <h2 id="find-heading">Find a crew</h2>
      <p>You are not on a team yet. Pick the way that suits you.</p>
      <div className="row">
        <a className="button button-primary" href="#/board">Browse open teams</a>
        <a className="button button-quiet" href="#/new">Create a team</a>
      </div>
      <h3 className="subhead">Have an invite code?</h3>
      <JoinForm />
    </section>
  );
}

export function Welcome({ name }) {
  const word = 'Welcome';
  const [text, setText] = useState(word);
  const first = name.trim().split(/\s+/)[0];
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const symbols = ['#', '+', '·', '◇', '/', '='];
    let frame = 0;
    const reveal = () => {
      setText([...word].map((letter, index) => index < frame ? letter : symbols[(index * 3 + frame) % symbols.length]).join(''));
      frame += 1;
      if (frame > word.length) clearInterval(timer);
    };
    const timer = setInterval(reveal, 52);
    reveal();
    return () => clearInterval(timer);
  }, []);
  return (
    <p className="crew-welcome" role="status">
      <span className="visually-hidden">Welcome, {first}.</span>
      <span aria-hidden="true"><span className="crew-welcome-word">{text}</span>, {first}.</span>
    </p>
  );
}

export function OverviewPage() {
  const { user, teamId } = useApp();
  const people = useSuggestions();
  return (
    <Page title="Overview">
      <div className="overview">
        <div className="overview-main">
          {teamId ? <MyTeamPanel /> : <FindCrewPanel />}
          <SentRequests />
          <section aria-labelledby="suggest-heading" className="panel">
            <div className="section-head">
              <h2 id="suggest-heading">Suggested teammates</h2>
              <a href="#/people">See all</a>
            </div>
            {people.error && <LoadError error={people.error} onRetry={people.retry} />}
            {people.loading && !people.data && <Loading label="Finding people" />}
            {people.data && (people.data.length
              ? <PersonList people={people.data.slice(0, 3)} />
              : <Empty title="No suggestions right now"><p>Everyone else may already be on a team.</p></Empty>)}
          </section>
        </div>
        <aside className="panel" aria-labelledby="profile-heading">
          <h2 id="profile-heading">Your profile</h2>
          <dl className="details">
            <dt>Name</dt><dd>{user.name}</dd>
            <dt>Email</dt><dd>{user.email} <span className="muted">(only you see this)</span></dd>
            <dt>Time zone</dt><dd><Zone zone={user.timezone} /></dd>
          </dl>
          <Skills skills={user.skills} label="Your skills" />
          <p><a href="#/profile/edit">Edit profile</a></p>
        </aside>
      </div>
    </Page>
  );
}
