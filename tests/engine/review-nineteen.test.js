// Review nineteen (2026-09-29): an outside reviewer's full plays with a
// phone plus a pass over the older rounds. Names, seats, and answers.
import { describe, it, expect, beforeEach } from 'vitest';
import { filterName, filterContent, checkSubmission } from '../../engine/content-filter.js';
import { NAME_INSULTS } from '../../engine/blocklist.js';
import { PlayerRegistry } from '../../engine/player-registry.js';
import { classifyJoin } from '../../engine/join-policy.js';

describe('a spaced-out swear word is still a swear word in a name', () => {
  // "S h i t" went up on the projector as S H I T: capitals and letter
  // spacing close the gaps. A name is short, so the spaces come out too.
  it('blocks the word with spaces between the letters', () => {
    for (const n of ['S h i t', 's h i t', 'S  h  i  t', 'F u c k', 'S h i t head', 'B i t c h']) {
      expect(filterName(n).blocked, n).toBe(true);
    }
  });
  it('answers read spaced letters too since review twenty (a spaced swear word went up as a choice)', () => {
    expect(filterContent('S h i t').blocked).toBe(true);
  });
  it('still lets ordinary two-word names through', () => {
    for (const n of ['Maya R', 'Ana L', 'Sam Hill', 'Cass Idy', 'Jo Anne', 'Li Na', 'Al Ba', 'Mo Sa']) {
      expect(filterName(n).blocked, n).toBe(false);
    }
  });
});

describe('body-shaming words are insults as names', () => {
  it('the list carries them', () => {
    for (const w of ['fatty', 'fat', 'ugly', 'pig', 'piggy', 'porky', 'lardo']) {
      expect(NAME_INSULTS).toContain(w);
    }
  });
  it('bare, with a head, or with a tail', () => {
    for (const n of ['Fatty', 'Fat', 'Big Fat', 'Fat Tony', 'Ugly', 'Pig Face', 'Porky', 'Fathead']) {
      expect(filterName(n).blocked, n).toBe(true);
    }
  });
  it('names that only contain the letters pass', () => {
    for (const n of ['Fatima', 'Fatih', 'Pigott', 'Piggott']) {
      expect(filterName(n).blocked, n).toBe(false);
    }
  });
  it('answers may still use the words', () => {
    expect(filterContent('the pig was fat and ugly').blocked).toBe(false);
  });
});

describe('a blank name never takes a disconnected seat', () => {
  let players;
  beforeEach(() => {
    players = new PlayerRegistry();
    players.add('sock-1', 'Alex', 'token-alex');
    players.add('sock-2', '', 'token-anon'); // stored as "Anonymous"
  });
  it('a second blank-name student is a fresh join while the first is disconnected', () => {
    players.disconnect('sock-2');
    expect(classifyJoin(players, { token: null, name: '', anonymousRoom: false }).kind).toBe('fresh');
    expect(classifyJoin(players, { token: null, name: '   ', anonymousRoom: false }).kind).toBe('fresh');
  });
  it('typing "Anonymous" is a fresh join too', () => {
    players.disconnect('sock-2');
    expect(classifyJoin(players, { token: null, name: 'anonymous', anonymousRoom: false }).kind).toBe('fresh');
  });
  it('the token still brings the anonymous student back to their own seat', () => {
    players.disconnect('sock-2');
    const v = classifyJoin(players, { token: 'token-anon', name: '', anonymousRoom: false });
    expect(v.kind).toBe('reconnect');
    expect(v.player.id).toBe('sock-2');
  });
  it('a typed name still reconnects a disconnected classmate of that name (a lost token)', () => {
    players.disconnect('sock-1');
    const v = classifyJoin(players, { token: null, name: 'Alex', anonymousRoom: false });
    expect(v.kind).toBe('reconnect');
    expect(v.player.id).toBe('sock-1');
  });
});

describe('a partly filled answer keeps what is there when time runs out', () => {
  // Ana typed two truths and no lie; the expiry sent the three boxes with
  // one empty and the server refused the lot as too short, so her work
  // vanished with no round and no message.
  it('an object with some empty parts passes when at least one part is filled', () => {
    const r = checkSubmission({ truth1: 'I have a twin', truth2: 'I ran a marathon', lie: '' });
    expect(r.ok).toBe(true);
  });
  it('an object with every part empty is still refused', () => {
    const r = checkSubmission({ truth1: '', truth2: ' ', lie: '' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('empty');
  });
  it('a filled part is still checked for length and content', () => {
    expect(checkSubmission({ a: 'x', b: '' }).ok).toBe(false);
    expect(checkSubmission({ a: 'this is fine', b: 'shit' }).ok).toBe(false);
  });
  it('a plain string that is empty is still refused', () => {
    expect(checkSubmission('').ok).toBe(false);
    expect(checkSubmission('   ').ok).toBe(false);
  });
});
