import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as api from './api.js';
import { AppContext, useAction, useFocusRescue, useHashRoute, useResource } from './hooks.js';
import { useLiveTick } from './live.js';
import { errorText, plural } from './format.js';
import { Button, Loading, LoadError, Page } from './ui.jsx';
import { AuthPage } from './pages/Auth.jsx';
import { BoardPage } from './pages/Board.jsx';
import { CreateTeamPage, EditTeamPage } from './pages/CreateTeam.jsx';
import { JoinPage } from './pages/Join.jsx';
import { OverviewPage } from './pages/Overview.jsx';
import { PeoplePage } from './pages/People.jsx';
import { EditProfilePage, ProfilePage } from './pages/Profile.jsx';
import { TeamPage } from './pages/Team.jsx';

const TEAM_ROUTE = /^\/teams\/([A-Za-z0-9-]{1,64})(\/edit)?$/;
const PERSON_ROUTE = /^\/people\/([A-Za-z0-9-]{1,64})$/;
const CONNECTION_TEXT = { connecting: 'Connecting', live: 'Live', reconnecting: 'Reconnecting' };
const NAV_ICONS = {
  Overview: 'M3 10l9-7 9 7v11h-6v-7H9v7H3z',
  Board: 'M3 4h18v16H3zM9 4v16m6-16v16',
  'My team': 'M3 6h18v13H3zM3 10h18m-12 3v3m6-3v3',
  People: 'M8 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-7a3 3 0 0 1 0 6M2 21v-1a6 6 0 0 1 12 0v1m2-6a5 5 0 0 1 6 5v1',
  Profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21v-1a8 8 0 0 1 16 0v1'
};

function RailIcon({ path }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg>;
}

function NotFound() {
  return (
    <Page title="Page not found">
      <p>This address does not match anything in Seatsplice.</p>
      <p><a href="#/">Browse teams</a></p>
    </Page>
  );
}
function focusMain(event) {
  event.preventDefault();
  document.querySelector('main h1')?.focus();
}

function Signedin({ user, teamId, setSession, refreshSession, endSession, showWelcome }) {
  const route = useHashRoute();
  const { tick, connection } = useLiveTick(true, api.clearBoardPrefetch);
  const [notice, setNotice] = useState('');
  const [tabReveal, setTabReveal] = useState(null);
  const [compact, setCompact] = useState(false);
  const [welcomePath, setWelcomePath] = useState(showWelcome ? route.path : null);
  const signOut = useAction();
  const main = useRef(null);
  const boardMemory = useRef({ display: 'gallery', filters: '', cursors: [null], selected: null });
  const peopleMemory = useRef({ query: '', selected: null });
  useFocusRescue(main);

  useEffect(() => {
    if (window.location.hash === '#/overview') {
      api.prefetchBoard();
    }
    return api.clearBoardPrefetch;
  }, []);

  useEffect(() => {
    if (welcomePath && welcomePath !== route.path) setWelcomePath(null);
  }, [route.path, welcomePath]);

  const announce = useCallback(message => setNotice(message), []);
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(''), 8000);
    return () => clearTimeout(timer);
  }, [notice]);

  // Live: membership can change because someone else acted (approval, removal).
  const knownTeam = useRef(teamId);
  knownTeam.current = teamId;
  const lastTick = useRef(tick);
  useEffect(() => {
    if (tick === lastTick.current) return;
    lastTick.current = tick;
    api.getMe().then(me => {
      if (!me.user) {
        endSession();
        return;
      }
      const before = knownTeam.current; // Read late, so the user's own actions are not reported as news.
      setSession(current => ({ ...current, user: me.user, teamId: me.teamId }));
      if (before !== me.teamId) {
        announce(me.teamId ? 'Your join request was approved. You are on a team now' : 'You are no longer on a team');
      }
    }).catch(() => { /* The connection indicator and the next tick cover passing failures. */ });
  }, [tick, setSession, announce, endSession]);

  const ownTeam = useResource(signal => api.getTeam(teamId, signal), teamId, tick);
  const inboxCount = ownTeam.data?.leaderId === user.id ? ownTeam.data.requests?.length ?? 0 : 0;

  const lastInbox = useRef(null);
  useEffect(() => {
    if (!ownTeam.data) return;
    if (lastInbox.current !== null && inboxCount > lastInbox.current) {
      announce(`${plural(inboxCount, 'join request')} waiting for you`);
    }
    lastInbox.current = inboxCount;
  }, [ownTeam.data, inboxCount, announce]);

  // A failed refresh must not make a completed action look failed. The next live tick catches up.
  const safeRefresh = useCallback(() => refreshSession().catch(() => null), [refreshSession]);
  const updateProfile = useCallback(profile => setSession(current => (
    current.user?.id === profile.id ? { ...current, user: { ...current.user, ...profile } } : current
  )), [setSession]);

  const context = useMemo(() => ({
    user, teamId, tick, announce, refreshSession: safeRefresh, ownTeam, boardMemory, peopleMemory, updateProfile
  }), [user, teamId, tick, announce, safeRefresh, ownTeam, updateProfile]);

  const handleLogout = () => signOut.run(async () => {
    await api.logout();
    api.forgetKeys();
    window.location.hash = '/';
    setSession(current => ({ ...current, user: null, teamId: null }));
  });

  const teamMatch = TEAM_ROUTE.exec(route.path);
  const personMatch = PERSON_ROUTE.exec(route.path);
  const onBoard = route.path === '/' || route.path === '/board';
  const mainStyle = onBoard ? 'board-view' : route.path === '/people' ? 'people-view'
    : personMatch || (teamMatch && !teamMatch[2]) ? 'gallery-detail' : undefined;
  const links = [
    ['/board', 'Board'],
    ['/people', 'People'],
    ['/overview', 'Overview'],
    ...(teamId ? [[`/teams/${teamId}`, inboxCount ? `My team (${inboxCount})` : 'My team']] : []),
    [`/people/${user.id}`, 'Profile']
  ];

  let page;
  if (onBoard) page = <BoardPage initial={route.params} path={route.path} showWelcome={welcomePath === route.path} />;
  else if (route.path === '/overview') page = <OverviewPage />;
  else if (route.path === '/people') page = <PeoplePage />;
  else if (route.path === '/profile/edit') page = <EditProfilePage />;
  else if (personMatch) page = <ProfilePage id={personMatch[1]} />;
  else if (route.path === '/new') page = <CreateTeamPage />;
  else if (route.path === '/join') page = <JoinPage initialCode={route.params.get('code') ?? ''} />;
  else if (teamMatch) page = teamMatch[2] ? <EditTeamPage id={teamMatch[1]} /> : <TeamPage id={teamMatch[1]} />;
  else page = <NotFound />;

  return (
    <AppContext.Provider value={context}>
      <a className="skip-link" href="#main" onClick={focusMain}>Skip to content</a>
      <div className={compact ? 'shell rail-compact' : 'shell'}>
        <header className="rail">
          <div className="rail-top">
            <a className="brand" href="#/" title="Seatsplice"><span className="brand-mark" aria-hidden="true" /><span className="rail-text">Seatsplice</span></a>
            <Button className="rail-toggle" aria-label={compact ? 'Expand sidebar' : 'Collapse sidebar'} aria-controls="main-navigation sidebar-details" aria-expanded={!compact} title={compact ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setCompact(value => !value)}>
              <RailIcon path={compact ? 'M3 4h18v16H3zM8 4v16m4-11 3 3-3 3' : 'M3 4h18v16H3zM8 4v16m7-11-3 3 3 3'} />
            </Button>
          </div>
          <nav id="main-navigation" aria-label="Main">
            <p className="rail-label" aria-hidden="true">Workspace</p>
            <ul>
              {links.map(([path, label], index) => (
                <li key={path} className={index < 2 ? 'rail-primary' : undefined}>
                  <a href={`#${path}`} title={label} aria-current={route.path === path || (onBoard && path === '/board') ? 'page' : undefined} onClick={event => {
                    if (path !== route.path && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
                      && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                      setTabReveal(path);
                    }
                  }}><RailIcon path={NAV_ICONS[label.startsWith('My team') ? 'My team' : label]} /><span className="rail-text">{label}</span></a>
                </li>
              ))}
            </ul>
          </nav>
          <div id="sidebar-details" className="rail-foot">
            <p className={`connection connection-${connection}`}>
              <span className="connection-dot" aria-hidden="true" />
              <span><span className="visually-hidden">Updates: </span>{CONNECTION_TEXT[connection]}</span>
            </p>
            <p className="rail-user">{user.name}</p>
            <Button busy={signOut.busy} busyLabel="Logging out" onClick={handleLogout}>Log out</Button>
            {signOut.error && <p className="field-error" role="alert">{errorText(signOut.error)}</p>}
            <p className="rail-stamp">May contain traces of recursion.</p>
          </div>
        </header>
        <main ref={main} id="main" className={mainStyle}>
          <React.Fragment key={route.path}>
            {page}
            {tabReveal === route.path && (
              <div className="tab-blinds" aria-hidden="true" onAnimationEnd={event => {
                if (event.target === event.currentTarget.lastElementChild) setTabReveal(null);
              }}><span /><span /><span /><span /><span /></div>
            )}
          </React.Fragment>
        </main>
      </div>
      <p className="toast" role="status">{notice}</p>
    </AppContext.Provider>
  );
}

export function App() {
  const [session, setSession] = useState({ status: 'loading', user: null, teamId: null, error: null });
  const [endedNotice, setEndedNotice] = useState('');
  const [showWelcome, setShowWelcome] = useState(false);

  const refreshSession = useCallback(async () => {
    const me = await api.getMe();
    setSession({ status: 'ready', user: me.user, teamId: me.teamId, error: null });
    return me;
  }, []);

  const start = useCallback(() => {
    setSession(current => ({ ...current, status: 'loading', error: null }));
    refreshSession().catch(error => setSession(current => (
      current.status === 'ready' ? current : { status: 'error', user: null, teamId: null, error }
    )));
  }, [refreshSession]);

  const endSession = useCallback(() => {
    api.forgetKeys();
    setSession(current => {
      if (current.user) setEndedNotice('Your session ended. Log in to continue');
      return { status: 'ready', user: null, teamId: null, error: null };
    });
  }, []);

  useEffect(() => {
    api.setUnauthorizedHandler(endSession);
    start();
    return () => api.setUnauthorizedHandler(() => {});
  }, [start, endSession]);

  const signedIn = useCallback(me => {
    setEndedNotice('');
    setShowWelcome(true);
    setSession({ status: 'ready', user: me.user, teamId: me.teamId, error: null });
  }, []);

  if (session.status === 'loading') return <main className="center"><Loading label="Loading Seatsplice" kind="session" /></main>;
  if (session.status === 'error') {
    return (
      <main className="center">
        <h1>Seatsplice</h1>
        <LoadError error={session.error} onRetry={start} />
      </main>
    );
  }
  if (!session.user) return <AuthPage notice={endedNotice} onSignedIn={signedIn} refreshSession={refreshSession} />;

  // Keying by user discards every piece of per-user state when the account changes.
  return (
    <Signedin
      key={session.user.id}
      user={session.user}
      teamId={session.teamId}
      setSession={setSession}
      refreshSession={refreshSession}
      endSession={endSession}
      showWelcome={showWelcome}
    />
  );
}
