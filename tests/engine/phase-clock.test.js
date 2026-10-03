/**
 * The clock survives a refresh on every timed step (cause 4 of
 * docs/ARCHITECTURE-REVIEW-2026-10.md: the CLAUDE.md rule "a new
 * collect-style handler with a host clock should record timerEndsAt and
 * send secondsLeft on reconnect" as a chokepoint).
 *
 * engine/phase-timer.js owns the deadline (recordDeadline, secondsLeft;
 * armPhaseTimer records it too). phase-context.js makes it structural:
 * every ctx.emitTo* at enter records the deadline from a payload's
 * `timer`, and the stamping socket every onReconnect emits through fills
 * the time left into any payload that carries a `timer` key. 2026-10-03:
 * eleven handlers re-sent `timer: null` to a refreshed student (proof
 * scripts/simulate-clock-refresh.js). A raw emit from server.js that
 * carries a timer must record its own deadline (the relay's turns) or sit
 * in ALLOWED with the reason.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { recordDeadline, secondsLeft, armPhaseTimer } from '../../engine/phase-timer.js';
import { createPhaseContext, stampingSocket } from '../../engine/phase-handlers/phase-context.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('the deadline helpers', () => {
  it('record a deadline only for a positive timer and only with a phase state', () => {
    const room = { phaseState: {} };
    expect(recordDeadline(room, 60, 1000)).toBe(61000);
    expect(room.phaseState.timerEndsAt).toBe(61000);
    expect(recordDeadline({ phaseState: {} }, null)).toBe(null);
    expect(recordDeadline({ phaseState: {} }, 0)).toBe(null);
    expect(recordDeadline({}, 60)).toBe(null);
  });

  it('read the seconds left, none after the close or the deadline', () => {
    const room = { phaseState: { timerEndsAt: 61000 } };
    expect(secondsLeft(room, 1000)).toBe(60);
    expect(secondsLeft(room, 58_400)).toBe(3);
    expect(secondsLeft(room, 61000)).toBe(null);
    expect(secondsLeft({ phaseState: {} })).toBe(null);
    expect(secondsLeft(null)).toBe(null);
    room.phaseState.closed = true;
    expect(secondsLeft(room, 1000)).toBe(null);
  });

  it('armPhaseTimer records the deadline it will fire at', () => {
    const room = { phaseState: {}, phaseInstanceId: 1 };
    armPhaseTimer(room, 45, () => {});
    clearTimeout(room.phaseState.timer);
    expect(room.phaseState.timerEndsAt).toBeGreaterThan(Date.now() + 44_000);
  });
});

function contextFor(room) {
  const sent = [];
  const io = { to: () => ({ emit: (e, p) => sent.push({ e, p }) }) };
  const services = { io, roomToHost: new Map([['AB12', 'host-1']]), aiService: {}, getNextPhaseId: () => null, getEligibleVoters: () => [] };
  room.engine = { getCurrentPhase: () => ({ id: 'x', type: 'rate' }), players: { list: () => [] } };
  return { ctx: createPhaseContext('AB12', room, services), sent };
}

describe('the enter emits record the deadline', () => {
  it('from the first payload that carries a timer, once', () => {
    const room = { phaseState: {}, phaseInstanceId: 3 };
    const { ctx } = contextFor(room);
    const before = Date.now();
    ctx.emitToHost('rate-start', { prompt: 'Rate it', timer: 60 });
    const first = room.phaseState.timerEndsAt;
    expect(first).toBeGreaterThanOrEqual(before + 60_000);
    ctx.emitToPlayer('p1', 'rate-start', { prompt: 'Rate it', timer: 60 });
    ctx.emitToRoom('rate-start', { prompt: 'Rate it', timer: 60 });
    expect(room.phaseState.timerEndsAt).toBe(first);
  });

  it('never from a null timer, a missing timer, or a room without a phase state', () => {
    const room = { phaseState: {}, phaseInstanceId: 3 };
    const { ctx, sent } = contextFor(room);
    ctx.emitToPlayer('p1', 'waiting', { message: 'hold on' });
    ctx.emitToPlayer('p1', 'game-started', { prompt: 'Go', timer: null });
    expect(room.phaseState.timerEndsAt).toBeUndefined();
    expect(sent.map(s => s.p.timer)).toEqual([undefined, null]);
    const bare = { phaseInstanceId: 1 };
    contextFor(bare).ctx.emitToRoom('x', { timer: 30 });
    expect(bare.phaseState).toBeUndefined();
  });
});

describe('the reconnect socket fills in the time left', () => {
  const emitOnce = (room, payload) => {
    const sent = [];
    stampingSocket({ id: 'p2', emit: (e, p) => sent.push(p) }, room).emit('rate-start', payload);
    return sent[0];
  };

  it('over a null timer and over a restarted full timer', () => {
    const room = { phaseInstanceId: 2, phaseState: { timerEndsAt: Date.now() + 40_000 } };
    expect(emitOnce(room, { prompt: 'Rate it', timer: null }).timer).toBeGreaterThanOrEqual(39);
    expect(emitOnce(room, { prompt: 'Rate it', timer: 60 }).timer).toBeLessThanOrEqual(40);
    expect(emitOnce(room, { prompt: 'Rate it', timer: null }).phaseInstanceId).toBe(2);
  });

  it('leaves a payload alone when it carries no timer key or the step has no deadline', () => {
    const room = { phaseInstanceId: 2, phaseState: { timerEndsAt: Date.now() + 40_000 } };
    expect(emitOnce(room, { message: 'Waiting...' })).toEqual({ message: 'Waiting...', phaseInstanceId: 2 });
    const noClock = { phaseInstanceId: 2, phaseState: {} };
    expect(emitOnce(noClock, { prompt: 'Go', timer: null }).timer).toBe(null);
    expect(emitOnce({ phaseInstanceId: 2 }, { prompt: 'Go', timer: null }).timer).toBe(null);
  });

  it('sends null once the step closed or the deadline passed (nothing to count down)', () => {
    const closed = { phaseInstanceId: 2, phaseState: { timerEndsAt: Date.now() + 40_000, closed: true } };
    expect(emitOnce(closed, { prompt: 'x', timer: null }).timer).toBe(null);
    const passed = { phaseInstanceId: 2, phaseState: { timerEndsAt: Date.now() - 1000 } };
    expect(emitOnce(passed, { prompt: 'x', timer: 60 }).timer).toBe(null);
  });
});

describe('no clock is written outside the chokepoint', () => {
  it('handlers never write timerEndsAt by hand (phase-timer.js owns it)', () => {
    const dir = join(root, 'engine', 'phase-handlers');
    const offenders = [];
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.js')) continue;
      const src = read(join('engine', 'phase-handlers', f));
      if (/timerEndsAt\s*[:=]\s*(?!null)/.test(src) && f !== 'estimate.js') offenders.push(f);
    }
    // estimate.js keeps the deadline in its own phaseState literal (the
    // first host-clock step that learned the rule); everything else records
    // through recordDeadline or the emit wrappers
    expect(offenders).toEqual([]);
  });

  it('a raw server emit that carries a timer records its own deadline, or is listed with a reason', () => {
    const ALLOWED = {
      handlePhase: 'the console\'s teacher-phase carries the step\'s timer SETTING so the console knows whether A bit more time applies; it is not a clock'
    };
    const src = read('server.js');
    const lines = src.split('\n');
    const problems = [];
    let fn = null; let fnStart = 0;
    const fnBodies = new Map();
    for (let i = 0; i < lines.length; i++) {
      const m = /^(?:async )?function (\w+)/.exec(lines[i]);
      if (m) { if (fn) fnBodies.set(fn, lines.slice(fnStart, i).join('\n')); fn = m[1]; fnStart = i; }
    }
    if (fn) fnBodies.set(fn, lines.slice(fnStart).join('\n'));
    for (const [name, body] of fnBodies) {
      if (!/^\s*timer: /m.test(body)) continue;
      if (/recordDeadline\(/.test(body) || ALLOWED[name]) continue;
      problems.push(`${name} sends a timer without recording the deadline (recordDeadline) or a reason in ALLOWED`);
    }
    expect(problems).toEqual([]);
    expect(fnBodies.get('emitRelayTurn')).toContain('recordDeadline(room, rs.timer);');
    for (const name of Object.keys(ALLOWED)) expect(/^\s*timer: /m.test(fnBodies.get(name) || ''), `${name} no longer sends a timer; drop it from ALLOWED`).toBe(true);
  });
});
