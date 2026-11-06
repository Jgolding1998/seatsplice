import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { connect } from '../server/db.js';
import { createApp } from '../server/app.js';
import { seedFixtures } from '../server/fixtures.js';
import { hash } from '../server/auth.js';

const replica = await MongoMemoryReplSet.create({ replSet: { count: 1, ip: '127.0.0.1' } });
let db, server, events;
try {
  db = await connect(replica.getUri(), 'crewboard_load');
  console.log('Fixtures:', await seedFixtures(db));
  const instance = createApp(db);
  events = instance.events;
  server = instance.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  const users = await db.users.find({ fixture: true }).limit(100).project({ _id: 1 }).toArray();
  const expiresAt = new Date(Date.now() + 5 * 60000);
  const tokens = users.map(() => randomBytes(32).toString('hex'));
  await db.sessions.insertMany(users.map(({ _id }, index) => ({
    _id: hash(tokens[index]), userId: _id, expiresAt
  })));
  const child = spawn(process.env.K6_BIN ?? 'k6', ['run', 'tests/board.k6.js'], {
    env: { ...process.env, CREWBOARD_BENCH_URL: url, CREWBOARD_BENCH_TOKENS: JSON.stringify(tokens) },
    stdio: 'inherit'
  });
  const [status] = await once(child, 'exit');
  process.exitCode = status ?? 1;
} finally {
  await events?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await db?.client.close();
  await replica.stop();
}
