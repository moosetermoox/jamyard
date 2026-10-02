/**
 * simulate-hot-seat.js — the hot seat (2026-10-01, the mechanics
 * inventory's Part 3, reworked on the owner's call the same day) through
 * real rooms on two hidden fixtures, each the hotseat brick's own compile:
 *   games/_sim-hot-seat         pick "vote", two questions per seat: the
 *                               class votes Cleo first, Ana second
 *   games/_sim-hot-seat-random  pick "random", a new student every question
 * Everyone writes a question and the teacher approves them; then each
 * question goes up on the projector and every screen with who answers it,
 * marked as theirs on the seat's screen, the seat moving every run, and
 * nobody answering their own question. A refresh gets the current one.
 *
 *   node scripts/simulate-hot-seat.js    (server running on :3000, or SIM_SERVER)
 */
import { connect, waitForEvent, drainEvent, wait, teardown, makeReporter, log } from './sim-harness.js';

const report = makeReporter();
const check = (description, condition) => report.check(condition, description);

async function room(gameId, names) {
  const host = await connect('HOST');
  host.emit('create-room', { gameId });
  const { code } = await waitForEvent(host, 'room-created', 5000);
  log('HOST', `Room ${code} (${gameId})`);
  const players = [];
  const tokens = [];
  for (const name of names) {
    const p = await connect(name.toUpperCase());
    players.push(p);
    p.emit('join-room', { code, name });
    const joined = await waitForEvent(p, 'join-success', 4000);
    p._id = joined.playerId || p.id;
    tokens.push(joined.token);
  }
  return { host, code, players, tokens };
}

async function askAndApprove(host, code, players, names) {
  const asks = [];
  for (const p of players) asks.push(await waitForEvent(p, 'game-started', 8000));
  players.forEach((p, i) => p.emit('submit-response', { code, response: `Question from ${names[i]}?`, phaseInstanceId: asks[i].phaseInstanceId }));
  await wait(400);
  host.emit('close-submissions', { code });
  const preview = await waitForEvent(host, 'preview-content', 8000);
  await wait(200);
  host.emit('preview-approve', { code });
  return preview;
}

const authorOf = (e) => (String(e && e.item || '').match(/Question from (\w+)\?/) || [])[1];

async function voted() {
  const names = ['Ana', 'Ben', 'Cleo', 'Dev'];
  const { host, code, players, tokens } = await room('_sim-hot-seat', names);
  try {
    host.emit('start-game', { code });
    // Cleo gets three votes, Ana one
    const ballots = [];
    for (const p of players) ballots.push(await waitForEvent(p, 'vote-start', 8000));
    const cleoId = players[2]._id;
    players.forEach((p, i) => p.emit('submit-vote', { code, choice: i === 2 ? players[0]._id : cleoId, phaseInstanceId: ballots[i].phaseInstanceId }));
    await wait(400);
    drainEvent(players, 'vote-start');
    host.emit('close-voting', { code });
    const named = await waitForEvent(host, 'show-results', 8000);
    check('the first name goes up', /First in the hot seat:\s+\*\*Cleo\*\*/.test(String(named.content || '')));
    host.emit('advance-phase', { code });

    const preview = await askAndApprove(host, code, players, names);
    check('the teacher reads every question first', (preview.responses || []).length === 4);

    const hostStart = await waitForEvent(host, 'reveal-one-start', 8000);
    const starts = [];
    for (const p of players) starts.push(await waitForEvent(p, 'reveal-one-start', 8000));
    check('the projector knows who goes first, and every question is in play', hostStart.hotSeat === 'Cleo' && hostStart.total === 4);
    check('Cleo is told they are first, nobody else is', starts[2].inHotSeat === true && starts.filter(s => s.inHotSeat).length === 1);

    for (let k = 0; k < 2; k++) { host.emit('reveal-next', { code }); await wait(250); }

    // A classmate refreshes after two questions
    players[3].disconnect();
    const devBack = await connect('DEV2');
    players[3] = devBack;
    devBack.emit('join-room', { code, name: 'Dev', token: tokens[3] });
    await waitForEvent(devBack, 'join-success', 4000);
    await wait(400);
    const devNow = (devBack._buffer['reveal-one-item'] || [])[0];
    check('a refreshed screen gets the question that is up, with who answers', devNow && devNow.index === 2 && devNow.hotSeat === 'Cleo' && typeof devNow.item === 'string');

    for (let k = 0; k < 2; k++) { host.emit('reveal-next', { code }); await wait(250); }

    const hostItems = host._buffer['reveal-one-item'] || [];
    check('the projector shows every question in words with who answers it', hostItems.length === 4 && hostItems.every(e => typeof e.item === 'string' && e.hotSeat));
    check('the seat moves in vote order, two questions each: Cleo, Cleo, Ana, Ana', hostItems.map(e => e.hotSeat).join() === 'Cleo,Cleo,Ana,Ana');
    check('each run counts its own turns', hostItems.map(e => `${e.turn}/${e.turns}`).join() === '1/2,2/2,1/2,2/2');
    check('nobody answers their own question', hostItems.every(e => authorOf(e) !== e.hotSeat));
    const cleoItems = players[2]._buffer['reveal-one-item'] || [];
    const anaItems = players[0]._buffer['reveal-one-item'] || [];
    check('the seat\'s screen marks the question as theirs, and only then', cleoItems.map(e => e.mine).join() === 'true,true,false,false' && anaItems.map(e => e.mine).join() === 'false,false,true,true');
    check('every screen gets the words too', anaItems.every(e => typeof e.item === 'string'));
  } finally {
    teardown(host, players);
  }
}

async function random() {
  const names = ['Eli', 'Fay', 'Gus'];
  const { host, code, players } = await room('_sim-hot-seat-random', names);
  try {
    host.emit('start-game', { code });
    await askAndApprove(host, code, players, names);
    const hostStart = await waitForEvent(host, 'reveal-one-start', 8000);
    check('a student is drawn to go first', names.includes(hostStart.hotSeat) && hostStart.total === 3);
    for (let k = 0; k < 3; k++) { host.emit('reveal-next', { code }); await wait(250); }
    const items = host._buffer['reveal-one-item'] || [];
    check('a new student every question, all three get a turn', new Set(items.map(e => e.hotSeat)).size === 3);
    check('nobody answers their own question', items.every(e => authorOf(e) !== e.hotSeat));
  } finally {
    teardown(host, players);
  }
}

async function main() {
  await voted();
  await random();
  report.summary('THE HOT SEAT');
  process.exit(report.errors ? 1 : 0);
}

main().catch(err => { log('SIM', 'ERROR ' + err.message); process.exit(1); });
