import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as api from '../api.js';
import { auditText, formatClock, plural, zoneLabel } from '../format.js';
import { navigate, useAction, useApp, useResource } from '../hooks.js';
import { Button, ConfirmDialog, Empty, InlineError, LoadError, Loading, Page, Seats, Skills, Time, Zone } from '../ui.jsx';

function JoinPanel({ team, resource }) {
  const { teamId, refreshSession, announce } = useApp();
  const action = useAction();

  const ask = () => action.run(async () => {
    const result = await api.requestJoin(team.id);
    announce(`Request sent to ${team.leaderName}`);
    await Promise.all([refreshSession(), resource.reload()]);
    return result;
  });

  if (teamId) {
    return <p className="callout">You are on another team. <a href={`#/teams/${teamId}`}>Go to my team</a> if you want to leave it first.</p>;
  }
  // A person who left or was removed still has an old "approved" record, so only pending blocks a new ask.
  const status = team.ownRequest?.status;
  if (status === 'pending') {
    const withdraw = () => action.run(async () => {
      await api.withdrawRequest(team.id, team.ownRequest.id);
      announce('Request withdrawn');
      await resource.reload();
    });
    return (
      <div className="callout">
        <p role="status">Request sent. {team.leaderName} decides next, and this page updates when they do.</p>
        <Button busy={action.busy} busyLabel="Withdrawing" onClick={withdraw}>Withdraw request</Button>
        <InlineError error={action.error} />
      </div>
    );
  }
  if (team.memberCount >= team.maxSize) {
    return <p className="callout">This team is full. A seat opens if someone leaves.</p>;
  }
  return (
    <div className="callout">
      {status === 'declined' && <p>{team.leaderName} declined your last request. You can ask again after a minute.</p>}
      <Button variant="primary" busy={action.busy} busyLabel="Sending request" onClick={ask}>Request to join</Button>
      <InlineError error={action.error} />
    </div>
  );
}

function Members({ team, isLeader, currentUserId, resource }) {
  const { announce } = useApp();
  const [removing, setRemoving] = useState(null);
  const action = useAction();
  const heading = useRef(null);
  const focusHeadingOnClose = useRef(false);

  // The modal blocks focus outside it, so focus can only move once it has closed.
  useEffect(() => {
    if (removing || !focusHeadingOnClose.current) return;
    focusHeadingOnClose.current = false;
    heading.current?.focus(); // The removed member's row and button are gone.
  }, [removing]);

  const confirm = () => action.run(async () => {
    await api.removeMember(team.id, removing.id);
    announce(`${removing.name} removed from the team`);
    await resource.reload();
    focusHeadingOnClose.current = true;
    setRemoving(null);
  });

  return (
    <section aria-labelledby="members-heading" className="panel">
      <h2 id="members-heading" ref={heading} tabIndex={-1}>Members</h2>
      <ul className="members">
        {team.members.map(member => (
          <li key={member.id} className="member">
            <div>
              <p className="member-name">
                <a href={`#/people/${member.id}`}>{member.name}</a>
                {member.id === team.leaderId && <span className="tag">Leader</span>}
                {member.id === currentUserId && <span className="tag">You</span>}
              </p>
              <p className="muted"><Zone zone={member.timezone} /></p>
              <Skills skills={member.skills} label={`Skills of ${member.name}`} />
            </div>
            {isLeader && member.id !== currentUserId && (
              <Button aria-label={`Remove ${member.name}`} onClick={() => { action.clearError(); setRemoving(member); }}>Remove</Button>
            )}
          </li>
        ))}
      </ul>
      {removing && (
        <ConfirmDialog
          title={`Remove ${removing.name}?`}
          confirmLabel="Remove member"
          busy={action.busy}
          error={action.error}
          onConfirm={confirm}
          onClose={() => setRemoving(null)}
        >
          <p>Their seat opens up. They can ask to join again, and you decide.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}

function Inbox({ team, resource, refreshSession }) {
  const { announce } = useApp();
  const action = useAction();
  const [activeId, setActiveId] = useState(null);
  const heading = useRef(null);
  const list = useRef(null);
  const nextFocusIndex = useRef(null);
  const requests = team.requests ?? [];

  // After a decision the row disappears, so focus moves to the next request, or the heading if none.
  // The time limit stops a failed reload from moving focus during some later live update.
  useLayoutEffect(() => {
    const pending = nextFocusIndex.current;
    nextFocusIndex.current = null;
    if (!pending || Date.now() - pending.at > 3000) return;
    const rows = list.current?.querySelectorAll('[data-approve]') ?? [];
    (rows[Math.min(pending.index, rows.length - 1)] ?? heading.current)?.focus();
  }, [team]);

  const decide = (request, index, decision) => {
    setActiveId(request.id);
    return action.run(async () => {
      await api.decideRequest(team.id, request.id, decision);
      announce(`${request.user.name} ${decision === 'approve' ? 'approved' : 'declined'}`);
      nextFocusIndex.current = { index, at: Date.now() };
      await Promise.all([resource.reload(), refreshSession()]);
    }).then(succeeded => {
      if (!succeeded) resource.reload(); // A conflict means the shown state is out of date.
    });
  };

  return (
    <section aria-labelledby="inbox-heading" className="panel">
      <div className="section-head">
        <h2 id="inbox-heading" ref={heading} tabIndex={-1}>Join requests</h2>
        <span className="figure muted">{requests.length ? plural(requests.length, 'waiting', 'waiting') : ''}</span>
      </div>
      <InlineError error={action.error} />
      {requests.length > 0 && team.memberCount >= team.maxSize && <p className="muted">The team is full. Approving needs a free seat, so a member has to leave first.</p>}
      {requests.length === 0 ? <p className="muted">No requests waiting. New ones appear here on their own.</p> : (
        <ul ref={list} className="members">
          {requests.map((request, index) => (
            <li key={request.id} className="member">
              <div>
                <p className="member-name"><a href={`#/people/${request.user.id}`}>{request.user.name}</a></p>
                <p className="muted"><Zone zone={request.user.timezone} /> · asked <Time value={request.createdAt} /></p>
                <Skills skills={request.user.skills} label={`Skills of ${request.user.name}`} />
              </div>
              <div className="row row-tight">
                <Button
                  data-approve
                  variant="primary"
                  aria-label={`Approve ${request.user.name}`}
                  busy={action.busy && activeId === request.id}
                  busyLabel="Working"
                  onClick={() => decide(request, index, 'approve')}
                >
                  Approve
                </Button>
                <Button
                  aria-label={`Decline ${request.user.name}`}
                  busy={action.busy && activeId === request.id}
                  busyLabel="Working"
                  onClick={() => decide(request, index, 'decline')}
                >
                  Decline
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function useCopy() {
  const [copied, setCopied] = useState('');
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  return {
    copied,
    copy: async (text, label, input) => {
      clearTimeout(timer.current);
      try {
        await navigator.clipboard.writeText(text);
        setCopied(`${label} copied`);
      } catch {
        input?.focus();
        input?.select();
        setCopied(`Could not reach the clipboard. ${label} is selected, so press Ctrl or Command and C`);
      }
      timer.current = setTimeout(() => setCopied(''), 6000);
    }
  };
}

function Invites({ team }) {
  const [invite, setInvite] = useState(null);
  const [expired, setExpired] = useState(false);
  const action = useAction();
  const { copied, copy } = useCopy();
  const codeInput = useRef(null);
  const linkInput = useRef(null);
  const full = team.memberCount >= team.maxSize;

  useEffect(() => {
    if (!invite) return undefined;
    const remaining = new Date(invite.expiresAt).getTime() - Date.now();
    setExpired(remaining <= 0);
    // setTimeout overflows above about 24.8 days, and the invite check is only for display.
    const timer = setTimeout(() => setExpired(true), Math.min(Math.max(remaining, 0), 2 ** 31 - 1));
    return () => clearTimeout(timer);
  }, [invite]);

  const generate = () => action.run(async () => {
    setInvite(await api.createInvite(team.id));
    requestAnimationFrame(() => codeInput.current?.focus());
  });

  const link = invite ? `${window.location.origin}${window.location.pathname}#/join?code=${encodeURIComponent(invite.code)}` : '';

  return (
    <section aria-labelledby="invite-heading" className="panel">
      <h2 id="invite-heading">Invite code</h2>
      <p className="muted">This preapproves one seat. Share it with one person you trust. It expires in an hour.</p>
      {invite && !expired && (
        <div className="invite">
          <label htmlFor="invite-code">Code</label>
          <div className="row row-tight">
            <input ref={codeInput} id="invite-code" className="mono" readOnly value={invite.code} onFocus={event => event.target.select()} />
            <Button data-copied={copied === 'Code copied'} onClick={() => copy(invite.code, 'Code', codeInput.current)}>
              {copied === 'Code copied' ? '✓ Copied' : 'Copy code'}
            </Button>
          </div>
          <label htmlFor="invite-link">Link</label>
          <div className="row row-tight">
            <input ref={linkInput} id="invite-link" className="mono" readOnly value={link} onFocus={event => event.target.select()} />
            <Button data-copied={copied === 'Link copied'} onClick={() => copy(link, 'Link', linkInput.current)}>
              {copied === 'Link copied' ? '✓ Copied' : 'Copy link'}
            </Button>
          </div>
          <p className="muted">Expires <Time value={invite.expiresAt} /></p>
        </div>
      )}
      {invite && expired && <p className="callout">That code has expired. Create a new one.</p>}
      <p className="visually-hidden" role="status">{copied}</p>
      {copied.startsWith('Could not') && <p className="muted" aria-hidden="true">{copied}</p>}
      <InlineError error={action.error} />
      {full
        ? <p className="muted">The team is full, so new codes are not available.</p>
        : <Button busy={action.busy} busyLabel="Creating code" onClick={generate}>{invite ? 'Create another code' : 'Create invite code'}</Button>}
    </section>
  );
}

function Audit({ entries }) {
  return (
    <section aria-labelledby="audit-heading" className="panel">
      <h2 id="audit-heading">Audit trail</h2>
      <p className="muted">Team changes, newest first. Only members can see this.</p>
      {entries.length === 0 ? <Empty title="No changes recorded yet" /> : (
        <ol className="audit">
          {entries.map(entry => (
            <li key={entry.id}>
              <span>{auditText(entry)}</span>
              <span className="muted"><Time value={entry.createdAt} /></span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function LeaveControl({ team, isLeader }) {
  const { announce, refreshSession } = useApp();
  const [open, setOpen] = useState(false);
  const action = useAction();
  const alone = team.memberCount <= 1;

  const leave = () => action.run(async () => {
    await api.leaveTeam(team.id);
    announce(alone ? `You left and ${team.name} was deleted` : `You left ${team.name}`);
    navigate('/');
    await refreshSession();
  });

  let consequence = 'Your seat opens up. To come back you will need to ask again.';
  if (alone) consequence = 'You are the last member, so the team and its pending requests will be deleted.';
  else if (isLeader) consequence = 'Leadership passes to the longest-serving remaining member, and invite codes you created stop working.';

  return (
    <>
      <Button variant="danger-quiet" onClick={() => { action.clearError(); setOpen(true); }}>Leave team</Button>
      {open && (
        <ConfirmDialog
          title={`Leave ${team.name}?`}
          confirmLabel={alone ? 'Leave and delete team' : 'Leave team'}
          busy={action.busy}
          error={action.error}
          onConfirm={leave}
          onClose={() => setOpen(false)}
        >
          <p>{consequence}</p>
        </ConfirmDialog>
      )}
    </>
  );
}

function TeamDetail({ team, resource }) {
  const { user, refreshSession } = useApp();
  const isLeader = team.leaderId === user.id;
  const isMember = team.members.some(member => member.id === user.id);

  return (
    <div className="team">
      <section className="team-summary panel panel-lead" aria-label="Team summary">
        {team.sample && <p className="sample-label">Sample team</p>}
        {team.description && <p className="team-description">{team.description}</p>}
        <Seats team={team} />
        <dl className="details">
          <dt>Leader</dt><dd>{team.leaderName}</dd>
          <dt>Time zone</dt><dd>{zoneLabel(team.timezone)}</dd>
          <dt>Size</dt><dd>Up to {team.maxSize} seats, active from {team.minSize}</dd>
        </dl>
        <Skills skills={team.skills} label="Skills the team wants" />
        {isMember && <div className="row team-actions">
          {isLeader && <a className="button" href={`#/teams/${team.id}/edit`}>Edit team</a>}
          <LeaveControl team={team} isLeader={isLeader} />
        </div>}
        {!isMember && (team.sample
          ? <p className="muted">This sample is for browsing. You can request a seat on a team led by a participant.</p>
          : <JoinPanel team={team} resource={resource} />)}
      </section>
      {isLeader && <Inbox team={team} resource={resource} refreshSession={refreshSession} />}
      {isLeader && <Invites team={team} />}
      <Members team={team} isLeader={isLeader} currentUserId={user.id} resource={resource} />
      {isMember && <Audit entries={team.audit ?? []} />}
    </div>
  );
}

export function TeamPage({ id }) {
  const { teamId, ownTeam, tick } = useApp();
  const isOwn = id === teamId;
  // My team is already loaded by the shell, so it is not fetched twice.
  const other = useResource(signal => api.getTeam(id, signal), isOwn ? null : id, tick);
  const resource = isOwn ? ownTeam : other;
  const team = resource.data?.id === id ? resource.data : null;

  return (
    <Page title={team?.name ?? 'Team'}>
      {resource.stale && resource.updatedAt && <p className="muted">Could not refresh. Showing details from {formatClock(resource.updatedAt)}</p>}
      {!team && !resource.error && <Loading label="Loading team" kind="team" />}
      {resource.error?.status === 404 && (
        <Empty title="This team is no longer available">
          <p>It may have been deleted when its last member left. <a href="#/board">Back to the board</a></p>
        </Empty>
      )}
      {resource.error && resource.error.status !== 404 && <LoadError error={resource.error} onRetry={resource.retry} />}
      {team && <TeamDetail team={team} resource={resource} />}
    </Page>
  );
}
