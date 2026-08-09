/**
 * Prompt banks — the library-first "prompts are the product" data layer.
 * Guards: bank shape, per-prompt attribution (the Along corpus's reuse
 * terms hinge on it), the wellbeing exclusion, and recipe↔deck reference
 * integrity (a renamed deck must fail loudly, not silently empty a picker).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const banksDir = join(root, 'recipes', 'prompt-banks');

const along = JSON.parse(readFileSync(join(banksDir, 'along.json'), 'utf-8'));
const lanyard = JSON.parse(readFileSync(join(banksDir, 'lanyard.json'), 'utf-8'));

function allPrompts(bank) {
  return bank.decks.flatMap(d => d.prompts);
}

describe('prompt bank shape', () => {
  for (const bank of [along, lanyard]) {
    it(`${bank.id}: deck ids unique, prompts have id + text`, () => {
      const deckIds = bank.decks.map(d => d.id);
      expect(new Set(deckIds).size).toBe(deckIds.length);
      for (const deck of bank.decks) {
        expect(deck.label).toBeTruthy();
        expect(deck.prompts.length).toBeGreaterThan(0);
        for (const p of deck.prompts) {
          expect(p.id).toBeTruthy();
          expect(typeof p.text).toBe('string');
          expect(p.text.length).toBeGreaterThan(3);
          if (p.choices) {
            expect(Array.isArray(p.choices)).toBe(true);
            expect(p.choices.length).toBeGreaterThanOrEqual(2);
            for (const c of p.choices) expect(typeof c).toBe('string');
          }
        }
      }
      const ids = allPrompts(bank).map(p => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  }
});

describe('the Along corpus', () => {
  it('carries per-prompt attribution on every single prompt', () => {
    for (const p of allPrompts(along)) {
      expect(p.author, `prompt ${p.id} lost its attribution`).toBeTruthy();
    }
  });

  it('ingested 142 prompts (151 minus the 9 deferred wellbeing questions)', () => {
    expect(allPrompts(along).length).toBe(142);
  });

  it('holds the wellbeing exclusion until the visibility design exists', () => {
    expect(along.excluded_note).toContain('Wellbeing');
    for (const deck of along.decks) {
      expect(deck.label.toLowerCase()).not.toContain('wellbeing');
    }
  });
});

describe('subject decks (the "for your class" layer)', () => {
  // The deck metadata and the TeacherProfile pickers must speak the same
  // ids, or personalization silently matches nothing.
  it('subjects/gradeBands metadata uses ids TeacherProfile knows', async () => {
    await import('../../screens/shared/teacher-profile.js');
    const TP = globalThis.TeacherProfile;
    const knownSubjects = TP.SUBJECTS.map(s => s.id);
    const knownBands = TP.GRADE_BANDS.map(g => g.id);
    for (const bank of [along, lanyard]) {
      for (const deck of bank.decks) {
        for (const s of deck.subjects || []) {
          expect(knownSubjects, `${bank.id}/${deck.id}: unknown subject "${s}"`).toContain(s);
        }
        for (const g of deck.gradeBands || []) {
          expect(knownBands, `${bank.id}/${deck.id}: unknown grade band "${g}"`).toContain(g);
        }
      }
    }
  });

  it('the lanyard bank covers the core subjects', () => {
    const tagged = lanyard.decks.filter(d => Array.isArray(d.subjects));
    const covered = new Set(tagged.flatMap(d => d.subjects));
    for (const s of ['social-studies', 'english', 'science']) {
      expect(covered.has(s), `no deck tagged for ${s}`).toBe(true);
    }
  });
});

describe('recipe promptDeck references resolve', () => {
  const banks = { along, lanyard };
  const recipesDir = join(root, 'recipes');
  const recipeFiles = readdirSync(recipesDir).filter(f => f.endsWith('.json'));

  it('every promptDeck param points at a real bank and real decks', () => {
    let wired = 0;
    for (const file of recipeFiles) {
      const recipe = JSON.parse(readFileSync(join(recipesDir, file), 'utf-8'));
      for (const [name, spec] of Object.entries(recipe.parameters || {})) {
        if (spec.type !== 'promptDeck') continue;
        wired++;
        expect(banks[spec.bank], `${file}#${name}: unknown bank "${spec.bank}"`).toBeTruthy();
        const deckIds = new Set(banks[spec.bank].decks.map(d => d.id));
        for (const d of spec.decks) {
          expect(deckIds.has(d), `${file}#${name}: deck "${d}" not in bank "${spec.bank}"`).toBe(true);
        }
        // A deck param still needs a plain-string default so zero-prep
        // hosting and the loader's compatibility compile keep working.
        expect(typeof spec.default).toBe('string');
        if (spec.choicesParam) {
          expect(recipe.parameters[spec.choicesParam],
            `${file}#${name}: choicesParam "${spec.choicesParam}" is not a declared param`).toBeTruthy();
        }
      }
    }
    expect(wired).toBeGreaterThanOrEqual(5);
  });
});
