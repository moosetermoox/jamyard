/**
 * The games list a visitor gets (2026-09-20): built-ins, featured user
 * rows, and the ids the browser says are its own. `mine` absent means
 * everything (the owner's console); `mine=` present but empty means a
 * visitor with no copies.
 */

import { describe, it, expect } from 'vitest';
import { parseMine, wantedUserIds, onlyWanted } from '../../engine/games-list-scope.js';

describe('parseMine', () => {
  it('is null when the parameter is absent (everything)', () => {
    expect(parseMine(undefined)).toBeNull();
    expect(parseMine(null)).toBeNull();
  });

  it('is an empty list for a visitor with no copies', () => {
    expect(parseMine('')).toEqual([]);
  });

  it('splits, trims, dedupes, and drops ids that are not id-shaped', () => {
    expect(parseMine(' snowball-2, my-quiz ,snowball-2,,../etc,a b,ok_1')).toEqual(['snowball-2', 'my-quiz', 'ok_1']);
  });

  it('accepts a repeated parameter as one list and caps the count', () => {
    expect(parseMine(['a', 'b,c'])).toEqual(['a', 'b', 'c']);
    const many = Array.from({ length: 300 }, (_, i) => 'g' + i).join(',');
    expect(parseMine(many)).toHaveLength(200);
  });
});

describe('wantedUserIds', () => {
  it('is the visitor\'s ids plus every featured user id, once each', () => {
    expect(wantedUserIds(['mine-1', 'shared-x'], { 'shared-x': true, 'other': true, 'hidden': false }))
      .toEqual(['mine-1', 'shared-x', 'other']);
  });

  it('copes with nothing on either side', () => {
    expect(wantedUserIds([], {})).toEqual([]);
    expect(wantedUserIds(undefined, undefined)).toEqual([]);
  });
});

describe('onlyWanted', () => {
  it('keeps the wanted rows in their original order and nothing else', () => {
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, null];
    expect(onlyWanted(rows, ['c', 'a'])).toEqual([{ id: 'a' }, { id: 'c' }]);
    expect(onlyWanted(rows, [])).toEqual([]);
  });
});
