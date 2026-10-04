/**
 * The screen knobs on the screens (2026-09-30): the student's ballot
 * takes several picks with a hint in every language, the choice handler
 * sends the limit, the server caps and stores the picks, the projector
 * reads a placeholder for a station token, the editor carries the three
 * settings and mirrors the rules, and the prompts name the knobs.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { STRINGS } from '../../engine/i18n/index.js';

const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

describe('several picks on the student screen', () => {
  const player = read('screens/player/player.js');
  it('a ballot that takes up to N picks, a hint under the question, the timer sends the picks', () => {
    expect(player).toContain('function pickSeveral(label, max, onConfirm)');
    expect(player).toContain("? pickSeveral(UiLang.t('Submit'), maxPicks, sendPicks)");
    expect(player).toContain("UiLang.t('Pick up to {n}.').replace('{n}', String(maxPicks))");
    expect(player).toContain("btn.classList.toggle('is-locked', full && !on)");
    expect(player).toMatch(/socket\.on\('game-started', \(\{[^}]*maxPicks[,} ][^}]*\}\) =>/);
  });
  it('the hint has a row in every language table', () => {
    for (const code of Object.keys(STRINGS)) {
      expect(STRINGS[code], code).toHaveProperty('Pick up to {n}.');
      expect(STRINGS[code]['Pick up to {n}.']).toContain('{n}');
    }
  });
  it('the choice handler sends the limit on enter and on reconnect; the server caps the picks', () => {
    const handler = read('engine/phase-handlers/collect-choice.js');
    expect((handler.match(/maxPicks: Number\.isInteger\(/g) || []).length).toBe(2);
    const server = read('server.js');
    expect(server).toContain("storedResponse = limit > 1 ? picks.slice(0, limit) : (picks[0] || '');");
    expect(server).toContain('const picks = Array.isArray(r.picks) ? r.picks : [r.text];');
  });
  it('the student stylesheet styles the hint and the locked choices', () => {
    const css = read('screens/player/styles.css');
    expect(css).toContain('.pick-hint {');
    expect(css).toContain('.choice-btn.is-locked {');
  });
});

describe('a graded open answer and stations on the server', () => {
  const server = read('server.js');
  it('the close grades a collect with a right answer', () => {
    expect(server).toContain("if (collectPhase.correctAnswer && collectPhase.inputType !== 'drawing') {");
    expect(server).toContain('const g = gradeFreeText(responses, [right].concat(accepted), collectPhase.pointsCorrect);');
  });
  it('the projector reads a placeholder where a station token stands', () => {
    // the stand-in lives in the one map (engine/per-player-template.js, 2026-10-03)
    const template = read('engine/per-player-template.js');
    expect(template).toContain("station: 'their group\\'s own text'");
    expect(server).toContain('projectorPlaceholder(trimmed)');
  });
});

describe('the editor and the prompts', () => {
  it('the editor carries the three settings and mirrors the rules', () => {
    const editor = read('screens/designer/editor.js');
    expect(editor).toContain("'Pick up to (optional)'");
    expect(editor).toContain("'The right answer (optional)'");
    expect(editor).toContain("'Other accepted answers'");
    expect(editor).toContain('function addStationsFields(phase, phaseId, textKey)');
    expect((editor.match(/addStationsFields\(phase, phaseId, '(prompt|message)'\)/g) || []).length).toBe(3);
    expect(editor).toContain('"Pick up to" cannot combine with a correct answer');
    expect(editor).toContain('"The right answer" needs a single answer box');
    expect(editor).toContain('"Different text per group" needs at least two lines');
  });
  it('the storyboard, concierge, and chat prompts name the knobs', () => {
    const ai = read('services/ai-service.js');
    expect(ai).toContain('maxPicks = 2-8 (optional) lets each student pick several');
    expect(ai).toContain('collect also takes answer = the one right answer to an open question');
    expect(ai).toContain('announce, collect, and collect-choice also take stations = 2-12 lines');
    expect(ai).toContain('"maxPicks" 2-8 lets each student pick several');
    expect(ai).toContain('from collect with answer,');
    expect(ai).toContain('with "maxPicks" each has .picks');
    expect(ai).toContain('also .scores, .correctAnswer, .correctCount, .answeredCount');
  });
});
