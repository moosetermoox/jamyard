/**
 * Teacher-console access check.
 *
 * The host screen is projected to the class, so "teacher-only" UI needs a
 * second, private device — the /teacher console. The console proves it's
 * the teacher one of two ways:
 *
 *   1. Room PIN — a 4-digit PIN generated at room creation, shown on the
 *      host screen behind a click-to-reveal (the teacher peeks before
 *      projecting). Defense for setups without a site password.
 *   2. Site password — when SITE_PASSWORD is set, the /teacher page sits
 *      behind HTTP Basic Auth, and the socket handshake carries the same
 *      Authorization header. A valid header is teacher-proof on its own
 *      (students don't have the password), so no PIN re-entry is needed.
 *
 * Pure function — server passes the room's PIN and env password in.
 */

/**
 * @param {{ pin?: string, authHeader?: string }} provided   What the console sent
 * @param {{ teacherPin?: string, sitePassword?: string }} expected
 * @returns {boolean}
 */
export function checkTeacherAccess(provided, expected) {
  const pin = provided && typeof provided.pin === 'string' ? provided.pin.trim() : '';
  const teacherPin = expected && expected.teacherPin ? String(expected.teacherPin) : null;

  if (teacherPin && pin && pin === teacherPin) return true;

  // Basic-auth fallback: only meaningful when a site password is configured.
  const sitePassword = expected && expected.sitePassword;
  const header = provided && provided.authHeader;
  if (sitePassword && typeof header === 'string' && header.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(header.slice(6), 'base64').toString('utf-8');
      const password = decoded.slice(decoded.indexOf(':') + 1);
      if (password === sitePassword) return true;
    } catch {
      /* malformed header — fall through to reject */
    }
  }

  return false;
}

/** 4-digit PIN, "1000"–"9999" — easy to read off a click-to-reveal chip. */
export function generateTeacherPin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}
