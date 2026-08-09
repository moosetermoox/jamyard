/**
 * TeacherProfile (screens/shared/teacher-profile.js) — the this-browser
 * grade band + subjects profile behind "for your class" prompt picks and
 * the first-visit setup card.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import '../../screens/shared/teacher-profile.js';

const TP = globalThis.TeacherProfile;

beforeEach(() => {
  TP.clear();
});

describe('TeacherProfile', () => {
  it('starts empty: no profile, offer the setup card, empty description', () => {
    expect(TP.get()).toBeNull();
    expect(TP.shouldOffer()).toBe(true);
    expect(TP.describe()).toBe('');
  });

  it('round-trips a saved profile and stops offering the card', () => {
    TP.save({ gradeBand: 'middle', subjects: ['social-studies', 'science'] });
    expect(TP.get()).toEqual({ gradeBand: 'middle', subjects: ['social-studies', 'science'] });
    expect(TP.shouldOffer()).toBe(false);
  });

  it('dismiss hides the card without saving a profile', () => {
    TP.dismiss();
    expect(TP.get()).toBeNull();
    expect(TP.shouldOffer()).toBe(false);
  });

  it('drops unknown grade bands and subjects instead of storing junk', () => {
    TP.save({ gradeBand: 'bogus', subjects: ['social-studies', 'nope'] });
    expect(TP.get()).toEqual({ gradeBand: null, subjects: ['social-studies'] });
  });

  it('an entirely-empty save behaves like a skip', () => {
    TP.save({ gradeBand: null, subjects: [] });
    expect(TP.get()).toBeNull();
    expect(TP.shouldOffer()).toBe(false);
  });

  it('describe reads like a sentence fragment for the Customize request', () => {
    TP.save({ gradeBand: 'middle', subjects: ['social-studies', 'science'] });
    expect(TP.describe()).toBe('Middle school (6-8), Social studies and Science');
    TP.save({ gradeBand: 'high', subjects: [] });
    expect(TP.describe()).toBe('High school (9-12)');
  });

  it('clear removes both the profile and the dismissal', () => {
    TP.save({ gradeBand: 'middle', subjects: [] });
    TP.clear();
    expect(TP.get()).toBeNull();
    expect(TP.shouldOffer()).toBe(true);
  });
});
