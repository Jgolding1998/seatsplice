import { randomUUID } from 'node:crypto';
import { hash, publicFields, publicUser } from './auth.js';
import { eventId, membershipQuery, transaction } from './db.js';
import { fail } from './input.js';

const hour = 60 * 60 * 1000;
const teamSummary = team => ({
  id: team._id, name: team.name, description: team.description, skills: team.skills, timezone: team.timezone,
  minSize: team.minSize, maxSize: team.maxSize, memberCount: team.memberIds.length, leaderName: team.leaderName,
  ready: team.memberIds.length >= team.minSize, sample: team.fixture === true
});

export async function once(db, actor, key, route, input, action) {
  const operationId = hash(JSON.stringify([actor._id, key]));
  const signature = hash(JSON.stringify([route, input]));
  function replay(previous) {
    if (previous.signature !== signature) fail(409, 'KEY_REUSED', 'That request key was used for another action.');
    return previous.result;
  }
  try {
    return await transaction(db, async session => {
      const previous = await db.operations.findOne({ _id: operationId }, { session });
      if (previous) return replay(previous);
      await db.operations.insertOne({
        _id: operationId, signature, expiresAt: new Date(Date.now() + 24 * hour)
      }, { session });
      const result = await action(session);
      await db.operations.updateOne({ _id: operationId }, { $set: { result } }, { session });
      return result;
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    const previous = await db.operations.findOne({ _id: operationId });
    if (previous) return replay(previous);
    fail(409, 'STATE_CONFLICT', 'The team state changed. Refresh and try again.');
  }
}

async function record(db, session, teamId, action, actor, subject = actor, audience = [actor._id, subject._id]) {
  await db.audit.insertOne({
    _id: randomUUID(), teamId, action, actorId: actor._id, subjectId: subject._id,
    actorName: actor.name, subjectName: subject.name, audience, createdAt: new Date()
  }, { session });
}

async function getTeam(db, session, teamId) {
  const team = await db.teams.findOne({ _id: teamId }, { session });
  if (!team) fail(404, 'TEAM_NOT_FOUND', 'This team is no longer available.');
  return team;
}

function requireLeader(team, actor) {
  if (team.leaderId !== actor._id) fail(403, 'LEADER_ONLY', 'Only the current team leader can do that.');
}

async function requireUnassigned(db, session, userId) {
  // Concurrent applications and enrollment serialize per applicant, not per team.
  await db.users.updateOne({ _id: userId }, { $inc: { membershipVersion: 1 } }, { session });
  if (await db.memberships.findOne(membershipQuery(userId), { session })) {
    fail(409, 'ALREADY_ON_TEAM', 'This participant is already on a team.');
  }
}

async function cancelOtherRequests(db, session, user, except) {
  const filter = { userId: user._id, status: 'pending' };
  if (except) filter._id = { $ne: except };
  const pending = await db.requests.find(filter, { session }).toArray();
  if (!pending.length) return;
  await db.requests.updateMany(filter, { $set: { status: 'cancelled' } }, { session });
  for (const request of pending) {
    const team = await db.teams.findOne({ _id: request.teamId }, { session });
    if (team) await record(db, session, team._id, 'join_cancelled', user, user, [user._id, ...team.memberIds]);
  }
}

async function changeTeam(db, session, team, changes) {
  const result = await db.teams.updateOne({ _id: team._id, version: team.version }, {
    $set: changes, $inc: { version: 1 }
  }, { session });
  if (!result.matchedCount) fail(409, 'STATE_CONFLICT', 'The team state changed. Refresh and try again.');
}

export async function createTeam(db, session, actor, input) {
  await requireUnassigned(db, session, actor._id);
  const teamId = randomUUID();
  await db.teams.insertOne({
    _id: teamId, ...input, skillKeys: input.skills.map(skill => skill.toLowerCase()),
    memberIds: [actor._id], leaderId: actor._id, leaderName: actor.name, open: true, version: 1
  }, { session });
  await db.memberships.insertOne({ ...membershipQuery(actor._id), teamId }, { session });
  await cancelOtherRequests(db, session, actor);
  await record(db, session, teamId, 'team_created', actor);
  return { id: teamId };
}

export async function updateTeam(db, session, actor, teamId, input) {
  const team = await getTeam(db, session, teamId);
  requireLeader(team, actor);
  if (input.maxSize < team.memberIds.length) {
    fail(409, 'SEATS_OCCUPIED', 'Maximum seats must fit everyone already on the team.');
  }
  await changeTeam(db, session, team, {
    ...input, skillKeys: input.skills.map(skill => skill.toLowerCase()), open: team.memberIds.length < input.maxSize
  });
  await record(db, session, teamId, 'team_updated', actor, actor, team.memberIds);
  return { id: teamId };
}

export async function updateProfile(db, session, actor, profile) {
  const user = await db.users.findOneAndUpdate({ _id: actor._id }, { $set: profile }, {
    returnDocument: 'after', projection: { passwordHash: 0 }, session
  });
  const membership = await db.memberships.findOne(membershipQuery(actor._id), { session });
  if (membership) {
    const team = await getTeam(db, session, membership.teamId);
    if (team.leaderId === actor._id && team.leaderName !== user.name) {
      await changeTeam(db, session, team, { leaderName: user.name });
    }
    await record(db, session, team._id, 'profile_updated', user, user, team.memberIds);
  }
  return { profile: publicUser(user) };
}

export async function requestJoin(db, session, actor, teamId) {
  const team = await getTeam(db, session, teamId);
  if (team.fixture) fail(409, 'SAMPLE_TEAM', 'This sample team is for browsing.');
  await requireUnassigned(db, session, actor._id);
  const existing = await db.requests.findOne({ teamId, userId: actor._id, status: 'pending' }, { session });
  if (existing) return { id: existing._id, teamId, status: 'pending' };
  if (!team.open) fail(409, 'TEAM_FULL', 'This team has no open seats.');
  const pending = await db.requests.find({ userId: actor._id, status: 'pending' }, { session }).toArray();
  const available = await db.teams.countDocuments({ _id: { $in: pending.map(request => request.teamId) } }, { session });
  if (available >= 12) fail(409, 'REQUEST_LIMIT', 'You already have 12 pending join requests.');
  const lastDeclined = await db.requests.findOne({
    teamId, userId: actor._id, status: 'declined', decidedAt: { $gt: new Date(Date.now() - 60000) }
  }, { session });
  if (lastDeclined) fail(409, 'REQUEST_COOLDOWN', 'Wait a minute before asking this team again.');
  const requestId = randomUUID();
  await db.requests.insertOne({
    _id: requestId, teamId, userId: actor._id, status: 'pending', createdAt: new Date()
  }, { session });
  await record(db, session, teamId, 'join_requested', actor, actor, [actor._id, ...team.memberIds]);
  return { id: requestId, teamId, status: 'pending' };
}

async function claimSeat(db, session, team, applicant, requestId) {
  if (!team.open) fail(409, 'TEAM_FULL', 'This team has no open seats.');
  await requireUnassigned(db, session, applicant._id);
  const memberIds = [...team.memberIds, applicant._id];
  await changeTeam(db, session, team, { memberIds, open: memberIds.length < team.maxSize });
  await db.memberships.insertOne({ ...membershipQuery(applicant._id), teamId: team._id }, { session });
  await cancelOtherRequests(db, session, applicant, requestId);
}

export async function decideRequest(db, session, actor, teamId, requestId, decision) {
  const team = await getTeam(db, session, teamId);
  requireLeader(team, actor);
  const request = await db.requests.findOne({ _id: requestId, teamId }, { session });
  if (!request) fail(404, 'REQUEST_NOT_FOUND', 'This join request is unavailable.');
  if (request.status === decision) return { id: requestId, status: decision };
  if (request.status !== 'pending') fail(409, 'REQUEST_CLOSED', 'This join request is already closed.');
  const applicant = await db.users.findOne({ _id: request.userId }, { projection: publicFields, session });
  if (!applicant) fail(404, 'APPLICANT_NOT_FOUND', 'The applicant is unavailable.');
  if (decision === 'approved') {
    await claimSeat(db, session, team, applicant, requestId);
  } else {
    // Serialize with leader changes so a former leader cannot decline after a handoff.
    await changeTeam(db, session, team, {});
  }
  await db.requests.updateOne({ _id: requestId }, { $set: { status: decision, decidedAt: new Date() } }, { session });
  await record(db, session, teamId, `join_${decision}`, actor, applicant, [applicant._id, ...team.memberIds]);
  return { id: requestId, status: decision };
}

export async function withdrawRequest(db, session, actor, teamId, requestId) {
  const team = await getTeam(db, session, teamId);
  const result = await db.requests.updateOne({ _id: requestId, teamId, userId: actor._id, status: 'pending' }, {
    $set: { status: 'withdrawn', decidedAt: new Date() }
  }, { session });
  if (!result.matchedCount) fail(409, 'REQUEST_UNAVAILABLE', 'You can only withdraw your own pending request.');
  await record(db, session, teamId, 'join_withdrawn', actor, actor, [actor._id, ...team.memberIds]);
  return { id: requestId, status: 'withdrawn' };
}

export async function ownRequests(db, actor) {
  const [pending, recent] = await Promise.all([
    db.requests.find({ userId: actor._id, status: 'pending' }).sort({ createdAt: -1 }).limit(50).toArray(),
    db.requests.find({ userId: actor._id, status: { $ne: 'pending' } }).sort({ createdAt: -1 }).limit(8).toArray()
  ]);
  const all = [...pending, ...recent];
  const teams = await db.teams.find({ _id: { $in: [...new Set(all.map(item => item.teamId))] } }, {
    projection: { name: 1 }
  }).toArray();
  const names = new Map(teams.map(team => [team._id, team.name]));
  return { requests: all.filter(request => names.has(request.teamId)).map(request => ({
    id: request._id, teamId: request.teamId, teamName: names.get(request.teamId), status: request.status
  })) };
}

export async function issueInvite(db, session, actor, teamId, code) {
  const team = await getTeam(db, session, teamId);
  requireLeader(team, actor);
  if (!team.open) fail(409, 'TEAM_FULL', 'This team has no open seats.');
  await changeTeam(db, session, team, {});
  const expiresAt = new Date(Date.now() + hour);
  await db.invites.insertOne({ _id: hash(code), teamId, issuerId: actor._id, expiresAt }, { session });
  await record(db, session, teamId, 'invite_issued', actor, actor, team.memberIds);
  return { expiresAt: expiresAt.toISOString() };
}

export async function redeemInvite(db, session, actor, code) {
  const invite = await db.invites.findOne({ _id: hash(code), expiresAt: { $gt: new Date() } }, { session });
  if (!invite) fail(404, 'INVITE_INVALID', 'This invitation is invalid or has expired.');
  if (invite.claimedAt) fail(409, 'INVITE_USED', 'This invitation has already been used.');
  const team = await getTeam(db, session, invite.teamId);
  if (team.leaderId !== invite.issuerId) fail(404, 'INVITE_INVALID', 'This invitation is invalid or has expired.');
  const existing = await db.requests.findOne({ teamId: team._id, userId: actor._id, status: 'pending' }, { session });
  await claimSeat(db, session, team, actor, existing?._id);
  const claimedAt = new Date();
  const result = await db.invites.updateOne({ _id: invite._id, expiresAt: { $gt: claimedAt } }, {
    $set: { claimedAt, claimedBy: actor._id }
  }, { session });
  if (!result.matchedCount) fail(404, 'INVITE_INVALID', 'This invitation is invalid or has expired.');
  if (existing) {
    await db.requests.updateOne({ _id: existing._id }, { $set: { status: 'approved', decidedAt: claimedAt } }, { session });
  }
  await record(db, session, team._id, 'invite_accepted', actor);
  return { teamId: team._id, status: 'approved' };
}

export async function removeMember(db, session, actor, teamId, memberId, isLeave) {
  const team = await getTeam(db, session, teamId);
  if (!isLeave) {
    requireLeader(team, actor);
    if (memberId === actor._id) fail(400, 'USE_LEAVE', 'Use Leave team to step down.');
  }
  if (!team.memberIds.includes(memberId)) fail(404, 'MEMBER_NOT_FOUND', 'This participant is not on the team.');
  const subject = isLeave ? actor : await db.users.findOne({ _id: memberId }, { projection: publicFields, session });
  const memberIds = team.memberIds.filter(id => id !== memberId);
  await db.memberships.deleteOne({ ...membershipQuery(memberId), teamId }, { session });
  await record(db, session, teamId, isLeave ? 'member_left' : 'member_removed', actor, subject);
  if (memberIds.length === 0) {
    await db.teams.deleteOne({ _id: teamId }, { session });
    await db.invites.deleteMany({ teamId }, { session });
    await db.requests.deleteMany({ teamId }, { session });
    await record(db, session, teamId, 'team_deleted', actor);
  } else {
    const changes = { memberIds, open: true };
    if (team.leaderId === memberId) {
      const next = await db.users.findOne({ _id: memberIds[0] }, { projection: publicFields, session });
      changes.leaderId = next._id;
      changes.leaderName = next.name;
      await db.invites.deleteMany({ teamId, issuerId: memberId }, { session });
      await record(db, session, teamId, 'leadership_transferred', actor, next);
    }
    await changeTeam(db, session, team, changes);
  }
  return { ok: true };
}

export async function board(db, { q, skill, cursor }) {
  const filter = { open: true };
  if (skill) filter.skillKeys = skill.toLowerCase();
  if (cursor) filter._id = { $gt: cursor };
  if (q) {
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: regex }, { description: regex }, { skills: regex }];
  }
  const rows = await db.teams.find(filter).sort({ _id: 1 }).limit(13).toArray();
  return { teams: rows.slice(0, 12).map(teamSummary), nextCursor: rows.length > 12 ? rows[11]._id : null };
}

export async function details(db, actor, teamId) {
  return transaction(db, async session => {
    const team = await getTeam(db, session, teamId);
    const isMember = team.memberIds.includes(actor._id);
    const members = await db.users.find({ _id: { $in: team.memberIds } }, { projection: publicFields, session }).toArray();
    const ownRequest = await db.requests.findOne({ teamId, userId: actor._id }, { sort: { createdAt: -1, _id: -1 }, session });
    const pending = team.leaderId === actor._id
      ? await db.requests.find({ teamId, status: 'pending' }, { session }).sort({ createdAt: 1, _id: 1 }).limit(200).toArray()
      : [];
    const applicants = await db.users.find({ _id: { $in: pending.map(request => request.userId) } }, {
      projection: publicFields, session
    }).toArray();
    const lookup = new Map(applicants.map(user => [user._id, user]));
    const audit = isMember
      ? await db.audit.find({ teamId }, { session }).sort({ createdAt: -1, _id: -1 }).limit(30).toArray()
      : [];
    const order = new Map(members.map(user => [user._id, user]));
    return { team: {
      ...teamSummary(team), leaderId: team.leaderId,
      members: team.memberIds.map(id => publicUser(order.get(id))),
      ownRequest: ownRequest ? { id: ownRequest._id, status: ownRequest.status } : null,
      requests: pending.map(request => ({ id: request._id, user: publicUser(lookup.get(request.userId)), createdAt: request.createdAt })),
      audit: audit.map(({ _id, action, actorName, subjectName, createdAt }) => ({ id: _id, action, actorName, subjectName, createdAt }))
    } };
  });
}

const suggestionCache = new WeakMap();
export const clearSuggestions = db => suggestionCache.delete(db);

function candidatePool(db) {
  const now = Date.now();
  const cached = suggestionCache.get(db);
  if (cached && cached.expiresAt > now) return cached.result;
  const result = Promise.all([
    db.users.find({}, { projection: publicFields }).toArray(),
    db.memberships.find({ hackathonId: eventId }, { projection: { userId: 1 } }).toArray()
  ]).then(([people, assigned]) => {
    const assignedIds = new Set(assigned.map(member => member.userId));
    return people.filter(user => !assignedIds.has(user._id));
  }).catch(error => {
    if (suggestionCache.get(db)?.result === result) suggestionCache.delete(db);
    throw error;
  });
  suggestionCache.set(db, { result, expiresAt: now + 5000 });
  return result;
}

export async function suggestions(db, actor, query = '') {
  const membership = await db.memberships.findOne(membershipQuery(actor._id));
  const team = membership ? await db.teams.findOne({ _id: membership.teamId }) : null;
  const covered = team
    ? (await db.users.find({ _id: { $in: team.memberIds } }, { projection: { skills: 1 } }).toArray()).flatMap(user => user.skills)
    : actor.skills;
  const known = new Set(covered.map(skill => skill.toLowerCase()));
  const formatters = new Map();
  const now = new Date();
  function offset(timeZone) {
    if (!formatters.has(timeZone)) {
      const time = new Intl.DateTimeFormat('en', { timeZone, timeZoneName: 'longOffset' })
        .formatToParts(now).find(part => part.type === 'timeZoneName').value;
      const match = /GMT([+-])(\d\d):(\d\d)/.exec(time);
      formatters.set(timeZone, match ? (match[1] === '-' ? -1 : 1) * (+match[2] * 60 + +match[3]) : 0);
    }
    return formatters.get(timeZone);
  }
  const people = await candidatePool(db);
  const actorOffset = offset(actor.timezone);
  const text = query.toLowerCase();
  return { people: people.filter(user => user._id !== actor._id && (
    !text || user.name.toLowerCase().includes(text) || user.skills.some(skill => skill.toLowerCase().includes(text))
  )).map(user => {
    const additions = user.skills.filter(skill => !known.has(skill.toLowerCase()));
    const difference = Math.abs(offset(user.timezone) - actorOffset) % 1440;
    const hours = Math.min(difference, 1440 - difference) / 60;
    const score = additions.length * 4 + Math.max(0, 4 - Math.ceil(hours));
    return {
      ...publicUser(user), score,
      reason: `${additions.length ? `Adds ${additions.join(', ')}` : 'Shared skill set'} · ${hours ? `${hours}h local time difference` : 'same local time'}`
    };
  }).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)).slice(0, 8) };
}
