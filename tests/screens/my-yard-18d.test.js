/**
 * My yard, 18d (design handoff 2026-09-24): a teacher's own copies and
 * AI-made games print differently from the built-ins beside them. A
 * sanded mat; the template's pictogram with its need-painted block
 * turned into a word block reading the copy's topic (under the picture
 * when the pictogram has several painted blocks, in the window's corner
 * on a content card); a custom game's initials over the fallback pile;
 * a kicker (the template's name, or MADE WITH AI) over the copy's own
 * name; five tools under the name row, share among them. Built-ins in
 * the yard stay 17g.
 *
 * Runs the modules against the yard test's small fake document.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFile } from 'node:fs/promises';

const ROOT = new URL('../..', import.meta.url);
const read = (p) => readFile(new URL(p, ROOT), 'utf8');

function makeNode(tag) {
  const node = {
    tagName: tag.toUpperCase(), className: '', textContent: '', children: [], parentNode: null, attrs: {}, listeners: {}, isConnected: true,
    style: { props: {}, setProperty(k, v) { this.props[k] = v; }, getPropertyValue(k) { return this.props[k] || ''; } },
    get classList() {
      const self = this;
      return {
        add(c) { const s = new Set(self.className.split(/\s+/).filter(Boolean)); s.add(c); self.className = [...s].join(' '); },
        remove(c) { self.className = self.className.split(/\s+/).filter((x) => x && x !== c).join(' '); },
        toggle(c, force) { const has = this.contains(c); if (force === undefined ? has : !force) this.remove(c); else this.add(c); },
        contains(c) { return self.className.split(/\s+/).includes(c); }
      };
    },
    get firstChild() { return this.children[0] || null; },
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    matches() { return false; },
    querySelectorAll(sel) { return all(this).filter((n) => matchesSel(n, sel)); },
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  };
  return node;
}
function all(node) { const out = []; for (const c of node.children) { out.push(c); out.push(...all(c)); } return out; }
function matchesSel(node, sel) {
  const parts = sel.trim().split(/\s+/);
  const last = parts.pop();
  if (!matchesCompound(node, last)) return false;
  if (parts.length === 0) return true;
  for (let p = node.parentNode; p; p = p.parentNode) if (matchesSel(p, parts.join(' '))) return true;
  return false;
}
function matchesCompound(node, sel) {
  const classes = node.className.split(/\s+/).filter(Boolean);
  const need = sel.replace(/:not\([^)]*\)/, '').split('.').filter(Boolean);
  return need.every((c) => classes.includes(c));
}
const text = (node) => [node, ...all(node)].map((n) => n.textContent).filter(Boolean).join(' ');

async function loadModules() {
  globalThis.window = globalThis;
  globalThis.document = { createElement: makeNode, createElementNS: (ns, tag) => makeNode(tag) };
  globalThis.matchMedia = () => ({ matches: false });
  delete globalThis.GoalGroups; delete globalThis.YardPictograms; delete globalThis.YardPrints;
  vi.resetModules();
  await import('../../screens/shared/goal-groups.js');
  await import('../../screens/shared/yard-pictograms.js');
  await import('../../screens/shared/yard-prints.js');
}

const BUILT_INS = [
  { id: 'exit-ticket', name: 'Exit Ticket', tags: ['review'], glimpse: { prompt: 'One thing you learned today. One question you still have.' } },
  { id: 'snowball', name: 'Snowball', tags: ['discuss'], glimpse: { prompt: 'What is the most important idea from this unit?' } },
  { id: 'both-sides-rope', name: 'Both Sides of the Rope', tags: ['discuss'], glimpse: { prompt: 'Where do you stand?' } },
  { id: 'closer', name: 'Closer', tags: ['connect'], glimpse: { prompt: 'Window seat or aisle seat?' } },
  { id: 'story-builder', name: 'Story Builder', tags: ['play'], glimpse: { prompt: 'Add a line.' } }
];

describe('my yard 18d: what is yours prints as yours', () => {
  beforeEach(() => loadModules());

  it('finds the template a copy came from by id, by name, or by slug, and never for a custom game', () => {
    const YP = globalThis.YardPrints;
    expect(YP.templateOf({ id: 'snowball-2', name: 'Snowball' }, BUILT_INS).id).toBe('snowball');
    expect(YP.templateOf({ id: 'exit-ticket-photosynthesis', name: 'Exit Ticket (my version)' }, BUILT_INS).id).toBe('exit-ticket');
    expect(YP.templateOf({ id: 'both-sides-of-the-rope-my-version', name: 'Both Sides of the Rope (my version)' }, BUILT_INS).id).toBe('both-sides-rope');
    expect(YP.templateOf({ id: 'squid-facts-relay', name: 'Squid Facts Relay' }, BUILT_INS)).toBeNull();
  });

  it('the topic is the copy\'s own words: the template\'s name and separator stripped, capped, else the prompt\'s first words only when the prompt is its own', () => {
    const YP = globalThis.YardPrints;
    const snow = BUILT_INS[1];
    expect(YP.topicOf({ name: 'Snowball: Causes of WWI' }, snow)).toBe('CAUSES OF WWI');
    expect(YP.topicOf({ name: 'Exit Ticket · Fractions, day 2' }, BUILT_INS[0])).toBe('FRACTIONS, DAY 2');
    expect(YP.topicOf({ name: 'Snowball: The French Revolution in one hour' }, snow)).toBe('THE FRENCH…');
    // (my version) is nothing; a changed prompt gives its first three words
    expect(YP.topicOf({ name: 'Snowball (my version)', glimpse: { prompt: 'Which cause of WWI mattered most?' } }, snow)).toBe('WHICH CAUSE OF');
    // the template's own question is not the teacher's words: no word block
    expect(YP.topicOf({ name: 'Snowball (my version)', glimpse: { prompt: snow.glimpse.prompt } }, snow)).toBe('');
    // a template name with a regex character (Whose Eyes?) must not throw
    const eyes = { id: 'whose-eyes', name: 'Whose Eyes?', glimpse: { prompt: 'Name one person.' } };
    expect(YP.topicOf({ name: 'Whose Eyes? Homework' }, eyes)).toBe('HOMEWORK');
    expect(YP.topicOf({ name: 'Whose Eyes? (my version)', glimpse: { prompt: 'Name one person.' } }, eyes)).toBe('');
    expect(YP.initialsOf({ name: 'Squid Facts Relay' })).toBe('SFR');
    expect(YP.initialsOf({ name: 'The Tournament of Penguins' })).toBe('TP');
    expect(YP.ownDetails({ name: 'Squid Facts Relay' }, null)).toEqual({ kicker: 'MADE WITH AI', templateId: null, topic: '', initials: 'SFR', ownPrompt: '' });
    // a copy with its own question carries it as its hover line; one with the template's carries none
    expect(YP.ownDetails({ name: 'Snowball', glimpse: { prompt: 'Which cause of WWI mattered most?' } }, snow).ownPrompt).toBe('Which cause of WWI mattered most?');
    expect(YP.ownDetails({ name: 'Snowball', glimpse: { prompt: snow.glimpse.prompt } }, snow).ownPrompt).toBe('');
    const own = YP.buildCard({ id: 'snowball-2', name: 'Snowball', tags: ['discuss'], glimpse: { prompt: 'Which cause of WWI mattered most?' } }, 0, { own: YP.ownDetails({ id: 'snowball-2', name: 'Snowball', glimpse: { prompt: 'Which cause of WWI mattered most?' } }, snow) });
    expect(own.querySelector('.yard-prompt').textContent).toBe('Which cause of WWI mattered most?');
    expect(YP.ownDetails({ name: 'Snowball: Causes of WWI' }, snow).kicker).toBe('SNOWBALL');
  });

  it('an own card gets the sanded mat, the kicker over its name, and its word block in place, under, or in the corner', () => {
    const YP = globalThis.YardPrints;
    const P = globalThis.YardPictograms;
    // Exit Ticket: one painted plain block on the pile becomes the word block
    const ticket = YP.buildCard({ id: 'exit-ticket-2', name: 'Exit Ticket: Photosynthesis', tags: ['review'] }, 0, {
      own: YP.ownDetails({ id: 'exit-ticket-2', name: 'Exit Ticket: Photosynthesis' }, BUILT_INS[0])
    });
    expect(ticket.className).toContain('yard-card-own');
    expect(ticket.querySelector('.yard-print').className).toContain('yard-print-own');
    expect(ticket.querySelector('.yard-kicker').textContent).toBe('EXIT TICKET');
    expect(ticket.querySelector('.yard-name').textContent).toBe('Exit Ticket: Photosynthesis');
    const word = ticket.querySelector('.pg-word');
    expect(word.textContent).toBe('PHOTOSYNTHESIS');
    expect(word.className).toContain('t-green');
    expect(ticket.querySelector('.pg-topic-corner')).toBeNull();
    expect(ticket.querySelector('.pg-with-topic')).toBeNull();
    // Solo Quiz: no plain painted block (the letter carries a letter, the
    // last line its check), so the word block sits under the picture
    const quiz = P.build({ id: 'solo-quiz-2' }, 't-green', YP.picture({ id: 'solo-quiz-2' }), { templateId: 'solo-quiz', topic: 'MONDAY' });
    expect(quiz.corner).toBeNull();
    expect(quiz.node.className).toContain('pg-with-topic');
    expect(quiz.node.querySelector('.pg-word').textContent).toBe('MONDAY');
    expect(quiz.node.querySelectorAll('.pg-check').length).toBe(3);
    // Snowball is a content card: the corner, and its own words untouched
    const snow = P.build({ id: 'snowball-2' }, 't-cyan', YP.picture({ id: 'snowball-2' }), { templateId: 'snowball', topic: 'CAUSES OF WWI' });
    expect(snow.corner).not.toBeNull();
    expect(snow.corner.textContent).toBe('CAUSES OF WWI');
    expect(text(snow.node)).toContain('Just division.');
    // no topic, no word block
    expect(P.build({ id: 'snowball-3' }, 't-cyan', YP.picture({ id: 'snowball-3' }), { templateId: 'snowball', topic: '' }).corner).toBeNull();
    // a built-in card is untouched
    const plain = YP.buildCard(BUILT_INS[0], 0, {});
    expect(plain.className).not.toContain('yard-card-own');
    expect(plain.querySelector('.yard-kicker')).toBeNull();
    expect(plain.querySelector('.pg-word')).toBeNull();
  });

  it('a custom game keeps the fallback pile with its initials above it, the first in the need paint', () => {
    const YP = globalThis.YardPrints;
    const g = { id: 'squid-facts-relay', name: 'Squid Facts Relay', tags: ['play'], glimpse: { mode: 'answer', prompt: 'Name one squid fact.' } };
    const card = YP.buildCard(g, 0, { own: YP.ownDetails(g, null) });
    expect(card.querySelector('.yard-kicker').textContent).toBe('MADE WITH AI');
    const initials = card.querySelectorAll('.pg-initial');
    expect(initials.map((n) => n.textContent).join('')).toBe('SFR');
    expect(initials[0].className).toContain(YP.paintOf(g));
    expect(initials[1].className).not.toContain(YP.paintOf(g));
    expect(card.querySelectorAll('.pg-arrive').length).toBe(1);
    // a copy of a template with no pictogram keeps the fallback, its word block under
    const P = globalThis.YardPictograms;
    const story = P.build({ id: 'story-builder-2', glimpse: { mode: 'answer' } }, 't-orange', YP.picture({ id: 'story-builder-2' }), { templateId: 'story-builder', topic: 'SPACE' });
    expect(story.node.querySelector('.pg-word').textContent).toBe('SPACE');
  });

  it('the shelf hands buildCard the own details, draws five tools with share for own copies, and styles the sanded mat and kicker', async () => {
    const js = await read('screens/shared/my-yard.js');
    expect(js).toContain('YardPrints.ownDetails(game, templateOf(game))');
    expect(js).toContain("shelfTool('button', 'share'");
    expect(js).toContain('M13.6 3.6 a1.7 1.7 0 1 1 -3.4 0');
    expect(js).toContain('function flashTool(');
    const css = await read('screens/shared/yard-prints.css');
    expect(css).toMatch(/\.yard-print-own \{[^}]*background: var\(--t-sanded\)/);
    expect(css).toMatch(/\.yard-print-own \{[^}]*background-image: var\(--t-grain\)/);
    expect(css).toMatch(/\.yard-kicker \{[^}]*letter-spacing: 0\.12em/);
    expect(css).toMatch(/\.pg-b\.pg-word \{[^}]*font-size: 9px/);
    expect(css).toMatch(/\.pg-b\.pg-word \{[^}]*white-space: nowrap/);
    const shelf = await read('screens/shared/my-yard.css');
    expect(shelf).toContain('.shelf-tool-share { --rot: 1deg; }');
    expect(shelf).toMatch(/\.shelf-flash \{/);
  });
});
