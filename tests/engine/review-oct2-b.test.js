/**
 * A reviewer's findings on the make page, the recipe forms, and the
 * designer (2026-10-02): raw validator text in front of teachers, a quiz
 * whose ✓ could be dropped, a scale x that did nothing, Min players above
 * Max players, limits said only after they were broken, examples that
 * looked filled in, raw choice values, fields shown for the wrong choice,
 * and Estimation Station's negative and twenty-digit numbers.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { compileRecipe } from '../../engine/recipe-compiler.js';
import { validate, validatePlayerLimits } from '../../engine/game-loader.js';
import { teacherFacingError } from '../../engine/teacher-error.js';
import { STRINGS } from '../../engine/i18n/index.js';
import '../../screens/shared/recipe-form-help.js';

const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const json = (p) => JSON.parse(read(p));
const H = globalThis.RecipeFormHelp;

const estimation = json('recipes/estimation-station.json');
const challenge = (answer) => ({ questions: [{ prompt: 'How many?', answer, unit: 'grains' }] });
const errorsOf = (recipe, params) => compileRecipe(recipe, params).diagnostics.filter(d => d.severity === 'error').map(d => d.message);

describe('a recipe form error is in a teacher\'s words', () => {
  it('a typed "7,000" is the number 7000', () => {
    const { config } = compileRecipe(estimation, challenge('7,000'));
    expect(config.phases.q1.answer).toBe(7000);
  });
  it('a word where a number goes names the field and where it sits', () => {
    const [msg] = errorsOf(estimation, challenge('lots'));
    expect(msg).toBe('"The real number" in item 1 of "Estimation challenges" needs a whole number, like 12.');
    expect(msg).not.toMatch(/Parameter|questions\[0\]|integer|got string/);
  });
  it('a negative count is refused, the recipe says zero or more', () => {
    expect(errorsOf(estimation, challenge(-7000))[0]).toMatch(/"The real number" in item 1 of "Estimation challenges" must be at least 0\./);
  });
  it('a twenty-digit number is refused, never rounded', () => {
    const msgs = errorsOf(estimation, challenge('100000000000000000000'));
    expect(msgs[0]).toMatch(/too big a number/);
  });
  it('a top-level range error uses the label', () => {
    const elim = json('recipes/elimination-tournament.json');
    const msgs = errorsOf(elim, { prompt: 'Best snack?', rounds: 1 });
    expect(msgs).toContain('"Most rounds" must be at least 2.');
  });
  it('the compile route\'s heading is plain too', () => {
    const server = read('server.js');
    expect(server).not.toContain("'Recipe parameters did not validate.'");
    expect(server).not.toContain('(recipe-author bug)');
    expect(server).not.toContain("'The example did not fit the recipe: ' + JSON.stringify");
  });
});

describe('Estimation Station counts from zero', () => {
  it('every estimate step of the built-in takes no guess below 0', () => {
    const config = json('games/estimation-station/config.json');
    const steps = Object.values(config.phases).filter(p => p.type === 'estimate');
    expect(steps.length).toBeGreaterThan(0);
    for (const s of steps) expect(s.min).toBe(0);
  });
  it('a guess past fifteen digits is said on the student screen and refused by the server', () => {
    const player = read('screens/player/player.js');
    expect(player).toContain('var ESTIMATE_MAX_GUESS = 999999999999999;');
    expect(player).toContain("UiLang.t('That number is too long. Use 15 digits or fewer.')");
    const server = read('server.js');
    expect(server).toContain('if (Math.abs(value) > Number.MAX_SAFE_INTEGER) return;');
    for (const lang of Object.keys(STRINGS)) {
      expect(STRINGS[lang]['That number is too long. Use 15 digits or fewer.'], lang).toBeTruthy();
    }
  });
});

describe('a save error never shows the copy\'s id', () => {
  it('the match step\'s repeat reads as a sentence about the step', () => {
    const raw = 'Game "vocab-match-my-version-28tzeh": phase "round1" (match) has "enzyme" on the left side twice. Change one so no two are the same.';
    const out = teacherFacingError(raw);
    expect(out).toBe('Step "round1" has "enzyme" on the left side twice. Change one so no two are the same.');
    expect(out).not.toMatch(/vocab-match|\(match\)|Game "/);
  });
  it('a game-level line keeps its sense', () => {
    expect(teacherFacingError('Game "x-1" is missing required field: name')).toBe('This activity is missing required field: name');
  });
  it('the save routes send it', () => {
    const server = read('server.js');
    expect(server.match(/teacherFacingError\(error\.message\)/g).length).toBeGreaterThanOrEqual(3);
  });
  it('the make page catches a repeated pair before saving', () => {
    const js = read('screens/make/make.js');
    expect(js).toContain('function pairsProblem()');
    const go = js.slice(js.indexOf('function go(dest)'));
    expect(go.indexOf('var pairsLine = pairsProblem();')).toBeGreaterThan(-1);
    expect(go.indexOf('var pairsLine = pairsProblem();')).toBeLessThan(go.indexOf('HostLaunch.begin()'));
  });
});

describe('the quiz panel', () => {
  const miy = read('screens/shared/make-it-yours.js');
  it('the ✓ choice has no ✕ until another choice is marked', () => {
    expect(miy).toContain('if (q.choices.length > 2 && !isCorrect) {');
  });
  it('each question card says what it still needs', () => {
    expect(miy).toContain('function refreshProblems()');
    expect(miy).toContain("problem.className = 'quiz-problem';");
  });
  it('the screen above follows the questions that are ready', () => {
    expect(miy).toContain('var cleaned = cleanedList().filter(function (q) { return SetupKnobs.validateQuizList([q]).length === 0; });');
  });
  it('a blocked Try it says why under the buttons, with a way down to it', () => {
    const js = read('screens/make/make.js');
    expect(js).toContain('if (result === false) { clearOpening(); panelProblem(); return; }');
    expect(js).toContain("show.textContent = 'Show me';");
    expect(miy).toContain('var api = { makeCopy: makeCopy, problem: function () { return lastProblem; }, showProblem: showProblem };');
  });
});

describe('the last scale has no x', () => {
  it('both scale lists hide the x when one is left', () => {
    const js = read('screens/make/make.js');
    expect(js).toContain('function syncScaleDrops(boxes) {');
    expect(js.match(/syncScaleDrops\(boxes\);/g).length).toBeGreaterThanOrEqual(4);
    expect(read('screens/make/styles.css')).toContain('.print-scale-x[hidden], .pair-x[hidden] { display: none; }');
  });
});

describe('Min players never above Max players', () => {
  const base = { name: 'T', phases: { lobby: { type: 'lobby', next: 'end' }, end: { type: 'end' } } };
  it('the validator refuses 10 over 3', () => {
    expect(validatePlayerLimits({ minPlayers: 10, maxPlayers: 3 }, 'g')[0]).toMatch(/Min players \(10\) is more than Max players \(3\)/);
    expect(() => validate({ ...base, minPlayers: 10, maxPlayers: 3 }, 'g')).toThrow(/Min players/);
  });
  it('blank, one side, or in order is fine', () => {
    expect(validatePlayerLimits({ minPlayers: null, maxPlayers: 3 }, 'g')).toEqual([]);
    expect(validatePlayerLimits({ minPlayers: 2 }, 'g')).toEqual([]);
    expect(validatePlayerLimits({ minPlayers: 3, maxPlayers: 3 }, 'g')).toEqual([]);
  });
  it('the editor mirrors it', () => {
    expect(read('screens/designer/editor.js')).toContain("gameConfig.minPlayers > gameConfig.maxPlayers");
  });
});

describe('the recipe form helps before it refuses', () => {
  const elim = json('recipes/elimination-tournament.json');
  const draft = json('recipes/choice-draft.json');
  it('limits are said on the field', () => {
    expect(H.limitHint(elim.parameters.rounds)).toBe('From 2 to 12.');
    expect(H.limitHint(elim.parameters.elimPercent)).toBe('From 10 to 60.');
    expect(H.limitHint(draft.parameters.choices)).toBe('2 to 8 of them.');
    expect(H.limitHint(estimation.parameters.questions.item.fields.answer)).toBe('Zero or more.');
    expect(H.limitHint({ type: 'string' })).toBe('');
  });
  it('an example reads as an example', () => {
    expect(H.hintPlaceholder('1247')).toBe('e.g. 1247');
    expect(H.hintPlaceholder('e.g. fractions')).toBe('e.g. fractions');
    expect(H.hintPlaceholder('')).toBe('');
  });
  it('choices show their words, never their values', () => {
    expect(H.enumLabel(draft.parameters.groups, 'size')).toBe('Groups of a size');
    expect(H.enumLabel(draft.parameters.method, 'teacher')).toBe('I arrange them');
    expect(H.enumLabel({ values: ['most-votes'] }, 'most-votes')).toBe('Most votes');
  });
  it('a field hides behind the choice it belongs to', () => {
    expect(H.fieldVisible(draft.parameters.groupSize, { groups: 'size' })).toBe(true);
    expect(H.fieldVisible(draft.parameters.groupSize, { groups: 'count' })).toBe(false);
    expect(H.fieldVisible(draft.parameters.groupCount, { groups: 'count' })).toBe(true);
    expect(H.fieldVisible(draft.parameters.question, { groups: 'none' })).toBe(true);
  });
  it('a typed number is read the way a teacher writes it', () => {
    expect(H.readWholeNumber('7,000')).toEqual({ value: 7000 });
    expect(H.readWholeNumber('')).toEqual({ value: null });
    expect(H.readWholeNumber('3.5').problem).toMatch(/whole number/);
    expect(H.readWholeNumber('100000000000000000000').problem).toMatch(/15 digits/);
  });
  it('the Create page uses them', () => {
    const js = read('screens/designer/designer.js');
    expect(js).toContain('RecipeFormHelp.enumLabel(spec, spec.values[i])');
    expect(js).toContain('function applyShowWhen(form, recipe)');
    expect(js).toContain('RecipeFormHelp.limitHint(spec)');
    expect(js).toContain("if (field.hidden) continue;");
    expect(js).not.toContain("heading.textContent = data.error || 'Please fix these issues:';");
    const html = read('screens/designer/index.html');
    expect(html.indexOf('/shared/recipe-form-help.js')).toBeGreaterThan(-1);
    expect(html.indexOf('/shared/recipe-form-help.js')).toBeLessThan(html.indexOf('src="designer.js"'));
    expect(read('screens/designer/styles.css')).toContain('.recipe-field-input::placeholder');
  });
});
