import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { connect } from './db.js';
import { createApp } from './app.js';

const { MONGO_URL, MONGO_DATABASE = 'crewboard', NODE_ENV, APP_ORIGIN, RENDER_EXTERNAL_URL, INVITE_SECRET } = process.env;
const trustProxy = process.env.TRUST_PROXY ?? '0';
const port = Number(process.env.PORT ?? 3000);
const secure = NODE_ENV === 'production';
const origin = new URL(APP_ORIGIN ?? RENDER_EXTERNAL_URL ?? 'http://localhost:5173').origin;
if (!MONGO_URL) throw new Error('Set MONGO_URL to a MongoDB replica set connection string.');
if (secure && !origin.startsWith('https://')) throw new Error('Production requires an HTTPS APP_ORIGIN.');
if (!/^\d$/.test(trustProxy) || (secure && process.env.TRUST_PROXY === undefined)) {
  throw new Error('Set TRUST_PROXY to the number of trusted proxy hops.');
}
const inviteSecret = INVITE_SECRET
  ? /^[a-f0-9]{64}$/i.test(INVITE_SECRET)
    ? Buffer.from(INVITE_SECRET, 'hex')
    : Buffer.from(INVITE_SECRET, 'base64')
  : undefined;
if ((secure || INVITE_SECRET !== undefined) &&
  (inviteSecret?.length !== 32 ||
    (!/^[a-f0-9]{64}$/i.test(INVITE_SECRET) && inviteSecret.toString('base64') !== INVITE_SECRET))) {
  throw new Error('Set INVITE_SECRET to 32 random bytes encoded as hex or standard base64.');
}
const db = await connect(MONGO_URL, MONGO_DATABASE);
const dist = fileURLToPath(new URL('../dist', import.meta.url));
const { app, events } = createApp(db, {
  origin, secure, trustProxy: Number(trustProxy), inviteSecret,
  staticDir: existsSync(dist) ? dist : undefined
});
const host = process.env.HOST ?? (secure ? '0.0.0.0' : '127.0.0.1');
const server = app.listen(port, host, () => console.log(`Seatsplice listening on ${host}:${port}`));
server.requestTimeout = 15000;
server.headersTimeout = 10000;

function shutdown() {
  const deadline = setTimeout(() => process.exit(1), 8000);
  deadline.unref();
  void events.close();
  server.close(async () => {
    await db.client.close();
    clearTimeout(deadline);
  });
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
