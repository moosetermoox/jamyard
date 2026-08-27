/**
 * Foreach sub-phase guard: rotation/pairing fields only work on top-level
 * steps. Inside a foreach round the remap layer never rewrites them and
 * their outputs land under virtual `_fe:` ids nothing can consume, so a
 * config using them would silently read no data at game time. The
 * validator must reject them loudly instead (2026-08-26 interop review).
 *
 * The restriction is schema-driven: fields carry `contexts: ['topLevel']`
 * in engine/phase-schemas.js, getFields filters by context, and the
 * standard sub-phase allow-list check does the rest.
 */

import { describe, it, expect } from 'vitest';
import { validate } from '../../engine/game-loader.js';
import { getFields } from '../../engine/phase-schemas.js';

/** A minimal valid game whose foreach round has one collect sub-phase. */
function gameWithCollectSub(extraSubFields) {
  return {
    name: 'Test',
    phases: {
      lobby: { type: 'lobby', next: 'ask' },
      ask: { type: 'collect', prompt: 'Write something', next: 'rounds' },
      rounds: {
        type: 'foreach', data: 'ask.responses',
        subPhases: {
          answer: { type: 'collect', prompt: 'Round answer', ...extraSubFields }
        },
        next: 'end'
      },
      end: { type: 'end' }
    }
  };
}

const TOP_LEVEL_ONLY_COLLECT_FIELDS = {
  rotateFrom: 'ask',
  rotateOffset: 2,
  assign: 'pairwise',
  pairsFrom: 'ask',
  oddHandling: 'triple',
  rotatePairsFrom: 'ask',
  reusePairsFrom: 'ask',
  prefillFromAssigned: true,
  appendOnly: true
};

describe('foreach sub-phase guard: top-level-only collect fields', () => {
  for (const [field, value] of Object.entries(TOP_LEVEL_ONLY_COLLECT_FIELDS)) {
    it(`rejects "${field}" on a collect sub-phase`, () => {
      const config = gameWithCollectSub({ [field]: value });
      expect(() => validate(config, 'test')).toThrow(field);
      expect(() => validate(config, 'test')).toThrow(/top-level step/);
    });
  }

  it('still allows the round-safe collect fields in a sub-phase', () => {
    const config = gameWithCollectSub({
      fields: ['optionA', 'optionB'],
      maxLength: 400,
      passAllowed: true,
      simultaneousReveal: true,
      timer: 30
    });
    expect(() => validate(config, 'test')).not.toThrow();
  });

  it('still allows all the pairing/rotation fields on a TOP-LEVEL collect', () => {
    const config = {
      name: 'Test',
      phases: {
        lobby: { type: 'lobby', next: 'ask' },
        ask: { type: 'collect', prompt: 'Seed', next: 'paired' },
        paired: {
          type: 'collect', prompt: 'Pair up',
          assign: 'pairwise', pairsFrom: 'ask', oddHandling: 'triple',
          next: 'end'
        },
        end: { type: 'end' }
      }
    };
    expect(() => validate(config, 'test')).not.toThrow();
  });

  it('schema getFields hides the restricted fields in foreach context only', () => {
    const topFields = getFields('collect', { context: 'topLevel' });
    const subFields = getFields('collect', { context: 'foreach' });
    for (const field of Object.keys(TOP_LEVEL_ONLY_COLLECT_FIELDS)) {
      expect(topFields[field], `${field} at topLevel`).toBeDefined();
      expect(subFields[field], `${field} in foreach`).toBeUndefined();
    }
    // Sanity: round-safe fields survive the filter
    expect(subFields.prompt).toBeDefined();
    expect(subFields.fields).toBeDefined();
    expect(subFields.drawingFrom).toBeDefined();
  });
});
