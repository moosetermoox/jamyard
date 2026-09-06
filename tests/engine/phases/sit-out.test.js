/**
 * sit-out.js — who sits a foreach round out (the item's author AND the
 * author of what it was made from), read the same way by every count.
 */
import { describe, it, expect } from 'vitest';
import { foreachSitOut, sitOutIds, sitsOut, withoutSitOut, sitOutMessage } from '../../../engine/phases/sit-out.js';

const players = [{ id: 'ada' }, { id: 'ben' }, { id: 'cal' }, { id: 'dee' }];

describe('foreachSitOut', () => {
  it('names the author and the source of a rotated item', () => {
    const out = foreachSitOut({ playerId: 'ada', assignedFromId: 'ben' }, {});
    expect(out).toEqual({ authorId: 'ada', sourceId: 'ben', ids: ['ada', 'ben'] });
  });

  it('is just the author when the item was not rotated from anyone', () => {
    expect(foreachSitOut({ playerId: 'ada' }, {})).toEqual({ authorId: 'ada', sourceId: null, ids: ['ada'] });
  });

  it('does not list the same person twice', () => {
    expect(foreachSitOut({ playerId: 'ada', assignedFromId: 'ada' }, {}).ids).toEqual(['ada']);
  });

  it('is nobody when the foreach turns self-exclusion off', () => {
    expect(foreachSitOut({ playerId: 'ada', assignedFromId: 'ben' }, { selfExclude: false }).ids).toEqual([]);
  });
});

describe('reading the stamped sub-phase', () => {
  it('uses the list when present, the legacy author id otherwise', () => {
    expect([...sitOutIds({ _foreachSitOutIds: ['ada', 'ben'] })]).toEqual(['ada', 'ben']);
    expect([...sitOutIds({ _foreachAuthorId: 'cal' })]).toEqual(['cal']);
    expect(sitOutIds({}).size).toBe(0);
    expect(sitOutIds(null).size).toBe(0);
  });

  it('filters the eligible list and answers per player', () => {
    const phase = { _foreachAuthorId: 'ada', _foreachSourceId: 'ben', _foreachSitOutIds: ['ada', 'ben'] };
    expect(withoutSitOut(players, phase).map(p => p.id)).toEqual(['cal', 'dee']);
    expect(sitsOut(phase, 'ada')).toBe(true);
    expect(sitsOut(phase, 'cal')).toBe(false);
    expect(withoutSitOut(players, {})).toBe(players);
  });

  it('tells the drawer and the phrase author different things', () => {
    const phase = { _foreachAuthorId: 'ada', _foreachSourceId: 'ben', _foreachSitOutIds: ['ada', 'ben'] };
    expect(sitOutMessage(phase, 'ada')).toMatch(/yours/);
    expect(sitOutMessage(phase, 'ben')).toMatch(/You wrote this one/);
    expect(sitOutMessage(phase, 'cal')).toBeNull();
  });
});
