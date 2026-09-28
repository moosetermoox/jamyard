/**
 * The teacher gate (engine/teacher-auth.js gateTeacher): a student who
 * guesses PINs must never lock the teacher's own browser out (2026-09-28,
 * a reviewer locked a real console with five wrong PINs off the projector's
 * room code). The teacher key and the site password skip the throttle; the
 * typed PIN stays throttled room-wide so guessing stays infeasible.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { teacherAccessVia, gateTeacher, generateTeacherKey } from '../../engine/teacher-auth.js';
import { createPinThrottle } from '../../engine/pin-throttle.js';

const T0 = 1_000_000;
const expected = { teacherPin: '4271', teacherKey: 'k-abcdef0123456789abcdef', sitePassword: 'sekrit' };
const basic = pw => 'Basic ' + Buffer.from('teacher:' + pw).toString('base64');

describe('teacherAccessVia', () => {
  it('names the credential that let the teacher in', () => {
    expect(teacherAccessVia({ key: expected.teacherKey }, expected)).toBe('key');
    expect(teacherAccessVia({ authHeader: basic('sekrit') }, expected)).toBe('site');
    expect(teacherAccessVia({ pin: '4271' }, expected)).toBe('pin');
    expect(teacherAccessVia({ pin: '0000', key: 'nope' }, expected)).toBe(null);
  });

  it('never matches an empty or missing key', () => {
    expect(teacherAccessVia({ key: '' }, { ...expected, teacherKey: '' })).toBe(null);
    expect(teacherAccessVia({ key: undefined }, { teacherPin: '4271' })).toBe(null);
  });
});

describe('gateTeacher', () => {
  function gate(throttle, provided, now = T0) {
    return gateTeacher({ provided, expected, throttle, code: 'ROOM', now });
  }

  it('a student guessing twenty PINs cannot lock out the teacher key', () => {
    const t = createPinThrottle();
    for (let i = 0; i < 20; i++) gate(t, { pin: String(1000 + i) }, T0 + i);
    expect(gate(t, { pin: '4271' }, T0 + 30).ok).toBe(false); // the typed PIN is locked
    expect(gate(t, { key: expected.teacherKey }, T0 + 31)).toEqual({ ok: true, via: 'key' });
    expect(gate(t, { authHeader: basic('sekrit') }, T0 + 32)).toEqual({ ok: true, via: 'site' });
  });

  it('a guesser is stopped after the threshold, even with the right PIN', () => {
    const t = createPinThrottle({ maxAttempts: 5 });
    for (let i = 0; i < 4; i++) expect(gate(t, { pin: '0000' }, T0 + i)).toMatchObject({ ok: false, reason: 'wrong', locked: false });
    expect(gate(t, { pin: '0000' }, T0 + 5)).toMatchObject({ ok: false, reason: 'wrong', locked: true });
    expect(gate(t, { pin: '4271' }, T0 + 6)).toMatchObject({ ok: false, reason: 'locked' });
  });

  it('a wrong key does not count as a PIN guess, and an empty try does not either', () => {
    const t = createPinThrottle({ maxAttempts: 2 });
    for (let i = 0; i < 10; i++) gate(t, { key: 'guess-' + i }, T0 + i);
    for (let i = 0; i < 10; i++) gate(t, { pin: '' }, T0 + i);
    expect(gate(t, { pin: '4271' }, T0 + 20)).toEqual({ ok: true, via: 'pin' });
  });

  it('the right PIN before any lockout lets the teacher in', () => {
    const t = createPinThrottle();
    expect(gate(t, { pin: '4271' })).toEqual({ ok: true, via: 'pin' });
  });
});

describe('the key rides every teacher door', () => {
  const read = f => readFileSync(new URL('../../' + f, import.meta.url), 'utf8');

  it('the server mints it, sends it to the projector, and every teacher door goes through the gate', () => {
    const server = read('server.js');
    expect(server).toContain('room.teacherKey = generateTeacherKey();');
    expect(server).toContain('teacherKey: room.teacherKey, hostToken: room.hostToken');
    expect((server.match(/gateTeacher\(\{/g) || []).length).toBe(3); // console, projector rejoin, HTTP
    expect((server.match(/const gate = teacherGateForRequest\(req, room\);/g) || []).length).toBe(2); // journal, report
    expect(server).not.toContain('checkTeacherAccess');
    expect(read('engine/room-snapshot.js')).toContain('teacherKey: snapshot.teacherKey || null,');
  });

  it('the projector hands it on and the console and report send it', () => {
    const host = read('screens/host/host.js');
    expect(host).toContain('HostLaunch.publish(PAIR_NONCE, code, teacherPin || null, teacherKey || null);');
    expect((host.match(/if \(currentTeacherKey\) link \+= '&key=' \+ currentTeacherKey;/g) || []).length).toBe(2);
    const teacher = read('screens/teacher/teacher.js');
    expect(teacher).toContain("socket.emit('join-teacher', { code: code, pin: pin, key: linkKey });");
    expect(teacher).toContain("socket.emit('join-teacher', { code: currentCode, pin: currentPin, key: currentKey });");
    expect(read('screens/teacher/report.js')).toContain("(key ? '&key=' + encodeURIComponent(key) : '')");
    expect(read('screens/prototype/prototype.js')).toContain("railSocket.emit('join-teacher', { code, pin, key: key || '' })");
  });
});

describe('generateTeacherKey', () => {
  it('is long and random', () => {
    const a = generateTeacherKey();
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(a).not.toBe(generateTeacherKey());
  });
});
