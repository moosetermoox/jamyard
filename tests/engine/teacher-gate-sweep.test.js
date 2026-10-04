/**
 * The teacher gates, swept (cause 4 of docs/ARCHITECTURE-REVIEW-2026-10.md,
 * eighth pass, 2026-10-03). Two rules from CLAUDE.md:
 *   - every route or socket event that takes a room PIN or teacher key
 *     goes through engine/teacher-auth.js (the report and journal routes
 *     took unlimited guesses before 2026-09-28);
 *   - a socket event that drives the room (a close, a Next step, a
 *     moderation) is the teacher's: the handler checks the sender.
 * The first run found `close-sorting` with no sender check: any student
 * could close the class's sort step.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { EVENTS } from '../../engine/events.js';
import { EVENT_SCHEMAS } from '../../engine/event-schemas.js';

const server = readFileSync(new URL('../../server.js', import.meta.url), 'utf8');

// Socket handlers by event name, from `socket.on(EVENTS.X, ...)` to the next one
function socketHandlers() {
  const out = new Map();
  const re = /socket\.on\((EVENTS\.([A-Z_]+)|'([a-z-]+)'|([a-zA-Z]+)),/g;
  const hits = [...server.matchAll(re)];
  for (let i = 0; i < hits.length; i++) {
    const m = hits[i];
    const name = m[2] ? EVENTS[m[2]] : (m[3] || `<${m[4]}>`);
    const body = server.slice(m.index, i + 1 < hits.length ? hits[i + 1].index : m.index + 20000);
    out.set(name, body);
  }
  return out;
}

const TEACHER_CHECK = /isTeacherSocket\(|roomToHost\.get\(code\)\s*!==?\s*socket\.id/;

// Events that drive the room: the teacher's to send
const TEACHER_ACTIONS = new Set([
  'start-game', 'advance-phase', 'retry-phase', 'skip-phase', 'end-game', 'extend-timer',
  'close-submissions', 'close-voting', 'close-ranking', 'close-merge', 'close-one-voice',
  'close-solo-quiz', 'close-estimates', 'close-sorting', 'close-matching', 'close-rating',
  'close-wager', 'close-checklist', 'reveal-next', 'wager-resolve', 'relay-finish-all',
  'buzz-judge', 'buzz-next', 'buzz-finish', 'estimate-set-answer', 'team-assign',
  'team-split-confirm', 'check-item', 'moderate-hide', 'moderate-kick', 'moderate-rename',
  'show-discussion', 'spotlight'
]);

describe('every socket event that drives the room checks the sender is a teacher', () => {
  const handlers = socketHandlers();

  it('finds the handlers', () => {
    expect(handlers.size).toBeGreaterThan(40);
  });

  for (const event of TEACHER_ACTIONS) {
    it(`${event}`, () => {
      const body = handlers.get(event);
      expect(body, `no handler found for ${event}`).toBeTruthy();
      expect(TEACHER_CHECK.test(body), `${event} drives the room and never checks the sender (isTeacherSocket or the host's socket)`).toBe(true);
    });
  }

  it('every close-* and moderate-* event is on the list, and every handler that checks the sender is too', () => {
    const missing = [];
    for (const [event, body] of handlers) {
      if (event.startsWith('<')) continue; // a dynamic name (the preview events)
      const looksTeacher = /^(close-|moderate-)/.test(event) || TEACHER_CHECK.test(body);
      if (looksTeacher && !TEACHER_ACTIONS.has(event)) missing.push(event);
    }
    expect(missing, 'events that act like teacher actions but are not on TEACHER_ACTIONS (add them)').toEqual([]);
  });
});

describe('every PIN or teacher key is checked by engine/teacher-auth.js', () => {
  it('the HTTP query is read in one place, the gate helper', () => {
    expect(server.match(/req\.query\.pin/g) || []).toHaveLength(1);
    expect(server.match(/req\.query\.key/g) || []).toHaveLength(1);
    const helper = server.slice(server.indexOf('function teacherGateForRequest'), server.indexOf('function teachersChannel'));
    expect(helper).toContain('req.query.pin');
    expect(helper).toContain('gateTeacher(');
  });

  it('every room route but the public info lookup goes through the gate helper', () => {
    const re = /app\.(get|post|put|delete)\('\/api\/rooms\/:code([^']*)'/g;
    const routes = [...server.matchAll(re)];
    expect(routes.length).toBeGreaterThanOrEqual(3);
    for (const m of routes) {
      const body = server.slice(m.index, server.indexOf('\napp.', m.index + 10));
      if (m[2] === '/info') {
        expect(body).not.toContain('teacherGateForRequest'); // public facts only: the room exists, its name, the anonymous flag
        continue;
      }
      expect(body, `/api/rooms/:code${m[2]} reads the room without the teacher gate`).toContain('teacherGateForRequest(req, room)');
    }
  });

  it('every socket event whose payload carries a pin or key calls gateTeacher', () => {
    const handlers = socketHandlers();
    const withCredential = Object.entries(EVENT_SCHEMAS).filter(([, s]) => s && (s.pin || s.key)).map(([n]) => n);
    expect(withCredential.sort()).toEqual(['host-rejoin', 'join-teacher']);
    for (const event of withCredential) {
      expect(handlers.get(event), `no handler for ${event}`).toBeTruthy();
      expect(handlers.get(event)).toContain('gateTeacher(');
    }
  });

  it('nothing compares a PIN or key by hand', () => {
    const engineFiles = ['server.js'];
    for (const f of engineFiles) {
      const src = readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
      expect(src).not.toMatch(/===\s*room\.teacher(Pin|Key)|room\.teacher(Pin|Key)\s*===/);
    }
  });
});
