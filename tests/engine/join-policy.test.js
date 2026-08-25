import { describe, it, expect, beforeEach } from 'vitest';
import { PlayerRegistry } from '../../engine/player-registry.js';
import { classifyJoin } from '../../engine/join-policy.js';

// classifyJoin decides what a join-room attempt MEANS before the server
// touches any state: a reconnect, a same-student duplicate (takeover), a
// name collision with a student who is still connected, or a fresh join.
describe('classifyJoin', () => {
  let players;

  beforeEach(() => {
    players = new PlayerRegistry();
    players.add('sock-1', 'Alex', 'token-alex');
    players.add('sock-2', 'Bella', 'token-bella');
  });

  it('token match on a disconnected player is a reconnect', () => {
    players.disconnect('sock-1');
    const verdict = classifyJoin(players, { token: 'token-alex', name: 'Alex', anonymousRoom: false });
    expect(verdict.kind).toBe('reconnect');
    expect(verdict.player.id).toBe('sock-1');
  });

  it('token match on a CONNECTED player is a takeover (duplicated tab)', () => {
    const verdict = classifyJoin(players, { token: 'token-alex', name: 'Alex', anonymousRoom: false });
    expect(verdict.kind).toBe('takeover');
    expect(verdict.player.id).toBe('sock-1');
  });

  it('typed name already in use by a connected player is rejected', () => {
    const verdict = classifyJoin(players, { token: null, name: 'Alex', anonymousRoom: false });
    expect(verdict.kind).toBe('name-taken');
    expect(verdict.player.name).toBe('Alex');
  });

  it('name-taken check is case-insensitive and trims whitespace', () => {
    const verdict = classifyJoin(players, { token: null, name: '  aLeX ', anonymousRoom: false });
    expect(verdict.kind).toBe('name-taken');
  });

  it('name match on a DISCONNECTED player is a reconnect (lost token)', () => {
    players.disconnect('sock-1');
    const verdict = classifyJoin(players, { token: null, name: 'Alex', anonymousRoom: false });
    expect(verdict.kind).toBe('reconnect');
    expect(verdict.player.id).toBe('sock-1');
  });

  it('anonymous rooms never reject on typed names (they are discarded)', () => {
    const verdict = classifyJoin(players, { token: null, name: 'Alex', anonymousRoom: true });
    expect(verdict.kind).toBe('fresh');
  });

  it('an unknown token with an unused name is a fresh join', () => {
    const verdict = classifyJoin(players, { token: 'token-nobody', name: 'Cam', anonymousRoom: false });
    expect(verdict.kind).toBe('fresh');
  });

  it('no token and a new name is a fresh join', () => {
    const verdict = classifyJoin(players, { token: null, name: 'Cam', anonymousRoom: false });
    expect(verdict.kind).toBe('fresh');
  });

  it('an empty typed name never triggers name-taken', () => {
    players.add('sock-3', '', 'token-anon'); // stored as "Anonymous"
    const verdict = classifyJoin(players, { token: null, name: '', anonymousRoom: false });
    expect(verdict.kind).toBe('fresh');
  });

  it('empty name still reconnects a disconnected "Anonymous"', () => {
    players.add('sock-3', '', 'token-anon');
    players.disconnect('sock-3');
    const verdict = classifyJoin(players, { token: null, name: '', anonymousRoom: false });
    expect(verdict.kind).toBe('reconnect');
    expect(verdict.player.id).toBe('sock-3');
  });
});
