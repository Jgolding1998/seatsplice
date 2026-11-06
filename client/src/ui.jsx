import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Skeleton } from './Skeleton.jsx';
import { LIMITS, errorText, formatDateTime, teamState, timezoneOptions, zoneLabel } from './format.js';

let isFirstPage = true;

// One h1 per screen. Moving focus to it on navigation tells keyboard and screen reader users the
// screen changed; the first page load keeps the browser's default focus.
export function Page({ title, intro, eyebrow, children }) {
  const heading = useRef(null);
  useEffect(() => {
    if (isFirstPage) {
      isFirstPage = false;
      return;
    }
    window.scrollTo(0, 0);
    heading.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => { document.title = `${title} · Crewboard`; }, [title]);
  return (
    <>
      <div className="page-head">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 ref={heading} tabIndex={-1}>{title}</h1>
        {intro && <p className="page-intro">{intro}</p>}
      </div>
      {children}
    </>
  );
}

// Stays focusable while busy: disabling a focused button would drop keyboard focus to <body>.
export function Button({ variant = 'quiet', busy = false, busyLabel, onClick, type = 'button', children, ...rest }) {
  return (
    <button
      {...rest}
      type={type}
      className={`button button-${variant}`}
      aria-disabled={busy || undefined}
      onClick={event => {
        if (busy) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
    >
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
}

export function Field({ label, hint, error, children }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && <p id={hintId} className="field-hint">{hint}</p>}
      {error && <p id={errorId} className="field-error">{error}</p>}
    </div>
  );
}

// After a failed submit, moves focus to the first invalid field.
export function useFocusFirstInvalid(errors) {
  const form = useRef(null);
  useEffect(() => {
    if (Object.keys(errors).length) form.current?.querySelector('[aria-invalid="true"]')?.focus();
  }, [errors]);
  return form;
}

export function FormError({ error, children }) {
  const box = useRef(null);
  useEffect(() => { if (error) box.current?.focus(); }, [error]);
  if (!error) return null;
  return (
    <div ref={box} className="alert" role="alert" tabIndex={-1}>
      <p>{errorText(error)}</p>
      {children}
    </div>
  );
}

export function InlineError({ error }) {
  return error ? <p className="alert" role="alert">{errorText(error)}</p> : null;
}

export function LoadError({ error, onRetry, children }) {
  return (
    <div className="alert" role="alert">
      <p>{errorText(error)}</p>
      <div className="row">
        {onRetry && <Button onClick={onRetry}>Try again</Button>}
        {children}
      </div>
    </div>
  );
}

export function Empty({ title, children }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children}
    </div>
  );
}

export const Loading = ({ label = 'Loading', kind, rows }) => <Skeleton label={label} kind={kind} rows={rows} />;

// The signature element: each seat on a crew. The tick marks the minimum size for an active team.
export function SeatRow({ memberCount, minSize, maxSize }) {
  const seats = Array.from({ length: maxSize }, (_, seat) => {
    const classes = ['seat'];
    if (seat < memberCount) classes.push('seat-taken');
    if (seat === minSize - 1) classes.push('seat-minimum');
    if (seat === memberCount && memberCount === maxSize - 1) classes.push('seat-last');
    return <span key={seat} className={classes.join(' ')} />;
  });
  return <span className="seats" aria-hidden="true">{seats}</span>;
}

export function Seats({ team }) {
  const state = teamState(team);
  return (
    <div className="seat-block">
      <SeatRow {...team} />
      <p className="seat-text">
        <span className="figure">{team.memberCount} of {team.maxSize} seats</span>
        <span className={`state state-${state.tone}`}>{state.label}</span>
      </p>
    </div>
  );
}

export function Skills({ skills, label = 'Skills' }) {
  if (!skills?.length) return <p className="muted">No skills listed</p>;
  return (
    <ul className="skills" aria-label={label}>
      {skills.map(skill => <li key={skill}>{skill}</li>)}
    </ul>
  );
}

export const Zone = ({ zone }) => <span className="zone">{zoneLabel(zone)}</span>;

export function Time({ value }) {
  const text = formatDateTime(value);
  return text ? <time dateTime={new Date(value).toISOString()}>{text}</time> : null;
}

export function TimezoneSelect({ value, onChange, ...field }) {
  const options = useMemo(() => timezoneOptions(value), [value]);
  return (
    <select {...field} value={value} onChange={event => onChange(event.target.value)}>
      {options.map(zone => <option key={zone} value={zone}>{zoneLabel(zone)}</option>)}
    </select>
  );
}

const COMMON_SKILLS = ['React', 'Node.js', 'MongoDB', 'Python', 'TypeScript', 'Design', 'DevOps', 'Testing', 'Machine learning', 'Mobile'];

export function SkillsInput({ value, onChange, inputProps }) {
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState('');
  const input = useRef(null);
  const listId = useId();

  function commit() {
    const skill = draft.trim();
    if (!skill) return;
    setDraft('');
    if (value.some(existing => existing.toLowerCase() === skill.toLowerCase())) {
      setNote(`${skill} is already listed`);
    } else if (value.length >= LIMITS.skillCount) {
      setNote(`You can list up to ${LIMITS.skillCount} skills`);
    } else {
      onChange([...value, skill]);
      setNote(`Added ${skill}`);
    }
  }

  function remove(skill) {
    onChange(value.filter(existing => existing !== skill));
    setNote(`Removed ${skill}`);
    input.current?.focus(); // The remove button is about to disappear.
  }

  return (
    <div className="skills-input">
      <div className="row row-tight">
        <input
          {...inputProps}
          ref={input}
          value={draft}
          list={listId}
          maxLength={LIMITS.skillLength}
          autoComplete="off"
          onChange={event => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={event => {
            if ((event.key === 'Enter' && draft.trim()) || event.key === ',') {
              event.preventDefault();
              commit();
            }
          }}
        />
        <Button onClick={commit}>Add</Button>
      </div>
      <datalist id={listId}>{COMMON_SKILLS.map(skill => <option key={skill} value={skill} />)}</datalist>
      {value.length > 0 && (
        <ul className="skills skills-editable" aria-label="Skills added">
          {value.map(skill => (
            <li key={skill}>
              {skill}
              <button type="button" className="skill-remove" aria-label={`Remove ${skill}`} onClick={() => remove(skill)}>
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="visually-hidden" role="status">{note}</p>
    </div>
  );
}

// Native <dialog> gives a focus trap, Escape to close and focus return. Cancel comes first in the
// DOM, so it gets initial focus and pressing Enter by accident never removes anyone.
export function ConfirmDialog({ title, children, confirmLabel, busy, error, onConfirm, onClose }) {
  const dialog = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const node = dialog.current;
    const opener = document.activeElement;
    node.showModal();
    return () => {
      node.close();
      // By now React has removed the dialog, so the browser cannot return focus by itself.
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  return (
    <dialog ref={dialog} className="dialog" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }}>
      <h2 id={titleId}>{title}</h2>
      <div className="dialog-body">{children}</div>
      <InlineError error={error} />
      <div className="row dialog-actions">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="danger" busy={busy} busyLabel="Working" onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </dialog>
  );
}
