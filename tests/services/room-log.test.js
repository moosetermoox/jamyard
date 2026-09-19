/**
 * Rooms log (2026-09-18). The owner's per-room truth for the pilot: every
 * real room that opened, how many students it had, how far it got, and
 * whether it ended or was left behind. Nothing a student typed, no names,
 * no room codes on the way out. A random key the host's browser minted
 * lets the same teacher's rooms line up, which is how "teachers who
 * hosted a class room" gets counted.
 */

import { describe, it, expect } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { createRoomLog, summarizeRoomLog, isHostKey, PILOT_START } from '../../services/room-log.js';

async function tempLog() {
  const dir = await mkdtemp(join(tmpdir(), 'jamyard-room-log-'));
  const log = createRoomLog({ filePath: join(dir, 'room-log.ndjson') });
  return { log, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

const HOST_A = 'a1b2c3d4e5f60718a1b2c3d4e5f60718';
const HOST_B = 'ffffffffffffffff';

describe('createRoomLog, file mode', () => {
  it('open + list round-trips, newest first, with the fields the owner reads', async () => {
    const { log, cleanup } = await tempLog();
    try {
      const first = await log.open({ code: 'ABCD', gameId: 'snowball', gameLabel: 'snowball', source: 'built-in', kind: 'class', hostKey: HOST_A, steps: 6 });
      await log.open({ code: 'EFGH', gameId: 'u-123', gameLabel: 'My quiz', source: 'custom', kind: 'pretend', hostKey: null, steps: 3 });
      const rows = await log.list();
      expect(rows.map(r => r.code)).toEqual(['EFGH', 'ABCD']);
      const a = rows[1];
      expect(a.id).toBe(first);
      expect(a).toMatchObject({ game_label: 'snowball', kind: 'class', host_key: HOST_A, steps: 6, step: 0, players: 0, status: 'open', minutes: 0 });
      expect(typeof a.created_at).toBe('string');
    } finally {
      await cleanup();
    }
  });

  it('update writes progress and never lowers the headcount', async () => {
    const { log, cleanup } = await tempLog();
    try {
      const id = await log.open({ code: 'ABCD', gameId: 'snowball', gameLabel: 'snowball', source: 'built-in', kind: 'class', hostKey: HOST_A, steps: 6 });
      await log.update(id, { players: 24, step: 2, stepId: 'write', status: 'open', minutes: 3 });
      await log.update(id, { players: 21, step: 5, stepId: 'end', status: 'ended', minutes: 14 });
      const [row] = await log.list();
      expect(row).toMatchObject({ players: 24, step: 5, step_id: 'end', status: 'ended', minutes: 14 });
    } finally {
      await cleanup();
    }
  });

  it('list honours a limit and a missing file is empty, not an error', async () => {
    const { log, cleanup } = await tempLog();
    try {
      expect(await log.list()).toEqual([]);
      for (let i = 0; i < 5; i++) {
        await log.open({ code: 'R' + i, gameId: 'x', gameLabel: 'x', source: 'built-in', kind: 'class', hostKey: null, steps: 1 });
      }
      expect((await log.list(2)).length).toBe(2);
    } finally {
      await cleanup();
    }
  });

  it('update on an unknown id is a quiet no-op', async () => {
    const { log, cleanup } = await tempLog();
    try {
      await expect(log.update('nope', { players: 1, step: 1, stepId: 'a', status: 'open', minutes: 0 })).resolves.toBe(false);
    } finally {
      await cleanup();
    }
  });
});

describe('createRoomLog, db mode', () => {
  it('delegates to the injected db functions', async () => {
    const calls = [];
    const db = {
      addRoomLog: async (row) => { calls.push(['add', row]); return 7; },
      updateRoomLog: async (id, fields) => { calls.push(['update', id, fields]); return true; },
      listRoomLog: async (limit) => { calls.push(['list', limit]); return [{ id: 7 }]; }
    };
    const log = createRoomLog({ db });
    const id = await log.open({ code: 'ABCD', gameId: 'g', gameLabel: 'g', source: 'built-in', kind: 'class', hostKey: HOST_A, steps: 2 });
    expect(id).toBe(7);
    await log.update(7, { players: 3, step: 1, stepId: 's', status: 'open', minutes: 1 });
    expect(await log.list(10)).toEqual([{ id: 7 }]);
    expect(calls[0][0]).toBe('add');
    expect(calls[0][1]).toMatchObject({ code: 'ABCD', hostKey: HOST_A, kind: 'class' });
    expect(calls[1]).toEqual(['update', 7, { players: 3, step: 1, stepId: 's', status: 'open', minutes: 1 }]);
    expect(calls[2]).toEqual(['list', 10]);
  });
});

describe('summarizeRoomLog', () => {
  const day = (d) => new Date(d).toISOString();
  const rows = [
    // A class room with a real class, counted once per host
    { id: 1, created_at: day('2026-09-20T10:00:00Z'), kind: 'class', host_key: HOST_A, players: 24, status: 'ended' },
    { id: 2, created_at: day('2026-09-21T10:00:00Z'), kind: 'class', host_key: HOST_A, players: 18, status: 'closed' },
    // A different teacher
    { id: 3, created_at: day('2026-09-22T10:00:00Z'), kind: 'class', host_key: HOST_B, players: 3, status: 'ended' },
    // Too few students to be a class
    { id: 4, created_at: day('2026-09-22T11:00:00Z'), kind: 'class', host_key: 'cccccccccccccccc', players: 2, status: 'ended' },
    // Pretend students never count
    { id: 5, created_at: day('2026-09-22T12:00:00Z'), kind: 'pretend', host_key: 'dddddddddddddddd', players: 30, status: 'ended' },
    // No host key: a real room, but nobody to attribute it to
    { id: 6, created_at: day('2026-09-23T10:00:00Z'), kind: 'class', host_key: null, players: 12, status: 'open' },
    // Before the pilot started
    { id: 7, created_at: day('2026-09-01T10:00:00Z'), kind: 'class', host_key: 'eeeeeeeeeeeeeeee', players: 25, status: 'ended' }
  ];

  it('counts distinct hosts of class rooms with enough students since the pilot start', () => {
    const s = summarizeRoomLog(rows, { since: '2026-09-18', minPlayers: 3 });
    expect(s.hosts).toBe(2);
    expect(s.unattributedClassRooms).toBe(1);
    expect(s.classRooms).toBe(4);
  });

  it('reports rooms, endings, and pretend rooms in the window', () => {
    const s = summarizeRoomLog(rows, { since: '2026-09-18', minPlayers: 3 });
    expect(s.rooms).toBe(6);
    expect(s.pretendRooms).toBe(1);
    expect(s.ended).toBe(4);
    expect(s.since).toBe('2026-09-18');
  });

  it('defaults the window to the pilot start', () => {
    expect(PILOT_START).toBe('2026-09-18');
    expect(summarizeRoomLog(rows).since).toBe(PILOT_START);
  });

  it('handles an empty log', () => {
    expect(summarizeRoomLog([])).toMatchObject({ hosts: 0, rooms: 0, classRooms: 0, ended: 0, pretendRooms: 0, unattributedClassRooms: 0 });
  });
});

describe('isHostKey', () => {
  it('accepts a 16 to 32 char lowercase hex key and nothing else', () => {
    expect(isHostKey(HOST_A)).toBe(true);
    expect(isHostKey(HOST_B)).toBe(true);
    expect(isHostKey('ABCDEF0123456789')).toBe(false);
    expect(isHostKey('rivera@school.org')).toBe(false);
    expect(isHostKey('')).toBe(false);
    expect(isHostKey(null)).toBe(false);
    expect(isHostKey('a'.repeat(33))).toBe(false);
  });
});
