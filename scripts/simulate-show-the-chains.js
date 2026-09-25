/**
 * The class sees the chains (an outside reviewer built a water-cycle chain
 * on the Exquisite Corpse recipe and the finished chains never reached the
 * projector, 2026-09-25), proved against a real server on the built-in
 * Exquisite Corpse with four students (fewer than the six folds, so a
 * paper comes around twice, still blind):
 *
 *   1. Six blind folds run with four students; every student gets a chain
 *      back, assembled from the template.
 *   2. The return-to-author reveal stores every finished chain, and the
 *      teacher console hears the list (teacher-chains), one row per starter.
 *   3. Show from the console puts THAT chain on the projector (spotlight-show
 *      with the words and the starter's name); a student sending the same
 *      event gets nothing on the projector.
 *   4. The gallery step that follows (reveal-one over {{poem.responses}})
 *      opens on the projector with one item per chain.
 *   5. The report carries the chains whole under their own heading.
 *
 * Self-contained: spawns its own server (mock AI, filesystem storage) on a
 * random port.
 *
 * Usage: node scripts/simulate-show-the-chains.js
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { connect, waitForEvent, waitForEventOnAll, log, makeReporter, wait } from './sim-harness.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const r = makeReporter();
const NAMES = ['Maya', 'Jordan', 'Sam', 'Priya'];
// One word per fold per student: adjective, noun, adverb, verb, adjective, noun
const WORDS = [
  ['sleepy', 'ancient', 'sparkling', 'suspicious'],
  ['walrus', 'librarian', 'volcano', 'sock'],
  ['slowly', 'rudely', 'magnificently', 'quietly'],
  ['devours', 'serenades', 'interrogates', 'hugs'],
  ['furious', 'invisible', 'chocolate', 'tiny'],
  ['sandwich', 'principal', 'thunderstorm', 'cloud']
];

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
  const { child, url } = await startServer();
  let host; let teacher; const players = [];
  try {
    host = await connect('HOST', url);
    host.emit('create-room', { gameId: 'exquisite-corpse' });
    const room = await waitForEvent(host, 'room-created', 5000);
    const code = room.code;
    for (let i = 0; i < 4; i++) {
      const p = await connect('P' + (i + 1), url);
      p.emit('join-room', { code, name: NAMES[i] });
      await waitForEvent(p, 'join-success', 3000);
      players.push(p);
    }
    teacher = await connect('TEACHER', url);
    teacher.emit('join-teacher', { code, pin: room.teacherPin });
    await waitForEvent(teacher, 'teacher-joined', 5000);

    host.emit('start-game', { code });
    await waitForEvent(host, 'phase-announce', 5000).catch(() => null);
    await wait(300);

    // Six folds. Each collect opens on every student; all four answer; the
    // teacher closes the step from the projector.
    let starts = waitForEventOnAll(players, 'game-started', 8000);
    host.emit('advance-phase', { code });
    for (let fold = 0; fold < 6; fold++) {
      const opened = await starts;
      r.check(opened.every((s) => String(s.prompt || '').includes('Word ' + (fold + 1) + ' of 6')), `1. fold ${fold + 1} opens on every student`);
      if (fold < 5) starts = waitForEventOnAll(players, 'game-started', 12000);
      for (let i = 0; i < 4; i++) {
        players[i].emit('submit-response', { code, response: WORDS[fold][i], phaseInstanceId: opened[i].phaseInstanceId });
        await waitForEvent(players[i], 'response-accepted', 3000);
      }
      // The teacher closes the fold (a Close waits for in-flight answers)
      await wait(150);
      host.emit('close-submissions', { code });
      if (fold === 5) await wait(600);
    }

    // The unfold announce, then the return-to-author reveal
    const chainsOnConsole = waitForEvent(teacher, 'teacher-chains', 10000);
    const ownReveals = waitForEventOnAll(players, 'show-results', 10000);
    const hostReveal = waitForEvent(host, 'show-results', 10000);
    await wait(400);
    host.emit('advance-phase', { code });
    const shown = await ownReveals;
    const hostLine = await hostReveal;
    const chains = await chainsOnConsole;
    r.check(shown.every((s) => s.ownReveal === true && /Hand by hand, it became:/.test(String(s.content || ''))), '1. every student gets their own chain back, assembled');
    r.check(String(hostLine.content || '').includes('Everyone is reading'), '1. the projector only narrates during the private reveal');
    log('HOST', 'private reveal line: ' + hostLine.content);

    r.check(Array.isArray(chains.chains) && chains.chains.length === 4, '2. the console hears four finished chains');
    const byName = Object.fromEntries((chains.chains || []).map((c) => [c.name, c]));
    r.check(NAMES.every((n) => byName[n] && typeof byName[n].playerId === 'string'), '2. one row per starter, named');
    r.check((chains.chains || []).every((c) => /^The \S+ \S+ \S+ \S+ the \S+ \S+\.$/.test(c.text)), '2. every chain is the filled sentence: ' + JSON.stringify((chains.chains || []).map((c) => c.text)));
    for (const c of chains.chains || []) log('CHAIN', c.name + ': ' + c.text);

    // Show from the console
    const spot = waitForEvent(host, 'spotlight-show', 5000);
    teacher.emit('spotlight', { code, playerId: byName.Jordan.playerId });
    const onProjector = await spot;
    r.check(onProjector.text === byName.Jordan.text && onProjector.name === 'Jordan', '3. Show puts that chain on the projector with its starter\'s name');

    // A student sending the same event gets nothing on the projector
    let leaked = false;
    const spy = waitForEvent(host, 'spotlight-show', 1200).then(() => { leaked = true; }).catch(() => {});
    players[0].emit('spotlight', { code, playerId: byName.Maya.playerId });
    await spy;
    r.check(!leaked, '3. a student\'s spotlight event is ignored');

    // The gallery on the projector
    const gallery = waitForEvent(host, 'reveal-one-start', 8000);
    host.emit('advance-phase', { code });
    const g = await gallery;
    r.check(g.total === 4, '4. the gallery opens with one item per chain (got ' + g.total + ')');
    r.check(/Some of the sentences/.test(String(g.message || '')), '4. the gallery carries the recipe\'s line');

    // The report keeps the chains whole
    const rep = await fetch(`${url}/api/rooms/${code}/report?pin=${room.teacherPin}`);
    const body = rep.ok ? await rep.json() : null;
    const section = body && (body.sections || []).find((s) => s.id === 'poem');
    r.check(!!section && section.heading === 'What each one became, start to finish', '5. the report has the chains section');
    const items = section && section.blocks && section.blocks[0] && section.blocks[0].items || [];
    r.check(items.length === 4 && items.every((it) => NAMES.includes(it.name) && byName[it.name].text === it.text), '5. the report lists every chain whole, named for its starter');
  } finally {
    for (const s of [host, teacher, ...players]) { try { s && s.disconnect(); } catch (e) { /* gone */ } }
    child.kill();
  }
  r.summary('SHOW THE CHAINS');
  process.exit(r.errors ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
