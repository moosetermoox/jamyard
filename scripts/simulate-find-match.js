/**
 * simulate-find-match.js — secret pairs that find each other (2026-10-01,
 * the mechanics inventory's Part 3) through a real room on the hidden
 * fixture games/_sim-find-match, the findmatch brick's own compile (three
 * cell-biology pairs). Five students join (one pair becomes a trio), a
 * sixth arrives after the deal; every student gets ONE card in private,
 * the projector never shows one, and the close lists who held what and
 * counts who named a classmate holding the other half.
 *
 *   node scripts/simulate-find-match.js    (server running on :3000, or SIM_SERVER)
 */
import { connect, waitForEvent, wait, teardown, makeReporter, log } from './sim-harness.js';

const report = makeReporter();
const check = (description, condition) => report.check(condition, description);

const PAIRS = [['Nucleus', 'Holds the DNA'], ['Ribosome', 'Builds proteins'], ['Vacuole', 'Stores water']];
const ALL_CARDS = PAIRS.flat();
const itemOf = (card) => PAIRS.findIndex(p => p.includes(card));
const cardIn = (prompt) => {
  const m = String(prompt || '').match(/\*\*(.+?)\*\*/);
  return m ? m[1] : null;
};

async function main() {
  const host = await connect('HOST');
  host.emit('create-room', { gameId: '_sim-find-match' });
  const { code } = await waitForEvent(host, 'room-created', 5000);
  log('HOST', `Room ${code}`);
  const names = ['Ana', 'Ben', 'Cleo', 'Dev', 'Eli'];
  const players = [];
  try {
    for (const name of names) {
      const p = await connect(name.toUpperCase());
      players.push(p);
      p.emit('join-room', { code, name });
      await waitForEvent(p, 'join-success', 4000);
    }
    host.emit('start-game', { code });
    const hostStart = await waitForEvent(host, 'game-started', 6000);
    const starts = [];
    for (const p of players) starts.push(await waitForEvent(p, 'game-started', 6000));

    // A sixth student arrives after the deal
    const fay = await connect('FAY');
    fay.emit('join-room', { code, name: 'Fay' });
    await waitForEvent(fay, 'join-success', 4000);
    const fayStart = await waitForEvent(fay, 'game-started', 6000);
    players.push(fay);
    names.push('Fay');
    starts.push(fayStart);

    const cards = starts.map(s => cardIn(s && s.prompt));
    check('every student, the late one too, holds exactly one card from the list', cards.every(c => c && ALL_CARDS.includes(c)));
    check('the projector never shows a card', !ALL_CARDS.some(c => String(hostStart.prompt || '').includes(c)));
    const byItem = {};
    cards.forEach((c, i) => { (byItem[itemOf(c)] = byItem[itemOf(c)] || []).push(i); });
    const sizes = Object.values(byItem).map(m => m.length);
    // five students make two pairs, one a trio; the late one joins the smaller
    check('cards go out in twos, the odd one makes a trio, the late one joins the smallest', sizes.reduce((a, b) => a + b, 0) === 6 && sizes.every(n => n >= 2) && Math.max(...sizes) - Math.min(...sizes) <= 1);
    check('every group holds both halves of its pair', Object.entries(byItem).every(([k, m]) => m.length < 2 || new Set(m.map(i => cards[i])).size === 2));

    // Names are tapped from the class list, never typed (owner 2026-10-01)
    // The five who were in get Fay added when she joins; Fay gets the list whole
    await wait(300);
    const listOf = (i) => {
      const ups = players[i]._buffer['classmates-update'] || [];
      return ups.length ? ups[ups.length - 1].classmates : starts[i].classmates;
    };
    check('every student gets the class list to tap, everyone but them, alphabetical, a late joiner added',
      starts.every((s, i) => s.inputType === 'classmate' && Array.isArray(s.classmates) &&
        JSON.stringify(listOf(i)) === JSON.stringify(names.filter(n => n !== names[i]).slice().sort((a, b) => a.localeCompare(b)))));
    check('the students who were in before Fay got her name pushed to them', players.slice(0, 5).every(p => (p._buffer['classmates-update'] || []).length >= 1));
    // Everyone taps a groupmate, except Dev, who taps someone outside the group
    const typed = names.map((n, i) => {
      const mates = byItem[itemOf(cards[i])].filter(j => j !== i);
      if (n === 'Dev') return starts[i].classmates.find(c => !mates.some(j => names[j] === c));
      return mates.length ? names[mates[0]] : '';
    });
    players.forEach((p, i) => p.emit('submit-response', { code, response: typed[i], phaseInstanceId: starts[i].phaseInstanceId }));
    await wait(500);
    host.emit('close-submissions', { code });

    const shown = await waitForEvent(host, 'show-results', 8000);
    const text = String(shown.content || '');
    const groupsWithMates = Object.values(byItem).filter(m => m.length >= 2).flat().length;
    const expectedFound = groupsWithMates - (byItem[itemOf(cards[names.indexOf('Dev')])].length >= 2 ? 1 : 0);
    check('the close lists every pair with who held it', PAIRS.every(([l, r], k) => !byItem[k] || new RegExp(`${l} \\+ ${r}: `).test(text)) && names.every(n => text.includes(n)));
    check('it counts who named a classmate holding the other half', text.includes(`${expectedFound} of ${names.length} named their match.`));
  } finally {
    teardown(host, players);
  }
  report.summary('FIND YOUR MATCH');
  process.exit(report.errors ? 1 : 0);
}

main().catch(err => { log('SIM', 'ERROR ' + err.message); process.exit(1); });
