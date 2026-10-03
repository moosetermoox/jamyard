/**
 * The owner's live re-checks on jamyard.org (2026-10-03), each a guard so
 * it stays fixed:
 *   - Estimation Station: a student who guessed and reloaded got an empty
 *     box ("you guessed 500" gone, the guess still counted); the reveal
 *     said "1 guesses"
 *   - a Spanish activity through Create still read English on the lobby
 *     ("Go to ... and enter this code", "2 of us here", "Your teacher
 *     starts the activity from the big screen."), the counter ("0 OF 2
 *     SUBMITTED", "EVERYONE IS IN", the Wait / Close anyway box), the end
 *     ("That's a wrap."), and the title ("Discussion: ..."); the pretend
 *     answers were English, so the AI summary came out English
 *   - the idea asked for a poll and then a reason; the match (Discussion
 *     Starter, open answer only) said nothing was missing
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { STRINGS, LANGUAGE_CODES } from '../../engine/i18n/index.js';
import { asksForPoll, hasChoiceStep, withPollMissing, POLL_MISSING } from '../../engine/idea-poll.js';
import { withoutEnglishPrefix } from '../../engine/idea-name.js';
import { languageRule } from '../../services/ai-service.js';

const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const host = read('screens/host/host.js');
const player = read('screens/player/player.js');

const NEW_KEYS = [
  'Go to', 'and enter this code', 'Just you so far...', '{n} of us here',
  'Your teacher starts the activity from the big screen.',
  '{count} of {total} submitted', 'Everyone is in ({count} of {total})',
  'Nobody has answered yet.',
  'Closing now moves the class on with no answers. The next step will have nothing to show.',
  'Close anyway', 'Wait', "That's a wrap!", "That's a wrap.",
  '{count} of {total} guessed', '{n} guesses', '1 guess', 'average', 'median', 'The answer:',
  'Got it, you guessed {n}. You can change it until the teacher reveals.', 'Type a number first.'
];

describe('the lobby, the counter, the end, and the guessing step follow the room language', () => {
  it('every new label has a row in every language table, placeholders kept', () => {
    for (const lang of LANGUAGE_CODES.filter(c => c !== 'en')) {
      for (const key of NEW_KEYS) {
        const v = STRINGS[lang][key];
        expect(typeof v === 'string' && v.trim().length > 0, `${lang}: ${key}`).toBe(true);
        for (const ph of key.match(/\{\w+\}/g) || []) expect(v, `${lang}: ${key} keeps ${ph}`).toContain(ph);
      }
    }
  });

  it('the projector reads them through UiLang', () => {
    expect(host.match(/UiLang\.t\('Go to'\) \+ ' '/g)).toHaveLength(2);
    expect(host.match(/' ' \+ UiLang\.t\('and enter this code'\)/g)).toHaveLength(2);
    expect(host).toContain("UiLang.t('{count} of {total} submitted')");
    expect(host).not.toMatch(/\+ ' submitted'/);
    expect(host).toContain("UiLang.t('Everyone is in ({count} of {total})')");
    expect(host).toContain("title: UiLang.t('Nobody has answered yet.')");
    expect(host).toContain("UiLang.t('{count} of {total} guessed')");
    expect(host).not.toMatch(/\+ ' guessed'/);
    expect(host).toContain("UiLang.t('The answer:')");
  });

  it('the student screen reads them through UiLang', () => {
    expect(player).toContain("UiLang.t('Just you so far...')");
    expect(player).toContain("UiLang.t('{n} of us here').replace('{n}', String(names.length))");
    expect(player).toContain("UiLang.t('Type a number first.')");
    expect(player).toContain("UiLang.t('Got it, you guessed {n}. You can change it until the teacher reveals.')");
    // the static shell's lines are exact keys, so UiLang.apply swaps them
    expect(read('screens/player/index.html')).toContain('<p class="holding-next">Your teacher starts the activity from the big screen.</p>');
    expect(read('screens/player/index.html')).toContain("<p>That's a wrap.</p>");
    expect(read('screens/host/index.html')).toContain('>That\'s a wrap!<');
  });
});

describe('a refreshed guesser gets the guess back, and one guess is "1 guess"', () => {
  it('the estimate reconnect carries myGuess and the student screen shows it', () => {
    const estimate = read('engine/phase-handlers/estimate.js');
    expect(estimate).toContain("myGuess: Object.prototype.hasOwnProperty.call(state.guesses, socket.id) ? state.guesses[socket.id] : null,");
    expect(player).toMatch(/socket\.on\('estimate-start', \(\{ [^}]*myGuess[^}]*\}\) =>/);
    expect(player).toContain("if (typeof myGuess === 'number' && isFinite(myGuess)) {");
    expect(player).toContain('estimatePlayerStatus.textContent = guessedLine(myGuess);');
  });

  it('the projector says 1 guess, n guesses', () => {
    expect(host).toContain("stats.count === 1 ? UiLang.t('1 guess') : UiLang.t('{n} guesses').replace('{n}', String(stats.count))");
    expect(host).not.toContain("stats.count + ' guesses");
  });
});

describe('game-time AI and the pretend answers follow the room language', () => {
  it('the language rule names the language and is empty for English', () => {
    expect(languageRule('es')).toContain('Write your whole reply in Spanish');
    expect(languageRule('en')).toBe('');
    expect(languageRule(undefined)).toBe('');
    expect(languageRule('xx')).toBe('');
  });

  it('the AI step passes the room language, and the sample-answer writer names it', () => {
    expect(read('engine/phase-handlers/ai-process.js')).toContain('language: engine.language,');
    const ai = read('services/ai-service.js');
    expect(ai).toContain('system: (systemPrompt || SYSTEM_PROMPT) + SAFETY_RULES + languageRule(language),');
    expect(ai).toContain("- Every answer is in ${LANGUAGE_NAMES[resolveLanguage(config)] || 'English'}, the language the activity is written in.");
  });
});

describe('a poll the idea asked for is never silently dropped', () => {
  const es = 'Una encuesta rápida para empezar la clase: ¿qué prefieres, pizza, tacos o sushi? Después cada estudiante escribe por qué.';
  const openOnly = { phases: { lobby: { type: 'lobby' }, ask: { type: 'collect' }, sum: { type: 'ai-process' }, end: { type: 'end' } } };
  const withPoll = { phases: { lobby: { type: 'lobby' }, poll: { type: 'collect-choice' }, ask: { type: 'collect' }, end: { type: 'end' } } };

  it('reads a poll from a poll word or an option list after a choosing verb, in six languages', () => {
    expect(asksForPoll(es)).toBe(true);
    expect(asksForPoll('A quick poll: cats or dogs? Then a sentence on why.')).toBe(true);
    expect(asksForPoll('Which do you prefer: pizza, tacos or sushi? Then explain.')).toBe(true);
    expect(asksForPoll('Un sondage rapide pour commencer')).toBe(true);
    expect(asksForPoll('Eine kurze Umfrage zum Einstieg')).toBe(true);
    expect(asksForPoll('Um sondaggio veloce')).toBe(true);
    expect(asksForPoll('Uma enquete rápida')).toBe(true);
    expect(asksForPoll('Everyone writes one sentence about the weekend and we read a few aloud.')).toBe(false);
    expect(asksForPoll('')).toBe(false);
  });

  it('finds a choice step at the top level or inside a round', () => {
    expect(hasChoiceStep(withPoll)).toBe(true);
    expect(hasChoiceStep({ phases: { r: { type: 'foreach', subPhases: { v: { type: 'vote' } } } } })).toBe(true);
    expect(hasChoiceStep(openOnly)).toBe(false);
    expect(hasChoiceStep(null)).toBe(false);
  });

  it('adds the poll to the missing list only when it is asked for and absent, once', () => {
    expect(withPollMissing(es, openOnly, [])).toEqual([POLL_MISSING]);
    expect(withPollMissing(es, openOnly, ['a teacher review'])).toEqual(['a teacher review', POLL_MISSING]);
    expect(withPollMissing(es, openOnly, ['a three-choice poll at the start'])).toEqual(['a three-choice poll at the start']);
    expect(withPollMissing(es, withPoll, [])).toEqual([]);
    expect(withPollMissing('one sentence each', openOnly, undefined)).toEqual([]);
  });

  it('the route runs it on both the recipe match and the existing-activity card', () => {
    const server = read('server.js');
    expect(server).toContain("import { withPollMissing } from './engine/idea-poll.js';");
    expect(server).toContain('missing: withPollMissing(description, config, match.missing),');
    expect(server).toContain('missing: withPollMissing(description, existingConfig, match.missing),');
  });
});

describe('a recipe name keeps no English prefix in another language', () => {
  it('strips the template\'s literal opening when the language pass left it', () => {
    expect(withoutEnglishPrefix('Discussion: ¿Qué prefieres?', 'Discussion: ${question}')).toBe('¿Qué prefieres?');
    expect(withoutEnglishPrefix('Discusión: ¿Qué prefieres?', 'Discussion: ${question}')).toBe('Discusión: ¿Qué prefieres?');
    expect(withoutEnglishPrefix('Snowball', '${topic}')).toBe('Snowball');
    expect(withoutEnglishPrefix('Discussion: ', 'Discussion: ${question}')).toBe('Discussion: ');
  });

  it('the route applies it after the language pass', () => {
    const server = read('server.js');
    expect(server).toContain("import { withoutEnglishPrefix } from './engine/idea-name.js';");
    expect(server).toContain('config.name = withoutEnglishPrefix(config.name, recipe.template && recipe.template.name);');
  });
});
