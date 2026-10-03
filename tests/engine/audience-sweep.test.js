/**
 * The audience classifier, swept against the schemas (cause 4 of
 * docs/ARCHITECTURE-REVIEW-2026-10.md, seventh pass, 2026-10-03). CLAUDE.md's
 * rule: "a new consumer type or hand-off field must be classified" in
 * engine/audience.js, or the answer box says "Only your teacher sees this"
 * over an answer that goes somewhere else.
 *
 * Two reads off engine/phase-schemas.js:
 *   - every phase type, as a step that quotes a collect's answers, gives
 *     that collect an audience other than the teacher (or is ALLOWED_TYPES
 *     with a reason);
 *   - every hand-off field on the collect schema (a field that points at
 *     an earlier step) is named by the classifier (or is ALLOWED_FIELDS
 *     with a reason).
 *
 * First run: a collect feeding a self-paced quiz's questions, or a
 * hand-out board, read as teacher-only; a pairwise collect's `pairsFrom`
 * (one prompt per pair, from the answers) read as the whole class.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PHASE_SCHEMAS } from '../../engine/phase-schemas.js';
import { audienceFor, AUDIENCE } from '../../engine/audience.js';
import { TRANSITION_NAMES } from '../../engine/transitions.js';

const audienceSrc = readFileSync(new URL('../../engine/audience.js', import.meta.url), 'utf8');

// Types that never read a student's words, with the reason
const ALLOWED_TYPES = {
  lobby: 'the lobby runs before any answer exists',
  preview: 'a gate, not a reader: the class-facing step after it carries the audience'
};

// Collect fields that point at an earlier step but hand no answer to anyone
const ALLOWED_FIELDS = {
  stationsFrom: 'reads a team step for the group, never an answer'
};

const TRANSITIONS = new Set(TRANSITION_NAMES);

function configWith(consumer) {
  return {
    phases: {
      lobby: { type: 'lobby', next: 'ask' },
      ask: { type: 'collect', prompt: 'What stood out?', next: 'read' },
      read: { ...consumer, next: 'end' },
      end: { type: 'end', message: 'Done.' }
    }
  };
}

describe('every phase type that quotes a collect gives it an audience', () => {
  for (const type of Object.keys(PHASE_SCHEMAS)) {
    it(`${type}`, () => {
      const a = audienceFor(configWith({ type, message: 'Look: {{ask.responses}}', prompt: '{{ask.responses}}', content: '{{ask.responses}}' }), 'ask');
      expect(a, 'audienceFor returned nothing').toBeTruthy();
      if (ALLOWED_TYPES[type]) {
        expect(a.key, `${type} is in ALLOWED_TYPES but classifies as ${a.key}; drop it from the map`).toBe(AUDIENCE.TEACHER);
        return;
      }
      expect(a.key, `${type} quotes the answers and the classifier does not know who reads them`).not.toBe(AUDIENCE.TEACHER);
    });
  }

  it('every ALLOWED_TYPES entry is a phase type', () => {
    for (const type of Object.keys(ALLOWED_TYPES)) expect(PHASE_SCHEMAS[type], `${type} is not a phase type`).toBeTruthy();
  });
});

describe('every hand-off field on the collect schema is classified', () => {
  const fields = PHASE_SCHEMAS.collect.fields || {};
  const handoffs = Object.entries(fields)
    .filter(([name, f]) => !TRANSITIONS.has(name) && f && (f.type === 'phaseRef' || /\bstep\b/i.test(String(f.helper || '')) && /\{from/.test(String(f.helper || ''))))
    .map(([name]) => name);

  it('finds the hand-off fields (the schema still declares them)', () => {
    expect(handoffs).toEqual(expect.arrayContaining(['rotateFrom', 'pairsFrom', 'reusePairsFrom', 'pairBy']));
  });

  for (const name of handoffs) {
    it(`${name}`, () => {
      const named = new RegExp(`consumer\\.${name}\\b`).test(audienceSrc);
      if (ALLOWED_FIELDS[name]) {
        expect(named, `${name} is in ALLOWED_FIELDS but the classifier names it; drop it from the map`).toBe(false);
        return;
      }
      expect(named, `collect.${name} hands an answer somewhere and engine/audience.js never reads it`).toBe(true);
    });
  }

  it('every ALLOWED_FIELDS entry is a collect field', () => {
    for (const name of Object.keys(ALLOWED_FIELDS)) expect(fields[name], `${name} is not a collect field`).toBeTruthy();
  });
});

describe('the classifications the sweep added', () => {
  it('a self-paced quiz built from the answers: every student reads them', () => {
    const a = audienceFor(configWith({ type: 'solo-quiz', questionsFrom: 'ask' }), 'ask');
    expect(a.key).toBe(AUDIENCE.CLASS);
  });

  it('a pairwise collect with one prompt per pair from the answers: one pair reads each', () => {
    const a = audienceFor(configWith({ type: 'collect', assign: 'pairwise', pairsFrom: 'ask', prompt: 'Talk it over.' }), 'ask');
    expect(a.key).toBe(AUDIENCE.CLASSMATE);
    expect(a.groupSize).toBe(2);
  });
});
