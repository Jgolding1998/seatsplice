import React, { useState } from 'react';
import * as api from '../api.js';
import { LIMITS } from '../format.js';
import { navigate, useAction, useApp, useResource } from '../hooks.js';
import { Button, Empty, Field, FormError, LoadError, Loading, Page, Skills, SkillsInput, TimezoneSelect, Zone, useFocusFirstInvalid } from '../ui.jsx';

export function EditProfilePage() {
  const { user, updateProfile, announce } = useApp();
  const [name, setName] = useState(user.name);
  const [skills, setSkills] = useState(user.skills);
  const [timezone, setTimezone] = useState(user.timezone);
  const [lookingFor, setLookingFor] = useState(user.lookingFor ?? '');
  const [errors, setErrors] = useState({});
  const action = useAction();
  const form = useFocusFirstInvalid(errors);

  function submit(event) {
    event.preventDefault();
    const found = {};
    if (name.trim().length < LIMITS.name[0]) found.name = 'Enter at least 2 characters';
    if (!skills.length) found.skills = 'Add at least one skill';
    setErrors(found);
    if (Object.keys(found).length) return;
    action.run(async () => {
      updateProfile(await api.saveProfile({ name: name.trim(), skills, timezone, lookingFor: lookingFor.trim() }));
      announce('Profile saved');
      navigate(`/people/${user.id}`);
    });
  }

  return (
    <Page title="Edit profile" intro="Tell teammates what you can do and what you want to build.">
      <form ref={form} className="form-narrow" onSubmit={submit} noValidate>
        <FormError error={action.error} />
        <Field label="Display name" error={errors.name}>
          {field => <input {...field} value={name} autoComplete="name" maxLength={LIMITS.name[1]} onChange={event => setName(event.target.value)} />}
        </Field>
        <Field label="Your skills" hint="Press Enter after each skill" error={errors.skills}>
          {field => <SkillsInput value={skills} onChange={setSkills} inputProps={field} />}
        </Field>
        <Field label="Time zone">
          {field => <TimezoneSelect {...field} value={timezone} onChange={setTimezone} />}
        </Field>
        <Field label="What you’re looking for" hint="Optional. This appears on your profile.">
          {field => <textarea {...field} rows={3} maxLength={LIMITS.lookingFor} value={lookingFor} onChange={event => setLookingFor(event.target.value)} />}
        </Field>
        <div className="row">
          <Button type="submit" variant="primary" busy={action.busy} busyLabel="Saving profile">Save profile</Button>
          <a className="button button-quiet" href={`#/people/${user.id}`}>Cancel</a>
        </div>
      </form>
    </Page>
  );
}

export function ProfilePage({ id }) {
  const { user, tick } = useApp();
  const own = id === user.id;
  const resource = useResource(signal => api.getPerson(id, signal), own ? null : id, tick);
  const person = own ? user : resource.data;
  return (
    <Page title={person?.name ?? 'Profile'} eyebrow={person?.sample ? 'Sample participant' : own ? 'Your profile' : 'Participant profile'}>
      {resource.error?.status === 404 && <Empty title="This profile is no longer available" />}
      {resource.error && resource.error.status !== 404 && <LoadError error={resource.error} onRetry={resource.retry} />}
      {resource.loading && !person && <Loading label="Loading profile" />}
      {person && (
        <section className="panel profile-card" aria-label="Profile details">
          <dl className="details">
            <dt>Time zone</dt><dd><Zone zone={person.timezone} /></dd>
            {own && <><dt>Email</dt><dd>{user.email} <span className="muted">(private)</span></dd></>}
          </dl>
          <h2>Skills</h2>
          <Skills skills={person.skills} />
          {person.lookingFor && <><h2>Looking for</h2><p>{person.lookingFor}</p></>}
          {own && <a className="button button-primary" href="#/profile/edit">Edit profile</a>}
        </section>
      )}
      <p><a href="#/people">Browse people</a></p>
    </Page>
  );
}
