import React, { useState } from 'react';
import * as api from '../api.js';
import { LIMITS, SIZES, browserTimezone } from '../format.js';
import { navigate, useAction, useApp } from '../hooks.js';
import { Button, Field, FormError, Page, SkillsInput, TimezoneSelect, useFocusFirstInvalid } from '../ui.jsx';

function SizeSelect({ value, onChange, ...field }) {
  return (
    <select {...field} value={value} onChange={event => onChange(Number(event.target.value))}>
      {SIZES.map(size => <option key={size} value={size}>{size}</option>)}
    </select>
  );
}

export function CreateTeamPage() {
  const { teamId, refreshSession, announce } = useApp();
  const [values, setValues] = useState({
    name: '', description: '', skills: [], timezone: browserTimezone(), minSize: 2, maxSize: 6
  });
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
    setErrors(found);
    if (Object.keys(found).length) return;
    action.run(async () => {
      const { id } = await api.createTeam({ ...values, name, description: values.description.trim() });
      await refreshSession();
      announce(`${name} created. You are its leader`);
      navigate(`/teams/${id}`);
    });
  }

  if (teamId) {
    return (
      <Page title="Create a team">
        <p>You are already on a team, and each person can be on one team only.</p>
        <p><a href={`#/teams/${teamId}`}>Go to my team</a></p>
      </Page>
    );
  }

  return (
    <Page title="Create a team" intro="You become the leader and take the first seat">
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
        <Field label="Team time zone" hint="Set from this browser">
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
          <Button type="submit" variant="primary" busy={action.busy} busyLabel="Creating team">Create team</Button>
          <a className="button button-quiet" href="#/">Cancel</a>
        </div>
      </form>
    </Page>
  );
}
