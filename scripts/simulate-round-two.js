/**
 * Create page round two proof (2026-09-28, a reviewer's second pass).
 * Compiles a storyboard from the bricks and plays it with SIX students
 * on a server of its own:
 *
 *   collect-choice (fist to five) -> pairs with pairBy "far"
 *   -> collect (nominate a book) -> bracket over the answers -> end
 *
 *  1. the plan compiles clean: pairBy far on the pairwise step, five
 *     bracket rounds (room for 32 nominations), a projector line on the
 *     pair step
 *  2. far pairing: a 0 sits with a 5, a 1 with a 5, a 2 with a 4, read
 *     off the pair-private reveal (each student sees the partner's line)
 *  3. the projector carries the pair step's line
 *  4. six nominations: three rounds are played (3 matchups; 1 plus a
 *     bye; the final), the two spare rounds and their cards pass
 *     themselves, and the champion card names one book with no "no
 *     opponent" line
 *
 * Starts its own server on a random port: node scripts/simulate-round-two.js
 */
import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import '../screens/shared/step-suggestions.js';
import { connect, waitForEvent, waitForEventOnAll, drainEvent, log, makeReporter, wait } from './sim-harness.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const r = makeReporter();
const NAMES = ['Maya', 'Jordan', 'Sam', 'Priya', 'Lee', 'Noor'];
const FISTS = ['0', '5', '2', '1', '4', '5'];
const BOOKS = ['Holes', 'Hatchet', 'Wonder', 'Matilda', 'Frindle', 'Hoot'];
const COPY_ID = 'sim-round-two-' + Math.floor(Math.random() * 1e6);

async function startServer() {
  const port = 3100 + Math.floor(Math.random() * 800);
  const child = spawn(process.execPath, [join(ROOT, 'server.js')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), ANTHROPIC_API_KEY: '', DATABASE_URL: '', OPENAI_API_KEY: '', POSTHOG_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stderr.on('data', (d) => process.stderr.write('[server] ' + d));
  if (process.env.SIM_VERBOSE) child.stdout.on('data', (d) => process.stdout.write('[out] ' + d));
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start')), 20000);
    child.stdout.on('data', (d) => { if (String(d).includes(String(port))) { clearTimeout(t); resolve(); } });
  });
  return { child, url: `http://127.0.0.1:${port}` };
}

async function main() {
  const compiled = globalThis.StepSuggestions.compileStoryboard({
    name: 'Sim round two',
    description: 'far pairing + a big-class bracket',
    steps: [
      { brick: 'collect-choice', text: 'Fist to five: how sure are you about fractions?', choices: ['0', '1', '2', '3', '4', '5'] },
      { brick: 'pairs', text: 'Explain fractions to your partner in your own words.', pairBy: 'far' },
      { brick: 'collect', text: 'Nominate a book for our next read-aloud.' },
      { brick: 'bracket', text: 'Which book should we read next?' },
      { brick: 'end', text: 'Done.' }
    ]
  });
  r.check(compiled.problems.length === 0, '1. the storyboard compiles clean: ' + JSON.stringify(compiled.problems));
  const config = compiled.config;
  const ids = Object.keys(config.phases);
  const pairStep = ids.find((id) => config.phases[id].type === 'collect' && config.phases[id].assign === 'pairwise');
  const votes = ids.filter((id) => config.phases[id].type === 'vote');
  r.check(!!pairStep && config.phases[pairStep].pairBy && config.phases[pairStep].pairBy.mode === 'far', '1. the pair step pairs far apart');
  r.check(typeof config.phases[pairStep].hostTemplate === 'string' && /own device/.test(config.phases[pairStep].hostTemplate), '1. the pair step carries a projector line');
  r.check(votes.length === 5 && votes.every((id) => config.phases[id].bracket === true), '1. five bracket rounds, room for 32 nominations');

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
    for (let i = 0; i < NAMES.length; i++) {
      const p = await connect('P' + (i + 1), url);
      p.emit('join-room', { code, name: NAMES[i] });
      await waitForEvent(p, 'join-success', 3000);
      players.push(p);
    }

    // --- Fist to five ---
    const pick = waitForEventOnAll(players, 'game-started', 8000);
    const hostPoll = waitForEvent(host, 'game-started', 8000);
    host.emit('start-game', { code });
    const picks = await pick;
    await hostPoll; // consumed, so the next host game-started is the pair step's
    r.check(picks.every((ev) => Array.isArray(ev.choices) && ev.choices.length === 6), 'the scale reaches every student');
    players.forEach((p, i) => p.emit('submit-response', { code, response: FISTS[i], phaseInstanceId: picks[i].phaseInstanceId }));
    await waitForEventOnAll(players, 'response-accepted', 5000);

    // --- Pairs, far apart ---
    const pairStart = waitForEventOnAll(players, 'game-started', 8000);
    const hostPair = waitForEvent(host, 'game-started', 8000);
    await wait(300);
    host.emit('close-submissions', { code });
    const pairPrompts = await pairStart;
    const hostPairEv = await hostPair;
    r.check(/own device/.test(String(hostPairEv.hostTemplate || '')), '3. the projector carries the pair step\'s line');
    r.check(pairPrompts.every((ev) => !String(ev.prompt || '').includes('{{')), '2. no raw tokens on the pair step');
    players.forEach((p, i) => p.emit('submit-response', { code, response: `FIST ${FISTS[i]} by ${NAMES[i]}`, phaseInstanceId: pairPrompts[i].phaseInstanceId }));
    await waitForEventOnAll(players, 'response-accepted', 5000);
    const reveals = waitForEventOnAll(players, 'show-results', 8000);
    await wait(300);
    host.emit('close-submissions', { code });
    const seen = await reveals;
    await waitForEvent(host, 'show-results', 4000).catch(() => null); // the projector's copy of the pair reveal, consumed
    // The pair reveal shows both partners' lines; keep the partner's only
    const partnerFist = seen.map((ev, i) => {
      const m = String(ev.content || '').match(/FIST (\d) by (\w+)/g) || [];
      return m.filter((s) => !s.endsWith(' by ' + NAMES[i])).map((s) => Number(s.match(/\d/)[0]));
    });
    log('SIM', 'partner fists: ' + partnerFist.map((f, i) => FISTS[i] + '->' + f.join('/')).join(', '));
    const spread = partnerFist.every((fs, i) => fs.length >= 1 && fs.every((f) => Math.abs(f - Number(FISTS[i])) >= 2));
    r.check(spread, '2. every student sits with a partner at least two steps away on the scale');
    const zero = partnerFist[0];
    r.check(zero.includes(5), '2. the 0 sits with a 5');

    // --- Nominations ---
    const nominate = waitForEventOnAll(players, 'game-started', 8000);
    await wait(300);
    host.emit('advance-phase', { code });
    const nom = await nominate;
    players.forEach((p, i) => p.emit('submit-response', { code, response: BOOKS[i], phaseInstanceId: nom[i].phaseInstanceId }));
    await waitForEventOnAll(players, 'response-accepted', 5000);

    // --- The bracket: three real rounds, two spare ---
    let hostVoteStarts = 0;
    let hostReveals = 0;
    const revealTexts = [];
    host.on('vote-start', () => { hostVoteStarts++; });
    host.on('show-results', (ev) => { hostReveals++; revealTexts.push(String(ev.content || '')); });
    const cast = (p, ballot) => p.emit('submit-vote', { code, votes: (ballot.matchups || []).map((m) => ({ choice: Math.random() < 0.5 ? (m.optionA.playerId || m.optionA) : (m.optionB.playerId || m.optionB) })), phaseInstanceId: ballot.phaseInstanceId });
    // From round two on, the two authors in a matchup get no ballot (excludeAuthors), only a waiting line
    const ballotsOrNull = () => Promise.all(players.map((p) => waitForEvent(p, 'vote-start', 6000).catch(() => null)));
    const ballots1 = waitForEventOnAll(players, 'vote-start', 8000);
    await wait(300);
    host.emit('close-submissions', { code });
    const v1 = await ballots1;
    r.check(v1.every((b) => b.matchups.length === 2), '4. round one: six answers, each student votes on the two matchups not their own');
    const reveal1 = waitForEvent(host, 'show-results', 10000);
    players.forEach((p, i) => cast(p, v1[i]));
    await reveal1;
    const ballots2 = ballotsOrNull();
    await wait(300);
    host.emit('advance-phase', { code });
    const v2 = await ballots2;
    const reveal2 = waitForEvent(host, 'show-results', 10000);
    players.forEach((p, i) => { if (v2[i]) cast(p, v2[i]); });
    await reveal2;
    r.check(/no opponent this round/.test(revealTexts[1]), '4. round two carries the bye');
    const ballots3 = ballotsOrNull();
    await wait(300);
    host.emit('advance-phase', { code });
    const v3 = await ballots3;
    const reveal3 = waitForEvent(host, 'show-results', 10000);
    players.forEach((p, i) => { if (v3[i]) cast(p, v3[i]); });
    await reveal3;
    // The spare rounds pass themselves: the next press lands on the champion card
    const champion = waitForEvent(host, 'show-results', 10000);
    await wait(300);
    host.emit('advance-phase', { code });
    const champ = await champion;
    const champText = String(champ.content || '');
    log('HOST', 'champion card:\n' + champText);
    r.check(hostVoteStarts === 3, `4. three rounds were played, the spare two passed themselves (${hostVoteStarts} ballots)`);
    r.check(/The winner of the bracket: \*?\*?[A-Za-z]/.test(champText), '4. the champion card names one book');
    r.check(!/no opponent/.test(champText), '4. the champion card carries no "no opponent" line');
    r.check(hostReveals === 4, `4. four cards in all: three rounds and the champion (${hostReveals})`);
    const ended = waitForEvent(host, 'game-ended', 8000).catch(() => null);
    await wait(300);
    host.emit('advance-phase', { code });
    r.check(!!(await ended), 'the room reaches the end');
  } finally {
    for (const s of [host, ...players]) { try { s && s.disconnect(); } catch (e) { /* gone */ } }
    child.kill();
    await rm(join(ROOT, 'games', 'user', COPY_ID), { recursive: true, force: true }).catch(() => {});
  }
  r.summary('ROUND TWO');
  process.exit(r.errors ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
