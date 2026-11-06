import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { membershipQuery } from './db.js';
import { fail } from './input.js';

const derive = promisify(scrypt);
const cookieName = 'crewboard_session';
const lifetime = 7 * 24 * 60 * 60 * 1000;
const fakeSalt = 'crewboard-invalid-account-salt';
const fakeDigest = Buffer.alloc(64);
const passwordCost = { N: 32768, r: 8, p: 3, maxmem: 40 * 1024 * 1024 };
export const hash = value => createHash('sha256').update(value).digest('hex');

function readToken(req) {
  const match = /(?:^|;\s*)crewboard_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie ?? '');
  return match ? hash(match[1]) : null;
}

const cookieOptions = secure => ({ httpOnly: true, sameSite: 'strict', secure, path: '/' });
export const publicUser = user => ({ id: user._id, name: user.name, skills: user.skills, timezone: user.timezone });
export const ownUser = user => ({ ...publicUser(user), email: user.email });

export async function activeSession(db, req) {
  const key = readToken(req);
  if (!key) return null;
  return db.sessions.findOne({ _id: key, expiresAt: { $gt: new Date() } });
}

export async function sessionUser(db, req) {
  const session = await activeSession(db, req);
  if (!session) return null;
  const user = await db.users.findOne({ _id: session.userId }, { projection: { passwordHash: 0 } });
  return user ? { user, key: session._id, expiresAt: session.expiresAt } : null;
}

export async function me(db, user) {
  if (!user) return { user: null, teamId: null };
  const membership = await db.memberships.findOne(membershipQuery(user._id));
  return { user: ownUser(user), teamId: membership?.teamId ?? null };
}

export async function registerUser(db, data) {
  const { password, ...profile } = data;
  const salt = randomBytes(16).toString('hex');
  const digest = await derive(password, salt, 64, passwordCost);
  const user = { _id: randomUUID(), ...profile, passwordHash: `${salt}.${digest.toString('hex')}` };
  try { await db.users.insertOne(user); }
  catch (error) {
    if (error.code === 11000) fail(409, 'ACCOUNT_EXISTS', 'An account already uses this email.');
    throw error;
  }
  return user;
}

export async function verifyLogin(db, { email, password }) {
  const user = await db.users.findOne({ email });
  const [salt, encoded] = user?.passwordHash?.split('.') ?? [];
  const digest = await derive(password, salt ?? fakeSalt, 64, passwordCost);
  if (!timingSafeEqual(digest, encoded ? Buffer.from(encoded, 'hex') : fakeDigest) || !encoded) {
    fail(401, 'INVALID_LOGIN', 'The email or password is incorrect.');
  }
  return user;
}

export async function startSession(db, req, res, user, secure) {
  const previous = readToken(req);
  if (previous) await db.sessions.deleteOne({ _id: previous });
  const token = randomBytes(32).toString('hex');
  await db.sessions.insertOne({ _id: hash(token), userId: user._id, expiresAt: new Date(Date.now() + lifetime) });
  res.cookie(cookieName, token, { ...cookieOptions(secure), maxAge: lifetime });
}

export async function endSession(db, req, res, secure) {
  const key = readToken(req);
  if (key) await db.sessions.deleteOne({ _id: key });
  res.clearCookie(cookieName, cookieOptions(secure));
}

export async function consumeLimit(db, scope, identity, maximum, windowMs) {
  const bucket = Math.floor(Date.now() / windowMs);
  const key = hash(JSON.stringify([scope, identity, bucket]));
  const update = {
    $inc: { count: 1 },
    $setOnInsert: { expiresAt: new Date((bucket + 2) * windowMs) }
  };
  const options = { returnDocument: 'after' };
  let record;
  try { record = await db.limits.findOneAndUpdate({ _id: key }, update, { ...options, upsert: true }); }
  catch (error) {
    if (error.code !== 11000) throw error;
    record = await db.limits.findOneAndUpdate({ _id: key }, update, options);
  }
  if (record.count > maximum) fail(429, 'RATE_LIMITED', 'Too many attempts. Please try again later.');
}
