import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// A reviewer's small wording items (2026-09-23), each one verified in the
// code before the fix: Snowball promised one reader to a trio, the early
// joke stayed up through the whole activity, the console's Live entries
// hint named a reveal that Exit Ticket does not have, "Test with Robots"
// sat beside "Try it out" with no way to tell them apart, and Try it out
// opened Snowball with one pretend student.

const player = readFileSync('screens/player/player.js', 'utf8');
const teacherJs = readFileSync('screens/teacher/teacher.js', 'utf8');
const teacherHtml = readFileSync('screens/teacher/index.html', 'utf8');
const editorHtml = readFileSync('screens/designer/editor.html', 'utf8');
const editorJs = readFileSync('screens/designer/editor.js', 'utf8');
const prototype = readFileSync('screens/prototype/prototype.js', 'utf8');
const server = readFileSync('server.js', 'utf8');
const collect = readFileSync('engine/phase-handlers/collect.js', 'utf8');

describe('the early-bird joke folds away when the activity moves on', () => {
  it('the student screen notes the phase the joke was told in and hides it on the next one', () => {
    expect(player).toContain('earlyJokePhaseSeen(payload.phaseInstanceId);');
    expect(player).toContain('earlyJokePhase = latestPhaseInstanceId;');
    expect(player).toContain('earlyJokeShownAt = Date.now();');
    const fn = player.slice(player.indexOf('function earlyJokePhaseSeen('), player.indexOf('// joke = { setup, punchline, pauseMs }'));
    expect(fn).toContain('if (earlyJokeCard.hidden || earlyJokeDismissed) return;');
    expect(fn).toContain('earlyJokeCard.hidden = true;');
    expect(fn).toContain('FitScreen.fitNow()');
  });
});

describe('the console hint says where this step\'s answers go', () => {
  it('the server sends the audience key on every teacher-phase and the join snapshot', () => {
    expect(server).toContain("import { audienceFor } from './engine/audience.js';");
    expect(server).toContain('function audienceKeyFor(engine, phase)');
    expect((server.match(/audience: audienceKeyFor\(engine, phase\)/g) || []).length).toBe(2);
    expect(server).toContain('snap.audience = audienceKeyFor(engine, phase);');
  });

  it('the console picks the hint by audience, with the old line as the fallback', () => {
    expect(teacherHtml).toContain('id="entries-hint"');
    expect(teacherJs).toContain('entriesHint.textContent = ENTRIES_HINTS[data.audience] || ENTRIES_HINTS.generic;');
    for (const key of ['teacher', 'ai', 'class', "'class-after-review'", 'classmate', "'classmate+class'", "'classmate+class-after-review'", 'generic']) {
      expect(teacherJs).toContain(`  ${key}: '`);
    }
    // The private step never mentions a reveal or the AI
    const teacherLine = teacherJs.match(/  teacher: '([^\n]*)'/)[1];
    expect(teacherLine).not.toMatch(/reveal|AI/);
    expect(teacherLine).toContain('never reach the class');
  });
});

describe('the student screen counts heads before promising one reader', () => {
  it('both collect payloads pass the head count to the audience line', () => {
    expect((collect.match(/audienceLine\([^)]*\{ playerCount: (ctx\.)?engine\.players\.list\(\)\.length \}\)/g) || []).length).toBe(2);
  });
});

describe('the editor\'s two test buttons read differently', () => {
  it('the robot check says what it does, beside Try it out', () => {
    expect(editorHtml).toContain('>Check for problems</button>');
    expect(editorHtml).not.toContain('Test with Robots');
    expect(editorJs).toContain("reviewBtn.textContent = 'Check for problems';");
    expect(editorJs).not.toContain("'Test with Robots'");
  });
});

describe('Try it out seats what the activity needs', () => {
  it('the launch reads the seat count off the config unless a count was asked for', () => {
    expect(prototype).toContain('const seatsReady = fetch(');
    expect(prototype).toContain('BenchLogic.startingSeats(config)');
    expect(prototype).toContain("const countAsked = playerCount.value !== '' && askedCount !== 1;");
    expect(prototype).toContain('seatsReady.then(() => {');
    expect(prototype).toContain('createPlayerIframes(e.data.code, count);');
  });
});
