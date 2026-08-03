/**
 * Invariant sim: appendOnly chains + rotation-assigned reveals.
 *
 * Plays one-more-thing with a deliberate vandal (submits a "replacement"
 * that would have gutted a classmate's list under the old prefill behavior)
 * and asserts:
 *   1. The returned reveal (scope:"own") still starts with the origin
 *      author's own recall text — the vandal's submission could only append.
 *   2. Every returned chain contains its origin text.
 * Then plays whose-eyes far enough to assert the circle's reveal items carry
 * the assigned viewpoint text (no more retype-the-viewpoint field).
 *
 * Requires a running server (mock AI mode is fine): node scripts/simulate-append-only.js
 */
import {
  setupRoom, teardown, wait, log,
  waitForEventOnAll, waitForAnyPlayerEvent, drainEvent, drainAll
} from './sim-harness.js';

let failures = 0;
function check(ok, msg) {
  console.log((ok ? '  ✓ ' : '  ✗ FAIL ') + msg);
  if (!ok) failures++;
}

async function submitAll(players, code, texts) {
  players.forEach((p, i) => p.emit('submit-response', { code, response: texts[i] }));
  await wait(400);
}

async function appendOnlyRun() {
  log('SIM', '--- one-more-thing: vandal cannot gut an inherited list ---');
  const { host, players, code } = await setupRoom('one-more-thing', 3);
  const recalls = ['ALPHA fact one', 'BRAVO fact one', 'CHARLIE fact one'];

  host.emit('start-game', { code });
  await waitForEventOnAll(players, 'announce'); // intro
  drainAll([host, ...players]);
  host.emit('advance-phase', { code });

  await waitForEventOnAll(players, 'game-started'); // recall
  drainAll([host, ...players]);
  await submitAll(players, code, recalls);
  host.emit('close-submissions', { code });

  const addOne = await waitForEventOnAll(players, 'game-started'); // add-one
  check(addOne.every(d => d.appendOnly === true), 'add-one arrives with appendOnly flag');
  check(addOne.every(d => typeof d.prefill === 'string' && /fact one/.test(d.prefill)),
    'add-one prefill carries the inherited list');
  drainAll([host, ...players]);
  // Player 0 plays vandal: submits text that would REPLACE the list under
  // the old behavior. With appendOnly the server treats it as an addition.
  await submitAll(players, code, ['REPLACED EVERYTHING lol', 'added a real fact', 'me too, one more']);
  host.emit('close-submissions', { code });

  const addAgain = await waitForEventOnAll(players, 'game-started'); // add-again
  check(addAgain.every(d => d.appendOnly === true), 'add-again arrives with appendOnly flag');
  check(addAgain.every(d => /fact one/.test(d.prefill || '')),
    'add-again prefill still contains an origin line (vandal only appended)');
  drainAll([host, ...players]);
  await submitAll(players, code, ['third line a', 'third line b', 'third line c']);
  host.emit('close-submissions', { code });

  const returned = await waitForEventOnAll(players, 'show-results'); // scope:"own"
  const contents = returned.map(d => JSON.stringify(d));
  check(contents.every(c => /fact one/.test(c)),
    'every returned chain still contains its origin author\'s text');
  check(contents.some(c => /REPLACED EVERYTHING/.test(c)),
    'the vandal\'s text survives only as an APPENDED line, not a replacement');
  teardown(host, players);
}

async function assignedRevealRun() {
  log('SIM', '--- whose-eyes: circle shows the assigned viewpoint ---');
  const { host, players, code } = await setupRoom('whose-eyes', 3);
  const viewpoints = ['a tired custodian', 'the class hamster', 'a parent at dinner'];

  host.emit('start-game', { code });
  await waitForEventOnAll(players, 'announce'); // intro (host-paced now)
  drainAll([host, ...players]);
  host.emit('advance-phase', { code });

  await waitForEventOnAll(players, 'game-started'); // viewpoints
  drainAll([host, ...players]);
  await submitAll(players, code, viewpoints);
  host.emit('close-submissions', { code });

  const step = await waitForEventOnAll(players, 'game-started'); // step-inside
  check(step.every(d => Array.isArray(d.fields) && d.fields.length === 3),
    'step-inside has 3 fields (retype-the-viewpoint field removed)');
  drainAll([host, ...players]);
  players.forEach(p => p.emit('submit-response', {
    code, response: { think: 'thinking thoughts', feel: 'many feelings', ask: 'why though?' }
  }));
  await wait(400);
  host.emit('close-submissions', { code });

  await waitForAnyPlayerEvent(players, 'reveal-one-start', 15000);
  drainEvent(players, 'reveal-one-start');
  // Host reveals all three items; each should carry an assigned viewpoint.
  const items = [];
  for (let i = 0; i < 3; i++) {
    host.emit('reveal-next', { code });
    const item = await waitForAnyPlayerEvent(players, 'reveal-one-item', 10000);
    items.push(typeof item.item === 'string' ? item.item : JSON.stringify(item.item));
    drainEvent(players, 'reveal-one-item');
  }
  check(items.every(t => /Through the eyes of \S/.test(t)),
    'every circle card names its viewpoint (assigned text resolved)');
  check(items.every(t => /thinking thoughts/.test(t)),
    'circle cards carry the think field (fields.* paths resolve)');
  const matched = items.filter(t => viewpoints.some(v => t.includes(v))).length;
  check(matched === 3, `all 3 cards show a real classmate viewpoint (got ${matched})`);
  teardown(host, players);
}

try {
  await appendOnlyRun();
  await assignedRevealRun();
} catch (e) {
  console.error('SIM ERROR:', e.message);
  failures++;
}
console.log(failures === 0 ? '\nALL INVARIANTS HOLD ✓' : `\n${failures} FAILURE(S) ✗`);
process.exit(failures === 0 ? 0 : 1);
