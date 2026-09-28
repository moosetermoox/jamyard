/**
 * Jigsaw regroup + bracket proof (2026-09-27, a reviewer's fifteen
 * classroom routines). Compiles a storyboard from the new bricks and
 * plays it with SIX students on a server of its own:
 *
 *   teams (3) -> teams (jigsaw) -> bracket over five books -> end
 *
 *  1. the plan compiles clean: two splits (the second a jigsaw), three
 *     bracket rounds chained by .winners, a reveal after each
 *  2. the jigsaw regroup: every new group holds one member of each expert
 *     group, everyone seated once
 *  3. round one: the projector lists the matchups in words, each student
 *     votes on both, the bye moves on, the reveal says who beat whom
 *  4. round two: a tie sends the first-listed on
 *  5. round three names the champion; the room reaches the end
 *
 * Starts its own server on a random port: node scripts/simulate-bracket-jigsaw.js
 */
import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import '../screens/shared/step-suggestions.js';
import { connect, waitForEvent, waitForEventOnAll, drainEvent, log, makeReporter, wait } from './sim-harness.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const r = makeReporter();
const BOOKS = ['Holes', 'Hatchet', 'Wonder', 'Matilda', 'Frindle'];
const NAMES = ['Maya', 'Jordan', 'Sam', 'Priya', 'Lee', 'Noor'];
const COPY_ID = 'sim-bracket-' + Math.floor(Math.random() * 1e6);

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

function teamOf(teams, playerId) {
  return Object.keys(teams).find((name) => (teams[name] || []).some((m) => m.playerId === playerId)) || null;
}

async function main() {
  const compiled = globalThis.StepSuggestions.compileStoryboard({
    name: 'Sim jigsaw bracket',
    description: 'jigsaw + bracket proof',
    steps: [
      { brick: 'teams', teamCount: 3 },
      { brick: 'teams', jigsaw: true },
      { brick: 'bracket', text: 'Which book should we read next?', items: BOOKS },
      { brick: 'end', text: 'Done.' }
    ]
  });
  r.check(compiled.problems.length === 0, '1. the storyboard compiles clean: ' + JSON.stringify(compiled.problems));
  const config = compiled.config;
  const ids = Object.keys(config.phases);
  const splits = ids.filter((id) => config.phases[id].type === 'team-split');
  const votes = ids.filter((id) => config.phases[id].type === 'vote');
  r.check(splits.length === 2 && config.phases[splits[1]].method === 'jigsaw' && config.phases[splits[1]].regroupFrom === splits[0],
    '1. two splits, the second a jigsaw from the first');
  r.check(votes.length === 3 && votes.every((id) => config.phases[id].bracket === true && config.phases[id].mode === 'head-to-head'),
    '1. three bracket rounds (five books need three)');
  r.check(config.phases[votes[1]].candidates === votes[0] + '.winners' && config.phases[votes[2]].candidates === votes[1] + '.winners',
    '1. each later round reads the winners of the round before');

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

    // --- Expert teams ---
    const firstSplit = waitForEvent(host, 'team-split', 8000);
    host.emit('start-game', { code });
    const experts = await firstSplit;
    const expertTeams = experts.teams || {};
    log('HOST', 'expert teams: ' + Object.keys(expertTeams).map((n) => n + ' (' + expertTeams[n].length + ')').join(', '));
    r.check(Object.keys(expertTeams).length === 3 && Object.values(expertTeams).every((t) => t.length === 2), '2. six students in three expert teams of two');

    // --- Jigsaw regroup ---
    await wait(300);
    drainEvent(players, 'team-split');
    const secondSplit = waitForEvent(host, 'team-split', 8000);
    const playerSeats = waitForEventOnAll(players, 'team-split', 8000);
    await wait(300);
    host.emit('advance-phase', { code });
    const home = await secondSplit;
    const seats = await playerSeats;
    const homeTeams = home.teams || {};
    log('HOST', 'home groups: ' + Object.keys(homeTeams).map((n) => n + ' (' + homeTeams[n].length + ')').join(', '));
    r.check(Object.keys(homeTeams).length === 2 && Object.values(homeTeams).every((t) => t.length === 3), '2. two home groups of three');
    const mixed = Object.values(homeTeams).every((members) => {
      const origins = members.map((m) => teamOf(expertTeams, m.playerId));
      return new Set(origins).size === 3 && origins.every(Boolean);
    });
    r.check(mixed, '2. every home group holds one member of each expert team');
    const seated = Object.values(homeTeams).flat().map((m) => m.playerId);
    r.check(seated.length === 6 && new Set(seated).size === 6, '2. everyone is seated once');
    log('SIM', 'seats heard: ' + seats.map((s) => s.myTeam).join(', '));
    r.check(seats.every((s) => s.myTeam && homeTeams[s.myTeam]), '2. every student hears their home group');

    // --- Round one ---
    const ballots1 = waitForEventOnAll(players, 'vote-start', 8000);
    const hostBallot1 = waitForEvent(host, 'vote-start', 8000);
    await wait(300);
    host.emit('advance-phase', { code });
    const v1 = await ballots1;
    const h1 = await hostBallot1;
    log('HOST', 'round 1 matchups: ' + JSON.stringify(h1.proposals));
    r.check(Array.isArray(h1.proposals) && h1.proposals[0] === 'Holes  vs  Hatchet' && h1.proposals[1] === 'Wonder  vs  Matilda' && h1.proposals.length === 2,
      '3. the projector lists the two matchups in seed order, the bye off the list');
    r.check(v1.every((b) => b.mode === 'head-to-head' && Array.isArray(b.matchups) && b.matchups.length === 2), '3. every student votes on both matchups');
    const cast = (p, ballot, choices) => p.emit('submit-vote', { code, votes: choices.map((choice) => ({ choice })), phaseInstanceId: ballot.phaseInstanceId });
    const reveal1 = waitForEvent(host, 'show-results', 10000);
    // Hatchet 6-0, Wonder 4-2
    players.forEach((p, i) => cast(p, v1[i], ['Hatchet', i < 4 ? 'Wonder' : 'Matilda']));
    const s1 = await reveal1;
    const t1 = String(s1.content || '');
    log('HOST', 'round 1 reveal:\n' + t1);
    r.check(t1.includes('Hatchet beat Holes, 6 to 0.'), '3. the reveal says Hatchet beat Holes, 6 to 0');
    r.check(t1.includes('Wonder beat Matilda, 4 to 2.'), '3. the reveal says Wonder beat Matilda, 4 to 2');
    r.check(t1.includes('Frindle moves on, no opponent this round.'), '3. the bye is said');

    // --- Round two: a tie ---
    const ballots2 = waitForEventOnAll(players, 'vote-start', 8000);
    const hostBallot2 = waitForEvent(host, 'vote-start', 8000);
    await wait(300);
    host.emit('advance-phase', { code });
    const v2 = await ballots2;
    const h2 = await hostBallot2;
    log('HOST', 'round 2 matchups: ' + JSON.stringify(h2.proposals));
    r.check(h2.proposals.length === 1 && h2.proposals[0] === 'Hatchet  vs  Wonder', '4. round two pits the two winners, Frindle waits');
    const reveal2 = waitForEvent(host, 'show-results', 10000);
    players.forEach((p, i) => cast(p, v2[i], [i < 3 ? 'Hatchet' : 'Wonder']));
    const t2 = String((await reveal2).content || '');
    log('HOST', 'round 2 reveal:\n' + t2);
    r.check(t2.includes('Hatchet and Wonder tied, Hatchet moves on.'), '4. a tie sends the first-listed on');
    r.check(t2.includes('Frindle moves on, no opponent this round.'), '4. the bye moves on again');

    // --- Round three: the final ---
    const ballots3 = waitForEventOnAll(players, 'vote-start', 8000);
    const hostBallot3 = waitForEvent(host, 'vote-start', 8000);
    await wait(300);
    host.emit('advance-phase', { code });
    const v3 = await ballots3;
    const h3 = await hostBallot3;
    r.check(h3.proposals.length === 1 && h3.proposals[0] === 'Hatchet  vs  Frindle', '5. the final is Hatchet against Frindle');
    const reveal3 = waitForEvent(host, 'show-results', 10000);
    players.forEach((p, i) => cast(p, v3[i], [i < 5 ? 'Frindle' : 'Hatchet']));
    const t3 = String((await reveal3).content || '');
    log('HOST', 'final reveal:\n' + t3);
    r.check(t3.includes('Frindle beat Hatchet, 5 to 1.'), '5. the final is told in words');
    r.check(/The winner of the bracket: \*?\*?Frindle/.test(t3), '5. the champion is named');

    const ended = waitForEvent(host, 'game-ended', 8000).catch(() => null);
    await wait(300);
    host.emit('advance-phase', { code });
    const end = await ended;
    r.check(!!end, '5. the room reaches the end');
  } finally {
    for (const s of [host, ...players]) { try { s && s.disconnect(); } catch (e) { /* gone */ } }
    child.kill();
    await rm(join(ROOT, 'games', 'user', COPY_ID), { recursive: true, force: true }).catch(() => {});
  }
  r.summary('JIGSAW + BRACKET');
  process.exit(r.errors ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
