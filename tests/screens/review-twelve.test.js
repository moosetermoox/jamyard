/**
 * A twelfth outside review (2026-09-27): the match card reads as words,
 * the talk note only on talk, link previews and a tab icon, the example
 * note names what changed, bigger rating results, a wrong code says
 * where the code is, the Create page's box stacks on a phone, the join
 * page has the wordmark, Next step on a message that is already up, the
 * mic is a mic, no Nunito, the feedback button off the add-student slot.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildActivityMap } from '../../engine/activity-map.js';
import { continueLabelForPhase } from '../../engine/phases/continue-labels.js';
import { STRINGS, LANGUAGE_CODES } from '../../engine/i18n/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

describe('the match card reads as words', () => {
  const js = read('screens/designer/designer.js');
  it('a quiz question is its words, choices, and answer; a switch is On or Off', () => {
    expect(js).toContain('function readableParamItem(item)');
    expect(js).toContain("if (v === true) return 'On';");
    expect(js).toContain("if (v === false) return 'Off';");
    expect(js).toContain("parts.push('Answer: ' + item.correct)");
    expect(js).not.toContain('item.text || JSON.stringify(item)');
  });
});

describe('the talk note', () => {
  function plan(extra) {
    const phases = { lobby: { type: 'lobby', next: 'a1' } };
    for (let i = 1; i <= 5; i++) phases['a' + i] = { type: 'announce', message: 'Question ' + i, next: i < 5 ? 'a' + (i + 1) : 'tail' };
    return { phases: Object.assign(phases, extra) };
  }
  it('stays on Closer: talk with one closing rating', () => {
    const cfg = plan({ tail: { type: 'rate', prompt: 'How did that feel?', scales: [{ id: 's', label: 'S', min: 1, max: 5 }], next: 'done' }, done: { type: 'end' } });
    expect(buildActivityMap(cfg).talk).toBe(true);
  });
  it('goes on a quiz: a question the class taps after every card (a reviewer saw "nothing to type" on a quiz plan)', () => {
    const phases = { lobby: { type: 'lobby', next: 'q1' } };
    for (let i = 1; i <= 4; i++) {
      phases['q' + i] = { type: 'collect-choice', prompt: 'Q' + i, choices: ['a', 'b'], correctAnswer: 'a', next: 'r' + i };
      phases['r' + i] = { type: 'announce', message: 'The answer was a', next: i < 4 ? 'q' + (i + 1) : 'done' };
    }
    phases.done = { type: 'end' };
    expect(buildActivityMap({ phases }).talk).toBeUndefined();
  });
  it('goes on rounds of taps inside a For Each', () => {
    const phases = {
      lobby: { type: 'lobby', next: 'i1' },
      i1: { type: 'announce', message: 'One', next: 'i2' },
      i2: { type: 'announce', message: 'Two', next: 'i3' },
      i3: { type: 'announce', message: 'Three', next: 'ask' },
      ask: { type: 'collect-choice', prompt: 'Pick', choices: ['a', 'b'], next: 'rounds' },
      rounds: { type: 'foreach', data: 'ask.responses', subPhases: { g: { type: 'collect-choice', prompt: 'Guess', choices: ['a', 'b'] } }, next: 'done' },
      done: { type: 'end' }
    };
    expect(buildActivityMap({ phases }).talk).toBeUndefined();
  });
});

describe('link previews and the tab icon', () => {
  it('the home carries a description, the social card, and its image', () => {
    const html = read('screens/home/index.html');
    expect(html).toContain('<meta name="description" content="Whole-class activities');
    expect(html).toContain('<meta property="og:image" content="https://jamyard.org/shared/og-image.png">');
    expect(html).toContain('<meta property="og:title" content="Jamyard">');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(statSync(join(ROOT, 'screens/shared/og-image.png')).size).toBeGreaterThan(10000);
    expect(read('screens/shared/favicon.svg')).toContain('<svg');
  });
  it('every page has the tab icon', () => {
    const pages = [];
    (function walk(dir) {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (name.endsWith('.html')) pages.push(p);
      }
    })(join(ROOT, 'screens'));
    expect(pages.length).toBeGreaterThan(10);
    for (const p of pages) expect(readFileSync(p, 'utf8'), p).toContain('<link rel="icon" type="image/svg+xml" href="/shared/favicon.svg">');
  });
});

describe('the smaller answers', () => {
  it('the example note names what changed on a swaps-only example', () => {
    const js = read('screens/make/make.js');
    expect(js).toContain("swapsOnly ? 'The first question is filled in for ' : 'Filled in for '");
  });
  it('the rating results: one header line, bars per value, no pie', () => {
    const js = read('screens/host/host.js');
    expect(js).toContain('function hostDistributionBars(');
    expect(js).not.toContain('hostRenderPie(');
    expect(js).toContain("' student rated' : ' students rated'");
    expect(js).toContain('rateCounter.hidden = true;');
    expect(read('screens/host/styles.css')).toContain('.rate-dist-bars');
  });
  it('a wrong code says where the code is, in every language', () => {
    expect(read('server.js')).toContain("socket.emit(EVENTS.JOIN_ERROR, { message: 'Room not found. Check the code on the big screen.' });");
    expect(read('screens/player/player.js')).toContain('UiLang.t(message)');
    for (const lang of LANGUAGE_CODES.filter(c => c !== 'en')) {
      expect(STRINGS[lang]['Room not found. Check the code on the big screen.'], lang).toBeTruthy();
      expect(STRINGS[lang]['Next step'], lang).toBeTruthy();
      expect(STRINGS[lang]['Show the message'], lang).toBeUndefined();
    }
  });
  it('a message that is already up continues with Next step', () => {
    const phases = { lobby: { type: 'lobby', next: 'a' }, a: { type: 'announce', message: 'Hi', next: 'b' }, b: { type: 'announce', message: 'There', next: 'end' }, end: { type: 'end' } };
    expect(continueLabelForPhase(phases.a, phases)).toBe('Next step');
  });
  it('the Create page box stacks on a phone; the join page has the wordmark and a way home', () => {
    expect(read('screens/designer/styles.css')).toMatch(/@media \(max-width: 640px\) \{\s*\.idea-input-row \{ flex-direction: column;/);
    const join = read('screens/player/index.html');
    expect(join).toContain('<a class="join-brand" href="/" aria-label="Jamyard home">');
    expect(read('screens/player/styles.css')).toContain('.join-brand-yard');
  });
  it('the mic is a drawn mic with an accessible name, never the word MIC', () => {
    const js = read('screens/shared/speech-input.js');
    expect(js).toContain('function micIcon()');
    expect(js).toContain("btn.setAttribute('aria-label', 'Speak instead of typing')");
    expect(js).not.toContain('btn.textContent = IDLE_LABEL');
  });
  it('Nunito is gone from the pages (the site never loaded it)', () => {
    for (const f of ['screens/designer/designer.js', 'screens/player/styles.css', 'screens/designer/styles.css']) {
      expect(read(f), f).not.toContain('Nunito');
    }
  });
  it('Try it out keeps the feedback button off the add-student slot (in the toolbar since 2026-09-28)', () => {
    expect(read('screens/prototype/styles.css')).toContain('#toolbar #feedback-widget-btn {');
  });
  it('the no-results line says what is showing under a chip', () => {
    const html = read('screens/home/index.html');
    expect(html).toContain("'Here is everything under \"' + jobLabelOf(activeGoal) + '\".'");
  });
  it('skip ahead says where the pretend students are', () => {
    expect(read('screens/prototype/prototype.js')).toContain("': pretend students are playing ' + (here || 'the steps in between')");
  });
});
