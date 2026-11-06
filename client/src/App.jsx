import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as api from './api.js';
import { AppContext, useAction, useFocusRescue, useHashRoute, useResource } from './hooks.js';
import { useLiveTick } from './live.js';
import { errorText, plural } from './format.js';
import { Button, Loading, LoadError, Page } from './ui.jsx';
import { AuthPage } from './pages/Auth.jsx';
import { BoardPage } from './pages/Board.jsx';
import { CreateTeamPage } from './pages/CreateTeam.jsx';
import { JoinPage } from './pages/Join.jsx';
import { OverviewPage } from './pages/Overview.jsx';
import { PeoplePage } from './pages/People.jsx';
import { TeamPage } from './pages/Team.jsx';

const TEAM_ROUTE = /^\/teams\/([A-Za-z0-9-]{1,64})$/;
const CONNECTION_TEXT = { connecting: 'Connecting', live: 'Live', reconnecting: 'Reconnecting' };

function NotFound() {
  return (
    <Page title="Page not found">
      <p>This address does not match anything in Crewboard.</p>
      <p><a href="#/">Go to overview</a></p>
    </Page>
  );
}
function focusMain(event) {
  event.preventDefault();
  document.querySelector('main h1')?.focus();
}

function Signedin({ user, teamId, setSession, refreshSession, endSession }) {
  const route = useHashRoute();
  const { tick, connection } = useLiveTick(true);
  const [notice, setNotice] = useState('');
  const signOut = useAction();
  const main = useRef(null);
  useFocusRescue(main);

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

  const context = useMemo(() => ({
    user, teamId, tick, announce, refreshSession: safeRefresh, ownTeam
  }), [user, teamId, tick, announce, safeRefresh, ownTeam]);

  const handleLogout = () => signOut.run(async () => {
    await api.logout();
    api.forgetKeys();
    window.location.hash = '/';
    setSession(current => ({ ...current, user: null, teamId: null }));
  });

  const teamMatch = TEAM_ROUTE.exec(route.path);
  const links = [
    ['/', 'Overview'],
    ['/board', 'Board'],
    ...(teamId ? [[`/teams/${teamId}`, inboxCount ? `My team (${inboxCount})` : 'My team']] : []),
    ['/people', 'People']
  ];

  let page;
  if (route.path === '/') page = <OverviewPage />;
  else if (route.path === '/board') page = <BoardPage initial={route.params} />;
  else if (route.path === '/people') page = <PeoplePage />;
  else if (route.path === '/new') page = <CreateTeamPage />;
  else if (route.path === '/join') page = <JoinPage initialCode={route.params.get('code') ?? ''} />;
  else if (teamMatch) page = <TeamPage id={teamMatch[1]} />;
  else page = <NotFound />;

  return (
    <AppContext.Provider value={context}>
      <a className="skip-link" href="#main" onClick={focusMain}>Skip to content</a>
      <div className="shell">
        <header className="rail">
          <a className="brand" href="#/"><span className="brand-mark" aria-hidden="true" />Crewboard</a>
          <nav aria-label="Main">
            <p className="rail-label" aria-hidden="true">Workspace / 01</p>
            <ul>
              {links.map(([path, label]) => (
                <li key={path}>
                  <a href={`#${path}`} aria-current={route.path === path ? 'page' : undefined}>{label}</a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="rail-foot">
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
        <main ref={main} id="main"><React.Fragment key={route.path}>{page}</React.Fragment></main>
      </div>
      <p className="toast" role="status">{notice}</p>
    </AppContext.Provider>
  );
}

export function App() {
  const [session, setSession] = useState({ status: 'loading', user: null, teamId: null, error: null });
  const [endedNotice, setEndedNotice] = useState('');

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
    setSession({ status: 'ready', user: me.user, teamId: me.teamId, error: null });
  }, []);

  if (session.status === 'loading') return <main className="center"><Loading label="Loading Crewboard" kind="session" /></main>;
  if (session.status === 'error') {
    return (
      <main className="center">
        <h1>Crewboard</h1>
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
    />
  );
}
