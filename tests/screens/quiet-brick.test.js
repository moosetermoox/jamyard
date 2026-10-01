/**
 * The quiet brick (2026-10-01, the mechanics inventory's Part 3): silent
 * thinking with a clock and nothing to type, compiled to a timed announce
 * (both screens count down, the step moves on by itself) plus an optional
 * host-paced talk line. A timed announce now keeps its deadline so a
 * screen that comes back mid-step gets the time left.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import '../../screens/shared/step-suggestions.js';
import { validate } from '../../engine/game-loader.js';
import { STORYBOARD_BRICKS, validateSuggestions } from '../../engine/suggest-validate.js';

const S = globalThis.StepSuggestions;
const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const compile = (steps, extra) => S.compileStoryboard(Object.assign({ name: 'T', steps }, extra || {}));

function ordered(config) {
  const out = [];
  let id = 'lobby';
  const seen = new Set();
  while (id && config.phases[id] && !seen.has(id)) {
    seen.add(id);
    out.push([id, config.phases[id]]);
    id = config.phases[id].next;
  }
  return out;
}
function errorsOf(phases) {
  const result = validate({ name: 'Quiet test', description: 'quiet brick', phases }, 'quiet-test', { returnResults: true });
  return result.errors.map(e => (typeof e === 'string' ? e : e.message));
}

describe('quiet brick: compile', () => {
  it('a timed announce, two minutes by default, nothing to type', () => {
    const { config, problems } = compile([{ brick: 'quiet', text: 'Think about it.' }, { brick: 'end', text: 'Bye' }]);
    expect(problems).toEqual([]);
    const steps = ordered(config);
    expect(steps.map(([, p]) => p.type)).toEqual(['lobby', 'announce', 'end']);
    expect(steps[1][1]).toEqual({ type: 'announce', message: 'Think about it.', timer: 120, next: steps[2][0] });
    expect(errorsOf(config.phases)).toEqual([]);
  });

  it('a talk line follows as a host-paced card', () => {
    const { config } = compile([{ brick: 'quiet', text: 'Think.', timer: 90, talk: 'Turn and talk.' }, { brick: 'end', text: 'Bye' }]);
    const steps = ordered(config);
    expect(steps.map(([, p]) => p.type)).toEqual(['lobby', 'announce', 'announce', 'end']);
    expect(steps[1][1].timer).toBe(90);
    expect(steps[2][1].message).toBe('Turn and talk.');
    expect(steps[2][1].timer).toBeUndefined();
  });

  it('clamps the clock to 10 seconds through 15 minutes and says so', () => {
    const { config, problems } = compile([{ brick: 'quiet', text: 'Think.', timer: 3600 }, { brick: 'end', text: 'Bye' }]);
    expect(ordered(config)[1][1].timer).toBe(900);
    expect(problems.join(' ')).toMatch(/10 seconds to 15 minutes/);
  });

  it('needs words to think about', () => {
    const { problems } = compile([{ brick: 'quiet', text: '  ' }, { brick: 'end', text: 'Bye' }]);
    expect(problems.join(' ')).toMatch(/quiet time needs "text"/);
  });
});

describe('quiet brick: wiring', () => {
  it('the validator knows the brick and passes the talk line', () => {
    expect(STORYBOARD_BRICKS).toContain('quiet');
    const { suggestions } = validateSuggestions([{ kind: 'storyboard', storyboard: { name: 'X', steps: [
      { brick: 'quiet', text: 'Think.', timer: 60, talk: 'Talk.' }, { brick: 'end', text: 'Bye' }
    ] } }], { gameIds: [], recipes: {} });
    expect(suggestions[0].storyboard.steps[0]).toMatchObject({ brick: 'quiet', timer: 60, talk: 'Talk.' });
  });

  it('the storyboard and concierge prompts name it, and the rule sends silent thinking to it', () => {
    const src = read('services/ai-service.js');
    expect(src).toMatch(/- quiet: quiet time\. A stretch of silent thinking/);
    expect(src).toMatch(/SILENT THINKING .* is ONE quiet step/);
    expect(src).toMatch(/quiet \(silent thinking time with a clock and nothing to type/);
    expect(src).toMatch(/silent thinking time is quiet[,.]/);
  });

  it('the plan dialog shows the talk line, and the step has a name', () => {
    expect(read('screens/designer/designer.js')).toMatch(/added after the quiet: /);
    expect(read('screens/shared/phase-names.js')).toMatch(/'quiet': 'Quiet time'/);
  });

  it('a timed announce keeps its deadline and a returning screen gets the time left', () => {
    const src = read('engine/phase-handlers/announce.js');
    expect(src).toMatch(/phaseState\.timerEndsAt = Date\.now\(\) \+ ctx\.phase\.timer \* 1000/);
    expect(src).not.toMatch(/timer: null/);
    expect(src.match(/timer: secondsLeft\(ctx\.room\)/g)).toHaveLength(2);
  });
});
