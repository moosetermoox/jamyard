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

  it("the phase's own continueLabel field wins over the generated wording", () => {
    const custom = { type: 'announce', next: 'q1', continueLabel: "Let's discuss!" };
    expect(continueLabelForPhase(custom, phases)).toBe("Let's discuss!");
  });

  it('a blank or non-string continueLabel falls back to the generated label', () => {
    expect(continueLabelForPhase({ type: 'announce', next: 'q1', continueLabel: '   ' }, phases))
      .toBe('Send the question to students');
    expect(continueLabelForPhase({ type: 'announce', next: 'q1', continueLabel: 42 }, phases))
      .toBe('Send the question to students');
  });

  it('is safe on dangling refs and missing next', () => {
    expect(continueLabelForPhase({ next: 'nope' }, phases)).toBe('Continue');
    expect(continueLabelForPhase({}, phases)).toBe('Continue');
    expect(continueLabelForPhase(null, phases)).toBe('Continue');
    expect(continueLabelForPhase(phases.intro, null)).toBe('Continue');
  });

  // Quiz flows: the button into the FIRST multiple-choice question starts
  // the quiz; every later one is just the next question.
  describe('multiple-choice question labels', () => {
    const quiz = {
      lobby: { type: 'lobby', next: 'intro' },
      intro: { type: 'announce', next: 'q1' },
      q1: { type: 'collect-choice', next: 'r1' },
      r1: { type: 'announce', next: 'q2' },
      q2: { type: 'collect-choice', next: 'scores' },
      scores: { type: 'leaderboard', next: 'end' },
      end: { type: 'end' }
    };

    it('says Start the first question before any question has run', () => {
      expect(continueLabelForPhase(quiz.intro, quiz)).toBe('Start the first question');
    });

    it('says Next question once a question is behind us', () => {
      expect(continueLabelForPhase(quiz.r1, quiz)).toBe('Next question');
    });

    it('counts a question that leads straight into another question', () => {
      const backToBack = {
        lobby: { type: 'lobby', next: 'q1' },
        q1: { type: 'collect-choice', next: 'q2' },
        q2: { type: 'collect-choice', next: 'end' },
        end: { type: 'end' }
      };
      expect(continueLabelForPhase(backToBack.q1, backToBack)).toBe('Next question');
    });
  });
});
