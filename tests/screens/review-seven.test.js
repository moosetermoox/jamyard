/**
 * An outside reviewer's seventh round (2026-09-26) plus two live-site
 * catches of the same day. A Spanish activity kept the recipe's English
 * prose; a plan with no questions was offered; a religious joke reached a
 * join screen; the joke covered the first question for a student who
 * joined just before Start; the Vocab Match projector showed only a count;
 * the rounds box kept 99; a Hide on the review screen still reached the
 * classmate a line was written for; Closer's top card ignored a library
 * fill. Unit tests of the pure pieces plus source guards for the wiring.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { collectTexts, applyTexts, pathKey } from '../../engine/activity-text.js';
import { planProblem } from '../../engine/plan-check.js';
import { loadAllRecipes, getRecipe } from '../../engine/recipe-loader.js';
import { compileRecipe } from '../../engine/recipe-compiler.js';
import { AIService } from '../../services/ai-service.js';
import { STRINGS, LANGUAGE_CODES, detectLanguage } from '../../engine/i18n/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

await loadAllRecipes();
const compiled = (id, params) => compileRecipe(getRecipe(id), params || {}).config;

describe('the words an activity shows, as a list', () => {
  it('reads the recipe prose a Spanish idea left in English: the vote question, the reveal heading, the end message', () => {
    const config = compiled('creative-vote', { prompt: 'Escribe un eslogan para nuestra clase.' });
    const texts = collectTexts(config);
    const keys = texts.map(t => pathKey(t.path));
    const byKey = Object.fromEntries(texts.map(t => [pathKey(t.path), t.text]));
    const voteKey = keys.find(k => /^phases\.[^.]+\.question$/.test(k));
    expect(voteKey).toBeTruthy();
    expect(byKey[voteKey]).toBe('Which one is your favorite?');
    expect(Object.values(byKey).some(v => v.includes("Here's what everyone wrote:"))).toBe(true);
    expect(Object.values(byKey).some(v => v.includes('Escribe un eslogan'))).toBe(true);
    // never an id, a ref, or the provenance stamp
    expect(keys.some(k => /\.(next|recipe|id|from)\b/.test(k))).toBe(false);
  });

  it('writes the words back onto a copy by key, leaving the original alone', () => {
    const config = compiled('creative-vote', { prompt: 'Write a slogan for our class.' });
    const voteKey = collectTexts(config).map(t => pathKey(t.path)).find(k => /\.question$/.test(k));
    const out = applyTexts(config, { [voteKey]: '¿Cuál es tu favorito?', 'no.such.key': 'x', name: '' });
    const [, stepId] = voteKey.split('.');
    expect(out.phases[stepId].question).toBe('¿Cuál es tu favorito?');
    expect(config.phases[stepId].question).toBe('Which one is your favorite?');
    expect(out.name).toBe(config.name);
  });
});

describe('putting an activity into the class\'s language', () => {
  const reply = (obj) => ({ content: [{ type: 'thinking', thinking: '...' }, { type: 'text', text: JSON.stringify(obj) }] });

  it('sends every text with its key and applies the translations, keeping tokens and refusing a translation that lost one', async () => {
    const config = compiled('creative-vote', { prompt: 'Escribe un eslogan para nuestra clase.' });
    const texts = collectTexts(config);
    const voteKey = texts.map(t => pathKey(t.path)).find(k => /\.question$/.test(k));
    const tplKey = texts.map(t => pathKey(t.path)).find(k => texts.find(t => pathKey(t.path) === k).text.includes('{{'));
    const service = new AIService({ mode: 'real' });
    let sent = null;
    service._callClaude = async (params) => {
      sent = params;
      return reply({ [voteKey]: '¿Cuál es tu favorito?', [tplKey]: '## Esto es lo que escribieron:' /* token dropped */ });
    };
    const out = await service.translateActivityText({ config, language: 'es' });
    expect(sent.messages[0].content).toContain('in Spanish');
    expect(sent.messages[0].content).toContain(voteKey);
    const [, stepId] = voteKey.split('.');
    expect(out.phases[stepId].question).toBe('¿Cuál es tu favorito?');
    // the reveal template lost its {{...}} token, so the original stays
    const tplOriginal = texts.find(t => pathKey(t.path) === tplKey).text;
    const tplPath = tplKey.split('.');
    let node = out;
    for (const k of tplPath) node = node[k];
    expect(node).toBe(tplOriginal);
    expect(config.phases[stepId].question).toBe('Which one is your favorite?');
  });

  it('English or mock mode returns the activity unchanged, with no call', async () => {
    const config = compiled('creative-vote', { prompt: 'Write a slogan for our class.' });
    const mock = new AIService({ mode: 'mock' });
    expect(await mock.translateActivityText({ config, language: 'es' })).toEqual(config);
    const real = new AIService({ mode: 'real' });
    real._callClaude = async () => { throw new Error('should not be called'); };
    expect(await real.translateActivityText({ config, language: 'en' })).toBe(config);
  });

  it('the Create page detects the idea\'s language, pins it on the plan, and the storyboard writes in it', () => {
    expect(detectLanguage('Una votación creativa: cada estudiante escribe un eslogan para la clase y luego votamos por el mejor.')).toBe('es');
    const server = read('server.js');
    expect(server).toContain('const ideaLanguage = detectLanguage(description);');
    expect(server).toContain("config = await aiService.translateActivityText({ config, language: ideaLanguage });");
    expect(server).toContain('config.language = ideaLanguage;');
    expect(read('services/ai-service.js')).toContain('Every word students read (text, choices, items, headings, the name) is in the language the idea was written in.');
  });

  it('the projector\'s vote mode line is translated', () => {
    const host = read('screens/host/host.js');
    expect(host).toContain("UiLang.t('Pick One')");
    expect(host).toContain("UiLang.t('Head-to-Head')");
    for (const lang of LANGUAGE_CODES.filter(c => c !== 'en')) {
      expect(STRINGS[lang]['Pick One'], lang).toBeTruthy();
      expect(STRINGS[lang]['Head-to-Head'], lang).toBeTruthy();
    }
  });
});

describe('a plan the class can run', () => {
  it('refuses Trivia Bluff with prepared facts and none written, and passes a real plan', () => {
    const empty = compiled('trivia-bluff', { questionSource: 'prepared', questions: [], rounds: 1 });
    expect(empty).toBeTruthy();
    expect(planProblem(empty)).toMatch(/no step where students|did not check out/);
    expect(planProblem(compiled('creative-vote', { prompt: 'Write a slogan for our class.' }))).toBeNull();
    expect(planProblem(compiled('trivia-bluff', {}))).toBeNull();
    expect(planProblem(null)).toBeTruthy();
  });

  it('the Create page checks the plan, tries the first runner-up once, then says no', () => {
    const server = read('server.js');
    expect(server).toContain('let problem = planProblem(config);');
    expect(server).toContain('if (problem && alternates.length) {');
    expect(server).toContain("suggestion: 'Add the questions or facts to your idea, or plan it step by step.'");
  });
});

describe('the joke, the terms, the rounds box', () => {
  it('the joke list has no religion, romance, crime, body, or disability jokes, and the source and the JSON agree', () => {
    const built = JSON.parse(read('engine/dad-jokes.json'));
    expect(built.length).toBe(459);
    const bad = /atheis|prophet|catholic|\bnun\b|buddh|monastery|friar|sunday school|girlfriend|my date|kleptoman|kidnapping|pee soup|vowel movement|urine|bladder|\bdung\b|cross-eyed|hearing aid|bullies|corkscrew|steal a mixer|stealing from his job/i;
    expect(built.filter(j => bad.test(j))).toEqual([]);
    expect(read('docs/500-all-ages-dad-jokes.md')).not.toMatch(/non-prophet/);
  });

  it('the joke folds on the first step in a room with a lobby; only a rolling room keeps the settle window', () => {
    const player = read('screens/player/player.js');
    expect(player).toContain('let earlyJokeSettle = false;');
    expect(player).toContain('if (earlyJokePhase === null && earlyJokeSettle && Date.now() - earlyJokeShownAt < EARLY_JOKE_SETTLE_MS) {');
    expect(player).toContain('earlyJokeSettle = !!joke.settle;');
    const server = read('server.js');
    expect(server).toContain('if (joke && opts && opts.rolling) joke.settle = true;');
    // the two join-success emits, plus the isEarlyBirdJoin call that already read it that way
    expect((server.match(/rolling: !!\(room\.engine && isRolling\(room\.engine\.config\)\)/g) || []).length).toBe(3);
  });

  it('the Vocab Match projector lists the terms while the class matches', () => {
    expect(read('screens/host/index.html')).toContain('<ol id="match-terms" class="vote-proposals" hidden></ol>');
    const host = read('screens/host/host.js');
    expect(host).toContain("socket.on('match-start', ({ prompt, totalMatchers, timer, hostTemplate, show, leftItems }) => {");
    expect(host).toContain("const termList = document.getElementById('match-terms');");
    expect(read('engine/phase-handlers/match.js')).toContain('leftItems: pairs.map(p => p.left)');
  });

  it('the bluff panel\'s number boxes snap back into their range when left', () => {
    const src = read('screens/shared/make-it-yours.js');
    expect(src).toContain("roundsInput.addEventListener('change', function () {");
    expect(src).toContain("timerInput.addEventListener('change', function () {");
    expect(src).toContain('roundsInput.value = clampedInt(roundsInput, parseInt(roundsInput.min, 10), parseInt(roundsInput.max, 10)');
  });
});
