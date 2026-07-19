/**
 * Team-split interactive-modes sim — plays games/_team-modes (choice split,
 * teacher split, then choice with open capacity) with 5 clients and asserts
 * the invariants that unit tests can't see over sockets:
 *
 *   choice: capacity enforcement (a full team rejects the pick and tells
 *   only the tapper), re-pick allowed, straggler auto-fill on confirm
 *   teacher: assign / unassign / reassign round-trips, confirm auto-fills,
 *   explicit assignments survive the fill
 *   choice + capacity "open": no caps at all — everyone can join the same
 *   team (pre-existing classroom teams), auto-close when all placed
 *   both: a PLAYER emitting team-split-confirm / team-assign is ignored
 *   (privileged actions are teacher-socket only)
 *
 * Usage: node scripts/simulate-team-modes.js   (server must be running)
 */

import {
  setupRoom, teardown, wait, log,
  waitForEvent, waitForEventOnAll, drainEvent, drainAll, makeReporter
} from './sim-harness.js';

const reporter = makeReporter();
const { check, warn } = reporter;

const { host, players, code } = await setupRoom('_team-modes', 5);
log('SIM', `room ${code} with 5 players`);
host.emit('start-game', { code });

// ---- Phase 1: choice mode (groupSize 2, 5 players → Group 1 cap 3, Group 2 cap 2) ----

const start = await waitForEventOnAll(players, 'team-choice-start');
const rosters = start[0].rosters;
check(rosters.length === 2, `groupSize 2 with 5 players makes 2 groups (got ${rosters.length})`);
check(rosters[0].capacity === 3 && rosters[1].capacity === 2,
  `capacities are 3,2 (got ${rosters.map(r => r.capacity).join(',')})`);
const g1 = rosters[0].name, g2 = rosters[1].name;
drainAll([host, ...players]);

// Three players fill Group 1 to capacity
for (const i of [0, 1, 2]) {
  players[i].emit('team-pick', { code, team: g1 });
  await wait(150);
}
drainAll([host, ...players]);

// The fourth pick on a full team must bounce — and only to the tapper
players[3].emit('team-pick', { code, team: g1 });
const bounce = await waitForEvent(players[3], 'team-choice-update', 3000);
check(bounce.full === g1 && !bounce.yourTeam, 'full-team pick rejected with a personal "full" notice');
drainAll([host, ...players]);

// Intruder check: a player trying to confirm must be ignored
players[3].emit('team-split-confirm', { code });
await wait(500);
check(players[0]._buffer['team-split'] === undefined || players[0]._buffer['team-split'].length === 0,
  'player-emitted confirm did NOT close the phase');

// Player 3 takes an open spot; player 4 never picks (straggler)
players[3].emit('team-pick', { code, team: g2 });
await wait(300);
drainAll([host, ...players]);

host.emit('team-split-confirm', { code });
const finals = await waitForEventOnAll(players, 'team-split');
check(finals.every(f => !!f.myTeam), 'every player (incl. the straggler) landed on a team');
check(finals[4].myTeam === g2, `straggler auto-filled into the open group (got ${finals[4].myTeam})`);
check([0, 1, 2].every(i => finals[i].myTeam === g1), 'the three pickers kept their chosen group');
drainAll([host, ...players]);

// ---- Phase 2: teacher mode (2 teams, host arranges) ----

host.emit('advance-phase', { code });
const setup = await waitForEvent(host, 'team-split-setup');
check(setup.unassigned.length === 5, `teacher mode starts with all 5 unassigned (got ${setup.unassigned.length})`);
const t1 = setup.rosters[0].name, t2 = setup.rosters[1].name;
const alice = setup.unassigned[0];
drainAll([host, ...players]);

// Intruder check: a player emitting team-assign must be ignored
players[1].emit('team-assign', { code, playerId: alice.playerId, team: t2 });
await wait(400);
check(host._buffer['team-split-setup'] === undefined || host._buffer['team-split-setup'].length === 0,
  'player-emitted assign produced no roster update');

// Assign → unassign → reassign round-trip
host.emit('team-assign', { code, playerId: alice.playerId, team: t2 });
let upd = await waitForEvent(host, 'team-split-setup');
check(upd.rosters.find(r => r.name === t2).members.some(m => m.playerId === alice.playerId),
  `${alice.name} shows up on ${t2} after assign`);

host.emit('team-assign', { code, playerId: alice.playerId, team: '' });
upd = await waitForEvent(host, 'team-split-setup');
check(upd.unassigned.some(u => u.playerId === alice.playerId), 'unassign sends the player back to the pool');

host.emit('team-assign', { code, playerId: alice.playerId, team: t1 });
await waitForEvent(host, 'team-split-setup');
drainAll([host, ...players]);

// Confirm: the explicit assignment survives, everyone else auto-fills evenly
host.emit('team-split-confirm', { code });
const arranged = await waitForEventOnAll(players, 'team-split');
check(arranged.every(f => !!f.myTeam), 'teacher confirm placed everyone');
const aliceFinal = arranged.find(f => f.teams[t1].some(m => m.playerId === alice.playerId));
check(!!aliceFinal, `explicit assignment survived auto-fill (${alice.name} on ${t1})`);
const sizes = [arranged[0].teams[t1].length, arranged[0].teams[t2].length].sort();
check(sizes[0] === 2 && sizes[1] === 3, `auto-fill balanced the teams 3/2 (got ${sizes.join('/')})`);
drainAll([host, ...players]);

// ---- Phase 3: choice mode with capacity "open" (pre-existing teams) ----
// No spot caps: everyone can pile onto the same team — nobody gets bounced
// from the team they actually belong to.

host.emit('advance-phase', { code });
const openStart = await waitForEventOnAll(players, 'team-choice-start');
const openRosters = openStart[0].rosters;
check(openRosters.map(r => r.name).join(',') === 'Red,Blue',
  `custom team names delivered (got ${openRosters.map(r => r.name).join(',')})`);
check(openRosters.every(r => r.capacity === null && r.open === null),
  'open capacity: rosters carry no caps');
drainAll([host, ...players]);

// All five join Red — pick 4 and 5 would bounce under even-split caps (3,2)
for (const p of players) {
  p.emit('team-pick', { code, team: 'Red' });
  await wait(150);
}

// All placed → the phase auto-closes without a confirm
const openFinals = await waitForEventOnAll(players, 'team-split');
check(openFinals.every(f => f.myTeam === 'Red'),
  `all five landed on Red, nobody bounced (got ${openFinals.map(f => f.myTeam).join(',')})`);
check(openFinals[0].teams['Red'].length === 5 && openFinals[0].teams['Blue'].length === 0,
  `uneven 5/0 split allowed (got ${openFinals[0].teams['Red'].length}/${openFinals[0].teams['Blue'].length})`);
drainAll([host, ...players]);

host.emit('advance-phase', { code });
await waitForEvent(players[0], 'game-ended', 5000).catch(() => warn('game-ended not seen'));

await teardown(host, players);
reporter.summary('TEAM MODES SUMMARY');
process.exit(reporter.errors > 0 ? 1 : 0);
