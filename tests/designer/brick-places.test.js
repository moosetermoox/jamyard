/**
 * A brick's places, swept (cause 4 of docs/ARCHITECTURE-REVIEW-2026-10.md,
 * eighth pass, 2026-10-03). CLAUDE.md's rule: "a new brick goes in the
 * same five places plus a golden prompt": the validator's pass-through,
 * the compiler's append function, the matcher's brick list, the storyboard
 * prompt's brick docs, and a display name for the plan dialog's rows. The
 * bricks are read off the compiler; each place is checked for each.
 *
 * First run: eight bricks (chain, deal, pairs, roles, draw, summarize,
 * review, bracket) had no display name, so the plan dialog showed the raw
 * id as the step's label.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { STORYBOARD_BRICKS } from '../../engine/suggest-validate.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const compiler = read('screens/shared/step-suggestions.js');
const aiService = read('services/ai-service.js');
const phaseNames = read('screens/shared/phase-names.js');
const golden = JSON.parse(read('tests/designer/golden-prompts.json'));

// The bricks the compiler accepts: every `brick === '<name>'` in the
// compile loop, plus the end brick it always closes with
const BRICKS = [...new Set([...compiler.matchAll(/brick === '([a-z-]+)'/g)].map(m => m[1]).concat('end'))].sort();

// The matcher's "Bricks allowed" paragraph
const matcherList = aiService.slice(aiService.indexOf('"kind":"storyboard"'), aiService.indexOf('HARD RULES:'));
// The storyboard prompt's one-line docs, "- brick: ..."
const docLines = new Set([...aiService.matchAll(/^- ([a-z-]+):/gm)].map(m => m[1]));
// The display names (PHASE_NAMES keys)
const named = new Set([...phaseNames.matchAll(/^\s+'?([a-z-]+)'?:\s*'/gm)].map(m => m[1]));
// The golden corpus's reference plans
const goldenBricks = new Set();
for (const p of golden.prompts || []) {
  for (const s of (p.expect && p.expect.storyboard && p.expect.storyboard.steps) || []) goldenBricks.add(s.brick);
}

describe('the compiler accepts a sensible set of bricks', () => {
  it('reads at least thirty off the compile loop', () => {
    expect(BRICKS.length).toBeGreaterThan(30);
  });

  it('the validator passes through exactly the bricks the compiler takes (reveal-one rides as a reveal)', () => {
    const validator = [...STORYBOARD_BRICKS].sort();
    const onlyValidator = validator.filter(b => !BRICKS.includes(b));
    const onlyCompiler = BRICKS.filter(b => !validator.includes(b));
    expect(onlyValidator, 'bricks the validator admits that the compiler never builds').toEqual(['reveal-one']);
    expect(onlyCompiler, 'bricks the compiler builds that the validator refuses').toEqual([]);
  });
});

describe('every brick is in every place', () => {
  for (const brick of BRICKS) {
    it(`${brick}`, () => {
      expect(new RegExp(`\\b${brick}\\b`).test(matcherList), `${brick}: the matcher's "Bricks allowed" list never names it`).toBe(true);
      expect(docLines.has(brick), `${brick}: the storyboard prompt has no "- ${brick}:" line`).toBe(true);
      expect(named.has(brick), `${brick}: no display name in screens/shared/phase-names.js, so the plan dialog shows the raw id`).toBe(true);
      expect(goldenBricks.has(brick), `${brick}: no golden prompt's reference plan uses it (tests/designer/golden-prompts.json)`).toBe(true);
    });
  }
});
