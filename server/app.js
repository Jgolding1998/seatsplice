import path from 'node:path';
import { createHmac, randomBytes } from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import * as auth from './auth.js';
import * as input from './input.js';
import * as teams from './teams.js';
import { createEvents } from './events.js';

const developmentInviteSecret = randomBytes(32);

export function createApp(db, {
  origin, secure = false, trustProxy = 0, staticDir, limits = {}, log = console, inviteSecret = developmentInviteSecret
} = {}) {
  const app = express();
  let openBoardRead;
  const clearBoardRead = () => { openBoardRead = undefined; };
  const events = createEvents(db, log, clearBoardRead);
  const api = express.Router();
  const authRate = limits.auth ?? 120;
  const inviteRate = limits.invites ?? 10;
  const writeRate = limits.writes ?? 180;
  const minute = 60 * 1000;
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy);
  app.use(helmet({
    contentSecurityPolicy: { directives: {
      'default-src': ["'self'"], 'script-src': ["'self'"], 'connect-src': ["'self'"],
      'style-src': ["'self'"], 'font-src': ["'self'"], 'img-src': ["'self'", 'data:'],
      'object-src': ["'none'"], 'frame-ancestors': ["'none'"], 'form-action': ["'self'"],
      'upgrade-insecure-requests': secure ? [] : null
    } },
    strictTransportSecurity: secure
  }));
  api.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.get('Sec-Fetch-Site') === 'cross-site' || (req.get('Origin') && req.get('Origin') !== origin)) {
      input.fail(403, 'ORIGIN_REJECTED', 'This request came from a different site.');
    }
    if (req.method === 'POST' && !req.is('application/json')) {
      input.fail(415, 'JSON_REQUIRED', 'Send application/json.');
    }
    next();
  });
  api.use(express.json({ limit: '8kb', strict: true }));
  api.get('/health', async (_req, res) => {
    await db.client.db().command({ ping: 1 });
    res.json({ ok: true });
  });
  api.get('/me', async (req, res) => res.json(await auth.me(db, (await auth.sessionUser(db, req))?.user)));
  api.post('/auth/register', async (req, res) => {
    await auth.consumeLimit(db, 'register-ip', req.ip, authRate, 15 * minute);
    const user = await auth.registerUser(db, input.parse(input.register, req.body));
    const previous = await auth.sessionUser(db, req);
    await auth.startSession(db, req, res, user, secure);
    if (previous) events.revoke(previous.key);
    res.status(201).json(await auth.me(db, user));
  });
  api.post('/auth/login', async (req, res) => {
    await auth.consumeLimit(db, 'login-ip', req.ip, authRate, 15 * minute);
    const credentials = input.parse(input.login, req.body);
    await auth.consumeLimit(db, 'login-account-ip', [credentials.email, req.ip], 10, 15 * minute);
    await auth.consumeLimit(db, 'login-account', credentials.email, 100, 60 * minute);
    const user = await auth.verifyLogin(db, credentials);
    const previous = await auth.sessionUser(db, req);
    await auth.startSession(db, req, res, user, secure);
    if (previous) events.revoke(previous.key);
    res.json(await auth.me(db, user));
  });
  api.post('/auth/logout', async (req, res) => {
    input.parse(input.empty, req.body);
    const previous = await auth.sessionUser(db, req);
    await auth.endSession(db, req, res, secure);
    if (previous) events.revoke(previous.key);
    res.status(204).end();
  });
  api.get('/board', async (req, res) => {
    // The board is shared across all signed-in participants and never reads a user profile.
    if (!await auth.activeSession(db, req)) input.fail(401, 'SIGN_IN_REQUIRED', 'Sign in to continue.');
    const filters = input.parse(input.filters, req.query);
    if (filters.q || filters.skill || filters.cursor) return res.json(await teams.board(db, filters));
    // Concurrent readers can share the outstanding snapshot of the first page.
    // Clear it on settlement or a write so a later reader gets a fresh query.
    if (!openBoardRead) {
      const snapshot = teams.board(db, filters).finally(() => {
        if (openBoardRead === snapshot) clearBoardRead();
      });
      openBoardRead = snapshot;
    }
    return res.json(await openBoardRead);
  });
  api.use(async (req, _res, next) => {
    req.auth = await auth.sessionUser(db, req);
    if (!req.auth) input.fail(401, 'SIGN_IN_REQUIRED', 'Sign in to continue.');
    next();
  });
  api.get('/teams/:id', async (req, res) => {
    res.json(await teams.details(db, req.auth.user, input.parse(input.id, req.params.id)));
  });
  api.get('/requests/mine', async (req, res) => res.json(await teams.ownRequests(db, req.auth.user)));
  api.get('/suggestions', async (req, res) => {
    await auth.consumeLimit(db, 'suggestions', req.auth.user._id, 30, minute);
    res.json(await teams.suggestions(db, req.auth.user));
  });
  api.get('/events', (req, res) => {
    if (!events.open(res, req.auth)) input.fail(429, 'TOO_MANY_STREAMS', 'Close another Seatsplice tab and retry.');
  });

  function write(route, schema, action, { extraLimit, invite = false } = {}) {
    api.post(route, async (req, res) => {
      const actor = req.auth.user;
      const key = input.parse(input.id, req.get('Idempotency-Key'));
      const data = input.parse(schema, req.body);
      for (const value of Object.values(req.params)) input.parse(input.id, value);
      await auth.consumeLimit(db, 'writes', actor._id, writeRate, minute);
      if (extraLimit) await extraLimit(req);
      const codeFor = nonce => createHmac('sha256', inviteSecret)
        .update(JSON.stringify([actor._id, req.params.id, key, nonce])).digest().subarray(0, 16).toString('base64url');
      const result = await teams.once(db, actor, key, req.path, data, async session => {
        if (!invite) return action(session, actor, req.params, data);
        const nonce = randomBytes(16).toString('hex');
        return { ...await action(session, actor, req.params, data, codeFor(nonce)), nonce };
      });
      clearBoardRead();
      if (!invite) return res.json(result);
      const { nonce, ...publicResult } = result;
      return res.json({ ...publicResult, code: codeFor(nonce) });
    });
  }
  write('/teams', input.team, (session, actor, _params, data) => teams.createTeam(db, session, actor, data), {
    extraLimit: req => auth.consumeLimit(db, 'create-team', req.auth.user._id, 8, 15 * minute)
  });
  write('/teams/:id/requests', input.empty, (session, actor, params) => teams.requestJoin(db, session, actor, params.id));
  write('/teams/:id/requests/:requestId/approve', input.empty, (session, actor, params) =>
    teams.decideRequest(db, session, actor, params.id, params.requestId, 'approved'));
  write('/teams/:id/requests/:requestId/decline', input.empty, (session, actor, params) =>
    teams.decideRequest(db, session, actor, params.id, params.requestId, 'declined'));
  write('/teams/:id/requests/:requestId/withdraw', input.empty, (session, actor, params) =>
    teams.withdrawRequest(db, session, actor, params.id, params.requestId));
  write('/teams/:id/invites', input.empty, (session, actor, params, _data, code) =>
    teams.issueInvite(db, session, actor, params.id, code), { invite: true });
  write('/invites/redeem', input.redeem, (session, actor, _params, data) => teams.redeemInvite(db, session, actor, data.code),
    { extraLimit: async req => {
      await auth.consumeLimit(db, 'redeem-ip', req.ip, 120, 15 * minute);
      await auth.consumeLimit(db, 'redeem-account', req.auth.user._id, inviteRate, 15 * minute);
    } });
  write('/teams/:id/leave', input.empty, (session, actor, params) => teams.removeMember(db, session, actor, params.id, actor._id, true));
  write('/teams/:id/members/:userId/remove', input.empty, (session, actor, params) =>
    teams.removeMember(db, session, actor, params.id, params.userId, false));

  api.use((_req, _res) => input.fail(404, 'NOT_FOUND', 'This endpoint does not exist.'));
  app.use('/api', api);
  if (staticDir) {
    // Vite fingerprints files in assets. Keep HTML and public files revalidating.
    app.use('/assets', express.static(path.join(staticDir, 'assets'), {
      dotfiles: 'deny', index: false, fallthrough: false, immutable: true, maxAge: '1y'
    }));
    app.use(express.static(staticDir, { dotfiles: 'deny', index: false }));
    app.get('/{*path}', (_req, res) => res.set('Cache-Control', 'no-cache').sendFile(path.join(staticDir, 'index.html')));
  }
  app.use((error, _req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof input.HttpError) {
      return res.status(error.status).json({ error: { code: error.code, message: error.message } });
    }
    if (error.type === 'entity.parse.failed' || error.type === 'entity.too.large') {
      return res.status(error.status).json({ error: { code: 'INVALID_BODY', message: 'Invalid or oversized JSON body.' } });
    }
    if (error.status >= 400 && error.status < 500) {
      return res.status(error.status).json({ error: { code: 'INVALID_REQUEST', message: 'Invalid request.' } });
    }
    if (error.name === 'MongoOperationTimeoutError' || error.code === 50) {
      return res.set('Retry-After', '1').status(503).json({
        error: { code: 'DATABASE_BUSY', message: 'The database is busy. Retry this action in a moment.' }
      });
    }
    log.error('Request failed', { name: error.name, code: error.code });
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong. Please try again.' } });
  });
  return { app, events };
}
