// activity-prefs.js is a plain browser script attaching to globalThis; in
// node there is no localStorage so it runs on its in-memory fallback —
// tests use unique ids per case instead of clearing storage.
import { describe, it, expect } from 'vitest';
import '../../screens/shared/activity-prefs.js';

const { Archived, orderYard } = globalThis.ActivityPrefs;

describe('ActivityPrefs.Archived (the shed)', () => {
  it('starts empty and toggles an id in and out', () => {
    expect(Archived.has('shed-a')).toBe(false);
    Archived.toggle('shed-a');
    expect(Archived.has('shed-a')).toBe(true);
    Archived.toggle('shed-a');
    expect(Archived.has('shed-a')).toBe(false);
  });

  it('lists ids in the order they were put away', () => {
    Archived.toggle('shed-b');
    Archived.toggle('shed-c');
    const ids = Archived.list();
    expect(ids.indexOf('shed-b')).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf('shed-b')).toBeLessThan(ids.indexOf('shed-c'));
    Archived.toggle('shed-b');
    Archived.toggle('shed-c');
  });
});

describe('ActivityPrefs.orderYard', () => {
  const g = id => ({ id });
  const games = [g('old-copy'), g('mid-copy'), g('new-copy'), g('used-builtin'), g('loved-builtin')];

  it('puts hearted activities first, in heart order', () => {
    const out = orderYard(games, {
      hearts: ['new-copy', 'loved-builtin'],
      recents: [],
      created: ['old-copy', 'mid-copy', 'new-copy']
    });
    expect(out.map(x => x.id).slice(0, 2)).toEqual(['new-copy', 'loved-builtin']);
  });

  it('then recently used, in most-recent-first order', () => {
    const out = orderYard(games, {
      hearts: ['loved-builtin'],
      recents: ['used-builtin', 'mid-copy'],
      created: ['old-copy', 'mid-copy', 'new-copy']
    });
    expect(out.map(x => x.id)).toEqual(
      ['loved-builtin', 'used-builtin', 'mid-copy', 'new-copy', 'old-copy']);
  });

  it('then the rest newest-created first', () => {
    const out = orderYard([g('old-copy'), g('mid-copy'), g('new-copy')], {
      hearts: [], recents: [], created: ['old-copy', 'mid-copy', 'new-copy']
    });
    expect(out.map(x => x.id)).toEqual(['new-copy', 'mid-copy', 'old-copy']);
  });

  it('a hearted activity never appears twice even when also recent', () => {
    const out = orderYard(games, {
      hearts: ['mid-copy'],
      recents: ['mid-copy', 'used-builtin'],
      created: ['old-copy', 'mid-copy', 'new-copy']
    });
    const ids = out.map(x => x.id);
    expect(ids.filter(id => id === 'mid-copy')).toHaveLength(1);
    expect(ids[0]).toBe('mid-copy');
  });

  it('items unknown to every list keep their input order, after the known ones', () => {
    const out = orderYard([g('mystery-1'), g('mystery-2'), g('new-copy')], {
      hearts: [], recents: [], created: ['new-copy']
    });
    expect(out.map(x => x.id)).toEqual(['new-copy', 'mystery-1', 'mystery-2']);
  });

  it('does not mutate the input array', () => {
    const input = [g('a'), g('b')];
    const snapshot = input.map(x => x.id);
    orderYard(input, { hearts: ['b'], recents: [], created: [] });
    expect(input.map(x => x.id)).toEqual(snapshot);
  });

  it('tolerates missing opts fields', () => {
    expect(orderYard([g('a')], {}).map(x => x.id)).toEqual(['a']);
  });
});
