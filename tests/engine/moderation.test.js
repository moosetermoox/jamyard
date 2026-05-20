/**
 * Host moderation helpers (engine/moderation.js).
 */

import { describe, it, expect } from 'vitest';
import {
  responseToText,
  hasSubmitted,
  isVisibleSubmission,
  buildSubmissionList
} from '../../engine/moderation.js';

describe('responseToText', () => {
  it('passes through a string', () => {
    expect(responseToText('hello')).toBe('hello');
  });

  it('joins multi-field object values', () => {
    expect(responseToText({ a: 'cats', b: 'dogs' })).toBe('cats | dogs');
  });

  it('handles null/undefined', () => {
    expect(responseToText(null)).toBe('');
    expect(responseToText(undefined)).toBe('');
  });
});

describe('hasSubmitted', () => {
  it('true when a response is present', () => {
    expect(hasSubmitted({ response: 'hi' })).toBe(true);
    expect(hasSubmitted({ response: { a: 'x' } })).toBe(true);
  });

  it('false for empty / missing', () => {
    expect(hasSubmitted({ response: '' })).toBe(false);
    expect(hasSubmitted({ response: null })).toBe(false);
    expect(hasSubmitted({})).toBe(false);
  });
});

describe('isVisibleSubmission', () => {
  it('true when submitted and not hidden', () => {
    expect(isVisibleSubmission({ response: 'hi' })).toBe(true);
  });

  it('false when hidden by host', () => {
    expect(isVisibleSubmission({ response: 'hi', responseHidden: true })).toBe(false);
  });

  it('false when nothing submitted', () => {
    expect(isVisibleSubmission({ responseHidden: false })).toBe(false);
  });
});

describe('buildSubmissionList', () => {
  it('returns one row per submitter with hidden flag', () => {
    const players = [
      { id: 'p1', name: 'Alex', response: 'soccer' },
      { id: 'p2', name: 'Sam', response: 'bad', responseHidden: true },
      { id: 'p3', name: 'Jo' }, // no submission
      { id: 'p4', name: 'Pat', response: { food: 'pizza', drink: 'cola' } }
    ];
    const list = buildSubmissionList(players);
    expect(list).toEqual([
      { playerId: 'p1', name: 'Alex', text: 'soccer', hidden: false },
      { playerId: 'p2', name: 'Sam', text: 'bad', hidden: true },
      { playerId: 'p4', name: 'Pat', text: 'pizza | cola', hidden: false }
    ]);
  });

  it('returns empty list when nobody has submitted', () => {
    expect(buildSubmissionList([{ id: 'p1', name: 'Alex' }])).toEqual([]);
  });
});
