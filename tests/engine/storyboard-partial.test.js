/**
 * The Create page streams the storyboard reply and shows each step as it
 * lands (2026-09-20). This reader must report only whole steps, never
 * throw on a half-written reply, and tolerate the fences and preamble
 * the model sometimes wraps its JSON in.
 */

import { describe, it, expect } from 'vitest';
import { completeSteps, partialName, isCantBuild } from '../../engine/storyboard-partial.js';

const full = JSON.stringify({
  name: 'Exit Check',
  description: 'One thing learned, one still open.',
  steps: [
    { brick: 'announce', text: 'Before you go, two quick things.' },
    { brick: 'collect', text: 'What is one thing you learned today? Use the word "because".', timer: 60 },
    { brick: 'collect-choice', text: 'How sure are you?', choices: ['Very', 'Somewhat', 'Not yet'] },
    { brick: 'quiz', questions: [{ text: 'What is 2 + 2?', choices: ['3', '4'], correct: '4' }] },
    { brick: 'end', text: 'Thanks, see you tomorrow {not a slot}.' }
  ]
});

describe('completeSteps', () => {
  it('reports nothing before the steps array opens', () => {
    expect(completeSteps('')).toEqual([]);
    expect(completeSteps('{"name": "Exit Check", "description": "x", "st')).toEqual([]);
    expect(completeSteps('{"name": "Exit Check", "steps": [')).toEqual([]);
    expect(completeSteps(undefined)).toEqual([]);
  });

  it('reports every step whose closing brace has arrived, and only those', () => {
    const cut = full.indexOf('"collect-choice"') + 5; // mid second... third step
    const steps = completeSteps(full.slice(0, cut));
    expect(steps.map(s => s.brick)).toEqual(['announce', 'collect']);
  });

  it('grows one step at a time as text arrives, never repeating or skipping', () => {
    let seen = 0;
    for (let i = 0; i <= full.length; i++) {
      const n = completeSteps(full.slice(0, i)).length;
      expect(n === seen || n === seen + 1).toBe(true);
      seen = n;
    }
    expect(seen).toBe(5);
  });

  it('is not fooled by braces, brackets, or escaped quotes inside strings', () => {
    const steps = completeSteps(full);
    expect(steps[1].text).toContain('"because"');
    expect(steps[4].text).toContain('{not a slot}');
    expect(steps).toHaveLength(5);
  });

  it('keeps nested objects and arrays (quiz questions) inside one step', () => {
    const steps = completeSteps(full);
    expect(steps[3].questions).toHaveLength(1);
    expect(steps[3].questions[0].correct).toBe('4');
  });

  it('reads through a ```json fence and a preamble sentence', () => {
    const wrapped = 'Here is the plan:\n```json\n' + full + '\n```';
    expect(completeSteps(wrapped)).toHaveLength(5);
  });

  it('stops at the end of the array and ignores anything after it', () => {
    const steps = completeSteps(full + '{"brick": "vote"}');
    expect(steps).toHaveLength(5);
  });

  it('returns what it has when a step will not parse', () => {
    const broken = '{"steps": [{"brick": "announce", "text": "hi"}, {"brick": "collect" "text": "x"}]}';
    expect(completeSteps(broken).map(s => s.brick)).toEqual(['announce']);
  });

  it('reports no steps for an honest refusal', () => {
    expect(completeSteps('{"cantBuild": true, "reason": "I cannot pair students yet."}')).toEqual([]);
  });
});

describe('partialName', () => {
  it('is null until the closing quote arrives', () => {
    expect(partialName('{"name": "Exit Ch')).toBeNull();
    expect(partialName('')).toBeNull();
  });

  it('reads the name once whole, unescaping it', () => {
    expect(partialName('{"name": "Exit Check", "desc')).toBe('Exit Check');
    expect(partialName('{"name": "Say \\"hi\\"", "steps": []}')).toBe('Say "hi"');
  });
});

describe('isCantBuild', () => {
  it('flags the refusal shape and nothing else', () => {
    expect(isCantBuild('{"cantBuild": true, "reason": "no"}')).toBe(true);
    expect(isCantBuild('{"cantBuild":true')).toBe(true);
    expect(isCantBuild(full)).toBe(false);
    expect(isCantBuild('{"cantBuild": false}')).toBe(false);
  });
});
