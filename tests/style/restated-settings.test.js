/**
 * No sentence restates a setting (docs/ARCHITECTURE-REVIEW-2026-10.md, cause 1).
 *
 * A recipe lets a teacher change a timer, a list, a count; the make page edits
 * scales, choices, and timers in place. A sentence that says "90 seconds" or
 * "three scales" keeps the old number after that. This sweep fails on every
 * recipe and plain activity string that states a number one of its own
 * settings controls. Write the sentence so it reads the setting
 * ("${timer} seconds") or does not state it ("fill in every scale").
 *
 * Recipe-born built-ins (a `recipe` stamp) are compiled from their recipe, so
 * the recipe is the one place to fix. A retired recipe is kept only for old
 * copies. A string in ALLOWED is a coincidence a human read: the number is
 * not the setting's, and the reason says why.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { numbersIn, scanConfig, stepSettings } from '../../engine/restated-settings.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** file + path → why the number is not the setting's. Read before adding. */
const ALLOWED = {
  'recipes/choice-draft.json .parameters.groupCount.helper':
    'a worked example of uneven groups ("three here and four there"); the counts are the example\'s, not groupSize or the choices',
  'recipes/story-builder.json .parameters.writeTime.helper':
    'the five writing rounds are the template\'s fixed chain (start, three passes, ending); storiesRead happens to default to 5',
  'recipes/story-builder.json .template.phases.end.message':
    'the five authors are the template\'s fixed chain (start, three passes, ending); storiesRead happens to default to 5'
};

function readJson(rel) { return JSON.parse(readFileSync(join(root, rel), 'utf8')); }

function sweep() {
  const files = [];
  for (const f of readdirSync(join(root, 'recipes'))) if (f.endsWith('.json')) files.push(`recipes/${f}`);
  for (const d of readdirSync(join(root, 'games'))) {
    if (d.startsWith('_')) continue;
    if (existsSync(join(root, 'games', d, 'config.json'))) files.push(`games/${d}/config.json`);
  }
  const offenses = [];
  const seenAllowed = new Set();
  for (const rel of files) {
    const json = readJson(rel);
    if (json.retired) continue;
    if (rel.startsWith('games/') && json.recipe) continue;
    const name = rel.replace(/\/config\.json$/, '');
    for (const o of scanConfig(json)) {
      const key = `${name} ${o.path}`;
      if (ALLOWED[key]) { seenAllowed.add(key); continue; }
      offenses.push(`${key}: "${o.found}" (${o.n}) restates ${o.hits.join(', ')}`);
    }
  }
  return { offenses, unusedAllowed: Object.keys(ALLOWED).filter(k => !seenAllowed.has(k)) };
}

describe('numbersIn reads a sentence the way a student would', () => {
  it('finds digits and number words', () => {
    expect(numbersIn('Pick three. Then 20 more.').map(f => f.n)).toEqual([3, 20]);
  });
  it('converts time phrases to seconds and marks the unit', () => {
    expect(numbersIn('two minutes to write')).toEqual([{ n: 120, unit: 's', at: 'two minutes' }]);
    expect(numbersIn('90 seconds each').map(f => [f.n, f.unit])).toEqual([[90, 's']]);
    expect(numbersIn('half a minute').map(f => f.n)).toEqual([30]);
    expect(numbersIn('a minute and a half').map(f => f.n)).toEqual([90]);
  });
  it('skips the idioms: one, a minute, or two', () => {
    expect(numbersIn('One thing. Take a minute. Answer in a sentence or two.')).toEqual([]);
  });
  it('skips ordinals, list markers, ranges, percentages, and template tokens', () => {
    const found = numbersIn('Round 2: go. Fact 4: only you. 4) Avoid it. 10-25 words. 1–5 scales. 60% pass. {{players.count}} of 3 ${timer}');
    expect(found.map(f => [f.n, f.unit])).toEqual([[3, null]]);
    expect(found[0].at).toContain('of 3');
  });
});

describe('stepSettings', () => {
  it('reads every number and list on a plain step', () => {
    const s = stepSettings({ type: 'collect', timer: 90, fields: [{}, {}], prompt: 'x' });
    expect(s).toEqual([
      { key: 'timer', n: 90, time: true },
      { key: 'fields.length', n: 2, list: true }
    ]);
  });
  it('in a recipe reads only parameter-bound fields, fixed timers for time phrases', () => {
    const params = { t: { type: 'integer', default: 45 }, qs: { type: 'array', default: ['a', 'b', 'c'] } };
    const s = stepSettings({ type: 'collect', timer: '${t}', groupSize: 4, fields: { $map: 'qs', value: {} } }, params, { recipe: true });
    expect(s).toEqual([
      { key: 'timer=${t}', n: 45, time: true, param: 't' },
      { key: 'fields.length=$map qs', n: 3, list: true, param: 'qs' }
    ]);
    expect(stepSettings({ type: 'announce', timer: 60 }, params, { recipe: true })).toEqual([
      { key: 'timer', n: 60, time: true, timeOnly: true }
    ]);
  });
});

describe('scanConfig', () => {
  it('flags a plain activity whose prompt restates its own timer', () => {
    const o = scanConfig({ phases: { ask: { type: 'collect', timer: 20, prompt: 'Go wild. 20 seconds GO!' } } });
    expect(o).toEqual([{ path: '.phases.ask.prompt', found: '20 seconds', n: 20, hits: ['step timer', 'timer timer'] }]);
  });
  it('flags a time phrase against another step\'s timer, a bare number only against its own step', () => {
    const cfg = { phases: {
      intro: { type: 'announce', message: 'You have two minutes. Write four facts.', next: 'write' },
      write: { type: 'collect', timer: 120, fields: [{}, {}, {}, {}], prompt: 'Your four facts.' }
    } };
    expect(scanConfig(cfg).map(o => `${o.path} ${o.n} ${o.hits.join(',')}`)).toEqual([
      '.phases.intro.message 120 timer timer',
      '.phases.write.prompt 4 step fields.length'
    ]);
  });
  it('flags a recipe parameter\'s default anywhere but in its own helper', () => {
    const recipe = {
      parameters: {
        drawTimer: { type: 'integer', default: 90, label: 'Drawing time', helper: '90 is plenty.' },
        scales: { type: 'array', default: ['a', 'b', 'c'], helper: 'Three is the usual.' }
      },
      template: { phases: {
        draw: { type: 'collect', timer: '${drawTimer}', prompt: 'Sketch it in ninety seconds.' },
        fix: { type: 'collect', timer: '${drawTimer}', prompt: 'Sketch it in ${drawTimer} seconds.' },
        rate: { type: 'rate', scales: '${scales}', prompt: 'Fill in all three scales.' }
      } }
    };
    expect(scanConfig(recipe).map(o => `${o.path} ${o.n} ${o.hits.join(',')}`)).toEqual([
      '.template.phases.draw.prompt 90 param drawTimer,step timer=${drawTimer},timer timer=${drawTimer}',
      '.template.phases.rate.prompt 3 param scales,list scales.length=${scales},step scales.length=${scales}'
    ]);
  });
  it('a fixed list in a recipe template counts (the make page edits scales in place)', () => {
    const recipe = {
      description: 'Rate on three custom scales.',
      parameters: { topic: { type: 'string' } },
      template: { phases: { rate: { type: 'rate', scales: [{}, {}, {}], timer: 60, prompt: '${topic}' } } }
    };
    expect(scanConfig(recipe).map(o => o.hits)).toEqual([['list scales.length']]);
  });
});

describe('every recipe and plain activity', () => {
  const { offenses, unusedAllowed } = sweep();
  it('states no number a setting controls', () => {
    expect(offenses).toEqual([]);
  });
  it('keeps ALLOWED to strings that still exist', () => {
    expect(unusedAllowed).toEqual([]);
  });
});
