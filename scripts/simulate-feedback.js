/**
 * simulate-feedback.js — the peer-feedback brick (2026-10-01, the
 * mechanics inventory's Part 3) through a real room on the hidden fixture
 * games/_sim-feedback, which is the brick's own compile with two readers:
 * every student writes a thesis, two classmates each read the THESIS (the
 * second never sees the first one's comment), and every writer gets their
 * thesis back with both comments, privately.
 *
 *   node scripts/simulate-feedback.js    (server running on :3000, or SIM_SERVER)
 */
import { connect, waitForEvent, drainEvent, wait, teardown, makeReporter, log } from './sim-harness.js';

const report = makeReporter();
const check = (description, condition) => report.check(condition, description);

async function promptsFor(players) {
  const out = [];
  for (const p of players) {
    const started = await waitForEvent(p, 'game-started', 6000).catch(() => null);
    out.push(started);
  }
  return out;
}

async function main() {
  const host = await connect('HOST');
  host.emit('create-room', { gameId: '_sim-feedback' });
  const roomData = await waitForEvent(host, 'room-created', 5000);
  const code = roomData.code;
  log('HOST', `Room ${code}`);
  const names = ['Ana', 'Ben', 'Cleo', 'Dev'];
  const thesis = Object.fromEntries(names.map(n => [n, `${n}'s thesis: homework should be optional.`]));
  const players = [];
  try {
    for (const name of names) {
      const p = await connect(name.toUpperCase());
      players.push(p);
      p.emit('join-room', { code, name });
      await waitForEvent(p, 'join-success', 4000);
    }
    host.emit('start-game', { code });

    // 1. Every student writes a thesis
    const drafts = await promptsFor(players);
    check('every student gets the draft question', drafts.every(d => d && /Write your thesis/.test(d.prompt || '')));
    players.forEach((p, i) => p.emit('submit-response', { code, response: thesis[names[i]], phaseInstanceId: drafts[i].phaseInstanceId }));
    await wait(400);
    host.emit('close-submissions', { code });

    // 2. The first reader reads one classmate's thesis
    const first = await promptsFor(players);
    const readFirst = {};
    first.forEach((s, i) => {
      const hit = names.find(n => (s && s.prompt || '').includes(thesis[n]));
      readFirst[names[i]] = hit || null;
    });
    check('every first reader sees one thesis under the instruction', names.every(n => readFirst[n]));
    check('no first reader reads their own thesis', names.every(n => readFirst[n] !== n));
    check('the four theses go to four different readers', new Set(Object.values(readFirst)).size === 4);
    players.forEach((p, i) => p.emit('submit-response', { code, response: `First comment from ${names[i]} on ${readFirst[names[i]]}: strong claim. Which evidence?`, phaseInstanceId: first[i].phaseInstanceId }));
    await wait(400);
    host.emit('close-submissions', { code });

    // 3. The second reader reads a thesis, never the first comment
    const second = await promptsFor(players);
    const readSecond = {};
    second.forEach((s, i) => {
      const text = s && s.prompt || '';
      readSecond[names[i]] = names.find(n => text.includes(thesis[n])) || null;
    });
    check('every second reader sees a thesis', names.every(n => readSecond[n]));
    check('no second reader sees the first reader\'s comment', second.every(s => !/First comment from/.test(s && s.prompt || '')));
    check('no second reader reads their own thesis', names.every(n => readSecond[n] !== n));
    check('nobody reads the same thesis twice', names.every(n => readSecond[n] !== readFirst[n]));
    players.forEach((p, i) => p.emit('submit-response', { code, response: `Second comment from ${names[i]} on ${readSecond[names[i]]}: clear. Why optional?`, phaseInstanceId: second[i].phaseInstanceId }));
    await wait(400);
    drainEvent(players, 'game-started');
    host.emit('close-submissions', { code });

    const hostPrompts = (host._buffer['game-started'] || []).map(e => String(e && e.prompt || ''));
    check('the projector never shows a thesis during the feedback steps', hostPrompts.length >= 2 && hostPrompts.every(t => !names.some(n => t.includes(thesis[n]))));

    // 4. Each writer gets their thesis back with both comments, privately
    const back = [];
    for (const p of players) back.push(await waitForEvent(p, 'show-results', 8000).catch(() => null));
    const ok = back.map((r, i) => {
      const c = String(r && r.content || '');
      const me = names[i];
      return c.includes(thesis[me]) && c.includes('You wrote:') && c.includes('What your classmates said:') &&
        new RegExp(`First comment from \\w+ on ${me}:`).test(c) && new RegExp(`Second comment from \\w+ on ${me}:`).test(c) &&
        !names.filter(n => n !== me).some(n => c.includes(thesis[n]));
    });
    check('every writer gets their own thesis and both comments on it, nobody else\'s', ok.every(Boolean));
    check('the return is private (an own reveal)', back.every(r => r && r.ownReveal === true));
  } finally {
    teardown(host, players);
  }
  report.summary('PEER FEEDBACK');
  process.exit(report.errors ? 1 : 0);
}

main().catch(err => { log('SIM', 'ERROR ' + err.message); process.exit(1); });
