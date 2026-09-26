/**
 * The Make page pass (owner, 2026-09-26): the words at the top are the
 * teacher's to type, so the fit never asks for them; no lone "See how it
 * reads"; the keep-note shows once; a talk-only activity's print is its
 * first question, not the rating at its end.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { AIService } from '../../services/ai-service.js';
import { printFor } from '../../engine/make-print.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const KNOWN = ['Grade band', 'Subjects', 'The question (the prompt students see, typed on the page above)', 'Timer', 'Student names'];

describe('the fit questions never ask for what the page already holds', () => {
  it('drops a question about the prompt, claim, topic, or task', () => {
    for (const q of [
      'What should students draw?',
      'What claim or statement should students take a stance on?',
      'What question should students answer alone first?',
      'What should the two questions ask students?',
      "What's the topic students will explore from different viewpoints?",
      'What subject or topic should the trivia facts cover?'
    ]) expect(AIService.asksAboutTypedContent(q, KNOWN), q).toBe(true);
  });
  it('keeps a question about tone, length, or the kind of work', () => {
    for (const q of [
      'What tone should the encouragement have?',
      'How long should each phrase be?',
      'What kind of work will students present?',
      'What tone should students use when adding to a classmate\'s list?'
    ]) expect(AIService.asksAboutTypedContent(q, KNOWN), q).toBe(false);
  });
  it('the page names the prompt, the choices, and the field labels as typed there, and hides See how it reads with nothing answered', () => {
    const make = read('screens/make/make.js');
    expect(make).toContain("'The question (the prompt students see, typed on the page above)'");
    expect(make).toContain("(state.print && state.print.choicesEditable) || choicesChanged() ? ['The answer choices'] : []");
    expect(make).toContain('el.fitFoot.hidden = n === 0 || !!state.panelApi');
    expect(read('services/ai-service.js')).toContain('so NEVER ask what the question, claim, topic, or task should be');
  });
});

describe('the keep-note', () => {
  it('shows once per browser and reads the share line plainly', () => {
    const html = read('screens/make/index.html');
    expect(html).toMatch(/id="keep-note" hidden>/);
    expect(html).toContain('Use the share link to open it on another computer.');
    expect(html).toContain('id="keep-note-ok"');
    expect(read('screens/make/make.js')).toContain("'jamyard.keepNoteSeen'");
  });
});

describe('a talk-only activity on the make page', () => {
  it('prints its first question, read only, with no scales, timer, or audience line', () => {
    const closer = JSON.parse(read('games/closer/config.json'));
    const p = printFor(closer);
    expect(p.type).toBe('announce');
    expect(p.prompt.editable).toBe(false);
    expect(p.prompt.text).toMatch(/\?$/);
    expect(p.scalesEditable).toBe(false);
    expect(p.scales).toEqual([]);
    expect(p.timer).toBeNull();
    expect(p.audience).toBeNull();
    expect(p.talk.length).toBeGreaterThan(0);
  });
  it('leaves a rating activity that is not talk-only alone', () => {
    const critique = JSON.parse(read('games/class-critique/config.json'));
    const p = printFor(critique);
    expect(p.type).toBe('rate');
    expect(p.scalesEditable).toBe(true);
  });
});
