import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { connect } from './db.js';
import { createApp } from './app.js';
import { seedFixtures } from './fixtures.js';

// Local-only preview. The temporary database goes away when the preview stops.
const host = '127.0.0.1';
const port = Number(process.env.PORT ?? 4173);
const replica = await MongoMemoryReplSet.create({ replSet: { count: 1, ip: host } });
const db = await connect(replica.getUri(), 'crewboard_demo');
if (process.argv.includes('--seed')) await seedFixtures(db, { participants: 72, teamCount: 12 });
const dist = fileURLToPath(new URL('../dist', import.meta.url));
const { app, events } = createApp(db, { origin: `http://${host}:${port}`, staticDir: dist });
const server = app.listen(port, host);
await once(server, 'listening');
console.log(`Seatsplice preview: http://${host}:${port}`);

let stopped = false;
async function shutdown() {
  if (stopped) return;
  stopped = true;
  await events.close();
  await new Promise(resolve => server.close(resolve));
  await db.client.close();
  await replica.stop();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
