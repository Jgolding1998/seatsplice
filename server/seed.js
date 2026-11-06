import { connect } from './db.js';
import { seedFixtures } from './fixtures.js';

const { MONGO_URL, MONGO_DATABASE = 'crewboard_fixtures' } = process.env;
if (!MONGO_URL || !MONGO_DATABASE.endsWith('_fixtures')) {
  throw new Error('Seed only into a dedicated database with a name ending in _fixtures. Set MONGO_URL and MONGO_DATABASE.');
}
const db = await connect(MONGO_URL, MONGO_DATABASE);
try {
  console.log(await seedFixtures(db));
} finally {
  await db.client.close();
}
