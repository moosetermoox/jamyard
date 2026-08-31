/**
 * Invariant sim: exquisite-corpse (blind rotation chain + template assembly)
 * and the showTail fold (_sim-fold fixture).
 *
 * Run 1 plays the full six-fold game with 6 players and asserts:
 *   1. The fold is real: no word round after the first carries a prefill,
 *      an appendOnly flag, or any earlier word in its prompt — students
 *      contribute blind, at the transport level, not just visually.
 *   2. Every poem returns to its author: each player's reveal contains
 *      the word THEY wrote in round one.
 *   3. Assembly is whole: every poem fills all six slots (no blanks, no
 *      raw {N} tokens), and all 36 submitted words surface somewhere.
 *
 * Run 2 plays _sim-fold (folded story, showTail: 3) and asserts:
 *   1. Each pass's prefill is ONLY the tail: it starts with an ellipsis,
 *      never contains a head word — server-side masking, nothing hidden
 *      ever reaches the wire.
 *   2. The returned story is whole: every head word is back in the final
 *      reveal (masking was display-only).
 *
 * Requires a running server (mock AI mode is fine; the games make no AI
 * calls): node scripts/simulate-exquisite-corpse.js
 */
import {
  setupRoom, teardown, log,
  waitForEvent, waitForEventOnAll, drainAll
} from './sim-harness.js';

const N = 6;
const ROUNDS = ['word-1', 'word-2', 'word-3', 'word-4', 'word-5', 'word-6'];
// Unique per player+round so we can trace each word into exactly one poem.
const WORDS = ROUNDS.map((_, r) => Array.from({ length: N }, (_, i) => `w${r + 1}p${i}zz`));

let failures = 0;
function check(ok, msg) {
  console.log((ok ? '  ✓ ' : '  ✗ FAIL ') + msg);
  if (!ok) failures++;
}

async function run() {
  log('SIM', '--- exquisite-corpse: the fold is real and the poems come home ---');
  const { host, players, code } = await setupRoom('exquisite-corpse', N);

  host.emit('start-game', { code });
  await waitForEventOnAll(players, 'announce'); // intro
  drainAll([host, ...players]);
  host.emit('advance-phase', { code });

  for (let r = 0; r < ROUNDS.length; r++) {
    const started = await waitForEventOnAll(players, 'game-started');
    if (r > 0) {
      check(started.every(d => d.prefill === undefined || d.prefill === null || d.prefill === ''),
        `${ROUNDS[r]}: no prefill reaches the players (blind hand-off)`);
      check(started.every(d => !d.appendOnly),
        `${ROUNDS[r]}: no appendOnly flag (nothing inherited to show)`);
      const earlier = WORDS.slice(0, r).flat();
      check(started.every(d => !earlier.some(w => String(d.prompt || '').includes(w))),
        `${ROUNDS[r]}: no earlier word leaks into the prompt`);
    }
    drainAll([host, ...players]);
    players.forEach((p, i) => p.emit('submit-response', { code, response: WORDS[r][i] }));
    // submit-response is async server-side (moderation ladder) — wait for
    // the host's per-submission acks, never a fixed sleep, before closing.
    for (let k = 0; k < N; k++) await waitForEvent(host, 'response-received');
    host.emit('close-submissions', { code });
  }

  await waitForEventOnAll(players, 'announce'); // unfold (host-paced)
  drainAll([host, ...players]);
  host.emit('advance-phase', { code });

  const returned = await waitForEventOnAll(players, 'show-results'); // poem, scope:"own"
  const contents = returned.map(d => String(d.content || ''));
  if (process.env.SIM_DEBUG) contents.forEach((c, i) => console.log(`--- P${i} ---\n${c}`));

  check(contents.every((c, i) => c.includes(WORDS[0][i])),
    'every player\'s poem opens with the word THEY started (return-to-author)');
  check(contents.every(c => /The \S+ \S+ \S+ \S+ the \S+ \S+\./.test(c)),
    'every poem assembles into the six-slot sentence');
  check(contents.every(c => !c.includes('____') && !/\{\d+\}/.test(c)),
    'no blanks or raw {N} tokens in any poem');
  const everywhere = contents.join('\n');
  const missing = WORDS.flat().filter(w => !everywhere.includes(w));
  check(missing.length === 0,
    `all ${N * ROUNDS.length} submitted words surface in the poems` +
    (missing.length ? ` (missing: ${missing.join(', ')})` : ''));

  teardown(host, players);
}

async function submitAndClose(host, players, code, texts) {
  players.forEach((p, i) => p.emit('submit-response', { code, response: texts[i] }));
  // submit-response is async server-side (moderation ladder) — wait for acks.
  for (let k = 0; k < players.length; k++) await waitForEvent(host, 'response-received');
  host.emit('close-submissions', { code });
}

async function foldRun() {
  log('SIM', '--- _sim-fold: the tail shows, the head hides, the story returns whole ---');
  const M = 3;
  const { host, players, code } = await setupRoom('_sim-fold', M);
  // 2 head words + 3 tail words per opening line; all uniquely greppable.
  const openings = Array.from({ length: M }, (_, i) =>
    `h${i}wa h${i}wb t${i}wa t${i}wb t${i}wc`);

  host.emit('start-game', { code });
  await waitForEventOnAll(players, 'game-started'); // start
  drainAll([host, ...players]);
  await submitAndClose(host, players, code, openings);

  const pass1 = await waitForEventOnAll(players, 'game-started');
  check(pass1.every(d => d.appendOnly === true && typeof d.prefill === 'string'),
    'pass-1 arrives add-only with a string prefill');
  check(pass1.every(d => d.prefill.startsWith('…')),
    'pass-1 prefill starts with the ellipsis (something is hidden)');
  check(pass1.every(d => !/h\dw/.test(d.prefill)),
    'pass-1 prefill contains NO head word (masked server-side)');
  check(pass1.every(d => /t\dwc/.test(d.prefill)),
    'pass-1 prefill ends with the real tail');
  drainAll([host, ...players]);
  await submitAndClose(host, players, code,
    Array.from({ length: M }, (_, i) => `addA${i}`));

  const pass2 = await waitForEventOnAll(players, 'game-started');
  check(pass2.every(d => !/h\dw/.test(d.prefill || '')),
    'pass-2 prefill still hides every head word');
  check(pass2.every(d => /addA\d/.test(d.prefill || '')),
    'pass-2 prefill carries the newest line (the tail moved forward)');
  drainAll([host, ...players]);
  await submitAndClose(host, players, code,
    Array.from({ length: M }, (_, i) => `addB${i}`));

  const returned = await waitForEventOnAll(players, 'show-results'); // scope:"own"
  const contents = returned.map(d => String(d.content || ''));
  check(contents.every((c, i) => c.includes(`h${i}wa`) && c.includes(`h${i}wb`)),
    'every returned story restores its hidden head (masking was display-only)');
  check(contents.every(c => /addA\d/.test(c) && /addB\d/.test(c)),
    'every returned story carries both added lines');
  teardown(host, players);
}

try {
  await run();
  await foldRun();
} catch (e) {
  console.error('SIM ERROR:', e.message);
  failures++;
}
console.log(failures === 0 ? '\nALL INVARIANTS HOLD ✓' : `\n${failures} FAILURE(S) ✗`);
process.exit(failures === 0 ? 0 : 1);
