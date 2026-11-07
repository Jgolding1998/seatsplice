import { eventId } from './db.js';

const skills = ['React', 'Node.js', 'Design', 'MongoDB', 'Testing', 'DevOps', 'TypeScript', 'Python', 'Mobile', 'Rust'];
const zones = ['America/Chicago', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Asia/Kolkata', 'Asia/Tokyo'];
const first = ['Alex', 'Jordan', 'Taylor', 'Chris', 'Sarah', 'Marcus', 'Ava', 'Jamie', 'Maya', 'Sam', 'Riley', 'Morgan'];
const last = ['Rivera', 'Chen', 'Brooks', 'Patel', 'Reed', 'Nguyen', 'Kim', 'Bennett', 'Ortiz', 'Walker'];
const lookingFor = [
  'A weekend project that makes everyday life a little less annoying.',
  'A small team that wants to ship a working prototype.',
  'Something with a dashboard, real data, and a reasonable number of tabs.',
  'A project where design and accessibility are part of the first commit.'
];
const samples = [
  ['Rubber Duck Debuggers', 'We have a duck and no roadmap. Looking for someone with either a data model or a second duck.'],
  ['Stack Underflow', 'One exception away from a breakthrough. Working on a tiny dashboard for huge logs.'],
  ['Merge Conflict Club', 'Main branch is protected for a reason. Seeking a designer who believes in second chances.'],
  ['The Null Pointers', 'Building a better lost-and-found app. If we can find the USB stick, we can find anything.'],
  ['CSS Is My Passion', 'We like crisp layouts, quiet keyboards, and divs that are centered on purpose.'],
  ['Ctrl Alt Elite', 'Accessibility is a feature. Breakfast is a dependency.'],
  ['O(Oh No)', 'Our prototype runs in exponential time. Our snack budget does too.'],
  ['Cache Me Outside', 'Fast UI, slow coffee. Help us finish a map for people who get lost indoors.']
];

function fixtureId(prefix, index) {
  return `${prefix}0000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

async function insertMissing(collection, documents, identity = doc => ({ _id: doc._id })) {
  for (let offset = 0; offset < documents.length; offset += 500) {
    await collection.bulkWrite(documents.slice(offset, offset + 500).map(document => ({
      updateOne: { filter: identity(document), update: { $setOnInsert: document }, upsert: true }
    })), { ordered: false });
  }
}

async function refreshDemoNames(collection, documents, field) {
  await collection.bulkWrite(documents.map(document => ({
    updateOne: { filter: { _id: document._id, fixture: true, [field]: { $ne: document[field] } },
      update: { $set: { [field]: document[field] } } }
  })), { ordered: false });
}

export async function seedFixtures(db, { participants = 10000, teamCount = 2000 } = {}) {
  if (participants < teamCount * 3) throw new Error('Fixture pool is too small for the requested teams.');
  const users = Array.from({ length: participants }, (_, index) => ({
    _id: fixtureId('d', index),
    email: `participant-${index}@crewboard.invalid`,
    name: `${first[(index + 5 * Math.floor(index / first.length)) % first.length]} ${last[Math.floor(index / first.length) % last.length]}`,
    skills: [skills[index % skills.length], skills[(index + 3) % skills.length]],
    timezone: zones[index % zones.length],
    ...(participants <= 100 && { lookingFor: lookingFor[index % lookingFor.length] }),
    fixture: true
  }));
  const memberships = [];
  const teams = Array.from({ length: teamCount }, (_, index) => {
    const id = fixtureId(index < samples.length ? '0' : 'e', index);
    const [name, description] = samples[index] ?? [
      `Build Crew ${String(index + 1).padStart(4, '0')}`,
      'Seeking a teammate to prototype, debug, and ship something before the weekend ends.'
    ];
    const members = users.slice(index * 3, index * 3 + 1 + (index % 3));
    for (const user of members) memberships.push({ hackathonId: eventId, userId: user._id, teamId: id });
    return {
      _id: id, name, description, skills: members[0].skills,
      skillKeys: members[0].skills.map(value => value.toLowerCase()),
      timezone: members[0].timezone, minSize: 2, maxSize: index % 2 ? 4 : 3,
      memberIds: members.map(user => user._id), leaderId: members[0]._id, leaderName: members[0].name,
      open: index % 3 !== 2 || index % 2 === 1, version: 1, fixture: true
    };
  });
  await insertMissing(db.users, users);
  await insertMissing(db.teams, teams);
  await insertMissing(db.memberships, memberships, doc => ({ hackathonId: doc.hackathonId, userId: doc.userId }));
  if (participants <= 100) {
    if (users.length) await refreshDemoNames(db.users, users, 'name');
    if (teams.length) await refreshDemoNames(db.teams, teams, 'leaderName');
  }
  return { participants, teamCount };
}
