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
    expect(TP.get()).toEqual({ gradeBand: 'middle', subjects: ['social-studies', 'science'], otherText: '', languageText: '' });
    expect(TP.shouldOffer()).toBe(false);
  });

  it('dismiss hides the card without saving a profile', () => {
    TP.dismiss();
    expect(TP.get()).toBeNull();
    expect(TP.shouldOffer()).toBe(false);
  });

  it('drops unknown grade bands and subjects instead of storing junk', () => {
    TP.save({ gradeBand: 'bogus', subjects: ['social-studies', 'nope'] });
    expect(TP.get()).toEqual({ gradeBand: null, subjects: ['social-studies'], otherText: '', languageText: '' });
  });

  it('keeps the typed "something else" subject alongside the other chip', () => {
    TP.save({ gradeBand: 'middle', subjects: ['other'], otherText: '  Culinary arts  ', languageText: '' });
    expect(TP.get()).toEqual({ gradeBand: 'middle', subjects: ['other'], otherText: 'Culinary arts', languageText: '' });
  });

  it('drops stale otherText when "other" is no longer among the subjects', () => {
    TP.save({ gradeBand: 'middle', subjects: ['science'], otherText: 'Culinary arts', languageText: '' });
    expect(TP.get().otherText).toBe('');
  });

  it('caps otherText at 60 characters', () => {
    TP.save({ gradeBand: null, subjects: ['other'], otherText: 'x'.repeat(200) });
    expect(TP.get().otherText).toHaveLength(60);
  });

  it('describe speaks the typed subject instead of "Something else"', () => {
    TP.save({ gradeBand: 'high', subjects: ['science', 'other'], otherText: 'Robotics', languageText: '' });
    expect(TP.describe()).toBe('High school (9-12), Science and Robotics');
  });

  it('describe falls back to the chip label when nothing was typed', () => {
    TP.save({ gradeBand: null, subjects: ['other'] });
    expect(TP.describe()).toBe('Something else');
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
