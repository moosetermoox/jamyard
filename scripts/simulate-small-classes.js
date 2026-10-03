/**
 * Small-class sweep: every visible built-in played start to finish with
 * 1, 2, and 3 students, and once with 3 students who never answer (every
 * answer step closed empty). Starts its own server (mock AI, no database)
 * so it can run in CI.
 *
 * Why: two outside reviews on 2026-10-02 found fourteen bugs that only
 * show with a tiny class or an empty step (zero votes called a tie, a
 * two-student chain handing a story back to its author, 5 of 7 eliminated
 * under a 60% cap, a review gate with nothing to review). Every step
 * handler guards those cases on its own, so the sweep is the shared
 * contract (docs/ARCHITECTURE-REVIEW-2026-10.md, cause 3).
 *
 * Usage: node scripts/simulate-small-classes.js [--games a,b] [--sizes 1,2,3]
 *                                               [--no-empty] [--jobs 4]
 *   env: SWEEP_PORT (3015), SWEEP_TIMEOUT_MS per run (240000)
 * Exit 1 when any run has errors, never reaches the end, or times out.
 */
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.SWEEP_PORT) || 3015;
const SERVER = `http://localhost:${PORT}`;
const RUN_TIMEOUT = Number(process.env.SWEEP_TIMEOUT_MS) || 360000;

/**
 * Server-side errors are a failure of the sweep even when every run reached
 * the end: a handler that throws is caught by the socket wrapper and the
 * room limps on (the match-submit crash never showed on a student screen).
 * Pure, tested.
 */
export function serverErrorLines(serverLog) {
  return String(serverLog || '').split('\n')
    .filter(l => /Unhandled handler error|\[handlePhase\] Error|TypeError|ReferenceError|unhandledRejection/.test(l))
    .map(l => l.trim());
}

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const SIZES = flag('--sizes', '1,2,3').split(',').map(Number);
const JOBS = Number(flag('--jobs', '4'));
const WITH_EMPTY = !args.includes('--no-empty');

/** Visible built-ins: a games/ dir with a config.json, not `_`-prefixed. */
export function visibleGames() {
  return readdirSync(join(ROOT, 'games'))
    .filter(d => !d.startsWith('_') && existsSync(join(ROOT, 'games', d, 'config.json')))
    .filter(d => {
      try { return !JSON.parse(readFileSync(join(ROOT, 'games', d, 'config.json'), 'utf8')).retired; }
      catch { return false; }
    })
    .sort();
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function startServer() {
  // Mock AI, no database, and the AI cost guards off: six games at once
  // would trip the 20-a-minute throttle and every AI step would stall.
  const env = { ...process.env, PORT: String(PORT), ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', DATABASE_URL: '', POSTHOG_KEY: '', POSTHOG_REPLAY: '0', SITE_PASSWORD: '', AI_CALLS_PER_MINUTE: '0', AI_DAILY_CAP: '0' };
  const proc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let serverLog = '';
  proc.stdout.on('data', d => { serverLog += d; });
  proc.stderr.on('data', d => { serverLog += d; });
  for (let i = 0; i < 120; i++) {
    await sleep(250);
    try { const r = await fetch(`${SERVER}/api/games`); if (r.ok) return { proc, log: () => serverLog }; } catch { /* not up */ }
  }
  proc.kill();
  throw new Error('server never answered:\n' + serverLog.slice(-2000));
}

/**
 * Read one playthrough's output into a verdict. Pure, so the parsing is
 * testable without a server.
 * @param {{game: string, size: number, empty: boolean, out: string, timedOut: boolean, exitCode: number|null}} run
 */
export function verdictFor(run) {
  const m = run.out.match(/Result: (\d+) errors, (\d+) warnings/);
  const errors = m ? Number(m[1]) : null;
  const reachedEnd = /--- Phase: END ---/.test(run.out);
  const stuck = /game may be stuck/.test(run.out);
  const crashed = /Simulator crashed|Failed to create room/.test(run.out);
  const phases = (run.out.match(/Phases visited: (\d+)/) || [])[1];
  let status = 'ok';
  if (run.timedOut) status = 'timeout';
  else if (crashed) status = 'crashed';
  else if (errors === null) status = 'no-result';
  else if (errors > 0) status = 'errors';
  else if (stuck || !reachedEnd) status = 'stuck';
  const lastPhase = (run.out.match(/--- Phase: ([A-Z-]+(?: \([a-z-]+\))?) ---(?![\s\S]*--- Phase: )/) || [])[1] || '';
  return { game: run.game, size: run.size, empty: run.empty, status, errors: errors || 0, phases: phases ? Number(phases) : 0, lastPhase };
}

function runOne(game, size, empty) {
  return new Promise(resolve => {
    const env = { ...process.env, SIM_SERVER: SERVER, SIM_FAST: '1', SIM_EMPTY: empty ? '1' : '0' };
    const proc = spawn(process.execPath, ['scripts/simulate-any-game.js', game, String(size)], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    proc.stdout.on('data', d => { out += d; });
    proc.stderr.on('data', d => { out += d; });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; proc.kill(); }, RUN_TIMEOUT);
    proc.on('close', code => {
      clearTimeout(timer);
      resolve({ game, size, empty, out, timedOut, exitCode: code });
    });
  });
}

async function main() {
  const games = flag('--games', '') ? flag('--games', '').split(',') : visibleGames();
  const plan = [];
  for (const g of games) {
    for (const s of SIZES) plan.push({ game: g, size: s, empty: false });
    if (WITH_EMPTY) plan.push({ game: g, size: 3, empty: true });
  }
  console.log(`Small-class sweep: ${games.length} activities, ${plan.length} runs, ${JOBS} at a time, server on :${PORT}`);
  const server = await startServer();
  const results = [];
  const started = Date.now();
  try {
    let next = 0;
    async function worker() {
      while (next < plan.length) {
        const job = plan[next++];
        const run = await runOne(job.game, job.size, job.empty);
        const v = verdictFor(run);
        v.out = run.out;
        results.push(v);
        const tag = v.empty ? 'empty' : `${v.size} student${v.size === 1 ? '' : 's'}`;
        const mark = v.status === 'ok' ? '  ok ' : ' FAIL';
        console.log(`${mark} ${v.game.padEnd(34)} ${tag.padEnd(10)} ${v.status.padEnd(9)} ${v.phases} steps${v.lastPhase ? ', last ' + v.lastPhase : ''}`);
      }
    }
    await Promise.all(Array.from({ length: JOBS }, worker));
  } finally {
    server.proc.kill();
  }

  const failed = results.filter(r => r.status !== 'ok');
  console.log(`\n${results.length - failed.length} of ${results.length} runs ok in ${Math.round((Date.now() - started) / 1000)}s`);
  for (const f of failed) {
    const tag = f.empty ? 'empty' : `${f.size} students`;
    console.log(`\n=== ${f.game} (${tag}): ${f.status}`);
    const lines = f.out.split('\n');
    const bad = lines.filter(l => /✗|crashed|Error|stuck|TypeError|ReferenceError/.test(l) && !/0 errors/.test(l));
    console.log((bad.length ? bad : lines.slice(-12)).slice(0, 15).map(l => '   ' + l).join('\n'));
  }
  const serverErrors = serverErrorLines(server.log());
  if (serverErrors.length) {
    const counts = new Map();
    for (const l of serverErrors) counts.set(l, (counts.get(l) || 0) + 1);
    console.log(`\nServer errors (${serverErrors.length} lines, a failure even when every run reached the end):`);
    for (const [l, n] of counts) console.log(`   ${n}x ${l.slice(0, 200)}`);
  }
  process.exit(failed.length || serverErrors.length ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(err => { console.error(err); process.exit(1); });
}
