import React, { useLayoutEffect, useRef, useState } from 'react';
import * as api from '../api.js';
import { LIMITS, browserTimezone } from '../format.js';
import { useAction } from '../hooks.js';
import { Button, Field, FormError, Page, SkillsInput, TimezoneSelect, useFocusFirstInvalid } from '../ui.jsx';
import { SignalArt, signalGeometry } from './SignalArt.jsx';

const looksLikeEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const cleanEmail = value => value.replace(/[\s\u200B]+/g, '');

function PasswordField({ value, onChange, onPaste, error, hint, autoComplete }) {
  const [visible, setVisible] = useState(false);
  return (
    <Field label="Password" hint={hint} error={error}>
      {field => (
        <div className="row row-tight">
          <input
            {...field}
            type={visible ? 'text' : 'password'}
            value={value}
            maxLength={LIMITS.password[1]}
            autoComplete={autoComplete}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            onPaste={onPaste}
            onChange={event => onChange(event.target.value)}
          />
          <Button aria-label={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible(!visible)}>{visible ? 'Hide' : 'Show'}</Button>
        </div>
      )}
    </Field>
  );
}

// The server may answer with the /api/me shape; if not, ask for it.
const toSession = async (result, refreshSession) => (result?.user ? result : refreshSession());

function LoginForm({ onSignedIn, refreshSession, onSwitch }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pastedOriginal, setPastedOriginal] = useState(null);
  const [errors, setErrors] = useState({});
  const action = useAction();
  const form = useFocusFirstInvalid(errors);

  function pastePassword(event) {
    const input = event.currentTarget;
    if (input.value && (input.selectionStart !== 0 || input.selectionEnd !== input.value.length)) return;
    const original = event.clipboardData.getData('text/plain');
    const cleaned = original.replace(/^[\s\u200B]+|[\s\u200B]+$/g, '');
    if (original === cleaned || cleaned.length > LIMITS.password[1]) return;
    event.preventDefault();
    setPassword(cleaned);
    setPastedOriginal(original.length <= LIMITS.password[1] ? original : null);
  }

  function submit(event) {
    event.preventDefault();
    const address = cleanEmail(email);
    const found = {};
    if (!looksLikeEmail(address)) found.email = 'Enter your email address';
    if (!password) found.password = 'Enter your password';
    setErrors(found);
    if (Object.keys(found).length) return;
    action.run(async () => {
      const result = await api.login({ email: address, password }).catch(error => {
        if (error.code !== 'INVALID_LOGIN' || !pastedOriginal) throw error;
        return api.login({ email: address, password: pastedOriginal });
      });
      onSignedIn(await toSession(result, refreshSession));
    });
  }

  return (
    <form ref={form} onSubmit={submit} noValidate>
      <FormError error={action.error} />
      <Field label="Email" error={errors.email}>
        {field => <input {...field} type="email" value={email} autoComplete="username"
          autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={event => setEmail(cleanEmail(event.target.value))} />}
      </Field>
      <PasswordField value={password} onChange={value => { setPastedOriginal(null); setPassword(value); }}
        onPaste={pastePassword} error={errors.password} autoComplete="current-password" />
      <div className="row">
        <Button type="submit" variant="primary" busy={action.busy} busyLabel="Logging in">Log in</Button>
        <Button onClick={onSwitch}>Create an account</Button>
      </div>
    </form>
  );
}

function SignupForm({ onSignedIn, refreshSession, onSwitch }) {
  const [step, setStep] = useState(1);
  const [values, setValues] = useState({ name: '', email: '', password: '', skills: [], timezone: browserTimezone() });
  const [errors, setErrors] = useState({});
  const action = useAction();
  const form = useFocusFirstInvalid(errors);
  const stepHeading = useRef(null);
  const set = (key, value) => setValues(current => ({ ...current, [key]: value }));

  function goTo(next) {
    setStep(next);
    setErrors({});
    action.clearError();
    requestAnimationFrame(() => stepHeading.current?.focus());
  }

  function continueToProfile(event) {
    event.preventDefault();
    const found = {};
    const name = values.name.trim();
    if (name.length < LIMITS.name[0]) found.name = `Enter at least ${LIMITS.name[0]} characters`;
    if (!looksLikeEmail(values.email.trim())) found.email = 'Enter a valid email address';
    if (values.password.length < LIMITS.password[0]) found.password = `Use at least ${LIMITS.password[0]} characters`;
    setErrors(found);
    if (!Object.keys(found).length) goTo(2);
  }

  function createAccount(event) {
    event.preventDefault();
    if (!values.skills.length) {
      setErrors({ skills: 'Add at least one skill, so leaders know what you bring' });
      return;
    }
    setErrors({});
    action.run(async () => {
      const result = await api.register({
        name: values.name.trim(),
        email: values.email.trim(),
        password: values.password,
        skills: values.skills,
        timezone: values.timezone
      });
      onSignedIn(await toSession(result, refreshSession));
    });
  }

  if (step === 1) {
    return (
      <form ref={form} onSubmit={continueToProfile} noValidate>
        <h2 ref={stepHeading} tabIndex={-1}>Step 1 of 2: your account</h2>
        <FormError error={action.error} />
        <Field label="Name" hint="Other participants see this" error={errors.name}>
          {field => <input {...field} value={values.name} maxLength={LIMITS.name[1]} autoComplete="name" onChange={event => set('name', event.target.value)} />}
        </Field>
        <Field label="Email" hint="Only you see this" error={errors.email}>
          {field => <input {...field} type="email" value={values.email} autoComplete="email" onChange={event => set('email', event.target.value)} />}
        </Field>
        <PasswordField
          value={values.password}
          onChange={value => set('password', value)}
          error={errors.password}
          hint={`At least ${LIMITS.password[0]} characters`}
          autoComplete="new-password"
        />
        <div className="row">
          <Button type="submit" variant="primary">Continue</Button>
          <Button onClick={onSwitch}>I have an account</Button>
        </div>
      </form>
    );
  }

  return (
    <form ref={form} onSubmit={createAccount} noValidate>
      <h2 ref={stepHeading} tabIndex={-1}>Step 2 of 2: what you bring</h2>
      <FormError error={action.error}>
        {action.error?.code === 'ACCOUNT_EXISTS' && <Button onClick={onSwitch}>Log in instead</Button>}
      </FormError>
      <Field label="Your skills" hint={`Press Enter after each one, up to ${LIMITS.skillCount}`} error={errors.skills}>
        {field => <SkillsInput value={values.skills} onChange={value => set('skills', value)} inputProps={field} />}
      </Field>
      <Field label="Your time zone" hint="Set from this browser. Change it if you will work from elsewhere">
        {field => <TimezoneSelect {...field} value={values.timezone} onChange={value => set('timezone', value)} />}
      </Field>
      <div className="row">
        <Button type="submit" variant="primary" busy={action.busy} busyLabel="Creating account">Create account</Button>
        <Button onClick={() => goTo(1)}>Back</Button>
      </div>
    </form>
  );
}

export function AuthPage({ notice, onSignedIn, refreshSession }) {
  const invited = /^#\/join\?/.test(window.location.hash) &&
    Boolean(new URLSearchParams(window.location.hash.split('?')[1]).get('code'));
  const [opened, setOpened] = useState(false);
  const [mode, setMode] = useState(invited ? 'signup' : 'login');
  const formRef = useRef(null);
  const artRef = useRef(null);
  const previousArt = useRef(null);
  const expanded = opened || invited || Boolean(notice);
  const title = mode === 'login' ? 'Log in' : 'Create your account';
  const Form = mode === 'login' ? LoginForm : SignupForm;

  function openSignIn() {
    previousArt.current = artRef.current?.getBoundingClientRect();
    setOpened(true);
  }

  useLayoutEffect(() => {
    if (!opened) return undefined;
    formRef.current?.querySelector('h1')?.focus({ preventScroll: true });
    const art = artRef.current;
    const before = previousArt.current;
    previousArt.current = null;
    if (!art || !before || matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const after = art.getBoundingClientRect();
    const from = signalGeometry(before.width, before.height, true);
    const to = signalGeometry(after.width, after.height, false);
    if (!from.radius || !to.radius) return undefined;
    const scale = from.radius / to.radius;
    const dx = before.left + from.x - after.left - to.x * scale;
    const dy = before.top + from.y - after.top - to.y * scale;
    const animation = art.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(${scale})` },
      { transform: 'none' }
    ], { duration: 720, easing: 'cubic-bezier(.35, 0, .2, 1)' });
    return () => animation.cancel();
  }, [opened]);

  return (
    <main className={expanded ? (opened ? 'auth auth-opened' : 'auth') : 'auth auth-intro'}>
      <section className="auth-story" aria-label="About Seatsplice">
        <p className="brand"><span className="brand-mark" aria-hidden="true" />Seatsplice</p>
        {!expanded && <>
          <h1 className="visually-hidden">Seatsplice</h1>
          <button type="button" className="signal-skip" onClick={openSignIn}>
            Skip to sign-in
          </button>
        </>}
        {expanded && <div className="signal-copy">
          <p className="eyebrow">The hackathon team finder</p>
          <p className="auth-line">Find your people.</p>
          <p className="muted">Find an open seat, start a team, or join with an invite code.</p>
        </div>}
        {expanded && <p className="signal-footer">Bring your own rubber duck.</p>}
      </section>
      <SignalArt artRef={artRef} onOpenSignIn={expanded ? undefined : openSignIn} />
      {expanded && <section ref={formRef} className="auth-panel"><div className="auth-form">
        <Page key={mode} title={title} eyebrow={invited ? 'You have a team invite' : mode === 'signup' ? 'Hack4Hack Crew Hiring Challenge / PS1 demo' : undefined}
          intro={invited ? 'Sign in or create an account, then confirm your invite.' : mode === 'login' ? 'Sign in to your team board.' : 'Create a Seatsplice demo account to try team formation.'}>
          {notice && <p className="alert" role="status">{notice}</p>}
          <Form onSignedIn={onSignedIn} refreshSession={refreshSession} onSwitch={() => setMode(mode === 'login' ? 'signup' : 'login')} />
        </Page>
      </div></section>}
    </main>
  );
}
