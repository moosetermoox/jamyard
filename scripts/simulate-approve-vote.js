/**
 * The yes-or-no vote (an outside reviewer's second Constitutional
 * Convention, 2026-09-25: "let a vote pass more than one proposal and show
 * the proposals on the reveal screen"), proved against a real server on a
 * storyboard the builder compiles today:
 *
 *   announce -> collect with items (four states) -> vote with approve
 *   -> the reveal the compiler adds ({{vote.approvedList}}) -> end.
 *
 *   1. The compiler builds an approve vote and a reveal of what passed,
 *      never a crown.
 *   2. Every student's ballot lists the other three clauses, each to be
 *      answered yes or no; a self-vote sent by hand is refused.
 *   3. Two clauses pass (more yes than no), one fails on a tie, one fails
 *      outright; the reveal on the projector lists the two that passed
 *      with their counts, never an id, and the report has every row.
 *   4. A self-vote sent by hand is dropped by the server.
 *   5. (2026-09-26, the third Convention run) the lobby joiner gets the
 *      early-bird joke, a student who arrives after the start does not.
 *   4. The projector lists every clause while the class votes, words only.
 *   6. The reveal lists what did not pass too, and "4 of 5 students voted."
 *
 * Self-contained: spawns its own server (mock AI, filesystem storage) on a
 * random port and cleans up its saved copy.
 *
 * Usage: node scripts/simulate-approve-vote.js
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
const COPY_ID = 'sim-approve-' + Math.floor(Math.random() * 1e6);

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
    description: 'yes-or-no vote proof',
    steps: [
      { brick: 'announce', text: 'Welcome, delegates.' },
      { brick: 'collect', text: 'You represent {{thisStep.assigned}}. Write one clause your state needs.', items: STATES, timer: 120 },
      { brick: 'vote', text: 'Does this clause belong in our constitution?', approve: true },
      { brick: 'end', text: 'Adjourned.' }
    ]
  });
  r.check(compiled.problems.length === 0, 'the storyboard compiles clean: ' + JSON.stringify(compiled.problems));
  const config = compiled.config;
  const ids = Object.keys(config.phases);
  const voteId = ids.find((id) => config.phases[id].type === 'vote');
  const revealId = ids.find((id) => config.phases[id].type === 'reveal');
  r.check(config.phases[voteId].mode === 'approve' && config.phases[voteId].excludeAuthors === true, '1. the vote is a yes-or-no vote with own answers off the ballot');
  r.check(!!revealId && config.phases[revealId].template.includes('{{' + voteId + '.approvedList}}'), '1. a reveal of what passed follows it');
  r.check(!ids.some((id) => config.phases[id].type === 'winner'), '1. no crown was added');
  r.check(config.phases[voteId].next === revealId, '1. the vote leads into the reveal');

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
      const joined = await waitForEvent(p, 'join-success', 3000);
      if (i === 0) r.check(!!(joined && joined.joke), '5. a student who joins in the lobby gets the early-bird joke');
      players.push(p);
    }
    host.emit('start-game', { code });
    await waitForEvent(host, 'phase-announce', 5000).catch(() => null);
    await wait(300);

    // A student who arrives after the start is late, not early: no joke
    // above their first instruction (the third Convention run, 2026-09-26).
    const late = await connect('LATE', url);
    late.emit('join-room', { code, name: 'Lee' });
    const lateJoin = await waitForEvent(late, 'join-success', 3000);
    r.check(!lateJoin.joke, '5. a student who joins after the start gets no joke');
    late.disconnect();
    await wait(300);

    const startedOnPlayers = waitForEventOnAll(players, 'game-started', 8000);
    host.emit('advance-phase', { code });
    const playerStarts = await startedOnPlayers;
    const seen = playerStarts.map((s) => STATES.find((st) => String(s.prompt || '').includes(st)) || null);
    log('SIM', 'states dealt: ' + seen.join(', '));

    for (let i = 0; i < 4; i++) {
      players[i].emit('submit-response', { code, response: 'Clause from ' + seen[i], phaseInstanceId: playerStarts[i].phaseInstanceId });
      await waitForEvent(players[i], 'response-accepted', 3000);
    }
    const ballots = waitForEventOnAll(players, 'vote-start', 8000);
    const hostBallot = waitForEvent(host, 'vote-start', 8000);
    host.emit('close-submissions', { code });
    const votes = await ballots;
    const hostVote = await hostBallot;
    r.check(hostVote.mode === 'approve', '2. the projector hears the yes-or-no mode');
    const floor = Array.isArray(hostVote.proposals) ? hostVote.proposals : [];
    r.check(floor.length === 4 && seen.every((st) => floor.includes('Clause from ' + st)),
      '4. the projector lists all four clauses while the class votes');
    r.check(!NAMES.some((n) => JSON.stringify(floor).includes(n)) && !/playerId/.test(JSON.stringify(floor)),
      '4. the projector list carries words only, no names or ids');
    r.check(votes.every((v) => v.mode === 'approve'), '2. every ballot is a yes-or-no ballot');
    r.check(votes.every((v, i) => (v.candidates || []).length === 3 && !v.candidates.some((c) => c.text === 'Clause from ' + seen[i])),
      '2. every ballot carries the other three clauses, never the voter\'s own');

    // Who wrote what
    const idOf = (state) => {
      for (const v of votes) { const c = (v.candidates || []).find((x) => x.text === 'Clause from ' + state); if (c) return c.playerId; }
      return null;
    };
    const A = idOf(seen[0]); const B = idOf(seen[1]); const C = idOf(seen[2]); const D = idOf(seen[3]);
    r.check([A, B, C, D].every(Boolean), 'every clause has an author id on the ballots');

    // Plan: A passes 3-0, B passes 2-1, C ties 1-1 (with one abstention) and fails, D fails 0-3.
    // Priya (P4) sends a self-vote by hand too, which the server must drop.
    const cast = (p, list) => p.emit('submit-vote', { code, votes: list, phaseInstanceId: votes[players.indexOf(p)].phaseInstanceId });
    cast(players[0], [{ choice: B, approve: true }, { choice: C, approve: true }, { choice: D, approve: false }]);
    cast(players[1], [{ choice: A, approve: true }, { choice: C, approve: false }, { choice: D, approve: false }]);
    cast(players[2], [{ choice: A, approve: true }, { choice: B, approve: true }, { choice: D, approve: false }]);
    // Priya: yes to A, no to B, nothing on C, and a self-vote for D
    cast(players[3], [{ choice: A, approve: true }, { choice: B, approve: false }, { choice: D, approve: true }]);

    const results = waitForEvent(host, 'show-results', 15000);
    await wait(500);
    // The late student (who left) never votes, so the teacher closes it
    host.emit('close-voting', { code });
    const shown = await results;
    const text = String(shown.content || shown.aiResult || '');
    log('HOST', 'reveal:\n' + text);
    r.check(text.includes('What the class passed:'), '3. the reveal carries its heading');
    r.check(text.includes('Clause from ' + seen[0] + ' (3 yes, 0 no)'), '3. the clause that passed 3-0 is listed with its counts');
    r.check(text.includes('Clause from ' + seen[1] + ' (2 yes, 1 no)'), '3. the clause that passed 2-1 is listed with its counts');
    const cut = text.indexOf('Did not pass:');
    const passedPart = cut === -1 ? text : text.slice(0, cut);
    const failedPart = cut === -1 ? '' : text.slice(cut);
    r.check(!passedPart.includes('Clause from ' + seen[2]), '3. the tied clause is not on the passed list');
    r.check(!passedPart.includes('Clause from ' + seen[3]), '3. the clause that failed is not on the passed list (the self-vote was dropped)');
    r.check(failedPart.includes('Clause from ' + seen[2] + ' (1 yes, 1 no)') && failedPart.includes('Clause from ' + seen[3] + ' (0 yes, 3 no)'),
      '6. the two that failed are listed under Did not pass, with their counts');
    r.check(text.includes('4 of 5 students voted.'), '6. the reveal says how many of the class voted (the late student who left counts and did not vote)');
    r.check(!/[A-Za-z0-9_-]{20}/.test(text.replace(/Clause from [A-Za-z ]+/g, '')), '3. the reveal prints no socket id');

    // The report has every row with its counts
    const rep = await fetch(`${url}/api/rooms/${code}/report?pin=${room.teacherPin}`);
    const body = rep.ok ? await rep.json() : null;
    const json = JSON.stringify(body || {});
    r.check(rep.ok && json.includes('"Passed"') && json.includes('"Did not pass"'), '3. the report marks what passed and what did not');
  } finally {
    for (const s of [host, ...players]) { try { s && s.disconnect(); } catch (e) { /* gone */ } }
    child.kill();
    await rm(join(ROOT, 'games', 'user', COPY_ID), { recursive: true, force: true }).catch(() => {});
  }
  r.summary('YES-OR-NO VOTE');
  process.exit(r.errors ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
