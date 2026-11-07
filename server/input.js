import { z } from 'zod';

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const fail = (status, code, message) => { throw new HttpError(status, code, message); };
export const id = z.uuid();
export const empty = z.strictObject({});
const cleanText = (min, max) => z.string().trim().min(min).max(max).refine(
  value => !/[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(value)
    && (!min || /[^\p{Cf}\p{M}\s]/u.test(value)), 'Use visible text.'
);
const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
const password = z.string().min(12).max(128);
const skills = z.array(cleanText(1, 28)).min(1).max(8).transform(
  values => [...new Map(values.map(value => [value.toLowerCase(), value])).values()]
);
const timezone = z.string().trim().min(1).max(80).refine(value => {
  if (!/^[a-zA-Z_]+(?:\/[a-zA-Z0-9_+\-]+)*$/.test(value)) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; }
  catch { return false; }
}, 'Use a valid time zone.');

export const register = z.strictObject({ name: cleanText(2, 50), email, password, skills, timezone });
export const login = z.strictObject({ email, password: z.string().min(1).max(128) });
export const profile = z.strictObject({ name: cleanText(2, 50), skills, timezone, lookingFor: cleanText(0, 160) });
export const team = z.strictObject({
  name: cleanText(2, 60),
  description: cleanText(0, 320),
  skills,
  timezone,
  minSize: z.number().int().min(2).max(6),
  maxSize: z.number().int().min(2).max(6)
}).refine(values => values.minSize <= values.maxSize, {
  path: ['maxSize'], message: 'Maximum size must be at least the minimum.'
});
export const redeem = z.strictObject({ code: z.string().trim().regex(/^[A-Za-z0-9_-]{22}$/) });
export const filters = z.strictObject({
  q: cleanText(0, 80).optional(),
  skill: cleanText(0, 28).optional(),
  cursor: z.union([id, z.literal('')]).optional()
});
export const peopleFilters = z.strictObject({ q: cleanText(0, 80).optional() });

export function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue.path.join('.');
    fail(400, 'INVALID_INPUT', field ? `${field}: ${issue.message}` : issue.message);
  }
  return result.data;
}
