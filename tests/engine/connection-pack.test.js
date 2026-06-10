/**
 * Connection Pack — Phase 1 shared infrastructure.
 * Spec: docs/connection-pack-spec.md §2.4, §6.
 *
 * Covers:
 *   - Pass machinery (engine/moderation.js): a pass counts as a submission
 *     but never flows downstream and is never attributable.
 *   - Pair-scoped reveal helpers (engine/phases/pair-reveal.js): per-pair
 *     views, neutral listen-card, {{_pair.*}} substitution.
 *   - Validator rules (engine/game-loader.js): pair reveal requirements
 *     incl. the all-paths dominator check, and connection-family
 *     no-winner enforcement.
 *   - Recipe-level family flag (recipe-schema / recipe-compiler).
 *   - Resolver grammar: _pair is a recognized scope.
 *   - Event schema: pass flag on submit-response.
 */

import { describe, it, expect } from 'vitest';
import {
  PASS_RESPONSE,
  isPassResponse,
  responseToText,
  hasSubmitted,
  isVisibleSubmission,
  collectPassedIds,
  buildSubmissionList
} from '../../engine/moderation.js';
import {
  buildPairViews,
  renderPairAnswers,
  buildPairContent,
  LISTEN_CARD_TEXT
} from '../../engine/phases/pair-reveal.js';
import { validate } from '../../engine/game-loader.js';
import { validateRecipe } from '../../engine/recipe-schema.js';
import { compileRecipe } from '../../engine/recipe-compiler.js';
import { parseRef } from '../../engine/resolver-grammar.js';
import { validatePayload } from '../../engine/event-schemas.js';

// ---------------------------------------------------------------------
// Pass machinery
// ---------------------------------------------------------------------

describe('pass response (moderation helpers)', () => {
  it('isPassResponse recognizes the sentinel and nothing else', () => {
    expect(isPassResponse(PASS_RESPONSE)).toBe(true);
    expect(isPassResponse({ _pass: true })).toBe(true);
    expect(isPassResponse('I pass')).toBe(false);
    expect(isPassResponse({ a: 'x' })).toBe(false);
    expect(isPassResponse(null)).toBe(false);
    expect(isPassResponse(undefined)).toBe(false);
  });

  it('a pass counts as submitted (closes the phase like an answer)', () => {
    expect(hasSubmitted({ response: PASS_RESPONSE })).toBe(true);
  });

  it('a pass never flows downstream (not a visible submission)', () => {
    expect(isVisibleSubmission({ response: PASS_RESPONSE })).toBe(false);
  });

  it('responseToText renders a pass as empty text', () => {
    expect(responseToText(PASS_RESPONSE)).toBe('');
  });

  it('collectPassedIds returns exactly the passers', () => {
    const players = [
      { id: 'p1', name: 'A', response: 'real answer' },
      { id: 'p2', name: 'B', response: PASS_RESPONSE },
      { id: 'p3', name: 'C' },
      { id: 'p4', name: 'D', response: PASS_RESPONSE }
    ];
    expect(collectPassedIds(players)).toEqual(['p2', 'p4']);
  });

  it('buildSubmissionList excludes passes (nothing to moderate, never attributable)', () => {
    const players = [
      { id: 'p1', name: 'Alex', response: 'soccer' },
      { id: 'p2', name: 'Sam', response: PASS_RESPONSE }
    ];
    const list = buildSubmissionList(players);
    expect(list).toEqual([
      { playerId: 'p1', name: 'Alex', text: 'soccer', hidden: false }
    ]);
  });
});

// ---------------------------------------------------------------------
// Pair-scoped reveal helpers
// ---------------------------------------------------------------------

const PLAYERS = [
  { id: 'p1', name: 'Alice' },
  { id: 'p2', name: 'Bob' },
  { id: 'p3', name: 'Cleo' },
  { id: 'p4', name: 'Dana' }
];

const SOURCE_DATA = {
  pairs: [
    { promptText: 'Window or aisle?', playerIds: ['p1', 'p2'] },
    { promptText: 'Best lunch ever?', playerIds: ['p3', 'p4'] }
  ],
  byPlayer: { p1: 'Window, always', p2: 'Aisle for snacks', p3: 'Taco day' },
  passedIds: ['p4']
};

describe('buildPairViews', () => {
  it('builds one shared view per pair, keyed by each member', () => {
    const views = buildPairViews(SOURCE_DATA, PLAYERS);
    expect(views.get('p1')).toBe(views.get('p2'));
    expect(views.get('p3')).toBe(views.get('p4'));
    expect(views.get('p1')).not.toBe(views.get('p3'));
  });

  it('resolves names and answers per member', () => {
    const views = buildPairViews(SOURCE_DATA, PLAYERS);
    const v = views.get('p1');
    expect(v.promptText).toBe('Window or aisle?');
    expect(v.members).toEqual([
      { playerId: 'p1', name: 'Alice', text: 'Window, always' },
      { playerId: 'p2', name: 'Bob', text: 'Aisle for snacks' }
    ]);
  });

  it('a passed member has null text — same as a missing answer', () => {
    const views = buildPairViews(SOURCE_DATA, PLAYERS);
    const v = views.get('p3');
    expect(v.members.find(m => m.playerId === 'p4').text).toBeNull();
  });

  it('a missing answer (no pass) also has null text — indistinguishable', () => {
    const noAnswer = { ...SOURCE_DATA, byPlayer: { p1: 'x', p2: 'y' }, passedIds: [] };
    const views = buildPairViews(noAnswer, PLAYERS);
    expect(views.get('p3').members.find(m => m.playerId === 'p4').text).toBeNull();
  });

  it('supports groups larger than 2 (odd-class triple)', () => {
    const triple = {
      pairs: [{ promptText: 'Q', playerIds: ['p1', 'p2', 'p3'] }],
      byPlayer: { p1: 'a', p2: 'b', p3: 'c' },
      passedIds: []
    };
    const views = buildPairViews(triple, PLAYERS);
    expect(views.get('p1').members).toHaveLength(3);
    expect(views.get('p3')).toBe(views.get('p1'));
  });

  it('returns an empty map for missing/malformed source data', () => {
    expect(buildPairViews(null, PLAYERS).size).toBe(0);
    expect(buildPairViews({}, PLAYERS).size).toBe(0);
  });
});

describe('renderPairAnswers', () => {
  it('renders each member as name: answer', () => {
    const views = buildPairViews(SOURCE_DATA, PLAYERS);
    const block = renderPairAnswers(views.get('p1'));
    expect(block).toContain('Alice: Window, always');
    expect(block).toContain('Bob: Aisle for snacks');
  });

  it('renders the neutral listen-card for a pass — identically to a missing answer', () => {
    const views = buildPairViews(SOURCE_DATA, PLAYERS);
    const passBlock = renderPairAnswers(views.get('p4'));
    expect(passBlock).toContain(`Dana ${LISTEN_CARD_TEXT}.`);
    expect(passBlock).not.toContain('Dana:');

    // Same render when the player simply didn't answer in time
    const noAnswer = { ...SOURCE_DATA, passedIds: [] , byPlayer: { p3: 'Taco day' } };
    const noAnswerBlock = renderPairAnswers(buildPairViews(noAnswer, PLAYERS).get('p4'));
    expect(noAnswerBlock).toBe(passBlock);
  });

  it('handles an undefined view', () => {
    expect(renderPairAnswers(undefined)).toBe('');
  });
});

describe('buildPairContent', () => {
  it('substitutes {{_pair.answers}} and {{_pair.prompt}} in a resolved template', () => {
    const views = buildPairViews(SOURCE_DATA, PLAYERS);
    const content = buildPairContent('Q: {{_pair.prompt}}\n\n{{_pair.answers}}', views.get('p1'));
    expect(content).toContain('Q: Window or aisle?');
    expect(content).toContain('Alice: Window, always');
    expect(content).not.toContain('{{_pair');
  });

  it('falls back to the bare answers block without a template', () => {
    const views = buildPairViews(SOURCE_DATA, PLAYERS);
    expect(buildPairContent(null, views.get('p1'))).toContain('Alice: Window, always');
  });
});

// ---------------------------------------------------------------------
// Validator — pair reveal rules
// ---------------------------------------------------------------------

function baseConfig(phases) {
  return { name: 'Test', phases };
}

function pairChainPhases(overrides = {}) {
  return {
    lobby: { type: 'lobby', next: 'seed' },
    seed: { type: 'collect', prompt: 'Write a question.', next: 'answer' },
    answer: {
      type: 'collect', prompt: 'Answer: {{seed.assigned}}',
      assign: 'pairwise', pairsFrom: 'seed',
      passAllowed: true, simultaneousReveal: true,
      next: 'share'
    },
    share: { type: 'reveal', scope: 'pair', pairsFrom: 'answer', next: 'end' },
    end: { type: 'end' },
    ...overrides
  };
}

describe('validator: collect pass/simultaneous flags', () => {
  it('accepts passAllowed and simultaneousReveal on collect', () => {
    const { errors } = validate(baseConfig(pairChainPhases()), 'test', { returnResults: true });
    expect(errors).toEqual([]);
  });
});

describe('validator: pair-scoped reveal', () => {
  it('valid pair chain produces no errors', () => {
    const { errors } = validate(baseConfig(pairChainPhases()), 'test', { returnResults: true });
    expect(errors).toEqual([]);
  });

  it('scope:"pair" without pairsFrom is an error', () => {
    const phases = pairChainPhases();
    delete phases.share.pairsFrom;
    const { errors } = validate(baseConfig(phases), 'test', { returnResults: true });
    expect(errors.some(e => e.includes('missing required field "pairsFrom"'))).toBe(true);
  });

  it('pairsFrom pointing at a nonexistent phase is an error', () => {
    const phases = pairChainPhases();
    phases.share.pairsFrom = 'ghost';
    const { errors } = validate(baseConfig(phases), 'test', { returnResults: true });
    expect(errors.some(e => e.includes('pairsFrom "ghost" which does not exist'))).toBe(true);
  });

  it('pairsFrom pointing at a non-pairwise collect is an error', () => {
    const phases = pairChainPhases();
    phases.share.pairsFrom = 'seed'; // plain collect, no assign:"pairwise"
    const { errors } = validate(baseConfig(phases), 'test', { returnResults: true });
    expect(errors.some(e => e.includes('must point to a collect step with assign:"pairwise"'))).toBe(true);
  });

  it('rejects a pair reveal reachable without the pairwise collect (all-paths rule)', () => {
    // lobby → gate(preview): approve → answer → share, reject → skip → share.
    // The reject path reaches the pair reveal without ever pairing.
    const phases = {
      lobby: { type: 'lobby', next: 'seed' },
      seed: { type: 'collect', prompt: 'Write a question.', next: 'gate' },
      gate: { type: 'preview', content: 'Ready?', approveNext: 'answer', rejectNext: 'skip' },
      skip: { type: 'announce', message: 'Skipping ahead.', next: 'share' },
      answer: {
        type: 'collect', prompt: 'Answer it.',
        assign: 'pairwise', pairsFrom: 'seed', next: 'share'
      },
      share: { type: 'reveal', scope: 'pair', pairsFrom: 'answer', next: 'end' },
      end: { type: 'end' }
    };
    const { errors } = validate(baseConfig(phases), 'test', { returnResults: true });
    expect(errors.some(e => e.includes('can be reached without going through "answer"'))).toBe(true);
  });

  it('invalid scope value is an enum error', () => {
    const phases = pairChainPhases();
    phases.share.scope = 'everyone';
    const { errors } = validate(baseConfig(phases), 'test', { returnResults: true });
    expect(errors.some(e => e.includes('invalid scope value "everyone"'))).toBe(true);
  });
});

// ---------------------------------------------------------------------
// Validator — connection family
// ---------------------------------------------------------------------

describe('validator: connection family', () => {
  function connectionConfig(extraPhases = {}, beforeEndId = null) {
    const phases = {
      lobby: { type: 'lobby', next: 'ask' },
      ask: { type: 'collect', prompt: 'How are you?', next: beforeEndId || 'end' },
      end: { type: 'end' },
      ...extraPhases
    };
    return { name: 'Conn', family: 'connection', phases };
  }

  it('clean connection game validates', () => {
    const { errors } = validate(connectionConfig(), 'test', { returnResults: true });
    expect(errors).toEqual([]);
  });

  it.each(['leaderboard', 'winner', 'eliminate', 'ai-eliminate', 'wager'])(
    'rejects %s in a connection-family game',
    (type) => {
      // Minimal phase of each forbidden type; required fields filled where
      // needed so the family error isn't masked by missing-field errors.
      const forbidden = {
        leaderboard: { type: 'leaderboard', from: 'ask.responses', next: 'end' },
        winner: { type: 'winner', from: 'ask.responses', next: 'end' },
        eliminate: { type: 'eliminate', method: 'bottom-percent', percent: 50, input: 'ask.responses', next: 'end' },
        'ai-eliminate': { type: 'ai-eliminate', input: 'ask.responses', instruction: 'judge', next: 'end' },
        wager: { type: 'wager', prompt: 'Bet!', options: ['a', 'b'], next: 'end' }
      }[type];
      const { errors } = validate(connectionConfig({ bad: forbidden }, 'bad'), 'test', { returnResults: true });
      expect(errors.some(e => e.includes('not allowed in a connection-family game'))).toBe(true);
    }
  );

  it('rejects graded collect-choice (correctAnswer/speedBonus) in a connection game', () => {
    const { errors } = validate(connectionConfig({
      quiz: {
        type: 'collect-choice', prompt: 'Pick', choices: ['a', 'b'],
        correctAnswer: 'a', next: 'end'
      }
    }, 'quiz'), 'test', { returnResults: true });
    expect(errors.some(e => e.includes('graded scoring'))).toBe(true);
  });

  it('rejects an invalid family value', () => {
    const config = { name: 'X', family: 'speedrun', phases: {
      lobby: { type: 'lobby', next: 'end' }, end: { type: 'end' }
    } };
    const { errors } = validate(config, 'test', { returnResults: true });
    expect(errors.some(e => e.includes('invalid family value "speedrun"'))).toBe(true);
  });

  it('no family flag means no family restrictions', () => {
    const config = baseConfig({
      lobby: { type: 'lobby', next: 'lb' },
      ask: { type: 'collect', prompt: 'Q', next: 'lb' },
      lb: { type: 'leaderboard', from: 'ask.responses', next: 'end' },
      end: { type: 'end' }
    });
    const { errors } = validate(config, 'test', { returnResults: true });
    expect(errors.some(e => e.includes('connection-family'))).toBe(false);
  });
});

// ---------------------------------------------------------------------
// Recipe-level family flag
// ---------------------------------------------------------------------

describe('recipe family flag', () => {
  const recipe = {
    id: 'test-connection',
    name: 'Test Connection',
    description: 'A test',
    family: 'connection',
    parameters: {
      prompt: { type: 'templateString', required: true, label: 'Prompt' }
    },
    template: {
      name: 'Test Connection',
      phases: {
        lobby: { type: 'lobby', next: 'ask' },
        ask: { type: 'collect', prompt: '${prompt}', next: 'end' },
        end: { type: 'end' }
      }
    }
  };

  it('validateRecipe accepts family:"connection"', () => {
    const diags = validateRecipe(recipe);
    expect(diags.filter(d => d.severity === 'error')).toEqual([]);
  });

  it('validateRecipe rejects an unknown family', () => {
    const diags = validateRecipe({ ...recipe, family: 'competitive' });
    expect(diags.some(d => d.field === 'family' && d.severity === 'error')).toBe(true);
  });

  it('compileRecipe carries family into the compiled config', () => {
    const { config, diagnostics } = compileRecipe(recipe, { prompt: 'Hello?' });
    expect(diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    expect(config.family).toBe('connection');
    // ...and the compiled config passes game validation including family rules
    const { errors } = validate(config, 'compiled', { returnResults: true });
    expect(errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// Grammar + event schema
// ---------------------------------------------------------------------

describe('resolver grammar: _pair scope', () => {
  it('parses {{_pair.answers}} as a pairScope ref', () => {
    const parsed = parseRef('_pair.answers');
    expect(parsed.kind).toBe('pairScope');
    expect(parsed.segments).toEqual(['_pair', 'answers']);
  });
});

describe('event schema: submit-response pass flag', () => {
  it('accepts pass: true', () => {
    expect(validatePayload('submit-response', { code: 'ABCD', response: '', pass: true }).ok).toBe(true);
  });

  it('rejects a non-boolean pass', () => {
    expect(validatePayload('submit-response', { code: 'ABCD', response: '', pass: 'yes' }).ok).toBe(false);
  });

  it('still accepts plain submissions without pass', () => {
    expect(validatePayload('submit-response', { code: 'ABCD', response: 'hi' }).ok).toBe(true);
  });
});
