/**
 * Two outside reviewer rounds (2026-09-26): Idea Chain never handed a chain
 * back, Anonymous Feedback put the teacher's summary on the projector, a
 * long Exit Ticket question was cut off on the student screen and missing
 * from the projector, the announce timer's number vanished, recipe names
 * carried the whole question, three more jokes, the class row went stale,
 * and the owner's ask: World languages asks which language.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadAllRecipes, getRecipe } from '../../engine/recipe-loader.js';
import { compileRecipe, capName } from '../../engine/recipe-compiler.js';
import { validate } from '../../engine/game-loader.js';
import { buildActivityMap } from '../../engine/activity-map.js';
import { validateSampleAnswers, sourceLines } from '../../engine/sample-answers.js';
import { AIService } from '../../services/ai-service.js';
import '../../screens/shared/rich-text.js';
import '../../screens/shared/teacher-profile.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const RT = globalThis.RichText;
const TP = globalThis.TeacherProfile;

await loadAllRecipes();
const compiled = (id, params) => compileRecipe(getRecipe(id), params || {}).config;

describe('Idea Chain hands every chain back', () => {
  const config = () => compiled('idea-chain', { starterPrompt: 'Write one character.', transformPrompt: 'Add a twist.' });

  it('compiles clean, with an own-scope steps reveal over all five steps and a gallery of the finished chains', () => {
    const c = config();
    expect(validate(c, 'idea-chain', { returnResults: true }).errors).toEqual([]);
    expect(c.phases.evolved).toMatchObject({ type: 'reveal', scope: 'own', chainFrom: ['starter', 'round-1', 'round-2', 'round-3', 'round-4'], chainDisplay: 'steps', next: 'gallery' });
    expect(c.phases.gallery).toMatchObject({ type: 'reveal-one', from: 'evolved.responses', next: 'end' });
    expect(c.phases['round-4'].next).toBe('evolved');
    for (const id of ['round-1', 'round-2', 'round-3', 'round-4']) {
      expect(c.phases[id].prompt).toContain('The version you received:');
    }
    expect(c.phases.intro.message).toContain('comes back to you');
    expect(c.name).toBe('Idea Chain');
  });

  it('the recipe explains the transform instruction must work on any version', () => {
    expect(getRecipe('idea-chain').parameters.transformPrompt.helper).toContain('never ask for a fresh start');
  });
});

describe('Anonymous Feedback keeps the teacher\'s summary on the console', () => {
  it('two summaries: the teacher\'s behind a preview gate with no raw answers, then the class\'s group-level version', () => {
    const c = compiled('anonymous-feedback', { question: 'How is class going?' });
    expect(validate(c, 'anonymous-feedback', { returnResults: true }).errors).toEqual([]);
    expect(c.phases.ask.next).toBe('for-teacher');
    expect(c.phases['for-teacher']).toMatchObject({ type: 'ai-process', task: 'summarize', next: 'teacher-view' });
    expect(c.phases['teacher-view']).toMatchObject({ type: 'preview', showResponses: false, approveNext: 'for-class', rejectNext: 'for-teacher' });
    expect(c.phases['for-class']).toMatchObject({ type: 'ai-process', task: 'summarize', next: 'results' });
    expect(c.phases.results.template).toContain('{{for-class.result}}');
    expect(c.phases.results.template).not.toMatch(/\*\$\{|\*How/);
    for (const id of ['for-teacher', 'for-class']) {
      expect(c.phases[id].instruction).toMatch(/never describe what one student said|never what one student said/i);
      expect(c.phases[id].instruction).toMatch(/no # headings/);
    }
    expect(c.phases['for-class'].instruction).toMatch(/No advice to the teacher/);
    expect(c.phases.intro.message.startsWith('##')).toBe(false);
    expect(c.name).toBe('Anonymous Feedback');
  });
});

describe('names, markers, and the map', () => {
  it('a recipe that folds the question into its name is cut near 48 characters at a word', () => {
    expect(capName('Feedback: How is class going for you? What\'s working well, and what would help?')).toBe('Feedback: How is class going for you? What\'s…');
    expect(capName('Live Poll: Best pizza?')).toBe('Live Poll: Best pizza?');
    const c = compiled('live-poll', { question: 'Which of the causes of the First World War do you think mattered most to ordinary people?', choices: ['Alliances', 'Nationalism', 'Imperialism'] });
    expect(c.name.length).toBeLessThanOrEqual(50);
    expect(c.name.endsWith('…')).toBe(true);
  });

  it('the What happens excerpt drops # heading marks, and the wall drops single-star italics', () => {
    const map = buildActivityMap({ phases: { lobby: { type: 'lobby', next: 'a' }, a: { type: 'announce', message: '## Your responses are anonymous to the class.', next: 'end' }, end: { type: 'end' } } });
    const stop = map.stops.find(s => (s.ids || []).indexOf('a') !== -1);
    expect(stop.detail).toBe('Your responses are anonymous to the class.');
    expect(RT.scrub('*How is class going?*')).toBe('How is class going?');
    expect(RT.scrub('**bold** stays')).toBe('**bold** stays');
    expect(RT.scrub('2 * 3')).toBe('2 * 3');
  });
});

describe('the long question', () => {
  it('a field is a wrapping box that never repeats the question as its placeholder, and long words never push the screen sideways', () => {
    const player = read('screens/player/player.js');
    expect(player).toContain("var fieldInput = document.createElement('textarea');");
    expect(player).toContain("fieldInput.placeholder = fieldDef.placeholder || UiLang.t('Type your answer here...');");
    const css = read('screens/player/styles.css');
    expect(css).toMatch(/\.field-label \{[^}]*overflow-wrap: anywhere;/);
    expect(css).toContain('.prompt, .field-input, .multi-fields, #prompt-display { overflow-wrap: anywhere; }');
  });

  it('the projector lists a multi-field step\'s questions under the instruction', () => {
    expect(read('screens/host/index.html')).toContain('<ol id="collect-fields" class="vote-proposals" hidden></ol>');
    const host = read('screens/host/host.js');
    expect(host).toContain("hostTemplate, show, liveResults, choices, fields }) => {");
    expect(host).toContain("const fieldList = document.getElementById('collect-fields');");
    expect(host).toContain('fieldList.hidden = labels.length < 2;');
  });

  it('the timer chip\'s last seconds are paper on orange, never orange on orange', () => {
    expect(read('screens/player/styles.css')).toMatch(/\.timer-bar-wrapper\.timer-warning \.timer-bar-text \{\s*color: var\(--t-paper, #fff\);/);
    expect(read('screens/host/styles.css')).toMatch(/\.timer-ring-container\.timer-warning \.timer-ring-text \{\s*color: var\(--t-paper, #fff\);/);
  });

  it('the fit question knows the answer box\'s cap', () => {
    const src = read('services/ai-service.js');
    expect(src).toContain('Students type into a box that holds at most ${answerCap} characters');
    expect(src).toContain('${capNote}${knownClass}${knownKnobs}');
  });
});

describe('sample answers follow a chain', () => {
  it('a set may respond to a set that itself responds to an earlier round', () => {
    const samples = { starter: ['a', 'b'], r1: { respondsTo: 'starter', lines: ['a1', 'b1'] }, r2: { respondsTo: 'r1', lines: ['a2', 'b2'] } };
    expect(sourceLines(samples, 'r1')).toEqual(['a1', 'b1']);
    const config = { phases: { starter: { type: 'collect' }, r1: { type: 'collect' }, r2: { type: 'collect' } }, sampleAnswers: samples };
    expect(validateSampleAnswers(config, 'x')).toEqual([]);
    expect(read('screens/shared/bot-brain.js')).toContain('var source = Array.isArray(src) ? src : (src && Array.isArray(src.lines) ? src.lines : []);');
    expect(read('screens/prototype/prototype.js')).toContain("'/sample-answers?seats=' + MAX_PLAYERS");
  });

  it('the writer asks for answers to the previous round\'s lines and stores them as a respondsTo set', async () => {
    const config = compiled('idea-chain', { starterPrompt: 'Write one character.', transformPrompt: 'Add a twist.' });
    const service = new AIService({ mode: 'real' });
    let sent = '';
    service._callClaude = async (params) => {
      sent = params.messages[0].content;
      const four = (p) => Array.from({ length: 4 }, (_, i) => `${p} ${i + 1}`);
      return { content: [{ type: 'text', text: JSON.stringify({ starter: four('start'), 'round-1': four('r1'), 'round-2': four('r2'), 'round-3': four('r3'), 'round-4': four('r4') }) }] };
    };
    const { sampleAnswers } = await service.writeSampleAnswers({ config, seats: 4 });
    expect(sent).toContain('each student receives a classmate\'s answer from step "starter"');
    expect(sampleAnswers.starter).toEqual(['start 1', 'start 2', 'start 3', 'start 4']);
    expect(sampleAnswers['round-1']).toEqual({ respondsTo: 'starter', lines: ['r1 1', 'r1 2', 'r1 3', 'r1 4'] });
    expect(sampleAnswers['round-2']).toEqual({ respondsTo: 'round-1', lines: ['r2 1', 'r2 2', 'r2 3', 'r2 4'] });
    expect(validateSampleAnswers({ ...config, sampleAnswers }, 'idea-chain')).toEqual([]);
  });
});

describe('the class', () => {
  beforeEach(() => { globalThis.localStorage = { store: {}, getItem(k) { return k in this.store ? this.store[k] : null; }, setItem(k, v) { this.store[k] = String(v); }, removeItem(k) { delete this.store[k]; } }; });

  it('World languages remembers which language, in the chip and in the class line the AI reads', () => {
    TP.save({ gradeBand: 'middle', subjects: ['languages'], languageText: 'Spanish' });
    expect(TP.get().languageText).toBe('Spanish');
    expect(TP.short()).toBe('6-8 · Spanish');
    expect(TP.describe()).toBe('Middle school (6-8), World languages (Spanish)');
    TP.save({ gradeBand: 'middle', subjects: ['science'], languageText: 'Spanish' });
    expect(TP.get().languageText).toBe('');
    expect(TP.short()).toBe('6-8 · Science');
  });

  it('the picker asks which language with the four most taught as chips and a box for another', () => {
    const picker = read('screens/shared/class-picker.js');
    expect(picker).toContain("var LANGUAGES_TAUGHT = ['Spanish', 'French', 'German', 'Mandarin'];");
    expect(picker).toContain("if (id === 'languages' && !had) askLanguage(picked, persist, opts.dialog);");
    expect(picker).toContain("title.textContent = 'Which language?';");
    expect(picker).toContain("input.placeholder = 'Another language: Latin, Japanese, ASL...';");
    expect(picker).toContain('askLanguage: askLanguage,');
  });

  it('the make page re-reads the class after a cached restore or a change in another tab', () => {
    const make = read('screens/make/make.js');
    expect(make).toContain('if (state.config) buildRows();');
    expect(make).toContain("if (e.key === 'lanyard-teacher-profile' && state.config) buildRows();");
  });
});

describe('the rest', () => {
  it('the joke list lost the injury, criminal, and bathroom jokes', () => {
    const built = JSON.parse(read('engine/dad-jokes.json'));
    expect(built.length).toBe(456);
    expect(built.some(j => /left side was cut off|criminal going down the stairs|found in the bathroom/i.test(j))).toBe(false);
  });

  it('an AI draft that leaves nothing for students to do cannot be applied', () => {
    const server = read('server.js');
    expect(server).toContain('const problem = planProblem(result.updatedConfig);');
    expect(server).toContain('structural.errors = (structural.errors || []).concat([problem]);');
  });
});
