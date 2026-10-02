/**
 * A plan built from an idea in Spanish reads in Spanish (2026-10-02): the
 * AI writes its words in the idea's language, and the builder's own lines
 * ("The class picked:", "Round 1:", "You wrote:") follow the plan's
 * `language` through StepSuggestions.localizeCompiled. Every golden
 * storyboard compiles here with its own words swapped for Spanish ones and
 * `language: "es"`; whatever English is left on a student or projector
 * line came from the builder and needs a row in COMPILER_TEXT.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import '../../screens/shared/step-suggestions.js';

const SS = globalThis.StepSuggestions;
const golden = JSON.parse(readFileSync(new URL('./golden-prompts.json', import.meta.url), 'utf8'));
const plans = golden.prompts
  .filter(p => p.expect && p.expect.kind === 'storyboard' && p.expect.storyboard)
  .map(p => ({ id: p.id, storyboard: p.expect.storyboard }));

// The step fields the AI writes as prose
const PROSE = ['text', 'draft', 'start', 'heading', 'voteText', 'talk', 'gallery', 'question'];
const SPANISH = 'Escribe tu idea sobre el tema de hoy';

function spanishPlan(storyboard) {
  const copy = JSON.parse(JSON.stringify(storyboard));
  copy.language = 'es';
  copy.name = 'Actividad';
  for (const step of copy.steps || []) {
    for (const k of PROSE) if (typeof step[k] === 'string' && step[k].trim()) step[k] = SPANISH;
    for (const k of ['hops', 'rounds']) if (Array.isArray(step[k])) step[k] = step[k].map(() => SPANISH);
  }
  return copy;
}

// Every string the plan itself carries (items, choices, pairs the AI wrote)
function planStrings(storyboard) {
  const out = new Set();
  const walk = (v) => {
    if (typeof v === 'string') out.add(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(storyboard.steps);
  return [...out].filter(s => s.length > 3).sort((a, b) => b.length - a.length);
}

const FIELDS = ['message', 'prompt', 'template', 'content', 'question', 'instruction', 'chainHeading', 'chainGrewHeading', 'hostTemplate', 'playerTemplate'];
const ENGLISH = /\b(the|your|you|what|who|is|are|was|and|with|each|one|here|class|round|wins?)\b/i;

function englishLeft(config, storyboard) {
  const own = planStrings(storyboard);
  const hits = [];
  const check = (text, where) => {
    let rest = text.replace(/\{\{[^}]*\}\}/g, ' ');
    for (const s of own) rest = rest.split(s).join(' ').split(s.toUpperCase()).join(' ');
    rest = rest.split(SPANISH).join(' ');
    if (ENGLISH.test(rest)) hits.push(where + ': ' + rest.replace(/\s+/g, ' ').trim().slice(0, 80));
  };
  const walk = (ph, id) => {
    if (!ph || ph.type === 'preview') return; // the teacher's own screen
    if (ph.confidenceFor) return; // translated when the room starts (localizeConfidence)
    for (const f of FIELDS) if (typeof ph[f] === 'string') check(ph[f], id + '.' + f);
    if (Array.isArray(ph.fields)) ph.fields.forEach((fd, i) => fd && typeof fd.label === 'string' && check(fd.label, id + '.fields[' + i + ']'));
    if (ph.subPhases) for (const [k, s] of Object.entries(ph.subPhases)) walk(s, id + '/' + k);
  };
  for (const [id, ph] of Object.entries(config.phases)) walk(ph, id);
  return hits;
}

describe('a Spanish plan reads in Spanish', () => {
  it('has golden plans to check', () => {
    expect(plans.length).toBeGreaterThan(30);
  });

  for (const { id, storyboard } of plans) {
    it(id, () => {
      const plan = spanishPlan(storyboard);
      const { config } = SS.compileStoryboard(plan);
      if (!config) return; // a plan the swap broke says nothing about language
      expect(englishLeft(config, plan)).toEqual([]);
    });
  }

  it('an English plan is left as the builder wrote it', () => {
    const plan = { steps: [{ brick: 'bracket', text: 'Which wins?', items: ['A', 'B', 'C', 'D'] }, { brick: 'end', text: 'Bye' }] };
    const { config } = SS.compileStoryboard(plan);
    expect(JSON.stringify(config)).toContain('Round 1:');
    expect(JSON.stringify(config)).toContain('The winner of the bracket:');
  });

  it('a bracket round header follows the language', () => {
    const plan = { language: 'es', steps: [{ brick: 'bracket', text: '¿Cuál gana?', items: ['A', 'B', 'C', 'D'] }, { brick: 'end', text: 'Fin' }] };
    const { config } = SS.compileStoryboard(plan);
    const text = JSON.stringify(config);
    expect(text).toContain('Ronda 1:');
    expect(text).not.toContain('Round 1:');
    expect(text).toContain('El ganador del torneo:');
  });

  it('the server stamps the plan with the idea\'s language', () => {
    const svc = readFileSync(new URL('../../services/ai-service.js', import.meta.url), 'utf8');
    expect(svc).toContain('return withPlanLanguage(this._parseStoryboard(extractText(message)), description);');
    const designer = readFileSync(new URL('../../screens/designer/designer.js', import.meta.url), 'utf8');
    expect(designer).toContain('language: storyboard.language,');
  });
});
