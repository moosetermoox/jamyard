/**
 * A twentieth outside review (2026-09-29, Two Truths and a Lie and Closer
 * with real students): a swear word spaced out letter by letter went up as
 * a choice, "Ben is a loser" went up with Ben in the room, and a quick
 * second click on Next step skipped a step. The filter rules live in
 * tests/engine/content-filter.test.js; this file guards the wiring: the
 * roster rides into every answer check, the AI judge is told what
 * "someone" means, and every forward press on both teacher screens goes
 * through a half-second guard.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

describe('a classmate\'s name next to an insult is refused on every path', () => {
  const server = read('server.js');
  it('the collect submit passes the roster into checkSubmission', () => {
    const at = server.indexOf('const check = checkSubmission(response, {');
    expect(at).toBeGreaterThan(-1);
    expect(server.slice(at, at + 400)).toContain('rosterNames: players.list().map(p => p.name)');
  });
  it('a merge draft and a relay line get the classmate check after the word filter', () => {
    expect(server).toContain("filterAboutClassmate(text, room.engine.players.list().map(p => p.name))");
    expect(server).toContain("filterAboutClassmate(text || '', room.engine.players.list().map(p => p.name))");
    expect(server).toContain('const check = checkSubmission(text, { prompt: phase.instruction, rosterNames: engine.players.list().map(p => p.name) });');
  });
  it('the student reads a line that names nothing back', () => {
    expect(server).toContain("reason: 'about_classmate', message: CLASSMATE_REFUSED_MESSAGE");
  });
  it('the console says what kind of line was stopped', () => {
    expect(read('screens/teacher/teacher.js')).toContain("data.reason === 'about_classmate'");
  });
  it('the AI judge is told that "someone" is a classmate whose name was removed', () => {
    const ai = read('services/ai-service.js');
    expect(ai).toContain('The word "someone" may stand where a classmate\'s name was removed');
  });
});

describe('a quick second click on Next step is dropped', () => {
  it('the projector sends every forward press through pressAdvance with a half-second guard', () => {
    const host = read('screens/host/host.js');
    expect(host).toContain('const ADVANCE_GUARD_MS = 500;');
    const emits = host.match(/socket\.emit\('advance-phase'/g) || [];
    expect(emits.length, 'one emit, inside pressAdvance').toBe(1);
    const at = host.indexOf('function pressAdvance(');
    expect(at).toBeGreaterThan(-1);
    expect(host.slice(at, at + 400)).toContain('if (now - lastAdvanceAt < ADVANCE_GUARD_MS) return false;');
    expect((host.match(/pressAdvance\(/g) || []).length).toBeGreaterThan(8);
  });
  it('the console guards Next step the same way', () => {
    const teacher = read('screens/teacher/teacher.js');
    expect(teacher).toContain('var ADVANCE_GUARD_MS = 500;');
    const at = teacher.indexOf("nextStepBtn.addEventListener('click'");
    expect(teacher.slice(at, at + 300)).toContain('if (now - lastAdvanceAt < ADVANCE_GUARD_MS) return;');
  });
});
