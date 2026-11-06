// Mirrors the server's input limits so people get a clear message before a round trip.
export const LIMITS = {
  name: [2, 50],
  password: [12, 128],
  teamName: [2, 60],
  description: 320,
  skillLength: 28,
  skillCount: 8,
  query: 80
};
export const INVITE_CODE = /^[A-Za-z0-9_-]{22}$/;
export const SIZES = [2, 3, 4, 5, 6];

const VALID_ZONE = /^[a-zA-Z_]+(?:\/[a-zA-Z0-9_+-]+)*$/;

export function browserTimezone() {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return VALID_ZONE.test(zone) ? zone : 'UTC';
  } catch {
    return 'UTC';
  }
}

export function timezoneOptions(selected) {
  const known = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return [...new Set([...known.filter(zone => VALID_ZONE.test(zone)), 'UTC', selected])].sort();
}

export const zoneLabel = zone => (zone ?? '').replaceAll('_', ' ');

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const clock = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });

export function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : dateTime.format(date);
}
export const formatClock = date => clock.format(date);

export function teamState({ memberCount, minSize, maxSize }) {
  if (memberCount >= maxSize) return { label: 'Full', tone: 'neutral' };
  const seats = `${memberCount} of ${maxSize} seats`;
  if (memberCount < minSize) {
    const needed = minSize - memberCount;
    return { label: `Forming, ${needed} more to be active`, tone: 'forming', seats };
  }
  return { label: memberCount === maxSize - 1 ? 'Active, last seat' : 'Active', tone: 'active', seats };
}

export function plural(count, singular, many = `${singular}s`) {
  return `${count} ${count === 1 ? singular : many}`;
}

const AUDIT_TEXT = {
  team_created: entry => `${entry.actorName} created the team`,
  join_requested: entry => `${entry.actorName} asked to join`,
  invite_accepted: entry => `${entry.actorName} claimed a seat with an invite code`,
  join_cancelled: entry => `${entry.actorName}'s request was cancelled because they joined a team`,
  join_withdrawn: entry => `${entry.actorName} withdrew a join request`,
  join_approved: entry => `${entry.actorName} approved ${entry.subjectName}`,
  join_declined: entry => `${entry.actorName} declined ${entry.subjectName}`,
  invite_issued: entry => `${entry.actorName} created an invite code`,
  member_left: entry => `${entry.actorName} left the team`,
  member_removed: entry => `${entry.actorName} removed ${entry.subjectName}`,
  leadership_transferred: entry => `${entry.subjectName} became team leader`,
  team_deleted: entry => `${entry.actorName} left as the last member, so the team was deleted`
};

export function auditText(entry) {
  const known = Object.hasOwn(AUDIT_TEXT, entry.action) ? AUDIT_TEXT[entry.action] : null;
  if (known) return known(entry);
  const action = String(entry.action ?? 'change').replaceAll(/[._]/g, ' ');
  return `${entry.actorName}: ${action}${entry.subjectName ? `, ${entry.subjectName}` : ''}`;
}

export function retryHint(error) {
  return error?.retryAfter ? ` Try again in ${plural(error.retryAfter, 'second')}.` : '';
}

export const errorText = error => (error ? `${error.message}${retryHint(error)}` : '');
