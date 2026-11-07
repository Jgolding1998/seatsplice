import React, { useState } from 'react';
import * as api from '../api.js';
import { LIMITS, SIZES, browserTimezone } from '../format.js';
import { navigate, useAction, useApp } from '../hooks.js';
import { Button, Field, FormError, LoadError, Loading, Page, SkillsInput, TimezoneSelect, useFocusFirstInvalid } from '../ui.jsx';

function SizeSelect({ value, onChange, ...field }) {
  return (
    <select {...field} value={value} onChange={event => onChange(Number(event.target.value))}>
      {SIZES.map(size => <option key={size} value={size}>{size}</option>)}
    </select>
  );
}

function TeamForm({ team }) {
  const { refreshSession, announce, ownTeam } = useApp();
  const [values, setValues] = useState(() => ({
    name: team?.name ?? '', description: team?.description ?? '', skills: team?.skills ?? [],
    timezone: team?.timezone ?? browserTimezone(), minSize: team?.minSize ?? 2, maxSize: team?.maxSize ?? 6
  }));
  const [errors, setErrors] = useState({});
  const action = useAction();
  const form = useFocusFirstInvalid(errors);
  const set = (key, value) => setValues(current => ({ ...current, [key]: value }));

  function submit(event) {
    event.preventDefault();
    const found = {};
    const name = values.name.trim();
    if (name.length < LIMITS.teamName[0]) found.name = `Enter at least ${LIMITS.teamName[0]} characters`;
    if (!values.skills.length) found.skills = 'Add at least one skill, so people can find your team';
    if (values.minSize > values.maxSize) found.maxSize = 'Maximum must be at least the minimum';
    if (team && values.maxSize < team.memberCount) found.maxSize = 'Maximum must fit everyone on your team';
    setErrors(found);
    if (Object.keys(found).length) return;
    action.run(async () => {
      const data = { ...values, name, description: values.description.trim() };
      const { id } = team ? await api.editTeam(team.id, data) : await api.createTeam(data);
      if (team) await ownTeam.reload();
      else await refreshSession();
      announce(team ? 'Team updated' : `${name} created. You are its leader`);
      navigate(`/teams/${id}`);
    });
  }

  return (
    <Page title={team ? 'Edit team' : 'Create a team'} intro={team ? 'Update what you’re building and who you need.' : 'You become the leader and take the first seat'}>
      <form ref={form} className="form-narrow" onSubmit={submit} noValidate>
        <FormError error={action.error} />
        <Field label="Team name" error={errors.name}>
          {field => <input {...field} value={values.name} maxLength={LIMITS.teamName[1]} autoComplete="off" onChange={event => set('name', event.target.value)} />}
        </Field>
        <Field label="What you are building" hint={`Optional. ${values.description.length} of ${LIMITS.description} characters`}>
          {field => <textarea {...field} rows={4} value={values.description} maxLength={LIMITS.description} onChange={event => set('description', event.target.value)} />}
        </Field>
        <Field label="Skills the team wants" hint={`Press Enter after each one, up to ${LIMITS.skillCount}`} error={errors.skills}>
          {field => <SkillsInput value={values.skills} onChange={value => set('skills', value)} inputProps={field} />}
        </Field>
        <Field label="Team time zone">
          {field => <TimezoneSelect {...field} value={values.timezone} onChange={value => set('timezone', value)} />}
        </Field>
        <div className="row row-fields">
          <Field label="Minimum to be active" error={errors.minSize}>
            {field => <SizeSelect {...field} value={values.minSize} onChange={value => set('minSize', value)} />}
          </Field>
          <Field label="Maximum seats" error={errors.maxSize}>
            {field => <SizeSelect {...field} value={values.maxSize} onChange={value => set('maxSize', value)} />}
          </Field>
        </div>
        <div className="row">
          <Button type="submit" variant="primary" busy={action.busy} busyLabel={team ? 'Saving team' : 'Creating team'}>{team ? 'Save team' : 'Create team'}</Button>
          <a className="button button-quiet" href={team ? `#/teams/${team.id}` : '#/'}>Cancel</a>
        </div>
      </form>
    </Page>
  );
}

export function CreateTeamPage() {
  const { teamId } = useApp();
  if (!teamId) return <TeamForm />;
  return (
    <Page title="Create a team">
      <p>You’re already on a team.</p>
      <p><a href={`#/teams/${teamId}`}>Go to my team</a></p>
    </Page>
  );
}

export function EditTeamPage({ id }) {
  const { teamId, user, ownTeam } = useApp();
  if (teamId === id && ownTeam.loading && !ownTeam.data) return <Page title="Edit team"><Loading label="Loading team" /></Page>;
  if (teamId === id && ownTeam.error) return <Page title="Edit team"><LoadError error={ownTeam.error} onRetry={ownTeam.retry} /></Page>;
  if (teamId === id && ownTeam.data?.leaderId === user.id) return <TeamForm team={ownTeam.data} />;
  return <Page title="Edit team"><p>Only the team leader can edit this team.</p><a href={`#/teams/${id}`}>View team</a></Page>;
}
