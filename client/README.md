# Crewboard client

React and ReactDOM only. Vite uses this folder as its root, and all API calls go to `/api` on the same origin.

| File | What it does |
|---|---|
| `src/App.jsx` | Session, hash routes, app shell, live-update reactions |
| `src/api.js` | Only place that calls `fetch`. Error shape, Idempotency-Key handling, 401 handling |
| `src/live.js` | SSE subscription: coalesces bursts, adds jitter, reconnects, closes in hidden tabs |
| `src/hooks.js` | Data loading, one-at-a-time actions, focus rescue, route state |
| `src/format.js` | Input limits mirrored from the server, status and audit wording |
| `src/ui.jsx` | Shared controls: fields, dialog, seat row, skills input |
| `src/pages/` | One file per screen |

## Decisions to be able to defend

- **No JSX plugin needed.** The Vite config has no React plugin, so esbuild uses the classic JSX transform. That is why each `.jsx` file imports `React`.
- **Hash routes** need no server fallback, and an invite code in `#/join?code=` is never sent to the server or in a Referer header.
- **Invite links only fill in the form.** Joining takes a deliberate press, so opening a link can never act for someone.
- **Idempotency keys** are kept per action while the outcome is unknown (network failure or 5xx), so a retry replays instead of acting twice. Auth requests get a new key per attempt, so nothing derived from a password is remembered.
- **Live updates** carry no data. Pages refetch what they show and keep the current data if a quiet refresh fails. Focus moves only if the focused control was removed.
- **Buttons use `aria-disabled` while busy**, because disabling a focused button would drop keyboard focus.
- **Only the httpOnly cookie persists.** The client uses no localStorage or sessionStorage, and keying the signed-in shell by user id discards all state when the account changes.

## Production headers

The UI runs under this policy; send it from the server:

`default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`
