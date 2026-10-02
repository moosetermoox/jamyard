/**
 * The owner's review of Part 3, 2026-10-01: peer feedback in labelled
 * boxes (two stars and a wish), a classmate's words on a paper card in a
 * book face, and the leaderboard as bars. (The confidence dial and its
 * report column are in tests/engine/confidence.test.js.)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import '../../screens/shared/step-suggestions.js';
import '../../screens/shared/rich-text.js';
import { validate } from '../../engine/game-loader.js';
import { validateSuggestions } from '../../engine/suggest-validate.js';
import { buildChainViews, formatChainContent } from '../../engine/phases/chain-reveal.js';

const S = globalThis.StepSuggestions;
const R = globalThis.RichText;
const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

describe('peer feedback in labelled boxes', () => {
  const compile = (extra) => S.compileStoryboard({ name: 'F', steps: [
    Object.assign({ brick: 'feedback', draft: 'Write your conclusion.', text: 'Two stars and a wish for the writer.', readers: 2 }, extra || {}),
    { brick: 'end', text: 'Bye' }
  ] });

  it('every reader gets one box per label, stored with its label', () => {
    const { config, problems } = compile({ boxes: ['Star 1', 'Star 2', 'Wish'] });
    expect(problems).toEqual([]);
    const readers = Object.values(config.phases).filter(p => p.type === 'collect' && p.rotateFrom);
    expect(readers).toHaveLength(2);
    for (const r of readers) {
      expect(r.fields).toEqual([{ label: 'Star 1', key: 'box1' }, { label: 'Star 2', key: 'box2' }, { label: 'Wish', key: 'box3' }]);
      expect(r.labelAnswers).toBe(true);
    }
    expect(validate({ name: 'F', description: 'f', phases: config.phases }, 'f1', { returnResults: true }).errors).toEqual([]);
  });

  it('without boxes, one open box as before; one label is not a box set', () => {
    for (const extra of [{}, { boxes: ['Only one'] }]) {
      const readers = Object.values(compile(extra).config.phases).filter(p => p.type === 'collect' && p.rotateFrom);
      expect(readers.every(r => !r.fields && !r.labelAnswers)).toBe(true);
    }
  });

  it('the return puts every piece on its own card', () => {
    const reveal = Object.values(compile({ boxes: ['Star 1', 'Star 2', 'Wish'] }).config.phases).find(p => p.scope === 'own');
    expect(reveal.chainQuoted).toBe(true);
    const views = buildChainViews([
      { byPlayer: { a: 'My draft.' }, assignedFrom: { b: 'a' } },
      { byPlayer: { b: '**Star 1:** Clear.\n**Star 2:** Data.\n**Wish:** Units.' }, assignedFrom: {} }
    ]);
    const text = formatChainContent(views.get('a'), { display: 'steps', heading: 'You wrote:', grewHeading: 'What a classmate said:', quoted: true });
    expect(text).toBe('You wrote:\n\n“My draft.”\n\nWhat a classmate said:\n\n“**Star 1:** Clear.\n**Star 2:** Data.\n**Wish:** Units.”');
  });

  it('the close stores a labelled line per box; the validator, prompts, and plan dialog know boxes', () => {
    expect(read('server.js')).toMatch(/if \(collectPhase\.labelAnswers === true && Array\.isArray\(collectPhase\.fields\)\)/);
    const { suggestions } = validateSuggestions([{ kind: 'storyboard', storyboard: { name: 'X', steps: [
      { brick: 'feedback', draft: 'W', text: 'T', boxes: ['Star 1', 'Star 2', 'Wish', 'Extra', 'Too many'] }, { brick: 'end', text: 'Bye' }
    ] } }], { gameIds: [], recipes: {} });
    expect(suggestions[0].storyboard.steps[0].boxes).toEqual(['Star 1', 'Star 2', 'Wish', 'Extra']);
    expect(read('services/ai-service.js')).toMatch(/two stars and a wish = \["Star 1", "Star 2", "Wish"\]/);
  });
});

describe('a classmate\'s words on a paper card', () => {
  it('a paragraph in curly quotes is a card, the rest stays text', () => {
    expect(R.quoteBlocks('Read this.\n\n“The plant grew.”')).toEqual([
      { quote: false, text: 'Read this.' }, { quote: true, text: 'The plant grew.' }
    ]);
  });

  it('a quote with paragraphs of its own stays one card; an unclosed one is text', () => {
    expect(R.quoteBlocks('“First part.\n\nSecond part.”')).toEqual([{ quote: true, text: 'First part.\n\nSecond part.' }]);
    expect(R.hasQuoteCard('“Never closed.\n\nStill going.')).toBe(false);
    expect(R.hasQuoteCard('He said “hi” in the middle.')).toBe(false);
  });

  it('prompts and the student screen draw it, both screens style it in a book face', () => {
    expect(read('screens/shared/rich-text.js')).toMatch(/if \(hasQuoteCard\(text\)\) \{\s+quotedInto\(el, text, 'prompt-bold'\);/);
    expect(read('screens/player/player.js')).toMatch(/RichText\.hasQuoteCard\(text\)\) \{\s+return RichText\.buildQuoted\(text, 'msg-body'\);/);
    for (const f of ['screens/player/styles.css', 'screens/host/styles.css']) {
      expect(read(f)).toMatch(/\.quote-card \{[\s\S]*font-family: Georgia, 'Noto Serif', Tinos, 'Times New Roman', serif;/);
    }
  });
});

describe('the leaderboard as bars', () => {
  it('every standing is a row with a bar against the top score', () => {
    const host = read('screens/host/host.js');
    expect(host).toMatch(/function standingRow\(rank, name, score, max\)/);
    expect(host).toMatch(/const p = standingRow\(s\.rank, s\.name, s\.score, max\);/);
    expect(host).toMatch(/const p = standingRow\(t\.rank, t\.team, t\.score, teamMax\);/);
    expect(read('screens/host/styles.css')).toMatch(/\.standings p\.standing-row \{\s+display: grid;/);
  });
});
