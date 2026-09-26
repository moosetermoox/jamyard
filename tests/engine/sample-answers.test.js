/**
 * Sample answers (outside review #2, 2026-09-07): hand-authored practice
 * responses on a config, validated by engine/sample-answers.js and dealt
 * by the picker in screens/shared/bot-brain.js. Two contracts:
 *   - the validator refuses shapes the picker cannot deal
 *   - the picker answers the classmate's line that is on screen
 * Plus a guard that every shelf template with a text step carries a set
 * (the review's ask: a coherent demo within a minute, no AI call).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { validateSampleAnswers } from '../../engine/sample-answers.js';
import { validate } from '../../engine/game-loader.js';
import '../../screens/shared/bot-brain.js';

const pick = (...args) => globalThis.pickSampleAnswer(...args);

const base = () => ({
  name: 'T', description: 'd',
  phases: {
    lobby: { type: 'lobby', next: 'notes' },
    notes: { type: 'collect', prompt: 'One thing', next: 'boost' },
    boost: { type: 'collect', rotateFrom: 'notes', prompt: '“{{notes.assigned}}” Write back', next: 'end' },
    end: { type: 'end' }
  }
});

describe('validateSampleAnswers', () => {
  it('accepts absent, a plain list, a respondsTo pair, and per-field arrays', () => {
    expect(validateSampleAnswers(base(), 'g')).toEqual([]);
    const cfg = base();
    cfg.sampleAnswers = {
      notes: ['a goal', ['one', 'two']],
      boost: { respondsTo: 'notes', lines: ['reply a', 'reply b'] }
    };
    expect(validateSampleAnswers(cfg, 'g')).toEqual([]);
  });

  it('refuses unknown steps, non-collect steps, empty lists, and bad lines', () => {
    const cfg = base();
    cfg.sampleAnswers = { nope: ['x'], end: ['x'], notes: [], boost: [''] };
    const errors = validateSampleAnswers(cfg, 'g');
    expect(errors.some(e => /"nope" names a step|\.nope names a step/.test(e))).toBe(true);
    expect(errors.some(e => /\.end must name a collect step/.test(e))).toBe(true);
    expect(errors.some(e => /\.notes must be a non-empty list/.test(e))).toBe(true);
    expect(errors.some(e => /\.boost must be a non-empty list/.test(e))).toBe(true);
  });

  it('requires respondsTo to name a listed step with the same number of lines', () => {
    const cfg = base();
    cfg.sampleAnswers = { notes: ['a', 'b', 'c'], boost: { respondsTo: 'notes', lines: ['only one'] } };
    expect(validateSampleAnswers(cfg, 'g').join('\n')).toMatch(/one line per "notes" sample \(3 there, 1 here\)/);
    cfg.sampleAnswers = { boost: { respondsTo: 'ghost', lines: ['x'] } };
    expect(validateSampleAnswers(cfg, 'g').join('\n')).toMatch(/names "ghost", which has no list/);
    cfg.sampleAnswers = 'nope';
    expect(validateSampleAnswers(cfg, 'g').join('\n')).toMatch(/must be an object keyed by step id/);
  });

  it('runs inside the game validator', () => {
    const cfg = base();
    cfg.sampleAnswers = { nope: ['x'] };
    expect(() => validate(cfg, 'g')).toThrow(/sampleAnswers/);
  });
});

describe('pickSampleAnswer', () => {
  const samples = {
    notes: ['I want to speak up in science.', 'Learning a hard song on guitar.'],
    boost: { respondsTo: 'notes', lines: ['Ask the first question.', 'Sore fingers mean progress.'] },
    ticket: [['learned A', 'question A'], ['learned B', 'question B']]
  };

  it('deals a plain list by seat, wrapping around', () => {
    expect(pick(samples, 'notes', '', 0)).toBe('I want to speak up in science.');
    expect(pick(samples, 'notes', '', 1)).toBe('Learning a hard song on guitar.');
    expect(pick(samples, 'notes', '', 2)).toBe('I want to speak up in science.');
    expect(pick(samples, 'ticket', '', 1)).toEqual(['learned B', 'question B']);
  });

  it('answers the classmate line that is on screen, whatever the seat', () => {
    const screen = 'A classmate wrote:\n“Learning a hard song on guitar.”\nWrite them one line';
    expect(pick(samples, 'boost', screen, 0)).toBe('Sore fingers mean progress.');
    expect(pick(samples, 'boost', screen.toUpperCase(), 5)).toBe('Sore fingers mean progress.');
  });

  it('falls back to the seat when nothing on screen matches, and to null when the step has no set', () => {
    expect(pick(samples, 'boost', 'something else entirely', 1)).toBe('Sore fingers mean progress.');
    expect(pick(samples, 'other', 'x', 0)).toBe(null);
    expect(pick(null, 'notes', 'x', 0)).toBe(null);
    expect(pick({ notes: [] }, 'notes', 'x', 0)).toBe(null);
  });
});

describe('shelf templates carry sample answers', () => {
  // The home shelf shows the featured templates; every text collect step
  // on one of them should demo coherently. Generated-at-game-time steps
  // (trivia-bluff's lies about AI questions) and For Each rounds are
  // exempt: nothing fixed can answer them.
  const EXEMPT = new Set(['trivia-bluff']);
  it('every featured template with a text step has a set for it', () => {
    const missing = [];
    for (const dir of readdirSync('games')) {
      if (dir.startsWith('_')) continue;
      let cfg;
      try { cfg = JSON.parse(readFileSync(`games/${dir}/config.json`, 'utf8')); } catch { continue; }
      if (!cfg.featured || EXEMPT.has(dir)) continue;
      for (const [id, p] of Object.entries(cfg.phases || {})) {
        if (p.type !== 'collect' || (p.inputType || 'text') !== 'text') continue;
        if (!cfg.sampleAnswers || !cfg.sampleAnswers[id]) missing.push(`${dir}.${id}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
