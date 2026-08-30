/**
 * rotateShuffle — shuffled-deal simulation (2026-08-30).
 *
 * Drives the real games/story-ingredients: three ingredient collects
 * (characters → settings → twists, each later step shuffle-dealing the
 * previous pool) into the write phase, whose prompt must hand every
 * player one character + one setting + one twist, each invented by a
 * classmate, never by themselves, with every pool fully dealt.
 *
 * Each bot's submissions carry its own name marker (CHAR-Alice, ...),
 * so the write prompt proves exactly who was dealt whose ingredient.
 *
 * Usage: node scripts/simulate-story-ingredients.js   (server running)
 */

import {
  wait, log, setupRoom, teardown,
  waitForEvent, waitForEventOnAll, makeReporter
} from './sim-harness.js';

const GAME_ID = 'story-ingredients';
const NUM_PLAYERS = 5;

const r = makeReporter();

async function collectPhase(label, host, players, names, code, markerPrefix) {
  const prompts = await waitForEventOnAll(players, 'game-started', 8000);
  players.forEach((p, i) => {
    p.emit('submit-response', { code, response: `${markerPrefix}-${names[i]} (a fine ingredient)` });
  });
  await wait(500);
  host.emit('close-submissions', { code });
  log('host', `${label} closed`);
  return prompts;
}

async function run() {
  console.log('\n=== STORY INGREDIENTS (rotateShuffle) SIMULATION ===');
  const { host, players, names, code } = await setupRoom(GAME_ID, NUM_PLAYERS);
  try {
    host.emit('start-game', { code });

    // --- intro (host-paced announce) ---
    await waitForEvent(players[0], 'announce', 8000);
    host.emit('advance-phase', { code });

    // --- the three ingredient pools ---
    await collectPhase('characters', host, players, names, code, 'CHAR');
    await collectPhase('settings', host, players, names, code, 'SET');
    await collectPhase('twists', host, players, names, code, 'TWIST');

    // --- write: every player's prompt is a dealt hand ---
    const writePrompts = await waitForEventOnAll(players, 'game-started', 8000);
    const dealt = { CHAR: new Set(), SET: new Set(), TWIST: new Set() };
    writePrompts.forEach((ev, i) => {
      const prompt = String(ev.prompt || '');
      for (const kind of ['CHAR', 'SET', 'TWIST']) {
        const matches = [...prompt.matchAll(new RegExp(`${kind}-(\\w+)`, 'g'))].map(m => m[1]);
        r.check(matches.length === 1,
          `${names[i]} was dealt exactly one ${kind} (got ${matches.length})`);
        if (matches.length === 1) {
          r.check(matches[0] !== names[i],
            `${names[i]}'s ${kind} is a classmate's, not their own (got ${kind}-${matches[0]})`);
          dealt[kind].add(matches[0]);
        }
      }
      r.check(!prompt.includes('{{'),
        `${names[i]}'s write prompt has no unresolved tokens`);
    });
    for (const kind of ['CHAR', 'SET', 'TWIST']) {
      r.check(dealt[kind].size === NUM_PLAYERS,
        `every ${kind} in the pool was dealt exactly once (${dealt[kind].size}/${NUM_PLAYERS})`);
    }

    players.forEach((p, i) => {
      p.emit('submit-response', { code, response: `STORY by ${names[i]}: they met, it rained frogs, the end.` });
    });
    await wait(500);
    host.emit('close-submissions', { code });

    // --- share (reveal-one, host-paced) then end ---
    let ended = false;
    for (let step = 0; step < NUM_PLAYERS + 3 && !ended; step++) {
      host.emit('advance-phase', { code });
      try {
        await waitForEvent(players[0], 'game-ended', 1500);
        ended = true;
      } catch { /* still stepping through stories */ }
    }
    r.check(ended, 'game reached the end phase through the story reveal');
  } finally {
    await teardown(host, players);
  }

  r.summary('STORY INGREDIENTS SUMMARY');
  process.exit(r.errors > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('\x1b[31mSimulator crashed:\x1b[0m', err.message);
  process.exit(1);
});
