import { MongoClient } from 'mongodb';

export const eventId = 'hack4hack-ps1';

export async function connect(url, name) {
  const client = new MongoClient(url, { serverSelectionTimeoutMS: 8000, maxPoolSize: 60 });
  try {
    await client.connect();
    const db = client.db(name);
    const collections = Object.fromEntries(
      ['users', 'sessions', 'teams', 'memberships', 'requests', 'invites', 'audit', 'operations', 'limits']
        .map(name => [name, db.collection(name)])
    );
    const { users, sessions, teams, memberships, requests, invites, audit, operations, limits } = collections;
    await Promise.all([
      users.createIndex({ email: 1 }, { unique: true }),
      sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      teams.createIndex({ open: 1, _id: 1 }),
      teams.createIndex({ open: 1, skillKeys: 1, _id: 1 }),
      memberships.createIndex({ hackathonId: 1, userId: 1 }, { unique: true }),
      requests.createIndex({ teamId: 1, userId: 1 }, {
        unique: true, partialFilterExpression: { status: 'pending' }
      }),
      requests.createIndex({ teamId: 1, status: 1, createdAt: 1 }),
      requests.createIndex({ teamId: 1, userId: 1, createdAt: -1 }),
      requests.createIndex({ userId: 1, status: 1, createdAt: -1 }),
      invites.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      invites.createIndex({ teamId: 1, issuerId: 1 }),
      audit.createIndex({ teamId: 1, createdAt: -1, _id: -1 }),
      operations.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      limits.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
    ]);
    return { ...collections, client };
  } catch (error) {
    await client.close();
    throw error;
  }
}

export function transaction(db, run) {
  return db.client.withSession(session => session.withTransaction(() => run(session), {
    readConcern: { level: 'snapshot' },
    writeConcern: { w: 'majority' },
    readPreference: 'primary',
    timeoutMS: 10000
  }));
}

export const membershipQuery = userId => ({ hackathonId: eventId, userId });
