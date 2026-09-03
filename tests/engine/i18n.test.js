/**
 * Activity language (engine/i18n): detection from the activity's own text,
 * the explicit-setting override, and the translation tables that put the
 * fixed button labels ("Show the message", "Submit") in that language.
 */
import { describe, it, expect } from 'vitest';
import {
  LANGUAGES, LANGUAGE_CODES, STRINGS,
  detectLanguage, configText, resolveLanguage, translate, stringsFor
} from '../../engine/i18n/index.js';
import { continueLabelFor, closeLabelFor, continueLabelForPhase } from '../../engine/phases/continue-labels.js';
import { GameEngine } from '../../engine/game-engine.js';

const spanish = {
  name: 'Palabras del día',
  phases: {
    lobby: { type: 'lobby', next: 'intro' },
    intro: { type: 'announce', message: 'Hoy vamos a escribir sobre el fin de semana. Piensa en algo que hiciste con tu familia.', next: 'ask' },
    ask: { type: 'collect', prompt: '¿Qué hiciste el sábado? Escribe una o dos frases.', next: 'end' },
    end: { type: 'end', message: '¡Gracias por participar!' }
  }
};

const english = {
  name: 'Weekend words',
  phases: {
    lobby: { type: 'lobby', next: 'ask' },
    ask: { type: 'collect', prompt: 'What did you do this weekend? Write one or two sentences about it.', next: 'end' },
    end: { type: 'end', message: 'Thanks for playing!' }
  }
};

describe('detectLanguage', () => {
  it('spots Spanish, French, German, Portuguese and Italian prose', () => {
    expect(detectLanguage('Hoy vamos a escribir sobre el fin de semana y la familia. ¿Qué hiciste con tus amigos?')).toBe('es');
    expect(detectLanguage("Écris une phrase sur ce que tu as fait pendant le week-end avec ta famille et tes amis.")).toBe('fr');
    expect(detectLanguage('Schreibe einen Satz über das Wochenende und was du mit deiner Familie gemacht hast.')).toBe('de');
    expect(detectLanguage('Escreva uma frase sobre o que você fez no fim de semana com a sua família.')).toBe('pt');
    expect(detectLanguage('Scrivi una frase su quello che hai fatto nel fine settimana con la tua famiglia.')).toBe('it');
  });

  it('leaves English alone, including short prompts with a stray borrowed word', () => {
    expect(detectLanguage('What is the best pizza topping and why?')).toBe('en');
    expect(detectLanguage('Describe la casa you would build with your friends.')).toBe('en');
  });

  it('is English for empty or token-only text', () => {
    expect(detectLanguage('')).toBe('en');
    expect(detectLanguage('{{ask.responses}}')).toBe('en');
    expect(detectLanguage(null)).toBe('en');
  });
});

describe('configText', () => {
  it('gathers the prose the class reads and skips ids, refs and the recipe stamp', () => {
    const text = configText({
      ...spanish,
      description: 'Una actividad corta',
      recipe: { id: 'weekend', params: { theme: 'the beach and the sea' } }
    });
    expect(text).toContain('Palabras del día');
    expect(text).toContain('Una actividad corta');
    expect(text).toContain('¿Qué hiciste el sábado?');
    expect(text).not.toContain('the beach and the sea');
    expect(text).not.toContain('collect');
  });
});

describe('resolveLanguage', () => {
  it('auto-detects from the activity text when no language is set', () => {
    expect(resolveLanguage(spanish)).toBe('es');
    expect(resolveLanguage(english)).toBe('en');
    expect(resolveLanguage({ ...spanish, language: 'auto' })).toBe('es');
  });

  it('an explicit setting wins over detection', () => {
    expect(resolveLanguage({ ...spanish, language: 'en' })).toBe('en');
    expect(resolveLanguage({ ...english, language: 'fr' })).toBe('fr');
  });

  it('the engine resolves it once at construction', () => {
    expect(new GameEngine(spanish).language).toBe('es');
    expect(new GameEngine(english).language).toBe('en');
  });
});

describe('translation tables', () => {
  it('every supported language except English has a table with the same keys', () => {
    const codes = LANGUAGE_CODES.filter(c => c !== 'en');
    expect(Object.keys(STRINGS).sort()).toEqual(codes.sort());
    const reference = Object.keys(STRINGS.es).sort();
    for (const code of codes) {
      expect(Object.keys(STRINGS[code]).sort(), `keys for ${code}`).toEqual(reference);
    }
    expect(Object.keys(LANGUAGES)).toContain('en');
  });

  it('no table value is empty, and none contains an em dash', () => {
    for (const [code, table] of Object.entries(STRINGS)) {
      for (const [key, value] of Object.entries(table)) {
        expect(typeof value === 'string' && value.trim().length > 0, `${code}: ${key}`).toBe(true);
        expect(value.includes('—'), `${code}: ${key}`).toBe(false);
      }
    }
  });

  it('translate falls back to the English key for unknown languages or labels', () => {
    expect(translate('es', 'Submit')).toBe('Enviar');
    expect(translate('en', 'Submit')).toBe('Submit');
    expect(translate(undefined, 'Submit')).toBe('Submit');
    expect(translate('es', 'Some brand new label')).toBe('Some brand new label');
    expect(stringsFor('en')).toEqual({});
    expect(stringsFor('fr').Submit).toBe('Envoyer');
  });
});

describe('continue labels speak the activity language', () => {
  const phases = {
    intro: { type: 'announce', next: 'q1' },
    q1: { type: 'collect-choice', next: 'results' },
    results: { type: 'reveal', next: 'end' },
    end: { type: 'end' }
  };

  it('generated labels translate, English stays the default', () => {
    expect(continueLabelFor('announce', 'es')).toBe('Mostrar el mensaje');
    expect(continueLabelFor('announce')).toBe('Show the message');
    expect(continueLabelFor('unknown-type', 'fr')).toBe('Continuer');
    expect(closeLabelFor('rate', 'de')).toBe('Bewertung beenden');
    expect(closeLabelFor('announce', 'de')).toBeNull();
    expect(continueLabelForPhase(phases.intro, phases, 'es')).toBe('Empezar con la primera pregunta');
    expect(continueLabelForPhase(phases.results, phases, 'it')).toBe('Concludi');
  });

  it('a teacher-typed continueLabel is left exactly as written', () => {
    const custom = { type: 'announce', next: 'q1', continueLabel: 'Vamos a ver' };
    expect(continueLabelForPhase(custom, phases, 'es')).toBe('Vamos a ver');
    expect(continueLabelForPhase(custom, phases, 'en')).toBe('Vamos a ver');
  });

  it('every generated label has a translation in every table', () => {
    const types = ['announce', 'collect', 'collect-choice', 'vote', 'reveal', 'reveal-one', 'preview', 'leaderboard', 'winner', 'rank', 'rate', 'estimate', 'match', 'sort', 'buzz', 'merge', 'one-voice', 'turn', 'relay', 'team-split', 'wager', 'checklist', 'eliminate', 'ai-eliminate', 'ai-process', 'foreach', 'end', null];
    for (const code of Object.keys(STRINGS)) {
      for (const type of types) {
        const en = continueLabelFor(type);
        expect(continueLabelFor(type, code), `${code} ${type}`).not.toBe(en);
      }
      for (const type of ['rate', 'estimate', 'match', 'sort', 'checklist']) {
        expect(closeLabelFor(type, code)).not.toBe(closeLabelFor(type));
      }
    }
  });
});
