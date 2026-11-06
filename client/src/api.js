// Single gateway to the Crewboard API. Same origin only; the session is an httpOnly cookie.

const TIMEOUT_MS = 15000;

export class ApiError extends Error {
  constructor(status, code, message, retryAfter = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = handler => { onUnauthorized = handler; };

// A retry of the same action must reuse its key so the server replays instead of acting twice.
// The key survives only when the outcome is unknown (network failure or 5xx).
const unresolvedKeys = new Map();

// crypto.randomUUID exists only on HTTPS and localhost; this also covers testing from a phone over LAN.
function newKey() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const forgetKeys = () => unresolvedKeys.clear();

async function send(path, init, signal) {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  let response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      redirect: 'error',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout
    });
  } catch (cause) {
    if (signal?.aborted) throw cause;
    throw new ApiError(0, 'NETWORK', 'Crewboard could not be reached. Check your connection and try again.');
  }
  if (response.status === 204) return null;

  let body = null;
  try { body = await response.json(); } catch { /* handled below: body stays null */ }
  if (response.ok && body !== null) return body;
  if (response.ok) throw new ApiError(response.status, 'BAD_RESPONSE', 'The server sent an unreadable response.');

  const seconds = Number(response.headers.get('Retry-After'));
  const message = typeof body?.error?.message === 'string' ? body.error.message : 'Something went wrong on the server. Try again.';
  throw new ApiError(response.status, body?.error?.code ?? 'SERVER_ERROR', message, seconds > 0 ? seconds : null);
}

async function read(path, signal) {
  try {
    return await send(path, { headers: { Accept: 'application/json' } }, signal);
  } catch (error) {
    if (error.status === 401) onUnauthorized();
    throw error;
  }
}

async function write(path, body = {}, { auth = false } = {}) {
  // Auth bodies hold passwords, so they never form a remembered intent: each attempt gets a new key.
  const intent = auth ? null : `${path}\n${JSON.stringify(body)}`;
  const key = (intent && unresolvedKeys.get(intent)) ?? newKey();
  if (intent) unresolvedKeys.set(intent, key);
  try {
    const result = await send(path, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify(body)
    });
    if (intent) unresolvedKeys.delete(intent);
    return result;
  } catch (error) {
    if (intent && error.status > 0 && error.status < 500) unresolvedKeys.delete(intent);
    if (error.status === 401 && !auth) onUnauthorized();
    throw error;
  }
}

const team = id => `/api/teams/${encodeURIComponent(id)}`;

export const getMe = signal => read('/api/me', signal);
export const login = body => write('/api/auth/login', body, { auth: true });
export const register = body => write('/api/auth/register', body, { auth: true });
export const logout = () => write('/api/auth/logout', {}, { auth: true });

let boardPrefetch;

export function clearBoardPrefetch() {
  boardPrefetch?.controller.abort();
  boardPrefetch = undefined;
}

export function prefetchBoard() {
  clearBoardPrefetch();
  const controller = new AbortController();
  const result = send('/api/board', { headers: { Accept: 'application/json' }, priority: 'low' }, controller.signal)
    .catch(() => null);
  boardPrefetch = { controller, result, expires: performance.now() + 5000 };
}

export function getBoard({ q, skill, cursor }, signal) {
  const query = new URLSearchParams();
  if (q) query.set('q', q);
  if (skill) query.set('skill', skill);
  if (cursor) query.set('cursor', cursor);
  const text = query.toString();
  if (!text && boardPrefetch) {
    const { result, expires } = boardPrefetch;
    if (performance.now() < expires) {
      return result.then(data => {
        signal?.throwIfAborted();
        return data ?? read('/api/board', signal);
      });
    }
    clearBoardPrefetch();
  }
  return read(text ? `/api/board?${text}` : '/api/board', signal);
}

export const getTeam = (id, signal) => read(team(id), signal).then(data => data.team);
export const getSuggestions = signal => read('/api/suggestions', signal).then(data => data.people ?? []);
export const getOwnRequests = signal => read('/api/requests/mine', signal).then(data => data.requests);
export const withdrawRequest = (teamId, requestId) => write(`${team(teamId)}/requests/${encodeURIComponent(requestId)}/withdraw`, {});

export const createTeam = body => write('/api/teams', body);
export const requestJoin = id => write(`${team(id)}/requests`);
export const redeemInvite = code => write('/api/invites/redeem', { code });
export const decideRequest = (id, requestId, decision) =>
  write(`${team(id)}/requests/${encodeURIComponent(requestId)}/${decision}`);
export const createInvite = id => write(`${team(id)}/invites`);
export const leaveTeam = id => write(`${team(id)}/leave`);
export const removeMember = (id, userId) => write(`${team(id)}/members/${encodeURIComponent(userId)}/remove`);
