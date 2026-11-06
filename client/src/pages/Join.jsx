import React, { useEffect, useState } from 'react';
import * as api from '../api.js';
import { INVITE_CODE } from '../format.js';
import { navigate, useAction, useApp } from '../hooks.js';
import { Button, Field, FormError, Page, useFocusFirstInvalid } from '../ui.jsx';

export function JoinForm({ initialCode = '' }) {
  const { refreshSession, announce } = useApp();
  const [code, setCode] = useState(initialCode);
  const [errors, setErrors] = useState({});
  const action = useAction();
  const form = useFocusFirstInvalid(errors);

  function submit(event) {
    event.preventDefault();
    const trimmed = code.trim();
    if (!INVITE_CODE.test(trimmed)) {
      setErrors({ code: 'Invite codes are 22 letters, numbers, dashes or underscores' });
      return;
    }
    setErrors({});
    action.run(async () => {
      const result = await api.redeemInvite(trimmed);
      await refreshSession();
      announce('You joined the team');
      navigate(`/teams/${result.teamId}`);
    });
  }

  return (
    <form ref={form} className="form-narrow" onSubmit={submit} noValidate>
      <FormError error={action.error} />
      <Field label="Invite code" hint="A single-use code from a team leader. Using it claims a seat." error={errors.code}>
        {field => (
          <input
            {...field}
            className="mono"
            value={code}
            maxLength={64}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck="false"
            onChange={event => setCode(event.target.value)}
          />
        )}
      </Field>
      <Button type="submit" variant="primary" busy={action.busy} busyLabel="Checking code">Use code</Button>
    </form>
  );
}

// An invite link only fills in the form. Joining always takes a deliberate press, so opening a
// link can never act on someone's behalf.
export function JoinPage({ initialCode }) {
  const { teamId } = useApp();
  useEffect(() => {
    if (initialCode) window.history.replaceState(null, '', '#/join');
  }, [initialCode]);

  return (
    <Page title="Join by code">
      {teamId ? (
        <>
          <p>You are already on a team. Leave it before you use an invite code.</p>
          <p><a href={`#/teams/${teamId}`}>Go to my team</a></p>
        </>
      ) : <JoinForm initialCode={initialCode} />}
    </Page>
  );
}
