/**
 * Demo room holder — spin up a live room with bot players and HOLD it at a
 * phase, so a human (or a screenshot harness) can poke at the host screen,
 * player screens, or the /teacher console against real state.
 *
 * Usage:
 *   node scripts/demo-room.js [gameId] [numPlayers] [hold] [holdSeconds]
 *     gameId       default _sim-teacher
 *     numPlayers   default 3
 *     hold         'collect' (entries submitted, submissions open)
 *                  'preview' (submissions closed, teacher review pending)
 *                  default 'collect'
 *     holdSeconds  default 60
 *
 * Prints CODE= and PIN= lines — join the room from any device, or open
 * /teacher with the PIN. The room dies when the script exits.
 */

import { connect, waitForEvent, wait, log } from './sim-harness.js';

const GAME = process.argv[2] || '_sim-teacher';
const N = parseInt(process.argv[3], 10) || 3;
const HOLD = process.argv[4] || 'collect';
const HOLD_MS = (parseInt(process.argv[5], 10) || 60) * 1000;

const NAMES = ['Ava', 'Ben', 'Cal', 'Dee', 'Eli', 'Fay'];
const LINES = [
  'Once upon a time the projector unplugged itself.',
  'A perfectly innocent line for the story.',
  'The hamster knew more than it let on.',
  'Nobody expected the substitute to be a wizard.',
  'It was all going fine until the glitter.',
  'The vending machine started accepting compliments.'
];

const host = await connect('HOST');
host.emit('create-room', { gameId: GAME });
const room = await waitForEvent(host, 'room-created', 5000);
console.log('CODE=' + room.code);
console.log('PIN=' + room.teacherPin);

const players = [];
for (let i = 0; i < N; i++) {
  const p = await connect('P' + (i + 1));
  p.emit('join-room', { code: room.code, name: NAMES[i % NAMES.length] });
  await waitForEvent(p, 'join-success', 3000);
  players.push(p);
}
log('DEMO', `${N} bots joined`);

host.emit('start-game', { code: room.code });
await waitForEvent(players[0], 'game-started', 8000);
players.forEach((p, i) => p.emit('submit-response', { code: room.code, response: LINES[i % LINES.length] }));
await wait(600);
log('DEMO', 'entries submitted');

if (HOLD === 'preview') {
  host.emit('close-submissions', { code: room.code });
  await waitForEvent(host, 'preview-content', 8000);
  log('DEMO', 'holding at PREVIEW (teacher review pending)');
} else {
  log('DEMO', 'holding at COLLECT (submissions open)');
}

console.log('READY');
await wait(HOLD_MS);
host.disconnect();
players.forEach(p => p.disconnect());
log('DEMO', 'room released');
process.exit(0);
