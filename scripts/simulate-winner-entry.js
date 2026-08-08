/**
 * Winner-entry invariant sim — plays games/_winner-entry (collect → vote →
 * crown) against a running server and asserts the winner-announced payload
 * carries WHAT the winner won for: winnerEntry/winnerEntries traced from the
 * vote's candidates back to the collect responses, on host AND player, with
 * the payoff-length pause.
 *
 * Usage: node scripts/simulate-winner-entry.js  (server must be running)
 */
import { io } from 'socket.io-client';

const SERVER = 'http://localhost:3000';
const IDEAS = ['Robot pets for every classroom', 'A homework-eating machine', 'Solar-powered skateboards'];

function connect() {
  return new Promise((resolve, reject) => {
    const s = io(SERVER, { forceNew: true });
    s.on('connect', () => resolve(s));
    s.on('connect_error', e => reject(e));
  });
}
function waitFor(socket, event, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeout);
    socket.once(event, d => { clearTimeout(t); resolve(d); });
  });
}
const wait = ms => new Promise(r => setTimeout(r, ms));

const host = await connect();
const players = [await connect(), await connect(), await connect()];

host.emit('create-room', { gameId: '_winner-entry' });
const { code } = await waitFor(host, 'room-created');
console.log('room:', code);

for (let i = 0; i < 3; i++) {
  players[i].emit('join-room', { code, name: 'Probe' + (i + 1) });
  await waitFor(players[i], 'join-success');
}

const winnerPromise = waitFor(host, 'winner-announced', 30000);
const playerWinnerPromise = waitFor(players[1], 'winner-announced', 30000);

host.emit('start-game', { code });
await waitFor(players[0], 'game-started');

for (let i = 0; i < 3; i++) players[i].emit('submit-response', { code, response: IDEAS[i] });
await wait(400);
host.emit('close-submissions', { code });

const voteData = await waitFor(players[0], 'vote-start');
// Everyone votes for whoever wrote IDEAS[0] — find that candidate
const target = voteData.candidates.find(c => (c.text || c.response || '').includes('Robot pets'));
for (const p of players) p.emit('submit-vote', { code, choice: target.playerId });

const winner = await winnerPromise;
const playerView = await playerWinnerPromise;
console.log('HOST winner-announced:', JSON.stringify({
  winnerName: winner.winnerName, winnerScore: winner.winnerScore,
  winnerEntry: winner.winnerEntry, winnerEntries: winner.winnerEntries, pause: winner.pause
}, null, 1));
console.log('PLAYER got same entry:', playerView.winnerEntry === winner.winnerEntry);

const ok = winner.winnerEntry === 'Robot pets for every classroom'
  && winner.winnerEntries.length === 1
  && winner.winnerEntries[0].text === 'Robot pets for every classroom'
  && winner.pause === 10
  && playerView.winnerEntry === winner.winnerEntry;
console.log(ok ? 'PROBE PASS' : 'PROBE FAIL');
process.exit(ok ? 0 : 1);
