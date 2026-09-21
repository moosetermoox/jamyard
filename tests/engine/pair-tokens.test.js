/**
 * Partner tokens and sides for pairwise collects (storyboard probe,
 * 2026-09-20: "debate pairs" was the one idea a teacher got NOTHING for,
 * noMatch upstream and an honest decline downstream, while the engine
 * already pairs students and keeps pairs across steps).
 *
 * Three per-recipient tokens join {{X.mine}} and {{X.assigned}}:
 *   {{X.partner}}      what the student's partner wrote at pairwise step X
 *                      (a triple: both partners, one after the other)
 *   {{X.side}}         the side this student was dealt at X (`sides`)
 *   {{X.partnerSide}}  the side across the table
 * and a collect with assign:"pairwise" may carry `sides: [A, B]`: each
 * pair's members are dealt one each (a triple: two of one, one of the
 * other), stored as `sides` on the step's data.
 */

import { describe, it, expect } from 'vitest';
import {
  resolvePerPlayerTemplate, MISSING_PARTNER
} from '../../engine/per-player-template.js';
import { dealSides } from '../../engine/phases/pairing.js';
import { KNOWN_SUFFIXES, PER_PLAYER_TOKEN, parseRef, classifyRef } from '../../engine/resolver-grammar.js';
import { audienceFor, AUDIENCE } from '../../engine/audience.js';
import { validate } from '../../engine/game-loader.js';
import { STRINGS, translate } from '../../engine/i18n/index.js';

function fakeEngine(phaseData, language) {
  return { language: language || 'en', phaseData, resolve: () => undefined };
}

const PAIRED = {
  open: {
    pairs: [{ promptText: 'p', playerIds: ['a', 'b'] }, { promptText: 'p', playerIds: ['c', 'd', 'e'] }],
    byPlayer: { a: 'Dogs are loyal.', b: 'Cats are quiet.', c: 'C says', d: 'D says', e: 'E says' },
    passedIds: [],
    sides: { a: 'For', b: 'Against', c: 'For', d: 'Against', e: 'For' }
  }
};

describe('{{X.partner}}', () => {
  it('fills in what the partner wrote at the pairwise step', () => {
    const engine = fakeEngine(PAIRED);
    expect(resolvePerPlayerTemplate('They wrote:\n\n{{open.partner}}', engine, 'a')).toBe('They wrote:\n\nCats are quiet.');
    expect(resolvePerPlayerTemplate('{{open.partner}}', engine, 'b')).toBe('Dogs are loyal.');
  });

  it('a triple hears both partners, one after the other', () => {
    const engine = fakeEngine(PAIRED);
    expect(resolvePerPlayerTemplate('{{open.partner}}', engine, 'c')).toBe('D says\n\nE says');
  });

  it('a partner who passed or never answered reads as a plain line, never a raw token', () => {
    const engine = fakeEngine({ open: { pairs: [{ playerIds: ['a', 'b'] }], byPlayer: { a: 'x' }, passedIds: [] } });
    const out = resolvePerPlayerTemplate('{{open.partner}}', engine, 'a');
    expect(out).toBe(MISSING_PARTNER);
    const passed = fakeEngine({ open: { pairs: [{ playerIds: ['a', 'b'] }], byPlayer: { a: 'x', b: 'y' }, passedIds: ['b'] } });
    expect(resolvePerPlayerTemplate('{{open.partner}}', passed, 'a')).toBe(MISSING_PARTNER);
  });

  it('an unpaired student (or a step that never paired) reads the plain line too', () => {
    expect(resolvePerPlayerTemplate('{{open.partner}}', fakeEngine(PAIRED), 'zz')).toBe(MISSING_PARTNER);
    expect(resolvePerPlayerTemplate('{{open.partner}}', fakeEngine({}), 'a')).toBe(MISSING_PARTNER);
  });

  it('speaks the activity language', () => {
    const out = resolvePerPlayerTemplate('{{open.partner}}', fakeEngine({}, 'es'), 'a');
    expect(out).toBe(translate('es', MISSING_PARTNER));
    expect(out).not.toBe(MISSING_PARTNER);
  });

  it('has a row in every language table', () => {
    for (const code of Object.keys(STRINGS)) {
      expect(STRINGS[code][MISSING_PARTNER], `i18n ${code}`).toBeTruthy();
    }
  });
});

describe('{{X.side}} and {{X.partnerSide}}', () => {
  it('fill in the dealt side and the side across the table', () => {
    const engine = fakeEngine(PAIRED);
    expect(resolvePerPlayerTemplate('You argue **{{open.side}}**, they argue {{open.partnerSide}}', engine, 'a'))
      .toBe('You argue **For**, they argue Against');
    expect(resolvePerPlayerTemplate('{{open.side}} / {{open.partnerSide}}', engine, 'b')).toBe('Against / For');
  });

  it('a triple reads the side its two partners share, or the odd one out', () => {
    const engine = fakeEngine(PAIRED);
    expect(resolvePerPlayerTemplate('{{open.partnerSide}}', engine, 'd')).toBe('For');
    expect(resolvePerPlayerTemplate('{{open.partnerSide}}', engine, 'c')).toBe('Against');
  });

  it('read as empty when the step dealt no sides', () => {
    const engine = fakeEngine({ open: { pairs: [{ playerIds: ['a', 'b'] }], byPlayer: {} } });
    expect(resolvePerPlayerTemplate('Side: {{open.side}}|{{open.partnerSide}}', engine, 'a')).toBe('Side: |');
  });
});

describe('dealSides (pure)', () => {
  it('hands each pair one of each side, and a triple two and one', () => {
    const sides = dealSides([['a', 'b'], ['c', 'd', 'e']], ['For', 'Against']);
    expect(sides).toEqual({ a: 'For', b: 'Against', c: 'For', d: 'Against', e: 'For' });
  });

  it('returns nothing to store when there are no sides to deal', () => {
    expect(dealSides([['a', 'b']], undefined)).toBeNull();
    expect(dealSides([['a', 'b']], ['Only one'])).toBeNull();
  });
});

describe('grammar', () => {
  it('knows the three tokens as per-player suffixes', () => {
    for (const s of ['partner', 'side', 'partnerSide']) expect(KNOWN_SUFFIXES.has(s), s).toBe(true);
    expect(PER_PLAYER_TOKEN.test('{{open.partner}}')).toBe(true);
    expect(PER_PLAYER_TOKEN.test('{{open.side}}')).toBe(true);
    expect(PER_PLAYER_TOKEN.test('{{open.partnerSide}}')).toBe(true);
  });

  it('lets a collect prompt quote a partner without a raw-list complaint', () => {
    const phases = {
      open: { type: 'collect', prompt: 'Argue.', assign: 'pairwise', sides: ['For', 'Against'], next: 'reply' },
      reply: { type: 'collect', prompt: 'Rebut this:\n\n{{open.partner}}\n\nYou are {{open.side}}.', assign: 'pairwise', reusePairsFrom: 'open', next: 'end' }
    };
    for (const ref of ['open.partner', 'open.side', 'open.partnerSide']) {
      const a = classifyRef(parseRef(ref), phases);
      expect(a.problem, ref).toBeFalsy();
      expect(a.renderable, ref).toBe(true);
    }
  });
});

describe('validator: sides', () => {
  function game(extra) {
    return {
      name: 'Sides', description: 'x',
      phases: {
        lobby: { type: 'lobby', next: 'open' },
        open: { type: 'collect', prompt: 'Argue.', assign: 'pairwise', next: 'end', ...extra },
        end: { type: 'end', message: 'Bye' }
      }
    };
  }
  it('accepts two sides on a pairwise collect', () => {
    const r = validate(game({ sides: ['For', 'Against'] }), 'sides-ok', { returnResults: true });
    expect(r.errors).toEqual([]);
  });
  it('rejects sides without pairing, and any count but two', () => {
    const noPair = validate({ ...game({ sides: ['For', 'Against'] }) }, 'sides-nopair', { returnResults: true });
    noPair.phases = undefined;
    const cfg = game({ sides: ['For', 'Against'] });
    delete cfg.phases.open.assign;
    const r1 = validate(cfg, 'sides-nopair', { returnResults: true });
    expect(r1.errors.join(' ')).toMatch(/sides/);
    const r2 = validate(game({ sides: ['Only'] }), 'sides-one', { returnResults: true });
    expect(r2.errors.join(' ')).toMatch(/sides/);
  });
});

describe('audience: a partner reads it', () => {
  it('a later collect quoting {{X.partner}} makes X a classmate-read step', () => {
    const config = {
      name: 'Debate', description: 'x',
      phases: {
        lobby: { type: 'lobby', next: 'open' },
        open: { type: 'collect', prompt: 'Argue.', assign: 'pairwise', next: 'reply' },
        reply: { type: 'collect', prompt: 'Rebut:\n\n{{open.partner}}', assign: 'pairwise', reusePairsFrom: 'open', next: 'again' },
        again: { type: 'collect', prompt: 'Answer:\n\n{{reply.partner}}', assign: 'pairwise', reusePairsFrom: 'open', next: 'end' },
        end: { type: 'end', message: 'Bye' }
      }
    };
    expect(audienceFor(config, 'open').key).toBe(AUDIENCE.CLASSMATE);
    // "again" names only "reply" in its prompt, so "reply" is read by a classmate too
    expect(audienceFor(config, 'reply').key).toBe(AUDIENCE.CLASSMATE);
  });
});
