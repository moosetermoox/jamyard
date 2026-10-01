/**
 * The peer-feedback brick (2026-10-01, the mechanics inventory's Part 3):
 * a draft, one or two classmates who each read the DRAFT and write in
 * their own box, and a private return to the writer with every comment.
 * The second reader rotates through the first reader's reply (so the
 * chain comes home) with `showOriginal` (so they see the draft, never the
 * first comment). The storyboard, concierge, and matcher prompts name it;
 * the validator passes its fields; the plan dialog shows what is added.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import '../../screens/shared/step-suggestions.js';
import { validate } from '../../engine/game-loader.js';
import { STORYBOARD_BRICKS, validateSuggestions } from '../../engine/suggest-validate.js';
import { chainOriginText } from '../../engine/phase-handlers/collect.js';
import { buildChainViews, formatChainContent } from '../../engine/phases/chain-reveal.js';

const S = globalThis.StepSuggestions;
const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const compile = (steps) => S.compileStoryboard({ name: 'T', steps });

function errorsOf(phases) {
  const result = validate({ name: 'Feedback test', description: 'feedback brick', phases }, 'feedback-test', { returnResults: true });
  return result.errors.map(e => (typeof e === 'string' ? e : e.message));
}
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

describe('feedback brick: compile', () => {
  it('one reader: a draft, a feedback step that shows it, and the return', () => {
    const { config, problems } = compile([
      { brick: 'feedback', draft: 'Write your thesis.', text: 'Write one strength and one question.' },
      { brick: 'end', text: 'Bye' }
    ]);
    expect(problems).toEqual([]);
    const steps = ordered(config);
    expect(steps.map(([, p]) => p.type)).toEqual(['lobby', 'collect', 'collect', 'reveal', 'end']);
    const [draftId, draft] = steps[1];
    const [fbId, fb] = steps[2];
    const reveal = steps[3][1];
    expect(draft.prompt).toBe('Write your thesis.');
    expect(fb.rotateFrom).toBe(draftId);
    expect(fb.prompt).toContain('{{' + draftId + '.assigned}}');
    expect(fb.showOriginal).toBeUndefined();
    expect(fb.prefillFromAssigned).toBeUndefined();
    expect(reveal).toMatchObject({ scope: 'own', chainFrom: [draftId, fbId], chainDisplay: 'steps', chainHeading: 'You wrote:', chainGrewHeading: 'What a classmate said:' });
    expect(errorsOf(config.phases)).toEqual([]);
  });

  it('two readers: the second rotates through the first reply and shows the draft', () => {
    const { config, problems } = compile([
      { brick: 'collect', text: 'Write a paragraph on the Dust Bowl.' },
      { brick: 'feedback', text: 'One glow and one grow.', readers: 2, timer: 120 },
      { brick: 'end', text: 'Bye' }
    ]);
    expect(problems).toEqual([]);
    const steps = ordered(config);
    expect(steps.map(([, p]) => p.type)).toEqual(['lobby', 'collect', 'collect', 'collect', 'reveal', 'end']);
    const [draftId] = steps[1];
    const [fb1Id, fb1] = steps[2];
    const [fb2Id, fb2] = steps[3];
    expect(fb1.rotateFrom).toBe(draftId);
    expect(fb2.rotateFrom).toBe(fb1Id);
    expect(fb2.showOriginal).toBe(true);
    expect(fb2.prompt).toContain('{{' + fb1Id + '.assigned}}');
    expect(fb1.timer).toBe(120);
    expect(fb2.timer).toBe(120);
    expect(steps[4][1].chainFrom).toEqual([draftId, fb1Id, fb2Id]);
    expect(steps[4][1].chainGrewHeading).toBe('What your classmates said:');
    expect(errorsOf(config.phases)).toEqual([]);
  });

  it('with no draft and no question before it, says what it needs', () => {
    const { problems } = compile([
      { brick: 'feedback', text: 'Write one strength.' },
      { brick: 'end', text: 'Bye' }
    ]);
    expect(problems.join(' ')).toMatch(/needs a piece to read/);
  });

  it('skips a drawing or a hand-off when it looks for the piece', () => {
    const { config } = compile([
      { brick: 'collect', text: 'Your claim.' },
      { brick: 'chain', start: 'Start a story.', hops: ['Add a line.'] },
      { brick: 'feedback', text: 'One strength.' },
      { brick: 'end', text: 'Bye' }
    ]);
    const fb = ordered(config).find(([, p]) => p.type === 'collect' && /One strength/.test(p.prompt))[1];
    expect(config.phases[fb.rotateFrom].prompt).toBe('Your claim.');
  });

  it('drops a token the AI wrote into the instruction and caps readers at two', () => {
    const { config, problems } = compile([
      { brick: 'feedback', draft: 'Write.', text: 'Read {{draft.assigned}} and comment.', readers: 3 },
      { brick: 'end', text: 'Bye' }
    ]);
    expect(problems.join(' ')).toMatch(/one or two readers/);
    const fbs = ordered(config).filter(([, p]) => p.rotateFrom);
    expect(fbs).toHaveLength(2);
    expect(fbs[0][1].prompt.startsWith('Read and comment.')).toBe(true);
  });
});

describe('showOriginal: the engine', () => {
  const engine = {
    config: { phases: {
      draft: { type: 'collect' },
      fb1: { type: 'collect', rotateFrom: 'draft' },
      fb2: { type: 'collect', rotateFrom: 'fb1', showOriginal: true }
    } },
    phaseData: {
      // fb1's writers got: a <- c, b <- a, c <- b
      draft: { byPlayer: { a: 'A draft', b: 'B draft', c: 'C draft' }, assignedFrom: { a: 'c', b: 'a', c: 'b' } },
      fb1: { byPlayer: { a: 'a on C', b: 'b on A', c: 'c on B' } }
    }
  };

  it('walks a reply back to the draft it was about', () => {
    expect(chainOriginText(engine, 'fb1', 'a')).toBe('C draft');
    expect(chainOriginText(engine, 'fb1', 'b')).toBe('A draft');
  });

  it('a step that is not a hand-off is its own first piece', () => {
    expect(chainOriginText(engine, 'draft', 'b')).toBe('B draft');
  });

  it('a missing link answers nothing, never the reply', () => {
    expect(chainOriginText(engine, 'fb1', 'zed')).toBeUndefined();
  });

  it('the return walk still brings both comments home', () => {
    const datas = [
      engine.phaseData.draft,
      { ...engine.phaseData.fb1, assignedFrom: { a: 'c', b: 'a', c: 'b' } },
      { byPlayer: { a: 'a 2nd on B', b: 'b 2nd on C', c: 'c 2nd on A' } }
    ];
    const views = buildChainViews(datas);
    // A's draft went to b (fb1), b's reply went to c (fb2), who read A's draft
    expect(views.get('a').steps).toEqual(['b on A', 'c 2nd on A']);
    const text = formatChainContent(views.get('a'), { display: 'steps', heading: 'You wrote:', grewHeading: 'What your classmates said:' });
    expect(text).toContain('You wrote:');
    expect(text).toContain('What your classmates said:');
    expect(text).not.toContain('hand to hand');
  });

  it('the validator refuses showOriginal without a hand-off or with a prefilled box', () => {
    const base = { lobby: { type: 'lobby', next: 'draft' }, draft: { type: 'collect', prompt: 'Write.', next: 'fb' } };
    const noRotate = errorsOf({ ...base, fb: { type: 'collect', prompt: 'Comment.', showOriginal: true, next: 'end' }, end: { type: 'end' } });
    expect(noRotate.join(' ')).toMatch(/showOriginal" but not "rotateFrom"/);
    const prefilled = errorsOf({ ...base, fb: { type: 'collect', prompt: 'Comment.', rotateFrom: 'draft', showOriginal: true, prefillFromAssigned: true, next: 'end' }, end: { type: 'end' } });
    expect(prefilled.join(' ')).toMatch(/both "showOriginal" and "prefillFromAssigned"/);
  });
});

describe('feedback brick: wiring', () => {
  it('the validator knows the brick and passes draft and readers', () => {
    expect(STORYBOARD_BRICKS).toContain('feedback');
    const { suggestions } = validateSuggestions([{ kind: 'storyboard', storyboard: { name: 'X', steps: [
      { brick: 'feedback', draft: 'Write.', text: 'Comment.', readers: 2 }, { brick: 'end', text: 'Bye' }
    ] } }], { gameIds: [], recipes: {} });
    expect(suggestions[0].storyboard.steps[0]).toMatchObject({ brick: 'feedback', draft: 'Write.', readers: 2 });
  });

  it('the storyboard, concierge, and matcher prompts name it', () => {
    const src = read('services/ai-service.js');
    expect(src).toMatch(/- feedback: peer feedback on each student's own piece/);
    expect(src).toMatch(/is ONE feedback step: draft = /);
    expect(src).toMatch(/feedback \(peer feedback: "draft"/);
    expect(src).toMatch(/has a peer feedback step that goes to one or two classmates/);
    expect(src).toMatch(/"showOriginal": true/);
  });

  it('the plan dialog says what comes with it, and the step has a name', () => {
    const designer = read('screens/designer/designer.js');
    expect(designer).toMatch(/step\.brick === 'feedback'/);
    expect(designer).toMatch(/comes back to its writer/);
    expect(read('screens/shared/phase-names.js')).toMatch(/'feedback': 'Peer feedback'/);
  });

  it('the editor mirrors the rule and keeps the field top-level only', () => {
    const editor = read('screens/designer/editor.js');
    expect(editor).toMatch(/phase\.showOriginal === true/);
    expect(editor).toMatch(/'showTail', 'showOriginal'\]/);
  });
});
