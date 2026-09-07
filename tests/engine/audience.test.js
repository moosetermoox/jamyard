/**
 * Audience (engine/audience.js): who will see a student's answer, read
 * off the phase graph. The label beside the answer box must match what
 * the activity actually does with the answer, so these run against the
 * real shelf templates as well as small synthetic graphs.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { audienceFor, AUDIENCE, AUDIENCE_LABELS, NEXT_CLASSMATE_HINT } from '../../engine/audience.js';

const load = (id) => JSON.parse(readFileSync(`games/${id}/config.json`, 'utf8'));

describe('audienceFor on shelf templates', () => {
  it("Someone's Got You: the note goes to one classmate; the reply reaches its author, then the wall after review", () => {
    const cfg = load('someones-got-you');
    const notes = audienceFor(cfg, 'notes');
    expect(notes.key).toBe(AUDIENCE.CLASSMATE);
    expect(notes.label).toBe('One classmate will read this.');
    expect(notes.nextHint).toBe(NEXT_CLASSMATE_HINT);
    const boost = audienceFor(cfg, 'boost');
    expect(boost.key).toBe(AUDIENCE.CLASSMATE_THEN_CLASS_AFTER_REVIEW);
    expect(boost.label).toBe('One classmate will read this, then the class sees it after your teacher reviews it.');
    expect(boost.nextHint).toBe(null);
  });

  it('Snowball: the solo idea goes to a partner (merge)', () => {
    expect(audienceFor(load('snowball'), 'solo').key).toBe(AUDIENCE.CLASSMATE);
  });

  it('One More Thing: the recall is handed on, the last addition returns to an author', () => {
    const cfg = load('one-more-thing');
    expect(audienceFor(cfg, 'recall').key).toBe(AUDIENCE.CLASSMATE);
    expect(audienceFor(cfg, 'add-again').key).toBe(AUDIENCE.CLASSMATE);
  });

  it('Draw Gallery: drawings reach the class only after the teacher preview', () => {
    const cfg = load('art-gallery');
    const collectId = Object.keys(cfg.phases).find(id => cfg.phases[id].type === 'collect');
    expect(audienceFor(cfg, collectId).key).toBe(AUDIENCE.CLASS_AFTER_REVIEW);
  });

  it('every shelf collect step gets a label, and every key has one', () => {
    for (const id of ['exit-ticket', 'live-poll', 'speed-quiz', 'both-sides-rope', 'whose-eyes', 'doodle-bluff']) {
      const cfg = load(id);
      for (const [pid, p] of Object.entries(cfg.phases)) {
        if (p.type !== 'collect' && p.type !== 'collect-choice') continue;
        const a = audienceFor(cfg, pid);
        expect(a, `${id}.${pid}`).not.toBe(null);
        expect(AUDIENCE_LABELS[a.key], `${id}.${pid}`).toBeTruthy();
      }
    }
  });
});

describe('audienceFor on synthetic graphs', () => {
  const graph = (extra) => ({
    phases: {
      lobby: { type: 'lobby', next: 'ask' },
      ask: { type: 'collect', prompt: 'Say something', next: 'after' },
      ...extra,
      end: { type: 'end' }
    }
  });

  it('nothing downstream means only the teacher sees it', () => {
    const cfg = graph({ after: { type: 'announce', message: 'Thanks', next: 'end' } });
    expect(audienceFor(cfg, 'ask').key).toBe(AUDIENCE.TEACHER);
  });

  it('an AI summary that reaches the class reads as AI', () => {
    const cfg = graph({
      after: { type: 'ai-process', task: 'summarize', input: 'ask.responses', next: 'show' },
      show: { type: 'reveal', content: 'after.result', next: 'end' }
    });
    expect(audienceFor(cfg, 'ask').key).toBe(AUDIENCE.AI);
  });

  it('a reveal template quoting the pile means the class, a gate before it means after review', () => {
    const plain = graph({ after: { type: 'reveal', template: 'We said:\n{{ask.responses.list}}', next: 'end' } });
    expect(audienceFor(plain, 'ask').key).toBe(AUDIENCE.CLASS);
    const gated = graph({
      after: { type: 'preview', content: 'ask.responses', approveNext: 'show', rejectNext: 'ask' },
      show: { type: 'reveal-one', from: 'ask.responses', next: 'end' }
    });
    expect(audienceFor(gated, 'ask').key).toBe(AUDIENCE.CLASS_AFTER_REVIEW);
  });

  it('a classmate AND the class reads as both, and the anonymous flag rides along', () => {
    const cfg = graph({
      after: { type: 'collect', rotateFrom: 'ask', prompt: 'Reply to “{{ask.assigned}}”', next: 'show' },
      show: { type: 'reveal-one', from: 'ask.responses', next: 'end' }
    });
    cfg.anonymous = true;
    const a = audienceFor(cfg, 'ask');
    expect(a.key).toBe(AUDIENCE.CLASSMATE_THEN_CLASS);
    expect(a.namesHidden).toBe(true);
    expect(a.nextHint).toBe(NEXT_CLASSMATE_HINT);
    // Only a classmate: the rotation with nothing on the projector
    const only = graph({
      after: { type: 'collect', rotateFrom: 'ask', prompt: 'Reply to “{{ask.assigned}}”', next: 'end' }
    });
    expect(audienceFor(only, 'ask').key).toBe(AUDIENCE.CLASSMATE);
  });

  it('a step inside For Each (not a top-level phase) gets no label', () => {
    expect(audienceFor(graph({ after: { type: 'end' } }), 'titles')).toBe(null);
    expect(audienceFor(null, 'ask')).toBe(null);
  });
});
