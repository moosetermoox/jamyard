/**
 * Teacher-console access check.
 *
 * The host screen is projected to the class, so "teacher-only" UI needs a
 * second, private device — the /teacher console. The console proves it's
 * the teacher one of three ways:
 *
 *   1. Room PIN — a 4-digit PIN generated at room creation, delivered via
 *      the host screen's "Copy teacher link" deep link (never displayed on
 *      the projector). Defense for setups without a site password.
 *   2. Site password — when SITE_PASSWORD is set, the /teacher page sits
 *      behind HTTP Basic Auth, and the socket handshake carries the same
 *      Authorization header. A valid header is teacher-proof on its own
 *      (students don't have the password), so no PIN re-entry is needed.
 *   3. Teacher key (2026-09-28) — a long random secret minted at room
 *      create and kept by the teacher's own browser: the projector gets it
 *      in room-created and hands it on with the PIN (the host launch relay,
 *      the teacher link, the report link, "Open the projector again"). It
 *      is the credential a student cannot guess.
 *
 * THE GATE (gateTeacher). A reviewer locked a real console for five
 * minutes with five wrong PINs typed off the projector's room code: the
 * throttle was room-wide and refused even the right PIN, so any student
 * could deny the teacher all class. Now:
 *   - the key and the site password are checked FIRST and never touch the
 *     throttle, so no amount of guessing locks the teacher's own browser
 *     (or the owner) out;
 *   - a typed PIN still goes through the room-wide throttle (engine/
 *     pin-throttle.js), keyed by room so fresh sockets or many machines
 *     gain nothing: about five guesses per five minutes, a few percent of
 *     the space over a room's six-hour life, and a locked room refuses
 *     even the right typed PIN (the message points at the teacher link);
 *   - a wrong key or an empty PIN is not a PIN guess and is not counted
 *     (the key is not guessable, and an empty try guesses nothing).
 *
 * Pure functions — server passes the room's credentials and env password in.
 */

import { randomUUID } from 'node:crypto';

/**
 * @param {{ pin?: string, key?: string, authHeader?: string }} provided   What the console sent
 * @param {{ teacherPin?: string, teacherKey?: string, sitePassword?: string }} expected
 * @returns {boolean}
 */
export function checkTeacherAccess(provided, expected) {
  return teacherAccessVia(provided, expected) !== null;
}

/**
 * Which credential lets this request in: 'key' | 'site' | 'pin' | null.
 */
export function teacherAccessVia(provided, expected) {
  const key = provided && typeof provided.key === 'string' ? provided.key.trim() : '';
  const teacherKey = expected && expected.teacherKey ? String(expected.teacherKey) : '';
  if (teacherKey && key && key === teacherKey) return 'key';
  if (siteAuthOk(provided, expected)) return 'site';

  const pin = provided && typeof provided.pin === 'string' ? provided.pin.trim() : '';
  const teacherPin = expected && expected.teacherPin ? String(expected.teacherPin) : null;
  if (teacherPin && pin && pin === teacherPin) return 'pin';
  return null;
}

/**
 * The gate every teacher door goes through. The key and the site password
 * skip the throttle; a typed PIN is throttled room-wide.
 * @returns {{ok: true, via: string} | {ok: false, reason: 'locked', retryAfterMs: number} | {ok: false, reason: 'wrong', locked: boolean}}
 */
export function gateTeacher({ provided, expected, throttle, code, now }) {
  const via = teacherAccessVia(provided, expected);
  if (via === 'key' || via === 'site') return { ok: true, via };
  const gate = throttle.check(code, now);
  if (!gate.allowed) return { ok: false, reason: 'locked', retryAfterMs: gate.retryAfterMs };
  if (via === 'pin') {
    throttle.recordSuccess(code);
    return { ok: true, via };
  }
  const pin = provided && typeof provided.pin === 'string' ? provided.pin.trim() : '';
  if (!pin) return { ok: false, reason: 'wrong', locked: false };
  const fail = throttle.recordFailure(code, now);
  return { ok: false, reason: 'wrong', locked: !!fail.locked };
}

function siteAuthOk(provided, expected) {
  // Basic-auth: only meaningful when a site password is configured.
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

/** 4-digit PIN, "1000"–"9999" — short enough to live in a copyable link. */
export function generateTeacherPin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/** The teacher key: a long random secret the teacher's browser keeps. */
export function generateTeacherKey() {
  return randomUUID().replace(/-/g, '');
}
