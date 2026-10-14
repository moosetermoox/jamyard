/**
 * simulate-chain-names.js — names on a pass-around (2026-10-13) through a
 * real room on the hidden fixture games/_sim-chain-names, the chain
 * brick's own compile with `names: true`: everyone writes something they
 * are proud of, two classmates each add a cheer under the piece, and it
 * comes home. Every hand-off says whose piece it is, and the return names
 * who wrote each cheer.
 *
 *   node scripts/simulate-chain-names.js    (server running on :3000, or SIM_SERVER)
 */
import { connect, waitForEvent, drainEvent, wait, teardown, makeReporter, log } from './sim-harness.js';

const report = makeReporter();
const check = (description, condition) => report.check(condition, description);

async function promptsFor(players) {
  const out = [];
  for (const p of players) out.push(await waitForEvent(p, 'game-started', 6000).catch(() => null));
  return out;
}

async function main() {
  const host = await connect('HOST');
  host.emit('create-room', { gameId: '_sim-chain-names' });
  const roomData = await waitForEvent(host, 'room-created', 5000);
  const code = roomData.code;
  log('HOST', `Room ${code}`);
  const names = ['Ana', 'Ben', 'Cleo', 'Dev'];
  const proud = Object.fromEntries(names.map(n => [n, `${n} is proud of a finished project.`]));
  const players = [];
  try {
    for (const name of names) {
      const p = await connect(name.toUpperCase());
      players.push(p);
      p.emit('join-room', { code, name });
      await waitForEvent(p, 'join-success', 4000);
    }
    host.emit('start-game', { code });

    // 1. Everyone writes what they are proud of; the first step is unsigned
    const starts = await promptsFor(players);
    check('every student gets the first question', starts.every(s => s && /proud of/.test(s.prompt || '')));
    check('the first step carries no handed line', starts.every(s => s && !s.handedLine));
    players.forEach((p, i) => p.emit('submit-response', { code, response: proud[names[i]], phaseInstanceId: starts[i].phaseInstanceId }));
    await wait(400);
    host.emit('close-submissions', { code });

    // 2. The first cheer: the piece in the box, the writer named
    const first = await promptsFor(players);
    const holder1 = {};
    first.forEach((s, i) => { holder1[names[i]] = names.find(n => (s && s.prefill || '').includes(proud[n])) || null; });
    check('every student is handed one classmate\'s piece', names.every(n => holder1[n] && holder1[n] !== n));
    check('the first hand-off says who wrote it', names.every(n => first[names.indexOf(n)].handedLine === `${holder1[n]} wrote this.`));
    players.forEach((p, i) => p.emit('submit-response', { code, response: `Cheer one from ${names[i]}.`, phaseInstanceId: first[i].phaseInstanceId }));
    await wait(400);
    host.emit('close-submissions', { code });

    // 3. The second cheer: the starter and the first cheerer both named
    const second = await promptsFor(players);
    const holder2 = {};
    second.forEach((s, i) => { holder2[names[i]] = names.find(n => (s && s.prefill || '').includes(proud[n])) || null; });
    check('every student is handed a piece with its first cheer', names.every(n => holder2[n] && holder2[n] !== n && /Cheer one from/.test(second[names.indexOf(n)].prefill || '')));
    const secondOk = names.every(n => {
      const starter = holder2[n];
      const firstCheerer = names.find(m => holder1[m] === starter);
      return second[names.indexOf(n)].handedLine === `${starter} started this. ${firstCheerer} added to it.`;
    });
    check('the second hand-off names the starter and who cheered first', secondOk);
    players.forEach((p, i) => p.emit('submit-response', { code, response: `Cheer two from ${names[i]}.`, phaseInstanceId: second[i].phaseInstanceId }));
    await wait(400);
    drainEvent(players, 'game-started');
    host.emit('close-submissions', { code });

    // 4. The return: each cheer under the name of who wrote it
    const back = [];
    for (const p of players) back.push(await waitForEvent(p, 'show-results', 8000).catch(() => null));
    const backOk = names.every((me, i) => {
      const c = String(back[i] && back[i].content || '');
      const firstCheerer = names.find(m => holder1[m] === me);
      const secondCheerer = names.find(m => holder2[m] === me);
      return c.includes(`“${proud[me]}”`) &&
        c.includes(`${firstCheerer} added:\n“Cheer one from ${firstCheerer}.”`) &&
        c.includes(`${secondCheerer} added:\n“Cheer two from ${secondCheerer}.”`) &&
        !names.filter(n => n !== me).some(n => c.includes(proud[n]));
    });
    check('every writer gets their own piece back with both cheers signed, nobody else\'s', backOk);
    check('the return never shows the whole last version unsigned', back.every(r => !/classmates took it from there/.test(String(r && r.content || ''))));
    check('the return is private (an own reveal)', back.every(r => r && r.ownReveal === true));
    const hostShown = await waitForEvent(host, 'show-results', 2000).catch(() => null);
    check('the projector gets a neutral line, never a cheer', !!hostShown && !/Cheer (one|two) from/.test(String(hostShown.content || '')));
  } finally {
    teardown(host, players);
  }
  report.summary('CHAIN NAMES');
  process.exit(report.errors ? 1 : 0);
}

main().catch(err => { log('SIM', 'ERROR ' + err.message); process.exit(1); });
