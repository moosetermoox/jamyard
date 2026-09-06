/**
 * word-help.js — the token ledger behind "tap a word to translate it".
 *
 * Two systems meet here: a per-student budget of spends (generic: any
 * rationed help can draw on it) and the translation lookup that is its
 * first customer. The ledger is server-authoritative and never trusts a
 * client count.
 */
import { describe, it, expect } from 'vitest';
import {
  createWordHelpState, normalizeWord, remaining, spend, refund,
  recordLookup, summarize, cachedTranslation, cacheTranslation,
  publicSettings, validateWordHelp, WORD_HELP_MAX_TOKENS
} from '../../engine/word-help.js';

const CONFIG = { name: 'X', wordHelp: { tokens: 3, to: 'en' }, phases: {} };

describe('normalizeWord', () => {
  it('trims punctuation and keeps the word as typed, with a lowercase key', () => {
    expect(normalizeWord('"Escuela,"')).toEqual({ word: 'Escuela', key: 'escuela' });
    expect(normalizeWord('¿Cómo?')).toEqual({ word: 'Cómo', key: 'cómo' });
  });

  it('keeps inner apostrophes and hyphens', () => {
    expect(normalizeWord("l'école")).toEqual({ word: "l'école", key: "l'école" });
    expect(normalizeWord('bien-être')).toEqual({ word: 'bien-être', key: 'bien-être' });
  });

  it('rejects numbers, symbols, multi-word and over-long input', () => {
    expect(normalizeWord('123')).toBeNull();
    expect(normalizeWord('two words')).toBeNull();
    expect(normalizeWord('')).toBeNull();
    expect(normalizeWord('a'.repeat(41))).toBeNull();
    expect(normalizeWord(null)).toBeNull();
    expect(normalizeWord('$$$')).toBeNull();
  });
});

describe('createWordHelpState', () => {
  it('is null when the activity has no word help', () => {
    expect(createWordHelpState({ name: 'X', phases: {} }, 'es')).toBeNull();
  });

  it('reads the budget and target from the config, source from the activity language', () => {
    const s = createWordHelpState(CONFIG, 'es');
    expect(s.tokens).toBe(3);
    expect(s.to).toBe('en');
    expect(s.from).toBe('es');
  });

  it('defaults the target to English', () => {
    const s = createWordHelpState({ name: 'X', wordHelp: { tokens: 2 }, phases: {} }, 'fr');
    expect(s.to).toBe('en');
  });
});

describe('the ledger', () => {
  it('starts every student at the full budget and counts spends down', () => {
    const s = createWordHelpState(CONFIG, 'es');
    expect(remaining(s, 'p1')).toBe(3);
    expect(spend(s, 'p1')).toEqual({ ok: true, left: 2 });
    expect(spend(s, 'p1')).toEqual({ ok: true, left: 1 });
    expect(remaining(s, 'p1')).toBe(1);
    expect(remaining(s, 'p2')).toBe(3); // separate purse
  });

  it('refuses a spend at zero and stays at zero', () => {
    const s = createWordHelpState({ name: 'X', wordHelp: { tokens: 1 }, phases: {} }, 'es');
    expect(spend(s, 'p1')).toEqual({ ok: true, left: 0 });
    expect(spend(s, 'p1')).toEqual({ ok: false, left: 0 });
    expect(remaining(s, 'p1')).toBe(0);
  });

  it('refunds a failed lookup, never above the budget', () => {
    const s = createWordHelpState(CONFIG, 'es');
    spend(s, 'p1');
    expect(refund(s, 'p1')).toBe(3);
    expect(refund(s, 'p1')).toBe(3);
  });

  it('keys spends by player id (so id migration on reconnect carries them)', () => {
    const s = createWordHelpState(CONFIG, 'es');
    spend(s, 'old-id');
    expect(Object.keys(s.spent)).toEqual(['old-id']);
  });
});

describe('the lookup log and cache', () => {
  it('counts each word once per lookup, keyed case-insensitively', () => {
    const s = createWordHelpState(CONFIG, 'es');
    recordLookup(s, normalizeWord('Escuela'));
    recordLookup(s, normalizeWord('escuela'));
    recordLookup(s, normalizeWord('libro'));
    expect(summarize(s)).toEqual([{ word: 'Escuela', count: 2 }, { word: 'libro', count: 1 }]);
  });

  it('caches a translation so the second student costs no AI call', () => {
    const s = createWordHelpState(CONFIG, 'es');
    expect(cachedTranslation(s, 'escuela')).toBeUndefined();
    cacheTranslation(s, 'escuela', 'school');
    expect(cachedTranslation(s, 'escuela')).toBe('school');
  });

  it('publishes only what the student screen needs', () => {
    const s = createWordHelpState(CONFIG, 'es');
    spend(s, 'p1');
    expect(publicSettings(s, 'p1')).toEqual({ tokens: 3, left: 2, from: 'es', to: 'en' });
  });
});

describe('validateWordHelp', () => {
  it('accepts a whole-number budget within the cap and a known target language', () => {
    expect(validateWordHelp({ wordHelp: { tokens: 5, to: 'fr' } }, 'g')).toEqual([]);
    expect(validateWordHelp({ wordHelp: { tokens: WORD_HELP_MAX_TOKENS } }, 'g')).toEqual([]);
    expect(validateWordHelp({}, 'g')).toEqual([]);
  });

  it('names the problem for every bad shape', () => {
    expect(validateWordHelp({ wordHelp: true }, 'g')[0]).toMatch(/"wordHelp" must be an object/);
    expect(validateWordHelp({ wordHelp: { tokens: 0 } }, 'g')[0]).toMatch(/tokens/);
    expect(validateWordHelp({ wordHelp: { tokens: 2.5 } }, 'g')[0]).toMatch(/tokens/);
    expect(validateWordHelp({ wordHelp: { tokens: WORD_HELP_MAX_TOKENS + 1 } }, 'g')[0]).toMatch(/tokens/);
    expect(validateWordHelp({ wordHelp: { tokens: 3, to: 'xx' } }, 'g')[0]).toMatch(/wordHelp\.to/);
  });
});
