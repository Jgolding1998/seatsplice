import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { once as eventOnce } from 'node:events';
import { after, before, beforeEach, test } from 'node:test';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { createApp } from '../server/app.js';
import { hash } from '../server/auth.js';
import { connect, membershipQuery } from '../server/db.js';

const origin = 'http://localhost:3000';
const credentials = {
  email: 'tess@example.test', password: 'one strong passphrase',
  name: 'Tess Example', skills: ['React'], timezone: 'America/Chicago'
};
const draft = { name: 'Recursive Snacks', description: 'We debug by eating cookies.',
  skills: ['React', 'MongoDB'], timezone: 'America/Chicago', minSize: 2, maxSize: 3 };
const day = 24 * 60 * 60 * 1000;
let replica, db, otherDb, servers, instance, otherInstance;

async function listen(app) {
  const server = app.listen(0, '127.0.0.1');
  await eventOnce(server, 'listening');
  return server;
}

before(async () => {
  const url = process.env.TEST_MONGO_URL;
  replica = url ? null : await MongoMemoryReplSet.create({ replSet: { count: 1, ip: '127.0.0.1' } });
  const database = `crewboard_test_${randomUUID().replaceAll('-', '')}`;
  db = await connect(url ?? replica.getUri(), database);
  otherDb = await connect(url ?? replica.getUri(), database);
  instance = createApp(db, { origin, limits: { invites: 3 } });
  otherInstance = createApp(otherDb, { origin, limits: { invites: 3 } });
  servers = await Promise.all([listen(instance.app), listen(otherInstance.app)]);
});

after(async () => {
  await Promise.all([instance?.events.close(), otherInstance?.events.close()]);
  if (servers) await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
  if (db) await db.client.db(db.users.dbName).dropDatabase();
  await Promise.all([db?.client.close(), otherDb?.client.close()]);
  await replica?.stop();
});

beforeEach(async () => {
  await Promise.all(Object.values(db).filter(value => typeof value.deleteMany === 'function').map(value => value.deleteMany({})));
});

const http = (index = 0) => request(servers[index]);
const get = (path, user, index) => http(index).get('/api' + path).set('Cookie', user?.cookie ?? '');
const post = (path, user, body = {}, { key = randomUUID(), index = 0 } = {}) => http(index)
  .post('/api' + path).set('Cookie', user?.cookie ?? '').set('Idempotency-Key', key).send(body);
const decision = (teamId, joinId, kind = 'approve') => `/teams/${teamId}/requests/${joinId}/${kind}`;

async function person(name = 'Ada', fields = {}) {
  const id = randomUUID();
  const token = randomBytes(32).toString('hex');
  await db.users.insertOne({ _id: id, name, email: id + '@example.test', skills: ['React'], timezone: 'America/Chicago', ...fields });
  await db.sessions.insertOne({ _id: hash(token), userId: id, expiresAt: new Date(Date.now() + day) });
  return { id, cookie: `crewboard_session=${token}` };
}

async function team(leader, fields = {}) {
  const response = await post('/teams', leader, { ...draft, ...fields }).expect(200);
  return response.body.id;
}

async function join(id, user) {
  const response = await post(`/teams/${id}/requests`, user).expect(200);
  return response.body.id;
}

test('registration creates a hashed session and login rotates it', async () => {
  const registered = await http().post('/api/auth/register').send(credentials).expect(201);
  assert.match(registered.headers['set-cookie'][0], /HttpOnly; SameSite=Strict/i);
  const cookie = registered.headers['set-cookie'][0].split(';')[0];
  const token = cookie.split('=')[1];
  const stored = await db.users.findOne({ email: credentials.email });
  assert.ok(stored.passwordHash);
  assert.notEqual(stored.passwordHash, credentials.password);
  assert.equal(await db.sessions.findOne({ _id: token }), null);
  await http().post('/api/auth/login').set('Cookie', cookie)
    .send({ email: credentials.email, password: credentials.password }).expect(200);
  assert.equal((await get('/me', { cookie })).body.user, null);
});

test('invalid logins do not identify registered accounts', async () => {
  await http().post('/api/auth/register').send(credentials).expect(201);
  const existing = await http().post('/api/auth/login').send({ email: credentials.email, password: 'wrong' }).expect(401);
  const missing = await http().post('/api/auth/login').send({ email: 'missing@example.test', password: 'wrong' }).expect(401);
  assert.deepEqual(existing.body, missing.body);
});

test('SQL and MongoDB injection payloads cannot authenticate or mint a session', async () => {
  await http().post('/api/auth/register').send(credentials).expect(201);
  const originalCount = await db.sessions.countDocuments();
  const payloads = [
    [400, { email: "x' OR 1=1 --", password: credentials.password }],
    [401, { email: credentials.email, password: "' OR '1'='1' --" }],
    [400, { email: { $ne: null }, password: credentials.password }],
    [400, { email: credentials.email, password: { $ne: null } }],
    [400, { email: credentials.email, password: ['anything'] }],
    [400, { email: credentials.email, password: credentials.password, $where: 'true' }]
  ];
  for (const [status, body] of payloads) {
    const denied = await http().post('/api/auth/login').send(body).expect(status);
    assert.equal(denied.headers['set-cookie'], undefined);
  }
  assert.equal(await db.sessions.countDocuments(), originalCount);
  await get('/board').expect(401);
});

test('logged-out session cannot read private endpoints', async () => {
  const user = await person();
  await post('/auth/logout', user).expect(204);
  await get('/board', user).expect(401);
});

test('expired session is rejected before TTL deletion', async () => {
  const user = await person();
  await db.sessions.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  await get('/board', user).expect(401);
});

test('cross-origin and cross-site reads and writes are rejected', async () => {
  const user = await person();
  await post('/teams', user, draft).set('Origin', 'https://attacker.test').expect(403);
  await get('/board', user).set('Sec-Fetch-Site', 'cross-site').expect(403);
  await get('/events', user).set('Origin', 'https://attacker.test').expect(403);
  await post('/teams', user, draft).set('Origin', origin).expect(200);
});

test('wrong content type, bad JSON, and oversized JSON are rejected', async () => {
  await http().post('/api/auth/login').type('form').send({ email: 'foo' }).expect(415);
  await http().post('/api/auth/login').type('json').send('{broken').expect(400);
  await http().post('/api/auth/login').send({ password: 'x'.repeat(9000) }).expect(413);
});

test('schema rejects invalid time zones, injected objects, and inverted sizes', async () => {
  const user = await person();
  await post('/teams', user, { ...draft, timezone: 'Not/Real' }).expect(400);
  await post('/teams', user, { ...draft, name: { $ne: '' } }).expect(400);
  await post('/teams', user, { ...draft, minSize: 5, maxSize: 4 }).expect(400);
  await post('/teams', user, { ...draft, name: '\u200b\u200b' }).expect(400);
  await get('/board?skill[$ne]=x', user).expect(400);
});

test('missing idempotency key and malformed route ID are rejected', async () => {
  const user = await person();
  await http().post('/api/teams').set('Cookie', user.cookie).send(draft).expect(400);
  await post('/teams/not-a-uuid/leave', user).expect(400);
});

test('creation is idempotent across concurrent requests and records one audit entry', async () => {
  const user = await person();
  const key = randomUUID();
  const [a, b] = await Promise.all([post('/teams', user, draft, { key }), post('/teams', user, draft, { key, index: 1 })]);
  assert.deepEqual([a.status, b.status], [200, 200]);
  assert.deepEqual(a.body, b.body);
  assert.equal(await db.teams.countDocuments(), 1);
  assert.equal(await db.audit.countDocuments({ action: 'team_created' }), 1);
  await post('/teams', user, { ...draft, name: 'Changed' }, { key }).expect(409);
});

test('different request keys cannot create two teams for one participant', async () => {
  const user = await person();
  const result = await Promise.all([post('/teams', user, draft), post('/teams', user, draft, { index: 1 })]);
  assert.deepEqual(result.map(item => item.status).sort(), [200, 409]);
  assert.equal(await db.memberships.countDocuments(membershipQuery(user.id)), 1);
  assert.equal(await db.teams.countDocuments(), 1);
});

test('join retries create one pending request and one audit entry', async () => {
  const user = await person('Grace');
  const id = await team(await person());
  const first = await join(id, user);
  assert.equal(await join(id, user), first);
  assert.equal(await db.audit.countDocuments({ teamId: id, action: 'join_requested' }), 1);
});

test('only leader can approve, decline, remove or invite', async () => {
  const leader = await person();
  const outsider = await person('Outsider');
  const applicant = await person('Applicant');
  const id = await team(leader);
  const joinId = await join(id, applicant);
  await post(decision(id, joinId), outsider).expect(403);
  await post(decision(id, joinId, 'decline'), applicant).expect(403);
  await post(`/teams/${id}/members/${leader.id}/remove`, outsider).expect(403);
  await post(`/teams/${id}/invites`, outsider).expect(403);
  await post(`/teams/${id}/leave`, outsider).expect(404);
});

test('requests and audit stay within their intended visibility', async () => {
  const leader = await person();
  const applicant = await person('Applicant');
  const id = await team(leader);
  await join(id, applicant);
  const mine = (await get(`/teams/${id}`, applicant).expect(200)).body.team;
  const lead = (await get(`/teams/${id}`, leader).expect(200)).body.team;
  assert.equal(mine.ownRequest.status, 'pending');
  assert.deepEqual(mine.requests, []);
  assert.deepEqual(mine.audit, []);
  assert.equal(lead.requests.length, 1);
  assert.equal(lead.audit.length, 2);
  assert.ok(!JSON.stringify(lead).includes('@example.test'));
});

test('leader cannot approve a request ID from another team', async () => {
  const leader = await person();
  const one = await team(leader);
  const two = await team(await person('Other leader'));
  const joinId = await join(two, await person('Applicant'));
  await post(decision(one, joinId), leader).expect(404);
});

test('declining closes a request and cannot later be approved', async () => {
  const leader = await person();
  const applicant = await person('Applicant');
  const id = await team(leader);
  const joinId = await join(id, applicant);
  await post(decision(id, joinId, 'decline'), leader).expect(200);
  await post(decision(id, joinId), leader).expect(409);
  assert.equal(await db.memberships.countDocuments(membershipQuery(applicant.id)), 0);
});

test('applicants can list and withdraw only their own pending requests', async () => {
  const leader = await person();
  const applicant = await person('Applicant');
  const id = await team(leader);
  const joinId = await join(id, applicant);
  const path = decision(id, joinId, 'withdraw');
  assert.deepEqual((await get('/requests/mine', leader).expect(200)).body.requests, []);
  assert.equal((await get('/requests/mine', applicant).expect(200)).body.requests[0].id, joinId);
  await post(path, leader).expect(409);
  await post(path, applicant).expect(200);
  await post(decision(id, joinId), leader).expect(409);
  assert.equal((await get('/requests/mine', applicant).expect(200)).body.requests[0].status, 'withdrawn');
  assert.notEqual(await join(id, applicant), joinId);
});

test('approval retries cannot consume a second seat or audit entry', async () => {
  const leader = await person();
  const applicant = await person('Applicant');
  const id = await team(leader);
  const route = decision(id, await join(id, applicant));
  const key = randomUUID();
  const one = await post(route, leader, {}, { key }).expect(200);
  const two = await post(route, leader, {}, { key }).expect(200);
  assert.deepEqual(one.body, two.body);
  await post(route, leader).expect(200);
  assert.equal(await db.memberships.countDocuments(membershipQuery(applicant.id)), 1);
  assert.equal(await db.audit.countDocuments({ teamId: id, action: 'join_approved' }), 1);
});

test('50 concurrent approvals on two app instances claim exactly one final seat', async () => {
  for (let round = 0; round < 3; round++) {
    const leader = await person(`Leader ${round}`);
    const id = await team(leader, { maxSize: 2 });
    const people = await Promise.all(Array.from({ length: 50 }, (_, index) => person(`Applicant ${index}`)));
    const requests = await Promise.all(people.map((user, index) =>
      post(`/teams/${id}/requests`, user, {}, { index: index % 2 }).expect(200)));
    const ids = requests.map(result => result.body.id);
    const results = await Promise.all(ids.map((joinId, index) =>
      post(decision(id, joinId), leader, {}, { index: index % 2 })));
    assert.equal(results.filter(result => result.status === 200).length, 1, JSON.stringify(results.map(r => r.status)));
    assert.equal(results.filter(result => result.status === 409 && result.body.error.code === 'TEAM_FULL').length, 49);
    assert.equal(await db.memberships.countDocuments({ teamId: id }), 2);
    assert.equal((await db.teams.findOne({ _id: id })).memberIds.length, 2);
    assert.equal((await get(`/teams/${id}`, leader)).body.team.ready, true);
    assert.equal(await db.requests.countDocuments({ teamId: id, status: 'approved' }), 1);
    assert.equal(await db.audit.countDocuments({ teamId: id, action: 'join_approved' }), 1);
  }
});

test('accepting a seat invalidates old applications even after leaving the team', async () => {
  const leadA = await person('Lead A');
  const leadB = await person('Lead B');
  const applicant = await person('Applicant');
  const a = await team(leadA);
  const b = await team(leadB);
  const reqA = await join(a, applicant);
  const reqB = await join(b, applicant);
  await post(decision(a, reqA), leadA).expect(200);
  await post(`/teams/${a}/leave`, applicant).expect(200);
  await post(decision(b, reqB), leadB).expect(409);
  assert.equal((await get(`/teams/${b}`, applicant)).body.team.ownRequest.status, 'cancelled');
  assert.notEqual(await join(b, applicant), reqB);
});

test('150 applicants can queue on one team concurrently without making a membership', async () => {
  const leader = await person();
  const id = await team(leader, { maxSize: 2 });
  const people = await Promise.all(Array.from({ length: 150 }, (_, index) => person(`Concurrent ${index}`)));
  await Promise.all(people.map((user, index) =>
    post(`/teams/${id}/requests`, user, {}, { index: index % 2 }).expect(200)));
  assert.equal(await db.requests.countDocuments({ teamId: id, status: 'pending' }), 150);
  assert.equal(await db.memberships.countDocuments({ teamId: id }), 1);
});

test('minimum size is explicit and leaving returns an active team to forming', async () => {
  const leader = await person();
  const member = await person('Member');
  const id = await team(leader);
  assert.equal((await get(`/teams/${id}`, leader)).body.team.ready, false);
  await post(decision(id, await join(id, member)), leader).expect(200);
  assert.equal((await get(`/teams/${id}`, leader)).body.team.ready, true);
  await post(`/teams/${id}/leave`, member).expect(200);
  assert.equal((await get(`/teams/${id}`, leader)).body.team.ready, false);
});

test('simultaneous approvals by different teams cannot enroll the same applicant twice', async () => {
  const leaders = await Promise.all([person('A'), person('B')]);
  const ids = await Promise.all(leaders.map(leader => team(leader)));
  const applicant = await person('Applicant');
  const requests = await Promise.all(ids.map(id => join(id, applicant)));
  const outcomes = await Promise.all(ids.map((id, index) =>
    post(decision(id, requests[index]), leaders[index], {}, { index })));
  assert.deepEqual(outcomes.map(result => result.status).sort(), [200, 409]);
  assert.equal(await db.memberships.countDocuments(membershipQuery(applicant.id)), 1);
  assert.equal(await db.audit.countDocuments({ action: 'join_approved' }), 1);
});

test('a single-use invitation claims one preapproved seat and expires before TTL cleanup', async () => {
  const leader = await person();
  const id = await team(leader);
  const user = await person('Guest');
  const response = await post(`/teams/${id}/invites`, leader).expect(200);
  const { code, expiresAt } = response.body;
  assert.match(code, /^[A-Za-z0-9_-]{22}$/);
  assert.ok(Date.parse(expiresAt) > Date.now());
  const redeemed = await post('/invites/redeem', user, { code }).expect(200);
  assert.equal(redeemed.body.status, 'approved');
  assert.equal(await db.memberships.countDocuments(membershipQuery(user.id)), 1);
  await post('/invites/redeem', await person('Second'), { code }).expect(409);
  const expired = (await post(`/teams/${id}/invites`, leader).expect(200)).body.code;
  await db.invites.updateOne({ _id: hash(expired) }, { $set: { expiresAt: new Date(0) } });
  await post('/invites/redeem', await person('Late'), { code: expired }).expect(404);
});

test('50 different invite holders race for the final seat and exactly one wins', async () => {
  const leader = await person('Invite Leader');
  const id = await team(leader, { maxSize: 2 });
  const codes = [];
  for (let index = 0; index < 50; index++) {
    codes.push((await post(`/teams/${id}/invites`, leader).expect(200)).body.code);
  }
  const participants = await Promise.all(codes.map((_, index) => person(`Invite holder ${index}`)));
  const results = await Promise.all(codes.map((code, index) => post(
    '/invites/redeem', participants[index], { code }, { index: index % 2 }
  )));
  assert.equal(results.filter(result => result.status === 200).length, 1);
  assert.equal(results.filter(result => result.status === 409 && result.body.error.code === 'TEAM_FULL').length, 49);
  assert.equal(await db.memberships.countDocuments({ teamId: id }), 2);
  assert.equal(await db.invites.countDocuments({ teamId: id, claimedAt: { $exists: true } }), 1);
  assert.equal(await db.audit.countDocuments({ teamId: id, action: 'invite_accepted' }), 1);
});

test('invite guessing is throttled and buckets are shared across instances', async () => {
  const user = await person();
  for (let attempt = 0; attempt < 3; attempt++) {
    await post('/invites/redeem', user, { code: 'x'.repeat(22) }).expect(404);
  }
  await post('/invites/redeem', user, { code: 'y'.repeat(22) }, { index: 1 }).expect(429);
  const bucket = await db.limits.findOne({ count: 4 });
  assert.ok(bucket);
});

test('invite issuance replays across instances without persisting the code in cleartext', async () => {
  const leader = await person();
  const id = await team(leader);
  const path = `/teams/${id}/invites`;
  const key = randomUUID();
  const original = (await post(path, leader, {}, { key }).expect(200)).body;
  const repeated = (await post(path, leader, {}, { key, index: 1 }).expect(200)).body;
  assert.deepEqual(repeated, original);
  assert.ok(!JSON.stringify(await db.operations.find().toArray()).includes(original.code));
  assert.equal(await db.invites.countDocuments({ _id: hash(original.code) }), 1);
});

test('leader leaving passes leadership, revokes old invites and removes old powers', async () => {
  const leader = await person();
  const next = await person('Next');
  const id = await team(leader);
  await post(decision(id, await join(id, next)), leader).expect(200);
  const { code } = (await post(`/teams/${id}/invites`, leader).expect(200)).body;
  await post(`/teams/${id}/leave`, leader).expect(200);
  const updated = (await get(`/teams/${id}`, next).expect(200)).body.team;
  assert.equal(updated.leaderId, next.id);
  assert.ok(updated.audit.some(row => row.action === 'leadership_transferred'));
  await post(`/teams/${id}/invites`, leader).expect(403);
  await post('/invites/redeem', await person('New'), { code }).expect(404);
});

test('last member leaving deletes team and pending invites, retains audit', async () => {
  const leader = await person();
  const id = await team(leader);
  await post(`/teams/${id}/invites`, leader).expect(200);
  await join(id, await person('Applicant'));
  await post(`/teams/${id}/leave`, leader).expect(200);
  await get(`/teams/${id}`, leader).expect(404);
  assert.equal(await db.invites.countDocuments({ teamId: id }), 0);
  assert.equal(await db.requests.countDocuments({ teamId: id }), 0);
  assert.equal(await db.audit.countDocuments({ teamId: id, action: 'team_deleted' }), 1);
});

test('removing a member reopens a full team on the board', async () => {
  const leader = await person();
  const member = await person('Member');
  const id = await team(leader, { maxSize: 2 });
  await post(decision(id, await join(id, member)), leader).expect(200);
  assert.equal((await get('/board', leader)).body.teams.length, 0);
  await post(`/teams/${id}/members/${member.id}/remove`, leader).expect(200);
  assert.equal((await get('/board', leader)).body.teams[0].id, id);
  assert.equal((await get('/me', member)).body.teamId, null);
});

test('a new board reader does not inherit a snapshot held open across the last-seat commit', { timeout: 8000 }, async () => {
  const leader = await person();
  const applicant = await person('Last seat applicant');
  const id = await team(leader, { maxSize: 2 });
  const application = await join(id, applicant);
  const find = db.teams.find;
  let intercepted = false;
  let snapshotReady;
  let release;
  const started = new Promise(resolve => { snapshotReady = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  db.teams.find = function (filter, ...options) {
    const cursor = find.call(this, filter, ...options);
    if (!intercepted && filter.open === true) {
      intercepted = true;
      const read = cursor.toArray.bind(cursor);
      cursor.toArray = async () => {
        const rows = await read();
        snapshotReady();
        await gate;
        return rows;
      };
    }
    return cursor;
  };
  const oldResponse = get('/board', leader).expect(200).then(response => response);
  try {
    await Promise.race([started, oldResponse.then(() => assert.fail('Board query was not intercepted'))]);
    await get('/board').expect(401);
    await post(decision(id, application), leader).expect(200);
    const latest = await get('/board', applicant).timeout({ deadline: 3000 }).expect(200);
    assert.equal(latest.body.teams.length, 0);
  } finally {
    release();
    delete db.teams.find;
    assert.equal((await oldResponse).body.teams[0].id, id);
  }
});

test('board handles literal search and case-insensitive skill filters', async () => {
  const leader = await person();
  const id = await team(leader, { name: 'C++ team' });
  await team(await person('Other'), { name: 'Other', skills: ['Python'] });
  assert.equal((await get('/board?q=C%2B%2B&skill=react', leader).expect(200)).body.teams[0].id, id);
  assert.equal((await get('/board?q=.*', leader).expect(200)).body.teams.length, 0);
});

test('board keyset pages do not overlap', async () => {
  const leaders = await Promise.all(Array.from({ length: 13 }, (_, index) => person(`Lead ${index}`)));
  await Promise.all(leaders.map(leader => team(leader)));
  const first = (await get('/board', leaders[0]).expect(200)).body;
  const second = (await get('/board?cursor=' + first.nextCursor, leaders[0]).expect(200)).body;
  assert.equal(first.teams.length, 12);
  assert.equal(second.teams.length, 1);
  assert.equal(second.nextCursor, null);
  assert.equal(new Set([...first.teams, ...second.teams].map(team => team.id)).size, 13);
});

test('suggestions rank complementary nearby skills and omit people on a team', async () => {
  const viewer = await person('Viewer');
  const near = await person('Near', { skills: ['MongoDB'] });
  await person('Far', { skills: ['MongoDB'], timezone: 'Asia/Tokyo' });
  const assigned = await person('Assigned', { skills: ['Python', 'Rust', 'Java'] });
  await team(assigned);
  const response = await get('/suggestions', viewer).expect(200);
  assert.equal(response.body.people[0].id, near.id);
  assert.match(response.body.people[0].reason, /Adds MongoDB/);
  assert.ok(!response.body.people.some(person => person.id === assigned.id || 'email' in person));
});

test('profile edits are scoped to the caller and expose only public fields to participants', async () => {
  const editor = await person('Editor', { passwordHash: 'private fixture' });
  const viewer = await person('Viewer');
  const id = await team(editor);
  const profile = { name: 'New display name', skills: ['Rust'], timezone: 'UTC', lookingFor: 'Compiler team' };
  await post('/profile', editor, { ...profile, id: viewer.id }).expect(400);
  await post('/profile', null, profile).expect(401);
  await post('/profile', editor, profile).expect(200);
  await get(`/people/${editor.id}`).expect(401);
  const { person: visible } = (await get(`/people/${editor.id}`, viewer).expect(200)).body;
  assert.deepEqual(visible, { id: editor.id, ...profile, sample: false });
  assert.equal((await get('/me', viewer)).body.user.name, 'Viewer');
  assert.equal((await get('/board', viewer)).body.teams.find(team => team.id === id).leaderName, profile.name);
  assert.equal((await get('/me', editor)).body.user.email, `${editor.id}@example.test`);
});

test('team edits enforce leader permissions and preserve occupied seats', async () => {
  const leader = await person('Leader');
  const applicant = await person('Applicant');
  const other = await person('Other');
  const id = await team(leader);
  await post(decision(id, await join(id, applicant)), leader).expect(200);
  await post(decision(id, await join(id, other)), leader).expect(200);
  const updated = { ...draft, maxSize: 4, skills: ['Rust'] };
  await post(`/teams/${id}/edit`, applicant, updated).expect(403);
  await post(`/teams/${id}/edit`, leader, { ...updated, maxSize: 2 }).expect(409);
  await post(`/teams/${id}/edit`, leader, updated).expect(200);
  const { teams } = (await get('/board?skill=Rust', applicant).expect(200)).body;
  assert.equal(teams[0].id, id);
  assert.equal(teams[0].memberCount, 3);
  assert.equal(teams[0].maxSize, 4);
});

async function* changeFrames(reader) {
  const decoder = new TextDecoder();
  let buffered = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) return;
    buffered += decoder.decode(value, { stream: true });
    let boundary;
    while ((boundary = buffered.indexOf('\n\n')) !== -1) {
      const frame = buffered.slice(0, boundary + 2);
      buffered = buffered.slice(boundary + 2);
      if (/^event: change$/m.test(frame)) yield frame;
    }
  }
}

test('SSE sees a committed write from another instance and leaks no event details', async () => {
  const user = await person();
  const abort = new AbortController();
  const url = `http://127.0.0.1:${servers[0].address().port}/api/events`;
  try {
    const response = await fetch(url, { headers: { Cookie: user.cookie }, signal: abort.signal });
    assert.equal(response.status, 200);
    const frames = changeFrames(response.body.getReader());
    assert.match((await frames.next()).value, /event: change\ndata: {}/);
    await post('/teams', user, draft, { index: 1 }).expect(200);
    const next = await Promise.race([
      frames.next(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('No cross-instance event')), 5000).unref())
    ]);
    assert.equal(next.value, 'event: change\ndata: {}\n\n');
  } finally {
    abort.abort();
  }
});

test('a private join request refreshes its leader but not an unrelated viewer', async () => {
  const leader = await person('Leader');
  const outsider = await person('Unrelated viewer');
  const applicant = await person('Applicant');
  const id = await team(leader);
  await new Promise(resolve => setTimeout(resolve, 1250));
  const abort = new AbortController();
  const url = `http://127.0.0.1:${servers[0].address().port}/api/events`;
  try {
    async function stream(user) {
      const response = await fetch(url, { headers: { Cookie: user.cookie }, signal: abort.signal });
      assert.equal(response.status, 200);
      const frames = changeFrames(response.body.getReader());
      assert.match((await frames.next()).value, /event: change/);
      return frames;
    }
    const [inbox, boardViewer] = await Promise.all([stream(leader), stream(outsider)]);
    await join(id, applicant);
    const next = await Promise.race([
      inbox.next(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Leader received no event')), 5000).unref())
    ]);
    assert.equal(next.value, 'event: change\ndata: {}\n\n');
    const unrelated = await Promise.race([
      boardViewer.next().then(() => true),
      new Promise(resolve => setTimeout(() => resolve(false), 400))
    ]);
    assert.equal(unrelated, false);
  } finally {
    abort.abort();
  }
});
