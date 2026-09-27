/**
 * A reviewer's Both Sides of the Rope round (2026-09-26): the before/after
 * votes were sorted by count so the order changed between them, zero rows
 * vanished, nothing said how many moved; the class never saw the first
 * vote; the projector counted the room at the step's start; a continue
 * button sat under the corner chip; a dead make link had no way back.
 * Source guards for each fix; the room-level proof is
 * scripts/simulate-rope-round.js.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { STRINGS } from '../../engine/i18n/index.js';
import { EVENTS } from '../../engine/events.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const SCALE = ['Yes', 'Lean yes', 'Not sure', 'Lean no', 'No'];

describe('Both Sides of the Rope, the built-in and the recipe', () => {
  for (const [label, phases] of [
    ['the built-in', JSON.parse(read('games/both-sides-rope/config.json')).phases],
    ['the recipe', JSON.parse(read('recipes/both-sides-rope.json')).template.phases]
  ]) {
    it(`${label}: both votes keep the scale's order, the second compares with the first`, () => {
      expect(phases.stance1.chartOrder).toBe('choices');
      expect(phases.stance2.chartOrder).toBe('choices');
      expect(phases.stance2.compareTo).toBe('stance1');
      expect(phases.stance1.choices).toEqual(SCALE);
      expect(phases.stance2.choices).toEqual(SCALE);
    });
    it(`${label}: the class sees where it starts before building the rope`, () => {
      expect(phases.stance1.next).toBe('start');
      expect(phases.start.type).toBe('reveal');
      expect(phases.start.template).toContain('{{stance1.barChart}}');
      expect(phases.start.next).toBe('evidence');
      expect(phases.start.timer).toBeUndefined();
    });
    it(`${label}: the ending is one paired chart and a moved line`, () => {
      expect(phases.delta.template).toContain('{{stance2.beforeAfter}}');
      expect(phases.delta.template).toContain('{{stance2.movedLine}}');
      expect(phases.delta.template).not.toContain('{{stance1.barChart}}');
      expect(phases.delta.template).toContain("Changed your mind? That's not losing, that's thinking.");
    });
  }
});

describe('the paired chart on the screens', () => {
  it('chart-render parses a paired line and builds the five-column chart', () => {
    const src = read('screens/shared/chart-render.js');
    expect(src).toContain('var PAIR_LINE = /^(.*?)\\s*([█░]+)\\s*(\\d+)\\s*→\\s*([█░]+)\\s*(\\d+)\\s*$/;');
    expect(src).toContain("segments.push({ type: 'pair', rows: [prow] })");
    expect(src).toContain('buildPairChart: buildPairChart');
    expect(src).toContain("wrap.className = 'msg-chart is-pair'");
    expect(src).toContain("t('Before'), '', t('After')");
  });
  it('the projector and the student screen draw a pair segment', () => {
    expect(read('screens/host/host.js')).toContain("} else if (seg.type === 'pair') {");
    expect(read('screens/player/player.js')).toContain("} else if (seg.type === 'pair') {");
    expect(read('screens/host/styles.css')).toContain('.msg-chart.is-pair { grid-template-columns: fit-content(30%) 1fr auto 1fr auto;');
    expect(read('screens/player/styles.css')).toContain('.msg-chart.is-pair { grid-template-columns: fit-content(30%) 1fr auto 1fr auto;');
  });
  it('every language table names Before, After, and the moved lines', () => {
    for (const lang of Object.keys(STRINGS)) {
      for (const key of ['Before', 'After', '{moved} of {total} students changed their minds.', 'Nobody changed their mind.']) {
        expect(STRINGS[lang], lang + ' ' + key).toHaveProperty(key);
      }
    }
  });
});

describe('the projector count follows a late joiner', () => {
  it('a fresh join during an answer step re-sends the counter', () => {
    expect(EVENTS.SUBMISSION_COUNT).toBe('submission-count');
    const server = read('server.js');
    const seat = server.indexOf('seatLateJoiner(socket, code, room);');
    const emit = server.indexOf('io.to(hostNow).emit(EVENTS.SUBMISSION_COUNT, countPayload)', seat);
    expect(emit).toBeGreaterThan(seat);
    expect(emit - seat).toBeLessThan(1200);
    expect(read('screens/host/host.js')).toContain("socket.on('submission-count', ({ count, total }) => {");
  });
});

describe('the make page puts the words into the class\'s language, on request', () => {
  it('a World languages class with a table gets one row of chips, As written / In French', () => {
    const make = read('screens/make/make.js');
    expect(make).toContain("var words = rowEl(\"Words on the students' screens\");");
    expect(make).toContain("var CLASS_LANGUAGES = { Spanish: 'es', French: 'fr', German: 'de', Portuguese: 'pt', Italian: 'it' };");
    expect(make).toContain("chipButton('In ' + classLang.name, state.language === classLang.code)");
  });
  it('every door goes through the translate route when a language is picked, and a picked language counts as a change', () => {
    const make = read('screens/make/make.js');
    expect(make).toContain("return inClassLanguage(config).then(function (ready) { return saveReady(ready, dest); });");
    expect(make).toContain("fetch('/api/games/translate', {");
    expect(make).toContain('if (!changed && !withAi && !state.language) {');
  });
  it('the route translates every word and pins the language', () => {
    const server = read('server.js');
    expect(server).toContain("app.post('/api/games/translate', async (req, res) => {");
    expect(server).toContain('const translated = await aiService.translateActivityText({ config, language });');
    expect(server).toContain('translated.language = language;');
  });
});

describe('small things from the round', () => {
  it('the active section keeps a strip clear under the corner chip', () => {
    expect(read('screens/host/styles.css')).toContain('body.in-activity { padding-bottom: 112px; }');
  });
  it('a dead make link offers the way back to the yard', () => {
    const make = read('screens/make/make.js');
    expect(make).toContain("back.href = '/#yard';");
    expect(make).toContain("back.textContent = 'Back to the yard';");
  });
});
