/**
 * The owner's three asks on the make page (2026-09-26): Vocab Match's
 * pairs can be written by the AI but stay typed by hand; Closer's
 * questions and how many per tier are editable; each tier says who it
 * pairs you with.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { talkStepsFor, applyEdits, printFor } from '../../engine/make-print.js';
import { validate } from '../../engine/game-loader.js';
import { AIService } from '../../services/ai-service.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const closer = () => JSON.parse(read('games/closer/config.json'));

describe('the talk tiers with their steps', () => {
  it('reads Closer as three tiers, with a new partner from the second on', () => {
    const t = talkStepsFor(closer());
    expect(t.map(x => x.questions.length)).toEqual([3, 3, 3]);
    expect(t.map(x => x.newPartner)).toEqual([false, true, true]);
    expect(t[0].questions[0].id).toBe('t1q1');
    expect(t[0].questions[0].tail).toMatch(/goes first/);
    expect(t[2].after).toBe('checkout');
    expect(printFor(closer()).talkSteps.length).toBe(3);
  });

  it('retypes a question and keeps its who-goes-first line', () => {
    const out = applyEdits(closer(), { talk: [{ questions: ['Cats or dogs, and why?', 'Q2?', 'Q3?'] }] });
    const cfg = out.config || out;
    expect(cfg.phases.t1q1.message).toMatch(/^Cats or dogs, and why\?\n\nWhoever woke up earlier/);
    expect(cfg.phases.t1q2.message).toMatch(/^Q2\?\n\n/);
    expect(validate(cfg, 'closer-edit', { returnResults: true }).errors).toEqual([]);
  });

  it('adds and drops questions in a tier and keeps the chain whole', () => {
    const out = applyEdits(closer(), { talk: [
      { questions: ['A?', 'B?', 'C?', 'D?'] },
      { questions: ['Only one?'] },
      { questions: ['X?', 'Y?', 'Z?'] }
    ] });
    const cfg = out.config || out;
    const ph = cfg.phases;
    const walk = []; let id = 'welcome';
    while (id && ph[id] && walk.length < 40) { walk.push(id); id = ph[id].next; }
    expect(walk.join(' ')).toBe('welcome tier1-intro t1q1 t1q2 t1q3 tier1-q4 tier2-intro t2q1 tier3-intro t3q1 t3q2 t3q3 checkout end');
    expect(ph.t2q2).toBeUndefined();
    expect(ph['tier1-q4'].message).toMatch(/^D\?\n\nDecide together who goes first/);
    expect(validate(cfg, 'closer-edit', { returnResults: true }).errors).toEqual([]);
  });

  it('never empties a tier and ignores a tier with no words', () => {
    const before = JSON.stringify(closer().phases);
    const out = applyEdits(closer(), { talk: [{ questions: [] }, { questions: ['', '  '] }] });
    const cfg = out.config || out;
    expect(JSON.stringify(cfg.phases)).toBe(before);
  });
});

describe('the pairs writer', () => {
  it('writes pairs in mock mode and the route exists', async () => {
    const ai = new AIService({});
    const out = await ai.generatePairs({ topic: 'cells', count: 5 });
    expect(out.pairs.length).toBe(5);
    expect(out.pairs[0]).toHaveProperty('left');
    expect(out.pairs[0]).toHaveProperty('right');
    expect(read('server.js')).toContain("app.post('/api/games/pair-list'");
  });
});

describe('the page', () => {
  it('edits the tiers, sends them as talk, and offers the pairs writer', () => {
    const make = read('screens/make/make.js');
    expect(make).toContain('function talkValue()');
    expect(make).toContain('if (talk) edits.talk = talk;');
    expect(make).toContain("chip.textContent = info && info.newPartner ? 'new partner'");
    expect(make).toContain("fetch('/api/games/pair-list'");
    expect(make).toContain("'Want the pairs written for you? Give a topic:'");
    expect(read('screens/make/index.html')).toContain('<details class="fold" open>');
    const server = read('server.js');
    expect(server).toContain('if (Array.isArray(body.talk)) {');
  });
});

describe('Your class on the make page (owner 2026-09-26)', () => {
  const make = read('screens/make/make.js');
  it('swaps in the class example when the words are untouched, and says so when it cannot', () => {
    expect(make).toContain('function applyClassExample()');
    expect(make).toContain('ClassExamples.pick(gameId, profile, 0)');
    expect(make).toContain("state.classNote = 'You changed the words above, so they stay.");
    expect(make).toContain("'No ready example for this class yet.");
    expect(make).toContain("onChange: function () { applyClassExample(); buildRows(); scheduleQuestions(); }");
    expect(make).toContain('state.wordsSnapshot = wordsNow();');
  });
  it('asks no fit question on a talk-only activity, and the pairs sit above the fit rows', () => {
    expect(make).toContain('!!(state.print && Array.isArray(state.print.talkSteps) && state.print.talkSteps.length)');
    const html = read('screens/make/index.html');
    expect(html.indexOf('id="pairs-section"')).toBeLessThan(html.indexOf('id="fit-section"'));
    expect(html).toContain('On their screens the meanings come shuffled');
  });
});

describe('the Closer question library (owner 2026-09-26)', () => {
  it('the bank carries named sets, original and clean, beside its tiers', () => {
    const bank = JSON.parse(read('recipes/prompt-banks/closer.json'));
    expect(bank.sets.map(s => s.id)).toEqual(['would-you-rather', 'hypotheticals']);
    for (const set of bank.sets) {
      expect(set.questions.length).toBeGreaterThanOrEqual(15);
      for (const q of set.questions) {
        expect(q).toMatch(/\?$/);
        expect(q).not.toContain('—');
        expect(q.length).toBeLessThan(160);
      }
      expect(new Set(set.questions).size).toBe(set.questions.length);
    }
    expect(bank.tier1.length).toBeGreaterThanOrEqual(28);
  });
  it('the page shows the library as one row over the tiers: tap a set and every tier fills from it', () => {
    const make = read('screens/make/make.js');
    expect(make).toContain("setsLabel.textContent = 'Questions from:';");
    expect(make).toContain("classic.textContent = 'Original';");
    expect(make).toContain('function fillTiersFrom(set)');
    expect(make).toContain("get('closer'), get('along')");
    expect(make).toContain("['fun-favorites', 'imagine-if', 'conversation-starters', 'belonging', 'gratitude']");
    expect(make).toContain('credit: along.attribution ||');
    expect(make).not.toContain('Pick from the library');
    expect(read('screens/make/index.html')).not.toContain('Tap a set and every tier fills from it');
    expect(make).toContain("'fun-favorites': 'Favorites'");
    expect(make).not.toContain("label: 'Along: '");
    expect(make).toContain('if (classUseful) fixedHolder.appendChild(classRow);');
  });
});
