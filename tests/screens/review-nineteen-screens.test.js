// Review nineteen (2026-09-29), the screens and the wiring: the projector
// keeps the card and the Remove box to itself, a removed student's screen
// is clean, an empty box says so, the lines are in every language.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { audienceFor, AUDIENCE, AUDIENCE_LABELS } from '../../engine/audience.js';
import { translate, LANGUAGE_CODES } from '../../engine/i18n/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const loadGame = (id) => JSON.parse(read(`games/${id}/config.json`));
const others = (LANGUAGE_CODES || ['en', 'es', 'fr', 'de', 'pt', 'it']).filter(l => l !== 'en');

describe('the projector never shows the Charades card', () => {
  it('the turn handler sends the host no item', () => {
    const turn = read('engine/phase-handlers/turn.js');
    expect(turn).toMatch(/role: 'host',\r?\n\s*item: null,/);
  });
  it('the projector says where the card is, in every language', () => {
    const host = read('screens/host/host.js');
    expect(host).toContain("UiLang.t('Only the describer can see the card.')");
    for (const lang of others) {
      expect(translate(lang, 'Only the describer can see the card.'), lang).not.toBe('Only the describer can see the card.');
    }
  });
});

describe('Remove lives on the console, not the projector', () => {
  it('the projector roster has no Remove button or confirm box', () => {
    const host = read('screens/host/host.js');
    expect(host).not.toContain('player-kick-btn');
    expect(host).not.toContain("confirmLabel: 'Remove'");
  });
  it('the console still has it', () => {
    expect(read('screens/teacher/teacher.js')).toContain("confirmLabel: 'Remove'");
  });
});

describe('a removed student sees a clean screen', () => {
  it('kicked and room-closed both fold the joke bubble away', () => {
    const player = read('screens/player/player.js');
    const kicked = player.slice(player.indexOf("socket.on('kicked'"), player.indexOf("socket.on('kicked'") + 600);
    expect(kicked).toContain('hideEarlyJoke();');
    const closed = player.slice(player.indexOf("socket.on('room-closed'"), player.indexOf("socket.on('room-closed'") + 400);
    expect(closed).toContain('hideEarlyJoke();');
  });
});

describe('an empty box is named, and time sends what is there', () => {
  it('Submit on a multi-box step names the gap and focuses it', () => {
    const player = read('screens/player/player.js');
    expect(player).toContain("showResponseNotice(UiLang.t('Fill in every box.'));");
    expect(player).toContain('firstEmpty.focus();');
    expect(player).not.toContain('if (!allFilled) return;');
  });
  it('the expiry sends the boxes when any has words', () => {
    const player = read('screens/player/player.js');
    expect(player).toContain("if (anyFilled) socket.emit('submit-response', { code: currentRoomCode, response: result });");
  });
  it('the line is in every language', () => {
    for (const lang of others) {
      expect(translate(lang, 'Fill in every box.'), lang).not.toBe('Fill in every box.');
    }
  });
});

describe('the answer line tells the truth about rounds and live totals', () => {
  it("Two Truths' lie vote says the points go on the board", () => {
    const tt = loadGame('two-truths-a-lie');
    const id = '_fe:foreach-player:vote-lie';
    const cfg = { ...tt, phases: { ...tt.phases, [id]: { ...tt.phases['foreach-player'].subPhases['vote-lie'], id } } };
    expect(audienceFor(cfg, id).key).toBe(AUDIENCE.SCORED);
  });
  it('a round nothing reads stays with the teacher; a round a sibling quotes goes to the class', () => {
    const base = {
      phases: {
        rounds: { type: 'foreach', data: 'ask.responses', subPhases: {
          guess: { type: 'collect-choice', prompt: 'Pick', choices: ['a', 'b'] },
          show: { type: 'announce', message: 'They picked {{guess.result}}' }
        }, next: 'end' },
        end: { type: 'end' }
      }
    };
    const withId = (name) => ({ phases: { ...base.phases, ['_fe:rounds:' + name]: { ...base.phases.rounds.subPhases[name], id: '_fe:rounds:' + name } } });
    expect(audienceFor(withId('guess'), '_fe:rounds:guess').key).toBe(AUDIENCE.CLASS);
    const quiet = withId('guess');
    delete quiet.phases.rounds.subPhases.show;
    quiet.phases.rounds = { ...quiet.phases.rounds, subPhases: { guess: base.phases.rounds.subPhases.guess } };
    expect(audienceFor(quiet, '_fe:rounds:guess').key).toBe(AUDIENCE.TEACHER);
  });
  it("Live Poll's question is a tally: bars while it runs, bars on the results screen", () => {
    expect(audienceFor(loadGame('live-poll'), 'ask').key).toBe(AUDIENCE.TALLY);
  });
  it('a live poll a later step lists answer by answer is still the class', () => {
    const cfg = { phases: {
      ask: { type: 'collect-choice', prompt: 'Q', choices: ['a', 'b'], liveResults: true, next: 'wall' },
      wall: { type: 'reveal-one', from: 'ask.responses', next: 'end' },
      end: { type: 'end' }
    } };
    expect(audienceFor(cfg, 'ask').key).toBe(AUDIENCE.CLASS);
  });
  it('the scored label is in every language, and the console has a hint for it', () => {
    for (const lang of others) {
      expect(translate(lang, AUDIENCE_LABELS[AUDIENCE.SCORED]), lang).not.toBe(AUDIENCE_LABELS[AUDIENCE.SCORED]);
    }
    expect(read('screens/teacher/teacher.js')).toMatch(/\n\s*scored: '/);
  });
});

describe('a solo quiz answer reaches the snapshot', () => {
  it('the answer handler writes the room snapshot', () => {
    const server = read('server.js');
    const start = server.indexOf('socket.on(EVENTS.SOLO_QUIZ_ANSWER');
    const block = server.slice(start, server.indexOf('socket.on(EVENTS.CLOSE_SOLO_QUIZ'));
    expect(block).toContain('persistRoom(code, room);');
  });
});
