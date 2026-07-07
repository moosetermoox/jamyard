/**
 * Side-by-side validator test (Phase #49 / spec §12 Phase C).
 *
 * Today validate() returns:
 *   { errors: string[], warnings: string[], diagnostics: Diagnostic[] }
 *
 * The string arrays are produced directly by call sites; the diagnostics
 * array is built from those strings via inferDiagnosticCode().
 *
 * In Phase #50, the validator will be rewritten to read from
 * PHASE_SCHEMAS and call mkDiagnostic() directly. This test snapshots
 * the diagnostic codes that today's validator emits on every shipped
 * game and on a curated set of bad-config fixtures, so the rewrite
 * can be confidence-checked: the new walker should emit the same set
 * of codes per fixture.
 *
 * If a code-set drift is intentional (e.g. you intend to start emitting
 * a new diagnostic), update the snapshot below in the same PR.
 */

import { describe, it, expect } from 'vitest';
import { readFile, readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { validate } from '../../engine/game-loader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GAMES_DIR = join(__dirname, '..', '..', 'games');

// Helper — sort + dedupe codes so order in source doesn't matter
function codeSet(diagnostics) {
  return [...new Set(diagnostics.map(d => d.code))].sort();
}

describe('validator diagnostics — shape', () => {
  it('returns errors as string[], warnings as string[], diagnostics as Diagnostic[]', () => {
    const config = {
      name: 'X',
      phases: {
        lobby: { type: 'lobby', next: 'a' },
        a: { type: 'collect', prompt: 'q', madeUpField: 1, next: 'end' },
        end: { type: 'end' }
      }
    };
    const result = validate(config, 't', { returnResults: true });
    expect(Array.isArray(result.errors)).toBe(true);
    expect(typeof result.errors[0]).toBe('string');
    expect(Array.isArray(result.warnings)).toBe(true);
    expect(Array.isArray(result.diagnostics)).toBe(true);
    expect(result.diagnostics[0]).toHaveProperty('severity');
    expect(result.diagnostics[0]).toHaveProperty('code');
    expect(result.diagnostics[0]).toHaveProperty('message');
  });

  it('returns diagnostics on the early-exit path (missing phases)', () => {
    const result = validate({ name: 'X' }, 't', { returnResults: true });
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics[0].code).toBe('MISSING_REQUIRED_FIELD');
  });
});

describe('validator diagnostics — code inference covers every emitted message', () => {
  it('no shipped game produces a LEGACY_STRING_* fallback', async () => {
    // Skip _* (templates) and the `user/` subdirectory (user-saved games
    // namespace introduced with the games picker categories).
    const games = (await readdir(GAMES_DIR)).filter(g => !g.startsWith('_') && g !== 'user');
    for (const id of games) {
      const config = JSON.parse(await readFile(join(GAMES_DIR, id, 'config.json'), 'utf-8'));
      const result = validate(config, id, { returnResults: true });
      const legacy = result.diagnostics.filter(d => d.code.startsWith('LEGACY_'));
      if (legacy.length) {
        // Surface useful detail when this fails
        throw new Error(
          `${id}: ${legacy.length} unmapped string(s):\n  ` +
          legacy.map(d => d.message).join('\n  ')
        );
      }
    }
  });
});

describe('validator diagnostics — code snapshots per fixture', () => {
  // Curated fixtures hand-built so each one provokes a specific code.
  // Drift here means the validator's behavior changed for that input,
  // which #50's schema-walker rewrite needs to preserve.

  const fixtures = [
    {
      name: 'invalid phase type',
      expected: ['UNKNOWN_PHASE_TYPE'],
      config: {
        name: 'X', phases: {
          lobby: { type: 'lobby', next: 'b' },
          b: { type: 'invalid-type', next: 'end' },
          end: { type: 'end' }
        }
      }
    },
    {
      name: 'unknown field',
      expected: ['UNKNOWN_FIELD'],
      config: {
        name: 'X', phases: {
          lobby: { type: 'lobby', next: 'a' },
          a: { type: 'collect', prompt: 'q', madeUp: 1, next: 'end' },
          end: { type: 'end' }
        }
      }
    },
    {
      name: 'missing required field',
      expected: ['MISSING_REQUIRED_FIELD'],
      config: {
        name: 'X', phases: {
          lobby: { type: 'lobby', next: 'a' },
          a: { type: 'collect', next: 'end' },
          end: { type: 'end' }
        }
      }
    },
    {
      name: 'invalid enum value',
      expected: ['INVALID_ENUM_VALUE'],
      config: {
        name: 'X', phases: {
          lobby: { type: 'lobby', next: 'a' },
          a: { type: 'collect', prompt: 'q', from: 'everyone', next: 'end' },
          end: { type: 'end' }
        }
      }
    },
    {
      name: 'invalid integer range (timer)',
      expected: ['INVALID_INTEGER_RANGE'],
      config: {
        name: 'X', phases: {
          lobby: { type: 'lobby', next: 'a' },
          a: { type: 'collect', prompt: 'q', timer: 99999, next: 'end' },
          end: { type: 'end' }
        }
      }
    },
    {
      name: 'missing phase ref (next)',
      expected: ['MISSING_PHASE_REF', 'UNREACHABLE_PHASE'],
      config: {
        name: 'X', phases: {
          lobby: { type: 'lobby', next: 'nope' },
          end: { type: 'end' }
        }
      }
    },
    {
      name: 'cycle detected',
      expected: ['CYCLE_DETECTED', 'UNREACHABLE_PHASE'],
      config: {
        name: 'X', phases: {
          lobby: { type: 'lobby', next: 'a' },
          a: { type: 'collect', prompt: 'q', next: 'b' },
          b: { type: 'reveal', template: 'r', next: 'a' },
          end: { type: 'end' }
        }
      }
    },
    {
      name: 'unreachable phase',
      expected: ['UNREACHABLE_PHASE'],
      config: {
        name: 'X', phases: {
          lobby: { type: 'lobby', next: 'a' },
          a: { type: 'collect', prompt: 'q', next: 'end' },
          orphan: { type: 'reveal', template: 'r', next: 'end' },
          end: { type: 'end' }
        }
      }
    },
    {
      name: 'missing lobby',
      expected: ['MISSING_LOBBY'],
      config: {
        name: 'X', phases: {
          a: { type: 'collect', prompt: 'q', next: 'end' },
          end: { type: 'end' }
        }
      }
    },
    {
      name: 'missing end',
      expected: ['CYCLE_DETECTED', 'MISSING_END'],
      config: {
        name: 'X', phases: {
          lobby: { type: 'lobby', next: 'a' },
          a: { type: 'collect', prompt: 'q', next: 'a' }  // self-ref to keep validator past structural
        }
      }
    },
    {
      name: 'wager design hole (no scoresFrom + no correctOption)',
      expected: ['WAGER_NO_RESOLUTION_BASIS'],
      config: {
        name: 'X', phases: {
          lobby: { type: 'lobby', next: 'w' },
          w: { type: 'wager', prompt: 'p', options: ['A', 'B'], next: 'end' },
          end: { type: 'end' }
        }
      }
    },
    {
      name: 'dataRef type mismatch',
      expected: ['DATA_REF_TYPE_MISMATCH'],
      config: {
        name: 'X', phases: {
          lobby: { type: 'lobby', next: 'c' },
          c: { type: 'collect', prompt: 'q', next: 'lb' },
          // leaderboard.from accepts scoreMap; collect.responses is array
          lb: { type: 'leaderboard', from: 'c.responses', next: 'end' },
          end: { type: 'end' }
        }
      }
    },
    {
      name: 'raw array in template (warning)',
      expected: ['RAW_ARRAY_IN_TEMPLATE'],
      config: {
        name: 'X', phases: {
          lobby: { type: 'lobby', next: 'c' },
          c: { type: 'collect', prompt: 'q', next: 'r' },
          r: { type: 'reveal', template: '{{c.responses}}', next: 'end' },
          end: { type: 'end' }
        }
      }
    }
  ];

  for (const fixture of fixtures) {
    it(`emits ${fixture.expected.join(' + ')} for "${fixture.name}"`, () => {
      const result = validate(fixture.config, 'fixture', { returnResults: true });
      expect(codeSet(result.diagnostics)).toEqual(fixture.expected);
    });
  }
});

describe('validator diagnostics — game snapshot', () => {
  // Snapshot the diagnostic codes for each shipped game. If the rewrite
  // in Phase #50 changes any of these, this test will fail loudly.

  it('matches expected diagnostic-code set per shipped game', async () => {
    // Empty array means the game is clean. Update if new validators land.
    const expected = {
      'class-critique': [],
      'class-quiz-showdown': [],
      'convince-me': [],
      'corn-story': [],
      'dream-vacation': [],
      'elimination-game': [],
      'excuse-machine': [],
      // 2026-06-10 sweep: stale fields removed, [object Object]/raw-{{_current}}
      // leaks fixed (reveal-one itemTemplate). The remaining mismatches are
      // structural: their leaderboards consume judge-task result objects.
      'feedback-academy': ['DATA_REF_TYPE_MISMATCH'],
      'feedback-coach-academy': ['DATA_REF_TYPE_MISMATCH'],
      'human-vs-ai-birthday-party-battle': [],
      'lightning-round': [],
      'llm-or-duck': [],
      'mad-lib-mashup': ['DATA_REF_TYPE_MISMATCH'],
      'mood-check': [],
      'one-voice': [],
      'roast-me-if-you-can': [],
      'scamper': [],
      'simple-poll': [],
      'snowball': [],
      'story-builder': [],
      'story-quest': [],
      'two-truths-a-lie': [],
      'vocab-match': [],
      'charades-bowl': [],
      'closer': [],
      'definition-bluff': [],
      'punchline-showdown': [],
      'trivia-bluff': [],
      'speed-quiz': [],
      'weekend-poem': [],
      'who-said-it': [],
      'yes-or-no-bets': []
    };

    // Skip _* (templates) and the `user/` subdirectory (user-saved games
    // namespace — its contents are per-user, not part of the shipped snapshot).
    const games = (await readdir(GAMES_DIR)).filter(g => !g.startsWith('_') && g !== 'user');
    for (const id of games) {
      if (!(id in expected)) {
        // New game added since this snapshot was written. Fail loudly so
        // we add an explicit entry rather than silently letting drift in.
        throw new Error(`Game "${id}" missing from expected snapshot. Add it.`);
      }
      const config = JSON.parse(await readFile(join(GAMES_DIR, id, 'config.json'), 'utf-8'));
      const result = validate(config, id, { returnResults: true });
      expect(codeSet(result.diagnostics), `code drift in ${id}`).toEqual(expected[id]);
    }
  });
});
