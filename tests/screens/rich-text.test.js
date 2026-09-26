/**
 * RichText (screens/shared/rich-text.js) — the markdown-flavored-AI-text
 * parser behind the projector reveal layout. parse() is pure (no DOM);
 * buildBody() is browser-only and screenshot-verified instead.
 */
import { describe, it, expect } from 'vitest';
import '../../screens/shared/rich-text.js';

const RT = globalThis.RichText;

// The real Haiku output for Both Sides of the Rope that triggered this work.
const ROPE = [
  '# HOMEWORK TUG-OF-WAR ROPE',
  '',
  '**TEAM YES (Optional Homework)**',
  '- Students already spend 7 hours in school and need rest',
  '- Homework stress hurts sleep and mental health',
  '',
  '**TEAM NO (Keep Homework Required)**',
  '- Practice at home makes new skills stick',
  '- Some subjects like math need repetition',
  '',
  '**The Rope Strains Hardest Here:**',
  'Does the value outweigh the costs?'
].join('\n');

describe('hasRich', () => {
  it('is false for plain prose, even with line breaks and colons', () => {
    expect(RT.hasRich('Just a message.\n\nWith two paragraphs: nice.')).toBe(false);
  });

  it('is true for hash headings, bold lines, bullets, and inline bold', () => {
    expect(RT.hasRich('# Heading')).toBe(true);
    expect(RT.hasRich('**Section:**')).toBe(true);
    expect(RT.hasRich('- a bullet')).toBe(true);
    expect(RT.hasRich('* a star bullet')).toBe(true);
    expect(RT.hasRich('so **bold** words')).toBe(true);
  });

  it('does not treat math or stray stars as rich', () => {
    expect(RT.hasRich('5 * 3 = 15')).toBe(false);
    expect(RT.hasRich('rated ****')).toBe(false);
  });
});

describe('parse', () => {
  it('structures the real rope output: subheads, bullet groups, closing text', () => {
    const segs = RT.parse(ROPE);
    expect(segs.map(s => s.type)).toEqual([
      'subhead', 'subhead', 'bullets', 'subhead', 'bullets', 'subhead', 'text'
    ]);
    expect(segs[0].text).toBe('HOMEWORK TUG-OF-WAR ROPE');
    expect(segs[1].text).toBe('TEAM YES (Optional Homework)');
    expect(segs[2].items).toHaveLength(2);
    expect(segs[2].items[0][0].text).toBe('Students already spend 7 hours in school and need rest');
    expect(segs[5].text).toBe('The Rope Strains Hardest Here:');
    expect(segs[6].lines[0][0].text).toBe('Does the value outweigh the costs?');
  });

  it('merges bullet lines split by blank lines into one group', () => {
    const segs = RT.parse('- one\n\n- two');
    expect(segs).toHaveLength(1);
    expect(segs[0].items).toHaveLength(2);
  });

  it('treats a short colon line above bullets as a subhead (plain-text AI shape)', () => {
    const segs = RT.parse('TEAM YES:\n- first\n- second');
    expect(segs[0]).toEqual({ type: 'subhead', text: 'TEAM YES:' });
    expect(segs[1].type).toBe('bullets');
  });

  it('leaves a colon sentence alone when no bullets follow', () => {
    const segs = RT.parse('Here is the thing:\nplain words after');
    expect(segs).toHaveLength(1);
    expect(segs[0].type).toBe('text');
  });

  it('treats an ALL-CAPS colon line as a subhead even without bullets after', () => {
    const segs = RT.parse('THE STRONGEST STRAIN:\nA closing thought.');
    expect(segs[0]).toEqual({ type: 'subhead', text: 'THE STRONGEST STRAIN:' });
    expect(segs[1].type).toBe('text');
  });

  it('splits inline bold into runs and leaves unmatched stars literal', () => {
    const runs = RT.inlineRuns('a **b** c ** d');
    expect(runs).toEqual([
      { text: 'a ', bold: false },
      { text: 'b', bold: true },
      { text: ' c ** d', bold: false }
    ]);
  });

  it('keeps plain multi-line text as one text segment with per-line runs', () => {
    const segs = RT.parse('line one\nline two');
    expect(segs).toHaveLength(1);
    expect(segs[0].lines).toHaveLength(2);
  });
});

describe('plainLine', () => {
  it('strips heading and bold markers for headline slots', () => {
    expect(RT.plainLine('# THE ROPE')).toBe('THE ROPE');
    expect(RT.plainLine('**THE ROPE**')).toBe('THE ROPE');
    expect(RT.plainLine('plain already')).toBe('plain already');
  });
});

// The scrub on the AI result path (2026-09-16): the tells the STYLE
// RULES ask the model to avoid, fixed anyway on the way to the wall.
describe('scrub', () => {
  it('turns em and en dashes into commas, keeps a numeric range', () => {
    expect(RT.scrub('Sleep matters — a lot')).toBe('Sleep matters, a lot');
    expect(RT.scrub('Practice—daily—helps')).toBe('Practice, daily, helps');
    expect(RT.scrub('Rest – then work')).toBe('Rest, then work');
    expect(RT.scrub('Grades 3–5 read 10–20 pages')).toBe('Grades 3–5 read 10–20 pages');
  });

  it('drops announcing and summarizing openers and re-opens the sentence', () => {
    expect(RT.scrub("It's worth noting that rest helps. Overall, the class agreed.")).toBe('Rest helps. The class agreed.');
    expect(RT.scrub('In summary, both sides want less stress.')).toBe('Both sides want less stress.');
    expect(RT.scrub("Let's dive in. the first idea is sleep.")).toBe('The first idea is sleep.');
  });

  it('leaves ordinary text alone and a dash-led line clean', () => {
    expect(RT.scrub('Two ideas: rest, and practice.')).toBe('Two ideas: rest, and practice.');
    expect(RT.scrub('Wins:\n— rest\n— practice')).toBe('Wins:\nrest\npractice');
    expect(RT.scrub(null)).toBe('');
  });

  it('parse reads through the scrub', () => {
    const segs = RT.parse('- Sleep — it matters\n- Practice');
    expect(segs[0].type).toBe('bullets');
    expect(segs[0].items[0][0].text).toBe('Sleep, it matters');
  });
});

describe('a yes-or-no vote result (2026-09-26)', () => {
  const RESULT = [
    'What the class passed:',
    '',
    '1. Every state gets two senators. (3 yes, 1 no)',
    '2. No taxes on trade (2 yes, 1 no)',
    '',
    'Did not pass:',
    '',
    'None.',
    '',
    '3 of 4 students voted.'
  ].join('\n');

  it('lays the lines out as tallies, the counts as their own tag, both colon lines as headings', () => {
    expect(RT.hasRich(RESULT)).toBe(true);
    const segs = RT.parse(RESULT);
    expect(segs.map(x => x.type)).toEqual(['subhead', 'tallies', 'subhead', 'text']);
    expect(segs[1].items[0]).toEqual({ num: '1', runs: [{ text: 'Every state gets two senators.', bold: false }], tag: '3 yes, 1 no' });
    expect(segs[1].items[1].tag).toBe('2 yes, 1 no');
    expect(segs[2].text).toBe('Did not pass:');
  });

  it('leaves an ordinary numbered line alone', () => {
    expect(RT.hasRich('1. Bring a pencil (the sharp kind)')).toBe(false);
  });
});
