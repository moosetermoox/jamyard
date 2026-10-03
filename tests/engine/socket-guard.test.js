/**
 * Two CLAUDE.md rules turned into chokepoints (cause 4 of
 * docs/ARCHITECTURE-REVIEW-2026-10.md):
 *
 *  1. "New gameplay socket handlers: checkEventPayload + isStalePhaseEvent."
 *     `guardSocket` runs both before any handler; a handler cannot forget.
 *     What a new handler still owes is a SCHEMA in EVENT_SCHEMAS, and the
 *     sweep at the bottom fails when server.js listens for an event without one.
 *
 *  2. "Player-facing payloads sent from a handler's onReconnect must carry
 *     phaseInstanceId." `stampingSocket` stamps every emit; server.js hands
 *     it to every onReconnect.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { guardSocket, REJECTED_EVENT } from '../../engine/socket-guard.js';
import { stampingSocket, withPhaseSeq } from '../../engine/phase-handlers/phase-context.js';
import { EVENT_SCHEMAS } from '../../engine/event-schemas.js';
import { EVENTS } from '../../engine/events.js';
import { getHandler, registerHandler } from '../../engine/phase-handlers/phase-registry.js';
import '../../engine/phase-handlers/relay.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function fakeSocket() {
  const handlers = {};
  const sent = [];
  const socket = {
    id: 'sock-1',
    on(event, fn) { handlers[event] = fn; },
    emit(event, payload) { sent.push({ event, payload }); }
  };
  return { socket, handlers, sent, fire: (event, payload) => handlers[event](payload) };
}

describe('guardSocket: the payload check', () => {
  it('rejects a payload that fails its schema and never runs the handler', async () => {
    const { socket, fire, sent } = fakeSocket();
    guardSocket(socket, {});
    let ran = false;
    socket.on('submit-response', () => { ran = true; });
    await fire('submit-response', { response: 'hi' });
    expect(ran).toBe(false);
    expect(sent).toEqual([{ event: REJECTED_EVENT, payload: { event: 'submit-response', reason: 'Missing required field: code' } }]);
  });

  it('runs the handler on a payload that passes, and on an event with no schema', async () => {
    const { socket, fire } = fakeSocket();
    guardSocket(socket, {});
    const seen = [];
    socket.on('submit-response', (p) => seen.push(p));
    socket.on('no-schema-event', (p) => seen.push(p));
    await fire('submit-response', { code: 'ABCD', response: 'hi' });
    await fire('no-schema-event', 'anything');
    expect(seen).toEqual([{ code: 'ABCD', response: 'hi' }, 'anything']);
  });

  it('treats a missing payload as an empty object (handlers default it the same way)', async () => {
    const { socket, fire, sent } = fakeSocket();
    guardSocket(socket, {});
    socket.on('start-game', () => {});
    await fire('start-game', undefined);
    expect(sent[0].payload.reason).toBe('Missing required field: code');
  });
});

describe('guardSocket: the stale check', () => {
  function roomAt(id) { return { phaseInstanceId: id }; }
  const isStale = (room, id) => id !== room.phaseInstanceId;

  it('drops an event whose phase id is behind the room', async () => {
    const { socket, fire } = fakeSocket();
    guardSocket(socket, { findRoom: () => roomAt(4), isStale });
    let ran = false;
    socket.on('close-submissions', () => { ran = true; });
    await fire('close-submissions', { code: 'ABCD', phaseInstanceId: 3 });
    expect(ran).toBe(false);
    await fire('close-submissions', { code: 'ABCD', phaseInstanceId: 4 });
    expect(ran).toBe(true);
  });

  it('lets an event through when the client sent no id, the room is gone, or the schema has no id', async () => {
    const { socket, fire } = fakeSocket();
    const ran = [];
    guardSocket(socket, { findRoom: (code) => code === 'GONE' ? null : roomAt(4), isStale });
    socket.on('close-submissions', (p) => ran.push(p.code));
    socket.on('end-game', (p) => ran.push('end:' + p.code));
    await fire('close-submissions', { code: 'ABCD' });
    await fire('close-submissions', { code: 'GONE', phaseInstanceId: 1 });
    await fire('end-game', { code: 'ABCD', phaseInstanceId: 1 });
    expect(ran).toEqual(['ABCD', 'GONE', 'end:ABCD']);
  });
});

describe('guardSocket: a throwing handler', () => {
  it('is logged through onError and never thrown', async () => {
    const { socket, fire } = fakeSocket();
    const errors = [];
    guardSocket(socket, { onError: (event, err) => errors.push(event + ': ' + err.message) });
    socket.on('no-schema-event', async () => { throw new Error('boom'); });
    await expect(fire('no-schema-event', {})).resolves.toBeUndefined();
    expect(errors).toEqual(['no-schema-event: boom']);
  });
});

describe('stampingSocket', () => {
  it('stamps the room\'s phaseInstanceId on every object payload and keeps the id', () => {
    const sent = [];
    const s = stampingSocket({ id: 'p1', emit: (e, p) => sent.push({ e, p }) }, { phaseInstanceId: 7 });
    s.emit('x', { a: 1 });
    s.emit('y');
    s.emit('z', 'plain');
    expect(s.id).toBe('p1');
    expect(sent).toEqual([{ e: 'x', p: { a: 1, phaseInstanceId: 7 } }, { e: 'y', p: { phaseInstanceId: 7 } }, { e: 'z', p: 'plain' }]);
    expect(withPhaseSeq({ a: 1 }, {})).toEqual({ a: 1, phaseInstanceId: 0 });
  });

  it('covers a handler that forgot the stamp (the relay bug\'s shape)', () => {
    registerHandler('_forgetful', { onReconnect(ctx, socket) { socket.emit('step-start', { prompt: 'go' }); } });
    const sent = [];
    const room = { phaseInstanceId: 12 };
    getHandler('_forgetful').onReconnect({}, stampingSocket({ id: 'p2', emit: (e, p) => sent.push(p) }, room));
    expect(sent).toEqual([{ prompt: 'go', phaseInstanceId: 12 }]);
  });

  it('the real relay reconnect carries the id for the active student and the waiters', () => {
    const room = {
      phaseInstanceId: 5,
      phaseState: { turnOrder: ['p1', 'p2'], currentTurnIndex: 0, prompt: 'Add a line', sharedResult: 'Once' }
    };
    const ctx = {
      room,
      phaseInstanceId: 5,
      engine: { players: { find: (id) => ({ id, name: 'Student ' + id }) } },
      resolveScreenControl: () => ({})
    };
    const sent = [];
    for (const id of ['p1', 'p2']) {
      getHandler('relay').onReconnect(ctx, stampingSocket({ id, emit: (e, p) => sent.push({ id, e, p }) }, room));
    }
    expect(sent.map(s => [s.id, s.e, s.p.phaseInstanceId])).toEqual([
      ['p1', EVENTS.RELAY_TURN, 5],
      ['p2', EVENTS.RELAY_WAITING, 5]
    ]);
  });
});

describe('server.js is wired to both chokepoints', () => {
  const server = readFileSync(join(root, 'server.js'), 'utf8');

  it('guards every socket at connect and hands every onReconnect a stamping socket', () => {
    expect(server).toMatch(/guardSocket\(socket, \{ findRoom: .*isStale: isStalePhaseEvent \}\)/);
    const calls = server.match(/\.onReconnect\([^)]*\)/g) || [];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) expect(call).toMatch(/stampingSocket\(socket, room\)/);
    expect(server).not.toMatch(/const rawOn = socket\.on\.bind/);
  });

  // Events the server listens for that carry no gameplay payload to check.
  const NO_SCHEMA = new Set(['get-games', 'disconnect']);

  it('every event the server listens for has a schema (a new handler needs a row in EVENT_SCHEMAS)', () => {
    const listened = new Set();
    for (const m of server.matchAll(/socket\.on\(EVENTS\.([A-Z_]+)/g)) listened.add(EVENTS[m[1]]);
    for (const m of server.matchAll(/socket\.on\('([a-z-]+)'/g)) listened.add(m[1]);
    // The preview events are registered from a list
    for (const m of server.matchAll(/for \(const \w+ of \[([^\]]+)\]\) \{\s*socket\.on\(/g)) {
      for (const name of m[1].match(/'([a-z-]+)'/g) || []) listened.add(name.replace(/'/g, ''));
    }
    expect(listened.size).toBeGreaterThan(50);
    const missing = [...listened].filter(e => !EVENT_SCHEMAS[e] && !NO_SCHEMA.has(e));
    expect(missing).toEqual([]);
  });
});
