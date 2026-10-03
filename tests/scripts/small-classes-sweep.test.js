// The small-class sweep (scripts/simulate-small-classes.js) is the shared
// contract for what a step does with 0, 1, or 2 inputs
// (docs/ARCHITECTURE-REVIEW-2026-10.md, cause 3). The sweep itself needs a
// server and runs in its own CI job; this guards the pure parts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { verdictFor, visibleGames, serverErrorLines } from '../../scripts/simulate-small-classes.js';
import { AIService } from '../../services/ai-service.js';

describe('serverErrorLines', () => {
  it('finds a handler that threw behind the socket wrapper, and ignores ordinary log lines', () => {
    const log = [
      '[handlePhase] Winner declared: abc (3 votes)',
      '[socket:match-submit] Unhandled handler error (room kept alive): TypeError: room.engine.players.get is not a function',
      "[handlePhase] Error in 'winner' (type: winner): Cannot convert undefined or null to object",
      '[submit-vote] abc voted (2/3)'
    ].join('\n');
    const found = serverErrorLines(log);
    expect(found).toHaveLength(2);
    expect(found[0]).toContain('match-submit');
  });
});

describe('the mock answers a JSON step with JSON', () => {
  it('gives a list, one line per answer, never prose', async () => {
    const ai = new AIService({ apiKey: '' });
    const out = await ai.process({ instruction: 'Mash these up', responses: [{ playerId: 'a', text: 'cats' }, { playerId: 'b', text: 'moon' }], expectJson: true });
    const parsed = JSON.parse(out.text);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThanOrEqual(2);
    expect(parsed[0]).toContain('cats');
  });
  it('still gives three lines when nothing came in', async () => {
    const ai = new AIService({ apiKey: '' });
    const out = await ai.process({ instruction: 'Write prompts', responses: [], expectJson: true });
    expect(JSON.parse(out.text)).toHaveLength(3);
  });
});

const summary = (phases, errors, end) =>
  `--- Phase: ANNOUNCE ---\n--- Phase: COLLECT ---\n${end ? '--- Phase: END ---\n' : ''}Phases visited: ${phases}\nResult: ${errors} errors, 0 warnings\n`;

describe('verdictFor reads one playthrough', () => {
  it('a run that reached the end with no errors is ok', () => {
    const v = verdictFor({ game: 'g', size: 2, empty: false, out: summary(3, 0, true), timedOut: false, exitCode: 0 });
    expect(v.status).toBe('ok');
    expect(v.phases).toBe(3);
    expect(v.lastPhase).toBe('END');
  });

  it('a run that never reached the end is stuck, even with zero errors', () => {
    const v = verdictFor({ game: 'g', size: 1, empty: false, out: summary(2, 0, false) + '⚠ No events for 86s — game may be stuck\n', timedOut: false, exitCode: 0 });
    expect(v.status).toBe('stuck');
    expect(v.lastPhase).toBe('COLLECT');
  });

  it('errors, a crash, a timeout, and no summary each get their own status', () => {
    expect(verdictFor({ game: 'g', size: 3, empty: false, out: summary(4, 2, true), timedOut: false, exitCode: 1 }).status).toBe('errors');
    expect(verdictFor({ game: 'g', size: 3, empty: false, out: 'Simulator crashed: boom', timedOut: false, exitCode: 1 }).status).toBe('crashed');
    expect(verdictFor({ game: 'g', size: 3, empty: false, out: '', timedOut: true, exitCode: null }).status).toBe('timeout');
    expect(verdictFor({ game: 'g', size: 3, empty: false, out: 'half a log', timedOut: false, exitCode: 0 }).status).toBe('no-result');
  });
});

describe('visibleGames', () => {
  it('lists every built-in a teacher can see, never a fixture or a retired one', () => {
    const games = visibleGames();
    expect(games).toContain('live-poll');
    expect(games).toContain('doodle-bluff');
    expect(games.some(g => g.startsWith('_'))).toBe(false);
    expect(games).not.toContain('user');
    for (const g of games) {
      const cfg = JSON.parse(readFileSync(new URL(`../../games/${g}/config.json`, import.meta.url), 'utf8'));
      expect(cfg.retired).toBeFalsy();
    }
  });
});

describe('the universal sim drives every step type that opens on a student screen', () => {
  it('knows the seven it learned on 2026-10-02 and presses continue on a quiet projector', () => {
    const src = readFileSync(new URL('../../scripts/simulate-any-game.js', import.meta.url), 'utf8');
    for (const ev of ['merge-start', 'rate-start', 'one-voice-start', 'reveal-one-start', 'solo-quiz-question', 'team-roles-start', 'turn-start']) {
      expect(src, ev).toContain(`'${ev}'`);
    }
    expect(src).toMatch(/quietPresses < 3/);
    expect(src).toMatch(/SIM_FAST/);
    expect(src).toMatch(/SIM_EMPTY/);
  });
});
