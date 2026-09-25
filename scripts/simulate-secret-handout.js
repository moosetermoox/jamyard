/**
 * The secret hand-out and the winner's words (two outside reviews,
 * 2026-09-24), proved against a real server on a storyboard the builder
 * compiles today:
 *
 *   announce -> collect with items (four states) -> vote -> reveal of
 *   {{vote.winnerText}} -> end, the crown added by the compiler.
 *
 *   1. Every student's own screen names a state, every state different,
 *      and the projector's copy of the prompt names none (a blank instead
 *      of a note in our words).
 *   2. The ballot every student gets is words, never a blank entry.
 *   3. The crown shows the winning clause, and the reveal after it prints
 *      the clause too, never a socket id.
 *
 * Self-contained: spawns its own server (mock AI, filesystem storage) on a
 * random port and cleans up its saved copy.
 *
 * Usage: node scripts/simulate-secret-handout.js
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { rm } from 'node:fs/promises';
import '../screens/shared/step-suggestions.js';
import { connect, waitForEvent, waitForEventOnAll, log, makeReporter, wait } from './sim-harness.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const r = makeReporter();
const STATES = ['Virginia', 'Georgia', 'Delaware', 'New York'];
const NAMES = ['Maya', 'Jordan', 'Sam', 'Priya'];
const COPY_ID = 'sim-handout-' + Math.floor(Math.random() * 1e6);

async function startServer() {
  const port = 3100 + Math.floor(Math.random() * 800);
  const child = spawn(process.execPath, [join(ROOT, 'server.js')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), ANTHROPIC_API_KEY: '', DATABASE_URL: '', OPENAI_API_KEY: '', POSTHOG_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stderr.on('data', (d) => process.stderr.write('[server] ' + d));
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start')), 20000);
    child.stdout.on('data', (d) => { if (String(d).includes(String(port))) { clearTimeout(t); resolve(); } });
  });
  return { child, url: `http://127.0.0.1:${port}` };
}

async function main() {
  const compiled = globalThis.StepSuggestions.compileStoryboard({
    name: 'Sim convention',
    description: 'secret hand-out proof',
    steps: [
      { brick: 'announce', text: 'Welcome, delegates.' },
      { brick: 'collect', text: 'You represent {{thisStep.assigned}}. Write one clause your state needs.', items: STATES, timer: 120 },
      { brick: 'vote', text: 'Which clause belongs in our constitution?' },
      { brick: 'reveal', text: 'The clause with the most support:\n\n{{vote.winner}}' },
      { brick: 'end', text: 'Adjourned.' }
    ]
  });
  r.check(compiled.problems.length === 0, 'the storyboard compiles clean: ' + JSON.stringify(compiled.problems));
  const config = compiled.config;
  const collectId = Object.keys(config.phases).find((id) => config.phases[id].type === 'collect');
  const revealId = Object.keys(config.phases).find((id) => config.phases[id].type === 'reveal');
  r.check(Array.isArray(config.phases[collectId].dealItems), 'the collect deals the list');
  r.check(config.phases[revealId].template.includes('{{vote.winnerText}}'), 'the reveal reads the winner\'s words');

  const { child, url } = await startServer();
  let host; const players = [];
  try {
    const saved = await fetch(`${url}/api/games`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: COPY_ID, config })
    });
    r.check(saved.ok, 'the copy saves');

    host = await connect('HOST', url);
    host.emit('create-room', { gameId: COPY_ID });
    const room = await waitForEvent(host, 'room-created', 5000);
    const code = room.code;
    for (let i = 0; i < 4; i++) {
      const p = await connect('P' + (i + 1), url);
      p.emit('join-room', { code, name: NAMES[i] });
      await waitForEvent(p, 'join-success', 3000);
      players.push(p);
    }
    host.emit('start-game', { code });
    await waitForEvent(host, 'phase-announce', 5000).catch(() => null);
    await wait(300);

    // 1. The hand-out
    const startedOnHost = waitForEvent(host, 'game-started', 8000);
    const startedOnPlayers = waitForEventOnAll(players, 'game-started', 8000);
    host.emit('advance-phase', { code });
    const [hostStart, playerStarts] = await Promise.all([startedOnHost, startedOnPlayers]);
    const seen = playerStarts.map((s) => STATES.find((st) => String(s.prompt || '').includes(st)) || null);
    log('SIM', 'states dealt: ' + seen.join(', '));
    r.check(seen.every(Boolean), 'every student\'s prompt names a state');
    r.check(new Set(seen).size === 4, 'the four states are all different');
    r.check(!STATES.some((st) => String(hostStart.prompt || '').includes(st)), 'the projector\'s prompt names no state');
    r.check(!/each student gets/.test(String(hostStart.prompt || '')), 'the projector carries no note in our words');
    r.check(String(hostStart.prompt || '').includes('…'), 'the projector shows a blank where the state goes');

    // The clauses, then the vote
    for (let i = 0; i < 4; i++) {
      players[i].emit('submit-response', { code, response: 'Clause from ' + seen[i], phaseInstanceId: playerStarts[i].phaseInstanceId });
      await waitForEvent(players[i], 'response-accepted', 3000);
    }
    const ballots = waitForEventOnAll(players, 'vote-start', 8000);
    host.emit('close-submissions', { code });
    const votes = await ballots;
    const labels = votes.flatMap((v) => (v.candidates || []).map((c) => (typeof c === 'string' ? c : (c.text || ''))));
    r.check(labels.length === 12 && labels.every((l) => l.startsWith('Clause from')), '2. every ballot entry is words (own clause off): ' + labels.length + ' entries');

    // Everyone votes for Maya's clause (her own ballot lacks it: she votes for Jordan's)
    const p1Id = votes[1].candidates.find((c) => c.text === 'Clause from ' + seen[0]).playerId;
    for (let i = 0; i < 4; i++) {
      const target = i === 0 ? votes[0].candidates[0].playerId : p1Id;
      players[i].emit('submit-vote', { code, choice: target, phaseInstanceId: votes[i].phaseInstanceId });
    }
    const crown = waitForEvent(host, 'winner-announced', 10000);
    host.emit('close-voting', { code });
    const won = await crown;
    r.check(won.winnerEntry === 'Clause from ' + seen[0], '3. the crown shows the winning clause: ' + JSON.stringify(won.winnerEntry));

    // The reveal after the crown reads winnerText
    const results = waitForEvent(host, 'show-results', 15000);
    host.emit('advance-phase', { code });
    const shown = await results;
    const text = String(shown.content || shown.aiResult || '');
    r.check(text.includes('Clause from ' + seen[0]), 'the reveal prints the clause');
    r.check(!/[A-Za-z0-9_-]{20}/.test(text.replace(/Clause from [A-Za-z ]+/g, '')), 'the reveal prints no socket id');
  } finally {
    for (const s of [host, ...players]) { try { s && s.disconnect(); } catch (e) { /* gone */ } }
    child.kill();
    await rm(join(ROOT, 'games', 'user', COPY_ID), { recursive: true, force: true }).catch(() => {});
  }
  r.summary('SECRET HAND-OUT');
  process.exit(r.errors ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
