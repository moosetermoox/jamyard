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

  // An announce step is often a reveal or a round intro; the button reads
  // the message it is about to show instead of a flat "Show the message"
  // (Trivia Bluff field test, 2026-09-04).
  describe('announce context labels', () => {
    const bluff = {
      lobby: { type: 'lobby', next: 'intro' },
      intro: { type: 'announce', message: 'TRIVIA BLUFF!\n\nWrite believable lies.', next: 'show1' },
      show1: { type: 'announce', message: 'Round 1 of 3\n\nCategory: Food\n\nThe ___ is banned in Singapore.', next: 'lies1' },
      lies1: { type: 'collect', prompt: 'Lie', next: 'vote1' },
      vote1: { type: 'collect-choice', choices: ['a', 'b'], next: 'reveal1' },
      reveal1: { type: 'announce', message: 'The truth was: {{fact1.result.truth}}!\n\n{{vote1.barChart}}', next: 'show2' },
      show2: { type: 'announce', message: 'Round 2 of 3\n\nCategory: Animals', next: 'lies2' },
      lies2: { type: 'collect', prompt: 'Lie', next: 'doodle' },
      doodle: { type: 'announce', message: 'The real title:\n{{_current.assigned}}\n\nDrawn by {{_current.playerName}}.', drawingFrom: '_current.drawing', next: 'clip' },
      clip: { type: 'announce', message: 'Watch this.', video: 'https://youtu.be/x', next: 'pic' },
      pic: { type: 'announce', message: 'Look closely.', image: 'photo.png', next: 'bye' },
      bye: { type: 'announce', message: 'Thanks for playing!', next: 'end' },
      end: { type: 'end' }
    };

    it('a plain message keeps Show the message', () => {
      expect(continueLabelForPhase(bluff.pic, bluff)).toBe('Show the message');
    });

    it('a round intro says Start the first round, then Start the next round', () => {
      expect(continueLabelForPhase(bluff.intro, bluff)).toBe('Start the first round');
      expect(continueLabelForPhase(bluff.reveal1, bluff)).toBe('Start the next round');
    });

    it('a truth or bar-chart reveal says Reveal the answer', () => {
      expect(continueLabelForPhase(bluff.vote1, bluff)).toBe('Reveal the answer');
      expect(continueLabelForPhase(bluff.lies2, bluff)).toBe('Reveal the answer');
    });

    it('a video says Play the video and a picture says Show the picture', () => {
      expect(continueLabelForPhase(bluff.doodle, bluff)).toBe('Play the video');
      expect(continueLabelForPhase(bluff.clip, bluff)).toBe('Show the picture');
    });

    it('translates the context labels into the activity language', () => {
      expect(continueLabelForPhase(bluff.vote1, bluff, 'es')).toBe('Revelar la respuesta');
      expect(continueLabelForPhase(bluff.reveal1, bluff, 'fr')).toBe('Lancer la manche suivante');
    });

    it('the teacher-typed label still wins', () => {
      const custom = { type: 'collect-choice', next: 'reveal1', continueLabel: 'Drumroll' };
      expect(continueLabelForPhase(custom, bluff)).toBe('Drumroll');
    });
  });
});
