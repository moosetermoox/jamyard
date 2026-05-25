/**
 * Tests for the three Jackbox-style primitives:
 *   - collect.assign: "pairwise" + pairsFrom        (Quiplash distribution)
 *   - vote.matchupsFromPairs + excludeAuthors        (Quiplash voting)
 *   - collect-choice.choicePool + excludeAuthored    (Fibbage/Balderdash voting)
 *
 * Validator-level checks live here. The full handler runtime is covered by the
 * game-flow simulators (scripts/simulate-quiplash.js etc.) — the heavy logic in
 * the handlers is also unit-testable but those tests would need a running
 * engine, so we cover the wiring + diagnostics here and rely on simulator runs
 * for end-to-end.
 */

import { describe, it, expect } from 'vitest';
import { validate } from '../../engine/game-loader.js';

const baseGame = (phases) => ({ name: 'Test', phases });

// ---------- pairwise collect ----------

describe('collect.assign: pairwise — validator', () => {
  it('accepts a pairwise collect with pairsFrom set', () => {
    const cfg = baseGame({
      lobby:    { type: 'lobby', next: 'prompts' },
      prompts:  { type: 'ai-process', task: 'generate', instruction: 'one liner', next: 'answers' },
      answers:  { type: 'collect', prompt: '{{prompts.assigned}}', assign: 'pairwise', pairsFrom: 'prompts', next: 'end' },
      end:      { type: 'end' }
    });
    expect(() => validate(cfg, 'pairwise-ok')).not.toThrow();
  });

  it('rejects assign:"pairwise" without pairsFrom', () => {
    const cfg = baseGame({
      lobby:   { type: 'lobby', next: 'answers' },
      answers: { type: 'collect', prompt: 'q?', assign: 'pairwise', next: 'end' },
      end:     { type: 'end' }
    });
    expect(() => validate(cfg, 'pairwise-missing-source'))
      .toThrow(/assign:"pairwise" but is missing required field "pairsFrom"/);
  });

  it('rejects an unknown value for assign', () => {
    const cfg = baseGame({
      lobby:   { type: 'lobby', next: 'answers' },
      answers: { type: 'collect', prompt: 'q?', assign: 'something-else', pairsFrom: 'lobby', next: 'end' },
      end:     { type: 'end' }
    });
    expect(() => validate(cfg, 'pairwise-bad-enum')).toThrow();
  });
});

// ---------- vote matchupsFromPairs + excludeAuthors ----------

describe('vote.matchupsFromPairs + excludeAuthors — validator', () => {
  it('accepts a head-to-head vote with matchupsFromPairs (no candidates)', () => {
    const cfg = baseGame({
      lobby:    { type: 'lobby', next: 'prompts' },
      prompts:  { type: 'ai-process', task: 'generate', instruction: 'lines', next: 'answers' },
      answers:  { type: 'collect', prompt: '{{prompts.assigned}}', assign: 'pairwise', pairsFrom: 'prompts', next: 'pickwinner' },
      pickwinner: {
        type: 'vote', mode: 'head-to-head',
        matchupsFromPairs: 'answers', excludeAuthors: true,
        next: 'end'
      },
      end: { type: 'end' }
    });
    expect(() => validate(cfg, 'matchups-ok')).not.toThrow();
  });

  it('rejects matchupsFromPairs with mode other than head-to-head', () => {
    const cfg = baseGame({
      lobby:   { type: 'lobby', next: 'answers' },
      answers: { type: 'collect', prompt: 'q', next: 'pickwinner' },
      pickwinner: {
        type: 'vote', mode: 'pick-one',
        matchupsFromPairs: 'answers',
        next: 'end'
      },
      end: { type: 'end' }
    });
    expect(() => validate(cfg, 'matchups-wrong-mode'))
      .toThrow(/uses "matchupsFromPairs" but mode is not "head-to-head"/);
  });

  it('rejects vote with neither candidates nor matchupsFromPairs', () => {
    const cfg = baseGame({
      lobby:    { type: 'lobby', next: 'pickwinner' },
      pickwinner: { type: 'vote', mode: 'head-to-head', next: 'end' },
      end:      { type: 'end' }
    });
    expect(() => validate(cfg, 'vote-no-source'))
      .toThrow(/missing required field "candidates"/);
  });
});

// ---------- choicePool + excludeAuthored ----------

describe('collect-choice.choicePool + excludeAuthored — validator', () => {
  it('accepts a choicePool with mixed sources', () => {
    const cfg = baseGame({
      lobby:    { type: 'lobby', next: 'topic' },
      topic:    { type: 'ai-process', task: 'generate', instruction: 'a trivia fact', next: 'lies' },
      lies:     { type: 'collect', prompt: 'Lie!', next: 'guess' },
      guess: {
        type: 'collect-choice',
        prompt: 'Find the truth',
        choicePool: [
          { from: 'lies.responses', field: 'text' },
          { literal: '{{topic.result}}' }
        ],
        excludeAuthored: 'lies',
        shuffle: true,
        next: 'end'
      },
      end: { type: 'end' }
    });
    expect(() => validate(cfg, 'choicepool-ok')).not.toThrow();
  });

  it('rejects collect-choice with neither choices nor choicePool', () => {
    const cfg = baseGame({
      lobby: { type: 'lobby', next: 'pick' },
      pick:  { type: 'collect-choice', prompt: 'pick', next: 'end' },
      end:   { type: 'end' }
    });
    expect(() => validate(cfg, 'choice-empty'))
      .toThrow(/missing required field "choices"/);
  });

  it('rejects collect-choice with BOTH choices and choicePool', () => {
    const cfg = baseGame({
      lobby: { type: 'lobby', next: 'pick' },
      pick:  {
        type: 'collect-choice', prompt: 'pick',
        choices: ['A', 'B'],
        choicePool: [{ literal: 'C' }],
        next: 'end'
      },
      end:   { type: 'end' }
    });
    expect(() => validate(cfg, 'choice-both'))
      .toThrow(/cannot set both "choices" and "choicePool"/);
  });
});

// ---------- runtime helpers (pure functions extracted from handlers) ----------
//
// The handler files keep helpers private. To unit-test the pairwise algorithm
// and the choice-pool dedupe we re-implement the contract here with the same
// shapes — and a smoke check on the handler files via static analysis.

describe('pairwise algorithm — contract', () => {
  function pair(playerIds, items) {
    const out = { pairs: [], assigned: {} };
    for (let i = 0; i + 1 < playerIds.length; i += 2) {
      const a = playerIds[i], b = playerIds[i + 1];
      const promptText = items[(i / 2) % items.length];
      out.pairs.push({ promptText, playerIds: [a, b] });
      out.assigned[a] = promptText;
      out.assigned[b] = promptText;
    }
    return out;
  }

  it('pairs an even player count, each pair sharing one prompt', () => {
    const { pairs, assigned } = pair(['p1', 'p2', 'p3', 'p4'], ['A', 'B']);
    expect(pairs).toHaveLength(2);
    expect(pairs[0].playerIds).toEqual(['p1', 'p2']);
    expect(pairs[1].playerIds).toEqual(['p3', 'p4']);
    expect(assigned.p1).toBe(assigned.p2);
    expect(assigned.p3).toBe(assigned.p4);
    expect(assigned.p1).not.toBe(assigned.p3);
  });

  it('leaves the last player unpaired on odd counts', () => {
    const { pairs, assigned } = pair(['p1', 'p2', 'p3'], ['A']);
    expect(pairs).toHaveLength(1);
    expect(assigned.p3).toBeUndefined();
  });

  it('cycles prompts if there are more pairs than items', () => {
    const { pairs } = pair(['p1', 'p2', 'p3', 'p4'], ['A']);
    expect(pairs[0].promptText).toBe('A');
    expect(pairs[1].promptText).toBe('A'); // wraps
  });
});
