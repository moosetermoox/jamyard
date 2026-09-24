/**
 * Class examples (2026-09-24): Your class on the home (grade band +
 * subjects, shared/class-picker.js, saved by TeacherProfile in this
 * browser only) swaps every yard card's words to an authored example
 * from that subject at that grade (shared/class-examples.js), and a card
 * opened from the yard carries its example to the make page
 * (`?ex=<subject>.<band>`), where the same words are already in the
 * question box, the field labels, the pairs, or the choices.
 *
 * Guards: the table covers every subject and band for every activity it
 * names; nothing in it breaks the house rules (no em dashes, no AI
 * mention); the resolver's fallbacks and round robin; the pictograms
 * draw the example's words; the pages load the modules; the picker
 * moved out of make-it-yours.js in one piece.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFile } from 'node:fs/promises';

const ROOT = new URL('../..', import.meta.url);
const read = (p) => readFile(new URL(p, ROOT), 'utf8');

// ── The yard test's small fake document ──
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
  const classes = node.className.split(/\s+/).filter(Boolean);
  const need = sel.split('.').filter(Boolean);
  return need.every((c) => classes.includes(c));
}
const text = (node) => [node, ...all(node)].map((n) => n.textContent).filter(Boolean).join(' ');

async function loadModules() {
  globalThis.window = globalThis;
  globalThis.document = { createElement: makeNode, createElementNS: (ns, tag) => makeNode(tag) };
  globalThis.matchMedia = () => ({ matches: false });
  delete globalThis.GoalGroups; delete globalThis.YardPictograms; delete globalThis.YardPrints; delete globalThis.ClassExamples; delete globalThis.TeacherProfile; delete globalThis.YardDoodles;
  vi.resetModules();
  await import('../../screens/shared/goal-groups.js');
  await import('../../screens/shared/teacher-profile.js');
  await import('../../screens/shared/class-examples.js');
  await import('../../screens/shared/yard-doodles.js');
  await import('../../screens/shared/yard-pictograms.js');
  await import('../../screens/shared/yard-prints.js');
}

const SUBJECT_IDS = ['social-studies', 'english', 'science', 'math', 'languages', 'advisory'];
const BANDS = ['elementary', 'middle', 'high'];
const FEATURED = ['art-gallery', 'both-sides-rope', 'closer', 'doodle-bluff', 'exit-ticket', 'group-work-day', 'live-poll', 'one-more-thing', 'snowball', 'solo-quiz', 'someones-got-you', 'speed-quiz', 'trivia-bluff', 'vocab-match', 'whose-eyes'];

describe('the authored table', () => {
  beforeEach(() => loadModules());

  it('has words for every featured activity, in every subject at every grade (or every grade for a subject-neutral one)', () => {
    const E = globalThis.ClassExamples;
    for (const id of FEATURED) {
      expect(E.IDS, id + ' in the table').toContain(id);
      for (const band of BANDS) {
        for (const subject of SUBJECT_IDS) {
          const ex = E.pick(id, { gradeBand: band, subjects: [subject] }, 0);
          expect(ex, `${id} ${subject} ${band}`).not.toBeNull();
          expect(ex.subject === subject || ex.subject === 'any', `${id} ${subject} ${band} subject`).toBe(true);
          expect(ex.band).toBe(band);
        }
      }
    }
    // the subject-neutral one reads its band with no subject at all
    expect(globalThis.ClassExamples.pick('someones-got-you', { gradeBand: 'high', subjects: [] }, 0).words.mine).toContain('jobs');
  });

  it('every quiz question has four choices with the answer among them, a blank with its truth, and every example compiles its recipe', async () => {
    const T = globalThis.ClassExamples.TABLE;
    const { readFileSync } = await import('node:fs');
    const { compileRecipe } = await import('../../engine/recipe-compiler.js');
    const recipeOf = (id) => JSON.parse(readFileSync(new URL('recipes/' + id + '.json', ROOT), 'utf8'));
    const stampOf = (game) => JSON.parse(readFileSync(new URL('games/' + game + '/config.json', ROOT), 'utf8')).recipe;
    const recipes = { 'solo-quiz': 'solo-quiz', 'speed-quiz': 'quiz-show', 'trivia-bluff': 'trivia-bluff', 'doodle-bluff': 'doodle-bluff', 'group-work-day': 'group-work-day' };
    const E = globalThis.ClassExamples;
    for (const s of SUBJECT_IDS) {
      for (const b of BANDS) {
        const qs = T['solo-quiz'][s][b].questions;
        expect(qs, s + ' ' + b).toHaveLength(3);
        for (const q of qs) {
          expect(q.choices, q.question).toHaveLength(4);
          expect(q.choices, q.question).toContain(q.correct);
          expect(new Set(q.choices).size, q.question).toBe(4);
        }
        for (const f of T['trivia-bluff'][s][b].facts) {
          expect(f.question, f.question).toContain('___');
          expect(f.truth.length, f.question).toBeGreaterThan(0);
        }
        expect(T['doodle-bluff'][s][b].phrases, s + ' ' + b).toHaveLength(3);
        expect(T['doodle-bluff'][s][b].phrases[0]).toBe(T['doodle-bluff'][s][b].phrase);
        expect(T['group-work-day'][s][b].tasks, s + ' ' + b).toHaveLength(4);
        for (const [game, recipeId] of Object.entries(recipes)) {
          const params = { ...(stampOf(game).params || {}), ...E.pick(game, { gradeBand: b, subjects: [s] }, 0).prefill.params };
          const out = compileRecipe(recipeOf(recipeId), params);
          expect(out.config, game + ' ' + s + ' ' + b + ' ' + JSON.stringify(out.diagnostics || []).slice(0, 200)).toBeTruthy();
          const errors = (out.diagnostics || []).filter((d) => d && d.severity === 'error');
          expect(errors, game + ' ' + s + ' ' + b).toEqual([]);
        }
      }
    }
  });

  it('every entry has the shape its card draws, short enough for its slips', () => {
    const T = globalThis.ClassExamples.TABLE;
    const each = (id, fn) => Object.values(T[id]).forEach((bySubject) => Object.values(bySubject).forEach(fn));
    each('live-poll', (w) => { expect(w.question.length).toBeLessThan(60); expect(w.choices).toHaveLength(4); w.choices.forEach((c) => expect(c.length).toBeLessThan(13)); });
    each('snowball', (w) => { expect(w.question.length).toBeLessThan(50); expect(w.a.length).toBeLessThan(18); expect(w.b.length).toBeLessThan(18); expect(w.together.length).toBeLessThan(44); });
    each('vocab-match', (w) => { expect(w.pairs).toHaveLength(6); w.pairs.forEach((p) => { expect(p[0].length).toBeLessThan(15); expect(p[1].length).toBeLessThan(32); }); });
    each('whose-eyes', (w) => { expect(w.tag.length).toBeLessThan(16); expect(w.eyes).toHaveLength(4); w.eyes.forEach((e) => expect(e.length).toBeLessThan(13)); expect(w.line.length).toBeLessThan(48); expect(w.topic.length).toBeGreaterThan(5); });
    each('both-sides-rope', (w) => expect(w.claim.length).toBeLessThan(50));
    const D = globalThis.YardDoodles;
    each('art-gallery', (w) => {
      expect(w.text.length).toBeLessThan(42);
      expect(w.text.startsWith('Draw')).toBe(true);
      expect(w.doodles).toHaveLength(4);
      w.doodles.forEach((name) => expect(D.paths(name), 'doodle ' + name).not.toBeNull());
    });
    each('doodle-bluff', (w) => {
      expect(w.phrase.length).toBeLessThan(44);
      expect(D.paths(w.doodle), 'doodle ' + w.doodle).not.toBeNull();
    });
    // every drawing in the library is stroke paths only, in the 60 by 50 box
    for (const name of D.NAMES) {
      for (const p of D.paths(name)) expect(p, name).toMatch(/^[MLHVCSQTAZmlhvcsqtaz0-9 .,-]+$/);
      expect(D.paths(name).length, name).toBeGreaterThan(0);
    }
    each('closer', (w) => expect(w.question.length).toBeLessThan(64));
    each('someones-got-you', (w) => { expect(w.mine.length).toBeLessThan(48); expect(w.reply.length).toBeLessThan(48); });
    each('exit-ticket', (w) => { expect(w.fields).toHaveLength(2); w.fields.forEach((f) => expect(f.length).toBeLessThan(56)); });
    const topics = globalThis.ClassExamples.TOPICS;
    for (const s of SUBJECT_IDS) for (const b of BANDS) expect(typeof topics[s][b], s + ' ' + b).toBe('string');
  });

  it('keeps the house rules: no em dashes, nothing that names the AI, no decorative marks', async () => {
    const src = await read('screens/shared/class-examples.js');
    const literals = src.match(/'(?:[^'\\]|\\.)*'/g) || [];
    for (const lit of literals) {
      expect(lit, lit).not.toMatch(/—/);
      expect(lit, lit).not.toMatch(/\bAI\b|artificial intelligence|the model|Claude/i);
      expect(lit, lit).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    }
  });
});

describe('the resolver', () => {
  beforeEach(() => loadModules());

  it('needs a grade band and a subject it has words for; Something else and adult fall back honestly', () => {
    const E = globalThis.ClassExamples;
    expect(E.pick('live-poll', null, 0)).toBeNull();
    expect(E.pick('live-poll', { gradeBand: null, subjects: ['science'] }, 0)).toBeNull();
    expect(E.pick('live-poll', { gradeBand: 'middle', subjects: [] }, 0)).toBeNull();
    expect(E.pick('live-poll', { gradeBand: 'middle', subjects: ['other'] }, 0)).toBeNull();
    // a college or adult class reads the high band
    expect(E.pick('live-poll', { gradeBand: 'adult', subjects: ['science'] }, 0).band).toBe('high');
    // an activity not in the table (a teacher's own, a hidden built-in) gets nothing
    expect(E.pick('story-quest', { gradeBand: 'middle', subjects: ['science'] }, 0)).toBeNull();
    expect(E.pick('live-poll-2', { gradeBand: 'middle', subjects: ['science'] }, 0)).toBeNull();
  });

  it('deals two subjects round robin across the cards, and a key round-trips', () => {
    const E = globalThis.ClassExamples;
    const profile = { gradeBand: 'middle', subjects: ['social-studies', 'science', 'other'] };
    expect(E.pick('snowball', profile, 0).subject).toBe('social-studies');
    expect(E.pick('snowball', profile, 1).subject).toBe('science');
    expect(E.pick('snowball', profile, 2).subject).toBe('social-studies');
    const ex = E.pick('snowball', profile, 1);
    expect(ex.key).toBe('science.middle');
    expect(E.keyOf(ex)).toBe('science.middle');
    const back = E.forKey('snowball', 'science.middle');
    expect(back.words).toEqual(ex.words);
    expect(E.forKey('snowball', 'science.college')).toBeNull();
    expect(E.forKey('snowball', 'robotics.middle')).toBeNull();
    expect(E.forKey('snowball', '')).toBeNull();
    expect(E.describe(ex)).toBe('science, grades 6-8');
    expect(E.describe(E.forKey('someones-got-you', 'any.elementary'))).toBe('grades K-5');
  });

  it('gives each activity the prefill its make page can take, and the line-only ones none', () => {
    const E = globalThis.ClassExamples;
    const p = { gradeBand: 'middle', subjects: ['science'] };
    const poll = E.pick('live-poll', p, 0);
    expect(poll.prefill.prompt).toBe(poll.words.question);
    expect(poll.prefill.choices).toEqual(poll.words.choices);
    const match = E.pick('vocab-match', p, 0);
    expect(match.prefill.pairs).toHaveLength(2);
    expect(match.prefill.pairs[0]).toHaveLength(3);
    expect(match.prefill.pairs[1]).toHaveLength(3);
    const eyes = E.pick('whose-eyes', p, 0);
    expect(eyes.prefill.prompt).toContain('Name ONE person, creature, or thing affected by ' + eyes.words.topic);
    const rope = E.pick('both-sides-rope', p, 0);
    expect(rope.prefill.prompt).toContain('“' + rope.words.claim + '”');
    expect(rope.prefill.prompt.startsWith('Where do you stand RIGHT NOW?')).toBe(true);
    const ticket = E.pick('exit-ticket', p, 0);
    expect(ticket.prefill.fields).toHaveLength(2);
    expect(ticket.line).toContain(ticket.words.fields[0]);
    const more = E.pick('one-more-thing', p, 0);
    expect(more.prefill.prompt).toContain('the rock cycle');
    expect(more.line).toContain('the rock cycle');
    for (const id of ['solo-quiz', 'speed-quiz', 'trivia-bluff', 'group-work-day']) {
      const ex = E.pick(id, p, 0);
      expect(ex.line, id).toContain('the rock cycle');
      expect(ex.prefill && ex.prefill.params, id).toBeTruthy();
    }
    // the quizzes share three checked questions; the bluff gets them as blanks
    const solo = E.pick('solo-quiz', p, 0).prefill.params.questions;
    expect(solo).toHaveLength(3);
    expect(solo[0]).toEqual({ question: 'Which rock forms from cooled lava?', choices: ['Igneous', 'Sedimentary', 'Metamorphic', 'Fossil'], correct: 'Igneous' });
    expect(E.pick('speed-quiz', p, 0).prefill.params.questions).toEqual(solo);
    const bluff = E.pick('trivia-bluff', p, 0).prefill.params;
    expect(bluff.questionSource).toBe('prepared');
    expect(bluff.questions[0]).toEqual({ question: 'Rock that forms from cooled lava is called ___.', truth: 'igneous' });
    const doodle = E.pick('doodle-bluff', p, 0).prefill.params;
    expect(doodle).toEqual({ phraseSource: 'teacher', phrases: ['a volcano that forgot how to erupt', 'a wave afraid of the beach', 'a mountain wearing a raincoat'] });
    expect(E.pick('group-work-day', p, 0).prefill.params.tasks).toHaveLength(4);
    expect(E.editsOf(E.pick('solo-quiz', p, 0)).params.questions).toEqual(solo);
    // Doodle Bluff's line is the strange phrase the class would draw
    const bluffCard = E.pick('doodle-bluff', p, 0);
    expect(bluffCard.line).toBe('\u201ca volcano that forgot how to erupt\u201d');
    expect(bluffCard.words.doodle).toBe('volcano');
    // talk-only and subject-neutral: words for the card, nothing to prefill
    expect(E.pick('closer', p, 0).prefill).toBeNull();
    expect(E.pick('someones-got-you', p, 0).prefill).toBeNull();
  });

  it('turns an example into the make route\'s edits, by position, for the popup\'s map', () => {
    const E = globalThis.ClassExamples;
    const p = { gradeBand: 'middle', subjects: ['science'] };
    expect(E.editsOf(E.pick('live-poll', p, 0))).toEqual({ prompt: 'Which state of matter is hardest to explain?', choices: ['Solid', 'Liquid', 'Gas', 'Plasma'] });
    const ticket = E.editsOf(E.pick('exit-ticket', p, 0));
    expect(ticket.fields).toEqual(['One thing you learned about the rock cycle', 'One question you still have']);
    const match = E.editsOf(E.pick('vocab-match', p, 0));
    expect(match.pairs).toHaveLength(2);
    expect(match.pairs[0][0]).toEqual({ left: 'igneous', right: 'rock from cooled lava' });
    expect(E.editsOf(E.pick('closer', p, 0))).toBeNull();
    expect(E.editsOf(null)).toBeNull();
  });
});

describe('the cards', () => {
  beforeEach(() => loadModules());

  it('draw the example\'s words in place of the activity\'s own, and Snowball\'s hover line is its question', () => {
    const P = globalThis.YardPictograms;
    const E = globalThis.ClassExamples;
    const p = { gradeBand: 'middle', subjects: ['science'] };
    const pic = (id) => globalThis.YardPrints.picture({ id });
    const poll = P.build({ id: 'live-poll' }, 't-green', pic('live-poll'), { example: E.pick('live-poll', p, 0) });
    const pollText = text(poll.node);
    expect(pollText).toContain('Which state of matter is hardest to explain?');
    expect(pollText).toContain('Plasma');
    expect(pollText).not.toContain('Got it!');
    expect(poll.hover).toBeNull();
    const snow = P.build({ id: 'snowball' }, 't-cyan', pic('snowball'), { example: E.pick('snowball', p, 0) });
    expect(text(snow.node)).toContain('Maya');
    expect(text(snow.node)).toContain('Doing work.');
    expect(snow.hover).toBe('What is energy?');
    const vocab = P.build({ id: 'vocab-match' }, 't-green', pic('vocab-match'), { example: E.pick('vocab-match', p, 0) });
    expect(text(vocab.node)).toContain('igneous');
    expect(text(vocab.node)).toContain('rock from cooled lava');
    expect(text(vocab.node)).not.toContain('simile');
    const eyes = P.build({ id: 'whose-eyes' }, 't-cyan', pic('whose-eyes'), { example: E.pick('whose-eyes', p, 0) });
    expect(text(eyes.node)).toContain('The dam');
    expect(text(eyes.node)).toContain('a salmon');
    expect(eyes.node.querySelectorAll('.pg-arrive').length).toBe(1);
    const rope = P.build({ id: 'both-sides-rope' }, 't-cyan', pic('both-sides-rope'), { example: E.pick('both-sides-rope', p, 0) });
    expect(text(rope.node)).toContain('“Pluto should still be a planet.”');
    // the wall draws the example's four drawings, the bluff's paper the drawing of its phrase
    const wall = P.build({ id: 'art-gallery' }, 't-orange', pic('art-gallery'), { example: E.pick('art-gallery', p, 0) });
    expect(wall.node.querySelectorAll('.pg-doodle').length).toBe(4);
    expect(text(wall.node)).toContain('Draw the water cycle, no words.');
    const plainWall = P.build({ id: 'art-gallery' }, 't-orange', pic('art-gallery'));
    expect(plainWall.node.querySelectorAll('.pg-doodle').length).toBe(4);
    expect(wall.node.querySelector('.pg-doodle').children[0].getAttribute('d')).not.toBe(plainWall.node.querySelector('.pg-doodle').children[0].getAttribute('d'));
    const bluff = P.build({ id: 'doodle-bluff' }, 't-orange', pic('doodle-bluff'), { example: E.pick('doodle-bluff', p, 0) });
    expect(bluff.node.querySelectorAll('.pg-doodle').length).toBe(1);
    expect(P.build({ id: 'doodle-bluff' }, 't-orange', pic('doodle-bluff')).node.querySelectorAll('.pg-doodle').length).toBe(0);
    // without an example every card reads as before
    expect(text(P.build({ id: 'live-poll' }, 't-green', pic('live-poll')).node)).toContain('Got it!');
    expect(P.build({ id: 'snowball' }, 't-cyan', pic('snowball')).hover).toBe('What is the most important idea from this unit?');
  });

  it('a card built with an example marks it, links it, and shows its line on the plain cards; an own copy never takes one', () => {
    const YP = globalThis.YardPrints;
    const E = globalThis.ClassExamples;
    const p = { gradeBand: 'high', subjects: ['math'] };
    const example = (g, i) => E.pick(g.id, p, i);
    const href = (g, ex) => '/make?game=' + g.id + (ex ? '&ex=' + ex.key : '');
    const quiz = YP.buildCard({ id: 'solo-quiz', name: 'Solo Quiz', tags: ['review'], glimpse: { prompt: 'Five quick questions.' } }, 0, { href, example });
    expect(quiz.getAttribute('data-example')).toBe('math.high');
    expect(quiz.href).toBe('/make?game=solo-quiz&ex=math.high');
    expect(text(quiz)).toContain('Five questions on derivatives, at your own pace.');
    expect(text(quiz)).not.toContain('Five quick questions.');
    const none = YP.buildCard({ id: 'solo-quiz', name: 'Solo Quiz', tags: ['review'], glimpse: { prompt: 'Five quick questions.' } }, 0, { href });
    expect(none.getAttribute('data-example')).toBeNull();
    expect(none.href).toBe('/make?game=solo-quiz');
    expect(text(none)).toContain('Five quick questions.');
    const own = YP.buildCard({ id: 'live-poll-3', name: 'Live Poll: lunch', tags: ['connect'], glimpse: { prompt: 'Pizza or tacos?' } }, 0, {
      href, example, own: { kicker: 'LIVE POLL', templateId: 'live-poll', topic: 'LUNCH', initials: '', ownPrompt: 'Pizza or tacos?' }
    });
    expect(own.getAttribute('data-example')).toBeNull();
    expect(text(own)).toContain('Got it!');
  });
});

describe('the pages', () => {
  it('the home loads the profile, the picker, and the examples before the prints, and its links carry the example', async () => {
    const html = await read('screens/home/index.html');
    const at = (s) => html.indexOf(s);
    expect(at('/shared/teacher-profile.js')).toBeGreaterThan(-1);
    expect(at('/shared/class-picker.js')).toBeGreaterThan(at('/shared/teacher-profile.js'));
    expect(at('/shared/class-picker.js')).toBeGreaterThan(at('/shared/dialog.js'));
    expect(at('/shared/class-examples.js')).toBeGreaterThan(-1);
    expect(at('/shared/class-examples.js')).toBeLessThan(at('<script src="/shared/yard-prints.js">'));
    expect(at('<script src="/shared/yard-doodles.js">')).toBeGreaterThan(-1);
    expect(at('<script src="/shared/yard-doodles.js">')).toBeLessThan(at('<script src="/shared/yard-pictograms.js">'));
    expect(html).toContain('<link rel="stylesheet" href="/shared/class-picker.css">');
    expect(html).toContain('id="class-panel" hidden');
    expect(html).toContain('.class-panel[hidden] { display: none; }');
    expect(html).toContain("'&ex=' + encodeURIComponent(ex.key)");
    expect(html).toContain('example: exampleFor,');
    expect(html).toContain("ClassPicker.render(classPanel, {");
    expect(html).toContain('bare: true,');
    expect(html).toContain("dialog: { overlay: 'home-dialog-overlay', modal: 'home-dialog' }");
    // the chip sits in the sticky row after the four jobs, opens the panel
    expect(html).toContain("'goal-chip class-chip t-lift'");
    expect(html).toContain("cls.setAttribute('aria-controls', 'class-panel')");
    // the popup's red door carries the card's example too
    expect(html).toContain('function showActivityPopup(g, card)');
    expect(html).toContain('start.href = makeHref(g, ex);');
    // the class picker's hint says what a teacher sees, never our words for it
    const hint = /hint: '([^']+)'/.exec(html.slice(at('ClassPicker.render(classPanel')))[1];
    expect(hint).not.toMatch(/door|print|plank|fit\b/);
    expect(hint).toContain('Saved on this computer only');
  });

  it('the make page loads the modules, reads ?ex=, fills the boxes, sends the choices, and offers the original words', async () => {
    const html = await read('screens/make/index.html');
    const js = await read('screens/make/make.js');
    expect(html.indexOf('/shared/class-picker.js')).toBeGreaterThan(html.indexOf('/shared/teacher-profile.js'));
    expect(html.indexOf('/shared/class-picker.js')).toBeLessThan(html.indexOf('/shared/make-it-yours.js'));
    expect(html.indexOf('/shared/class-examples.js')).toBeLessThan(html.indexOf('make.js"'));
    expect(html).toContain('<link rel="stylesheet" href="/shared/class-picker.css">');
    expect(js).toContain("var exKey = params.get('ex');");
    expect(js).toContain('ClassExamples.forKey(gameId, exKey)');
    expect(js).toContain('render();\n    applyExample();'.replace(/\n/g, js.includes('\r\n') ? '\r\n' : '\n'));
    expect(js).toContain('state.promptBox.value = pf.prompt;');
    expect(js).toContain('box.value = pf.fields[i];');
    expect(js).toContain('mountPairs(rounds);');
    expect(js).toContain('state.exampleChoices = pf.choices.slice();');
    expect(js).toContain("if (state.exampleChoices) edits.choices = state.exampleChoices.slice();");
    expect(js).toContain("'Use the original words'");
    expect(js).toContain("'Filled in for ' + ClassExamples.describe(ex)");
    // the fit is told the example's choices are the teacher's
    expect(js).toContain('The teacher set the answer choices in step');
    // never on a recipe panel's words
    expect(js).toContain('if (!state.print || state.panel) return;');
    // the profile's short form has one home
    expect(js).toContain('P.short()');
    const css = await read('screens/make/styles.css');
    expect(css).toContain('.example-note');
  });

  it('the picker moved to shared/class-picker.js in one piece; make-it-yours.js delegates and its sheet lost the rules', async () => {
    const picker = await read('screens/shared/class-picker.js');
    const miy = await read('screens/shared/make-it-yours.js');
    const pickerCss = await read('screens/shared/class-picker.css');
    const miyCss = await read('screens/shared/make-it-yours.css');
    for (const fn of ['function buildChipRow', 'function renderClassPicker', 'function askOtherSubject']) {
      expect(picker).toContain(fn);
      expect(miy).toContain(fn + '(');
    }
    expect(miy).toContain('window.ClassPicker.render(container, opts)');
    expect(miy).not.toContain("TeacherProfile.GRADE_BANDS,");
    expect(picker).toContain('window.ClassPicker = {');
    expect(picker).toContain("box.className = 'class-picker' + (opts.bare ? ' class-picker-bare' : '');");
    for (const rule of ['.class-picker {', '.setup-chip {', '.teacher-setup-chips {', '.teacher-setup-label {']) {
      expect(pickerCss).toContain(rule);
      expect(miyCss).not.toContain(rule);
    }
    // the make page does not load the module twice
    const html = await read('screens/make/index.html');
    expect(html.split('/shared/class-picker.js').length).toBe(2);
  });

  it('the server takes the choices with the other edits, capped, and applies them to a pick-one step only', async () => {
    const server = await read('server.js');
    expect(server).toContain('edits.choices = body.choices.slice(0, 8)');
    const { applyEdits } = await import('../../engine/make-print.js');
    const cfg = {
      name: 'Live Poll',
      phases: {
        lobby: { id: 'lobby', type: 'lobby', next: 'ask' },
        ask: { id: 'ask', type: 'collect-choice', prompt: 'How are you feeling?', choices: ['Got it!', 'Mostly', 'Confused', 'Lost'], next: 'end' },
        end: { id: 'end', type: 'end' }
      }
    };
    const out = applyEdits(cfg, { prompt: 'Which state of matter is hardest to explain?', choices: ['Solid', 'Liquid', 'Gas', 'Plasma'] });
    expect(out.changed).toBe(true);
    expect(out.config.phases.ask.choices).toEqual(['Solid', 'Liquid', 'Gas', 'Plasma']);
    expect(cfg.phases.ask.choices[0]).toBe('Got it!');
    expect(applyEdits(cfg, { choices: ['Got it!', 'Mostly', 'Confused', 'Lost'] }).changed).toBe(false);
    expect(applyEdits(cfg, { choices: ['Only one'] }).changed).toBe(false);
    cfg.phases.ask.type = 'collect';
    expect(applyEdits(cfg, { choices: ['A', 'B'] }).changed).toBe(false);
    // fields by position, pairs by match step in order (the popup's map)
    const ticket = {
      phases: {
        lobby: { id: 'lobby', type: 'lobby', next: 'ticket' },
        ticket: { id: 'ticket', type: 'collect', prompt: 'Answer in a sentence.', fields: [{ key: 'q1', label: 'A' }, { key: 'q2', label: 'B' }], next: 'end' },
        end: { id: 'end', type: 'end' }
      }
    };
    const filled = applyEdits(ticket, { fields: ['One thing you learned', 'One question you still have'] });
    expect(filled.changed).toBe(true);
    expect(filled.config.phases.ticket.fields.map((f) => f.label)).toEqual(['One thing you learned', 'One question you still have']);
    const vocab = {
      phases: {
        lobby: { id: 'lobby', type: 'lobby', next: 'round1' },
        round1: { id: 'round1', type: 'match', prompt: 'Match', pairs: [{ left: 'a', right: '1' }], next: 'round2' },
        round2: { id: 'round2', type: 'match', prompt: 'Match', pairs: [{ left: 'b', right: '2' }], next: 'end' },
        end: { id: 'end', type: 'end' }
      }
    };
    const rounds = applyEdits(vocab, { pairs: [[{ left: 'igneous', right: 'rock from cooled lava' }], [{ left: 'density', right: 'mass per volume' }]] });
    expect(rounds.changed).toBe(true);
    expect(rounds.config.phases.round1.pairs[0].left).toBe('igneous');
    expect(rounds.config.phases.round2.pairs[0].left).toBe('density');
    expect(server).toContain('} else if (Array.isArray(body.fields)) {');
    expect(server).toContain('} else if (Array.isArray(body.pairs)) {');
  });

  it('a quiz example rides as recipe params: the route recompiles, the map quotes the questions, the make page fills the panel', async () => {
    const server = await read('server.js');
    expect(server).toContain('const recipe = getRecipe(config.recipe.id);');
    expect(server).toContain('if (allowed.has(k)) merged[k] = v;');
    expect(server).toContain('const out = applyEdits(base, edits);');
    const { buildActivityMap } = await import('../../engine/activity-map.js');
    const map = buildActivityMap({
      phases: {
        lobby: { id: 'lobby', type: 'lobby', next: 'quiz' },
        quiz: { id: 'quiz', type: 'solo-quiz', questions: [{ question: 'Which rock forms from cooled lava?', choices: ['a', 'b'], correct: 'a' }, { question: 'What is a cell?', choices: ['a', 'b'], correct: 'a' }], next: 'end' },
        end: { id: 'end', type: 'end' }
      }
    });
    const quiz = map.stops.find((s) => s.type === 'solo-quiz');
    expect(quiz.detail).toBe('Which rock forms from cooled lava?');
    expect(quiz.samples).toEqual(['Which rock forms from cooled lava?', 'What is a cell?']);
    const js = await read('screens/make/make.js');
    expect(js).toContain('state.exampleParams = true;');
    expect(js).toContain("ActivityMap.attach(gameId, document.getElementById('map-holder'), exampleEdits ? { edits: exampleEdits } : undefined);");
    expect(js).toContain('state.panelApi.touched = function () { return true || touchedBefore(); };');
    expect(js).toContain("back.searchParams.delete('ex');");
    // the picker takes one subject at a time
    const picker = await read('screens/shared/class-picker.js');
    expect(picker).toContain('picked.subjects = had ? [] : [id];');
    expect(picker).toContain("subjectLabel.textContent = 'Subject';");
  });

  it('the popup\'s map reads the example through the make route', async () => {
    const html = await read('screens/home/index.html');
    const map = await read('screens/shared/activity-map.js');
    expect(html).toContain('ActivityMap.attach(g.id, mapHolder, edits ? { edits: edits } : undefined);');
    expect(html).toContain('ClassExamples.editsOf(ex)');
    expect(map).toContain('function attach(gameId, container, opts)');
    expect(map).toContain("'/make', {");
    expect(map).toContain('body: JSON.stringify(opts.edits)');
  });
});
