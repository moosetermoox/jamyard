import { describe, it, expect } from 'vitest';
import { continueLabelFor, continueLabelForPhase } from '../../engine/phases/continue-labels.js';

describe('continueLabelFor', () => {
  it('labels the common next-phase types descriptively', () => {
    expect(continueLabelFor('collect')).toBe('Send the question to students');
    expect(continueLabelFor('vote')).toBe('Start the voting');
    expect(continueLabelFor('reveal')).toBe('Reveal the results');
    expect(continueLabelFor('leaderboard')).toBe('Show the standings');
    expect(continueLabelFor('end')).toBe('Finish up');
  });

  it('falls back to Continue for unknown or missing types', () => {
    expect(continueLabelFor('some-future-phase')).toBe('Continue');
    expect(continueLabelFor(null)).toBe('Continue');
    expect(continueLabelFor(undefined)).toBe('Continue');
  });
});

describe('continueLabelForPhase', () => {
  const phases = {
    intro: { type: 'announce', next: 'q1' },
    q1: { type: 'collect', next: 'results' },
    results: { type: 'reveal', next: 'end' },
    end: { type: 'end' }
  };

  it('resolves the label from the phase map', () => {
    expect(continueLabelForPhase(phases.intro, phases)).toBe('Send the question to students');
    expect(continueLabelForPhase(phases.results, phases)).toBe('Finish up');
  });

  it('is safe on dangling refs and missing next', () => {
    expect(continueLabelForPhase({ next: 'nope' }, phases)).toBe('Continue');
    expect(continueLabelForPhase({}, phases)).toBe('Continue');
    expect(continueLabelForPhase(null, phases)).toBe('Continue');
    expect(continueLabelForPhase(phases.intro, null)).toBe('Continue');
  });
});
