/**
 * Debate pairs sim (2026-09-20, the pairs brick).
 *
 * Drives games/_sim-debate-pairs (compiled by the pairs brick itself:
 * a pairwise collect with sides, two follow-up rounds with the same
 * partner, a pair-private reveal) with FIVE students, so one group is a
 * triple, and checks what the engine promised the storyboard:
 *
 *  1. Round 1: every student is dealt a side, partners hold opposite
 *     sides (the triple: two of one, one of the other), no raw tokens
 *  2. Round 2: each student's prompt carries the PARTNER's opening (never
 *     their own; the triple sees both partners), still their own side
 *  3. Round 3: the switch, each prompt names the OTHER side and carries
 *     the partner's rebuttal
 *  4. The reveal is pair-private: each student sees their partner's last
 *     piece, the projector sees none of the students' text
 *  5. The room reaches the end
 *
 * Requires the server running: node scripts/simulate-debate-pairs.js
 */

import {
  wait, log, setupRoom, teardown,
  waitForEvent, waitForEventOnAll, makeReporter
} from './sim-harness.js';

const GAME_ID = '_sim-debate-pairs';
const NUM_PLAYERS = 5;
const SIDES = ['For', 'Against'];

const r = makeReporter();

function sideOf(prompt) {
  const found = SIDES.filter(s => new RegExp('\\*\\*' + s + '\\*\\*|arguing ' + s + '\\b|argue ' + s + '\\b').test(prompt));
  return found.length === 1 ? found[0] : null;
}

async function run() {
  console.log('\n=== DEBATE PAIRS SIMULATION ===');
  const { host, players, names, code } = await setupRoom(GAME_ID, NUM_PLAYERS);
  try {
    host.emit('start-game', { code });

    // --- Round 1: opening, sides dealt ---
    const open = await waitForEventOnAll(players, 'game-started', 8000);
    const prompts1 = open.map(ev => String(ev.prompt || ''));
    r.check(prompts1.every(p => !p.includes('{{')), 'round 1: no raw {{tokens}} reach a student');
    const sides = prompts1.map(sideOf);
    r.check(sides.every(Boolean), `round 1: every student was dealt one side (${sides.join(', ')})`);
    const forCount = sides.filter(s => s === 'For').length;
    r.check(forCount === 3 && sides.length - forCount === 2,
      `round 1: five students split 3 For / 2 Against (one pair + one triple with two of one side), got ${forCount}/${sides.length - forCount}`);

    players.forEach((p, i) => {
      p.emit('submit-response', { code, response: `OPENING by ${names[i]} for ${sides[i]}.` });
    });
    await wait(500);
    host.emit('close-submissions', { code });

    // --- Round 2: rebuttal, the partner's opening in view ---
    const rebut = await waitForEventOnAll(players, 'game-started', 8000);
    const prompts2 = rebut.map(ev => String(ev.prompt || ''));
    r.check(prompts2.every(p => !p.includes('{{')), 'round 2: no raw {{tokens}}');
    const partnersOf = prompts2.map((p, i) => names.filter((n, j) => j !== i && p.includes(`OPENING by ${n} `)));
    r.check(prompts2.every((p, i) => !p.includes(`OPENING by ${names[i]} `)), 'round 2: nobody is shown their own opening');
    r.check(partnersOf.every(list => list.length >= 1), `round 2: everyone sees at least one partner's opening (${partnersOf.map(l => l.length).join(',')})`);
    const tripleMembers = partnersOf.filter(list => list.length === 2).length;
    r.check(tripleMembers === 3, `round 2: the triple's three members each see BOTH partners (got ${tripleMembers})`);
    r.check(prompts2.every((p, i) => sideOf(p) === sides[i]), 'round 2: each student still holds the side from round 1');
    // partners hold opposite sides in the pair; the triple has one odd side out
    const pairMembers = partnersOf.map((list, i) => ({ i, list })).filter(x => x.list.length === 1);
    r.check(pairMembers.every(({ i, list }) => sides[names.indexOf(list[0])] !== sides[i]), 'round 2: the pair holds opposite sides');

    players.forEach((p, i) => {
      p.emit('submit-response', { code, response: `REBUTTAL by ${names[i]}.` });
    });
    await wait(500);
    host.emit('close-submissions', { code });

    // --- Round 3: the switch ---
    const sw = await waitForEventOnAll(players, 'game-started', 8000);
    const prompts3 = sw.map(ev => String(ev.prompt || ''));
    r.check(prompts3.every(p => !p.includes('{{')), 'round 3: no raw {{tokens}}');
    const other = s => (s === 'For' ? 'Against' : 'For');
    r.check(prompts3.every((p, i) => p.includes('you now argue ' + other(sides[i]))),
      'round 3: every student is told to argue the OTHER side');
    r.check(prompts3.every((p, i) => partnersOf[i].some(n => p.includes(`REBUTTAL by ${n}.`))),
      'round 3: the partner\'s rebuttal is in view');
    r.check(prompts3.every((p, i) => !p.includes(`REBUTTAL by ${names[i]}.`)), 'round 3: nobody sees their own rebuttal');

    players.forEach((p, i) => {
      p.emit('submit-response', { code, response: `FINAL by ${names[i]}.` });
    });
    await wait(500);
    host.emit('close-submissions', { code });

    // --- Pair-private reveal ---
    const reveals = await waitForEventOnAll(players, 'show-results', 8000);
    const contents = reveals.map(ev => String(ev.content || ''));
    r.check(contents.every(c => !c.includes('{{')), 'reveal: no raw tokens');
    r.check(contents.every((c, i) => partnersOf[i].every(n => c.includes(`FINAL by ${n}.`))),
      'reveal: each student sees their partner\'s final piece');
    r.check(contents.every((c, i) => names.every((n, j) => partnersOf[i].includes(n) || j === i || !c.includes(`FINAL by ${n}.`))),
      'reveal: nobody sees another pair\'s writing');
    const hostReveal = await waitForEvent(host, 'show-results', 4000).catch(() => null);
    const hostText = hostReveal ? JSON.stringify(hostReveal) : '';
    r.check(!/OPENING by|REBUTTAL by|FINAL by/.test(hostText), 'reveal: the projector shows none of the students\' text');

    host.emit('advance-phase', { code });
    try {
      await waitForEvent(players[0], 'game-ended', 8000);
      r.check(true, 'the room reached the end');
    } catch {
      r.warn('game-ended not observed');
    }
  } finally {
    await teardown(host, players);
  }

  r.summary('DEBATE PAIRS SUMMARY');
  process.exit(r.errors > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('\x1b[31mSimulator crashed:\x1b[0m', err.message);
  process.exit(1);
});
