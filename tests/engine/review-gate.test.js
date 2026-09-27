/**
 * A student's own words never reach the projector with a name on them
 * without a teacher gate (2026-09-26, a reviewer's "My parents are getting
 * divorced" went straight up in a guess-who round). The gate on read, the
 * heavy-topic flag, the audience line that says the class will guess the
 * author, and the author's neutral waiting line.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ungatedRounds, ensureReviewGate, GATE_TEMPLATE } from '../../engine/review-gate.js';
import { heavyTopic } from '../../engine/heavy-topics.js';
import { audienceFor, AUDIENCE } from '../../engine/audience.js';
import { sitOutMessage } from '../../engine/phases/sit-out.js';
import { validate } from '../../engine/game-loader.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// The shape every Guess Who copy had before the gate: collect -> foreach
function oldGuessWho() {
  return {
    name: 'Guess Who',
    phases: {
      lobby: { type: 'lobby', next: 'ask' },
      ask: { type: 'collect', prompt: 'Rose, bud, thorn?', timer: 60, next: 'rounds' },
      rounds: {
        type: 'foreach', data: 'ask.responses', shuffle: true, candidateSource: 'players', decoyCount: 3,
        subPhases: {
          show: { type: 'announce', message: '{{_current.text}}\n\nWho said it?' },
          guess: { type: 'collect-choice', prompt: 'Who?', choices: '_candidates', timer: 20 },
          reveal: { type: 'announce', message: 'It was {{_current.playerName}}!' }
        },
        next: 'end'
      },
      end: { type: 'end' }
    }
  };
}

describe('the review gate on read', () => {
  it('finds a collect that feeds guess-who rounds straight away', () => {
    expect(ungatedRounds(oldGuessWho())).toEqual([['ask', 'rounds']]);
  });
  it('puts a preview between them, in key order, approve = rounds, reject = answer again', () => {
    const cfg = oldGuessWho();
    expect(ensureReviewGate(cfg)).toEqual(['rounds-check']);
    expect(Object.keys(cfg.phases)).toEqual(['lobby', 'ask', 'rounds-check', 'rounds', 'end']);
    expect(cfg.phases.ask.next).toBe('rounds-check');
    expect(cfg.phases['rounds-check']).toEqual({ type: 'preview', template: GATE_TEMPLATE, approveNext: 'rounds', rejectNext: 'ask' });
    // the repaired copy validates
    const result = validate(cfg, 'guess-who', { returnResults: true });
    expect(result.errors).toEqual([]);
    // and is left alone the second time
    expect(ensureReviewGate(cfg)).toEqual([]);
  });
  it('leaves rounds that never name the author alone (a plain guessing game over clues)', () => {
    const cfg = oldGuessWho();
    delete cfg.phases.rounds.candidateSource;
    cfg.phases.rounds.subPhases.reveal.message = 'It was the answer!';
    expect(ungatedRounds(cfg)).toEqual([]);
  });
  it('names rounds that reveal the author even without a roster ballot, as advice; the read repair leaves those alone', () => {
    const cfg = oldGuessWho();
    delete cfg.phases.rounds.candidateSource;
    expect(ungatedRounds(cfg)).toEqual([['ask', 'rounds']]);
    expect(ungatedRounds(cfg, { secretOnly: true })).toEqual([]);
    expect(ensureReviewGate(cfg, { secretOnly: true })).toEqual([]);
    expect(Object.keys(cfg.phases)).toEqual(['lobby', 'ask', 'rounds', 'end']);
  });
  it('the built-in Who Said It? carries the gate, and every built-in and recipe is gated', async () => {
    const who = JSON.parse(readFileSync(join(ROOT, 'games/who-said-it/config.json'), 'utf8'));
    expect(who.phases.check.type).toBe('preview');
    expect(who.phases['collect-answers'].next).toBe('check');
    expect(ungatedRounds(who)).toEqual([]);
    const { readdirSync, existsSync } = await import('node:fs');
    for (const dir of readdirSync(join(ROOT, 'games'))) {
      const file = join(ROOT, 'games', dir, 'config.json');
      if (!existsSync(file)) continue;
      // every round where the author is the secret is gated; Excuse
      // Machine's name-reveal rounds carry the validator's advice instead
      expect(ungatedRounds(JSON.parse(readFileSync(file, 'utf8')), { secretOnly: true }), dir).toEqual([]);
    }
    for (const file of readdirSync(join(ROOT, 'recipes')).filter(f => f.endsWith('.json'))) {
      const recipe = JSON.parse(readFileSync(join(ROOT, 'recipes', file), 'utf8'));
      if (recipe.template && recipe.template.phases) expect(ungatedRounds(recipe.template), file).toEqual([]);
    }
  });
  it('the validator warns on the missing step', () => {
    const result = validate(oldGuessWho(), 'guess-who', { returnResults: true });
    expect(result.warnings.join('\n')).toMatch(/AUTHOR_UNGATED|before the rounds/);
  });
});

describe('heavyTopic', () => {
  it('marks a disclosure the filter and the ladder let through', () => {
    expect(heavyTopic("My parents are getting divorced and I can't sleep.")).toBe(true);
    expect(heavyTopic('My grandpa died last month.')).toBe(true);
    expect(heavyTopic('sometimes I want to die')).toBe(true);
    expect(heavyTopic('my stepdad hits me when he is drunk')).toBe(true);
  });
  it('leaves an ordinary answer alone', () => {
    expect(heavyTopic('Rose: my team won. Bud: the field trip. Thorn: too much homework.')).toBe(false);
    expect(heavyTopic('The most unusual thing I ate was a cricket taco.')).toBe(false);
    expect(heavyTopic('')).toBe(false);
    expect(heavyTopic(null)).toBe(false);
  });
});

describe('the answer box says the class will guess who wrote it', () => {
  it('a collect feeding guess-who rounds, with and without the gate', () => {
    const cfg = oldGuessWho();
    expect(audienceFor(cfg, 'ask').key).toBe(AUDIENCE.GUESSED);
    expect(audienceFor(cfg, 'ask').label).toBe('Your class will see this and try to guess who wrote it.');
    ensureReviewGate(cfg);
    expect(audienceFor(cfg, 'ask').key).toBe(AUDIENCE.GUESSED_AFTER_REVIEW);
    expect(audienceFor(cfg, 'ask').label).toBe('Your class will see this and try to guess who wrote it, after your teacher reviews it.');
  });
});

describe("the author's screen in a guess-who round", () => {
  it('reads like everyone else\'s waiting screen, never "This one is yours!"', () => {
    const round = { _foreachAuthorId: 'a', _foreachSitOutIds: ['a'], _foreachSecretAuthor: true };
    expect(sitOutMessage(round, 'a')).toBe('Waiting for the others...');
    const bluff = { _foreachAuthorId: 'a', _foreachSitOutIds: ['a'], _foreachSecretAuthor: false };
    expect(sitOutMessage(bluff, 'a')).toBe('This one is yours! Waiting for the others...');
  });
});
