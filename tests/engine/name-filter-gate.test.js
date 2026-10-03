/**
 * A name the filter refuses never enters a roster (cause 4 of
 * docs/ARCHITECTURE-REVIEW-2026-10.md: the CLAUDE.md rule "a new place a
 * name enters the room must call filterName" as a chokepoint in
 * PlayerRegistry, the one place every name passes).
 *
 * The server's own checks (join-room, the two renames through checkNewName)
 * still run first so the student gets the line in their language; the
 * registry is the backstop for a path that forgot. The sweep at the bottom
 * keeps those first checks in place.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PlayerRegistry, NameRefusedError } from '../../engine/player-registry.js';
import { pickAnonymousName } from '../../engine/anonymous-names.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('PlayerRegistry refuses a filtered name on every path', () => {
  it('add() throws NameRefusedError with the filter\'s category, and seats nobody', () => {
    const r = new PlayerRegistry();
    expect(() => r.add('p1', 'idiot')).toThrow(NameRefusedError);
    try { r.add('p1', 'idiot'); } catch (e) { expect(e.category).toBeTruthy(); expect(e.refusedName).toBe('idiot'); }
    expect(r.count()).toBe(0);
  });

  it('add() with a compound or a spaced-out word is refused too', () => {
    const r = new PlayerRegistry();
    expect(() => r.add('p1', 'big idiot')).toThrow(NameRefusedError);
    expect(() => r.add('p2', 'S h i t')).toThrow(NameRefusedError);
  });

  it('update() with a new name goes through the same filter; other fields never do', () => {
    const r = new PlayerRegistry();
    r.add('p1', 'Maya');
    expect(() => r.update('p1', { name: 'loser' })).toThrow(NameRefusedError);
    expect(r.find('p1').name).toBe('Maya');
    r.update('p1', { response: 'idiot' }); // an answer is the answer filter's business
    expect(r.find('p1').response).toBe('idiot');
    r.update('p1', { name: 'Jordan' });
    expect(r.find('p1').name).toBe('Jordan');
  });

  it('plain names, the Color Animal names, and the sims\' names pass', () => {
    const r = new PlayerRegistry();
    r.add('p1', 'Maya');
    r.add('p2', 'Student p2');
    for (let i = 0; i < 20; i++) r.add('a' + i, pickAnonymousName(r.list().map(p => p.name)));
    expect(r.count()).toBe(22);
  });
});

describe('the server still answers the student first', () => {
  const server = read('server.js');

  it('join-room filters a typed name before seating it', () => {
    const start = server.indexOf('socket.on(EVENTS.JOIN_ROOM');
    const add = server.indexOf('players.add(socket.id, joinName, playerToken)', start);
    expect(add).toBeGreaterThan(start);
    const before = server.slice(start, add);
    expect(before).toMatch(/if \(!anonymousRoom && filterName\(name\)\.blocked\)/);
  });

  it('both renames go through checkNewName with the filter, and one function writes the name', () => {
    const checks = server.match(/checkNewName\(players\.list\(\), \w+(\.\w+)?, payload\.name, filterName\)/g) || [];
    expect(checks.length).toBe(2); // the console's Rename and the student's own
    const writes = [...server.matchAll(/players\.update\(\w+, \{ name: /g)];
    expect(writes.length).toBe(1);
    const fnStart = server.lastIndexOf('function applyRename', writes[0].index);
    expect(fnStart).toBeGreaterThan(0);
    expect(writes[0].index - fnStart).toBeLessThan(600);
  });

  it('the registry is the only place a name is seated', () => {
    const adds = [...server.matchAll(/players\.add\(/g)];
    expect(adds.length).toBe(1);
  });
});
