/**
 * Bot Brain (screens/shared/bot-brain.js) — prompt-aware Bot Fill answers.
 * Plain browser script that attaches botAnswerFor to globalThis, so a
 * side-effect import makes it testable here.
 */

import { describe, it, expect } from 'vitest';
import '../../screens/shared/bot-brain.js';

const answer = (prompt) => globalThis.botAnswerFor(prompt);

// Run each rule a few times since answers are randomized within a bank.
function answers(prompt, n = 10) {
  return Array.from({ length: n }, () => answer(prompt));
}

describe('botAnswerFor', () => {
  it('answers food questions with food', () => {
    for (const a of answers('What is your favorite snack?')) {
      expect(a).toMatch(/pizza|ramen|taco|dumpling|cheese|watermelon/i);
    }
  });

  it('keeps Doodle Bluff phrases and fake titles in separate banks, so a fake never equals the truth', () => {
    const phrasePrompt = 'Write a short, strange phrase that would be fun to watch someone draw. Example: a nervous octopus';
    const fakePrompt = 'What is the REAL title of this drawing? Make up a fake so convincing your classmates pick it.';
    const phrases = new Set(answers(phrasePrompt));
    const fakes = new Set(answers(fakePrompt));
    expect(phrases.size).toBeGreaterThan(1);
    expect(fakes.size).toBeGreaterThan(1);
    for (const f of fakes) expect(phrases.has(f)).toBe(false);
  });

  it('answers mood questions with feelings', () => {
    for (const a of answers('How are you feeling today? (one word or short phrase)')) {
      // "one word" rule wins here — single word, no spaces
      expect(a).not.toContain(' ');
    }
    for (const a of answers('How are you feeling about the test?')) {
      expect(a).toMatch(/sleepy|nervous|calm|tired|curious|better|excited|ready|happy/i);
    }
  });

  it('picks one of the offered options when the prompt embeds choices', () => {
    const seen = new Set(answers('What should we have for our party — pizza, sushi, or tacos?', 30));
    for (const a of seen) {
      expect(['Pizza', 'Sushi', 'Tacos']).toContain(a);
    }
    expect(seen.size).toBeGreaterThan(1); // actually varies
  });

  it('answers yes/no questions with yes/no', () => {
    for (const a of answers('Should homework be banned?')) {
      expect(a).toMatch(/yes|no|absolutely|probably/i);
    }
  });

  it('writes excuses when asked for excuses', () => {
    for (const a of answers('Write a funny excuse for not doing your homework')) {
      expect(a.length).toBeGreaterThan(15);
      expect(a).toMatch(/dog|wizard|cat|time travel|brother/i);
    }
  });

  it('writes questions when asked to write a question', () => {
    for (const a of answers('Write a get-to-know-you question for another pair.')) {
      expect(a).toContain('?');
    }
  });

  it('contributes story lines to story prompts', () => {
    for (const a of answers('Add to the story! What happens next?')) {
      expect(a.length).toBeGreaterThan(20);
    }
  });

  it('falls back to playful generics for anything unmatched', () => {
    const a = answer('Zxqv frobnicate the blorp');
    expect(typeof a).toBe('string');
    expect(a.length).toBeGreaterThan(5);
  });

  it('never returns empty for empty/odd input', () => {
    expect(answer('')).toBeTruthy();
    expect(answer(null)).toBeTruthy();
    expect(answer(undefined)).toBeTruthy();
  });
});
