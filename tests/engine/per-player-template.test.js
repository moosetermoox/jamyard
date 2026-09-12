/**
 * {{X.assigned}} and {{X.mine}} are the two per-recipient tokens. When a
 * student has nothing behind one (the source step closed with nobody
 * answering, or they skipped it themselves), the prompt used to reach
 * them with the raw token in it: "look through the eyes of:
 * {{viewpoints.assigned}}" (outside review, 2026-09-12). Now it reads a
 * plain line in the activity's language instead.
 */

import { describe, it, expect } from 'vitest';
import { resolvePerPlayerTemplate, MISSING_ASSIGNED, MISSING_MINE } from '../../engine/per-player-template.js';

function fakeEngine(phaseData, language) {
  return {
    language: language || 'en',
    phaseData,
    resolve: (ref) => (ref === 'topic.result' ? 'homework' : undefined)
  };
}

describe('resolvePerPlayerTemplate', () => {
  it('fills assigned and mine per recipient', () => {
    const engine = fakeEngine({ v: { assigned: { p1: 'a parent' }, byPlayer: { p1: 'the dog' } } });
    expect(resolvePerPlayerTemplate('Eyes of {{v.assigned}}; you wrote {{v.mine}}', engine, 'p1'))
      .toBe('Eyes of a parent; you wrote the dog');
  });

  it('never sends a raw token: a missing assignment reads as a plain line', () => {
    const engine = fakeEngine({ v: { assigned: {}, byPlayer: {} } });
    const out = resolvePerPlayerTemplate('Eyes of:\n\n{{v.assigned}}\n\nStep inside.', engine, 'p9');
    expect(out).not.toContain('{{');
    expect(out).toContain(MISSING_ASSIGNED);
  });

  it('a student who skipped the source step gets a plain line for mine', () => {
    const engine = fakeEngine({ v: { assigned: {}, byPlayer: { p1: 'x' } } });
    const out = resolvePerPlayerTemplate('You wrote: {{v.mine}}', engine, 'p2');
    expect(out).toBe('You wrote: ' + MISSING_MINE);
  });

  it('the source step not having run at all counts as missing too', () => {
    const engine = fakeEngine({});
    expect(resolvePerPlayerTemplate('{{v.assigned}}', engine, 'p1')).toBe(MISSING_ASSIGNED);
  });

  it('speaks the activity language', () => {
    const engine = fakeEngine({ v: { assigned: {} } }, 'es');
    const out = resolvePerPlayerTemplate('{{v.assigned}}', engine, 'p1');
    expect(out).not.toBe(MISSING_ASSIGNED);
    expect(out).not.toContain('{{');
  });

  it('other refs still resolve through the engine, and unknown ones stay put', () => {
    const engine = fakeEngine({});
    expect(resolvePerPlayerTemplate('{{topic.result}} / {{nope.result}}', engine, 'p1'))
      .toBe('homework / {{nope.result}}');
  });

  it('empty template is an empty string', () => {
    expect(resolvePerPlayerTemplate('', fakeEngine({}), 'p1')).toBe('');
    expect(resolvePerPlayerTemplate(null, fakeEngine({}), 'p1')).toBe('');
  });
});
