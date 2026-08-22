/**
 * Regenerate the homepage carousel's activity shots.
 *
 * For every featured built-in (or the ids passed as args), drives the real
 * host screen over the Chrome DevTools Protocol with four bot players,
 * advances to the activity's photo moment (the first input phase, or a
 * per-game override below), hides the teacher chrome, and captures a
 * 900x675 shot into screens/home/shots/<gameId>.png — the size the
 * carousel displays, so the page's own responsive layout composes the
 * thumbnail and no cropping ever happens.
 *
 * Run this after any visual redesign or featured-set change, then commit
 * the changed PNGs. Activities without a shot fall back to the text-only
 * card automatically, so a missing/failed capture is never fatal.
 *
 * Usage: node scripts/regen-carousel-shots.js [gameId ...]   (server running)
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER = process.env.SIM_SERVER || 'http://localhost:3000';
const OUT_DIR = join(__dirname, '..', 'screens', 'home', 'shots');
const W = 900, H = 675;

// clicks = how many host continues to press before capturing. The driver
// stops early when a non-announce phase section appears. Overrides:
//   closer: all talk screens, land on the first question ("Window seat...")
//   trivia-bluff: capture the intro; one more click starts a real AI call.
const OVERRIDES = {
  closer: { clicks: 2 },
  'trivia-bluff': { clicks: 0 }
};
const DEFAULT_CLICKS = 3;

const EDGE_PATHS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
];
const edge = EDGE_PATHS.find(p => existsSync(p));
if (!edge) { console.error('Edge not found'); process.exit(1); }

// The in-page driver: join 4 bots (two of them answer text/choice prompts so
// the submission pile looks alive), start, advance to the photo moment,
// then strip the teacher chrome for a clean projector shot.
function driverJs(clicks) {
  return `(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const NAMES = ['Ava', 'Ben', 'Cal', 'Dee'];
    const ANSWERS = ['A rooftop garden for the whole school', 'A robot that waters plants'];
    for (let i = 0; i < 4; i++) {
      const s = io();
      s.emit('join-room', { code: currentRoomCode, name: NAMES[i] });
      if (i < 2) {
        s.on('game-started', (d) => {
          setTimeout(() => {
            if (d && Array.isArray(d.choices) && d.choices.length) {
              const c = d.choices[i % d.choices.length];
              s.emit('submit-response', { code: currentRoomCode, response: typeof c === 'string' ? c : (c.text || c.name || String(c)) });
            } else if (d && !d.fields && d.inputType !== 'drawing') {
              s.emit('submit-response', { code: currentRoomCode, response: ANSWERS[i] });
            }
          }, 900);
        });
      }
    }
    await sleep(1000);
    const startBtn = document.getElementById('start-game-btn');
    startBtn.disabled = false;
    startBtn.click();
    const CLICKS = ${clicks};
    for (let step = 0; step <= CLICKS; step++) {
      await sleep(1500);
      const visible = document.querySelector('section.active');
      const id = visible ? visible.id : '';
      const atTarget = id && id !== 'lobby-section' && id !== 'announce-section' && id !== 'process-section';
      if (step === CLICKS || atTarget) break;
      const btn = document.getElementById('announce-continue-btn');
      if (btn && !btn.closest('section[hidden]')) btn.click();
      else break; // not an announce: capture whatever this is
    }
    await sleep(700);
    document.documentElement.style.overflow = 'hidden';
    ['sfx-toggle', 'teacher-link-copy', 'close-submissions-btn', 'more-time-btn']
      .forEach(id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; });
    await sleep(300);
  })()`;
}

async function main() {
  let ids = process.argv.slice(2);
  if (ids.length === 0) {
    const res = await fetch(`${SERVER}/api/games`);
    const data = await res.json();
    ids = data.games
      .filter(g => (g.source || 'built-in') !== 'user' && g.featured)
      .map(g => g.id);
  }
  console.log(`Capturing ${ids.length} activities: ${ids.join(', ')}`);
  mkdirSync(OUT_DIR, { recursive: true });

  const port = 9222 + Math.floor(Math.random() * 500);
  const profile = `${process.env.TEMP || '/tmp'}\\cdp-carousel-${port}`;
  const browser = spawn(edge, [
    '--headless=new', '--disable-gpu', '--no-first-run',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    `--window-size=${W},${H}`,
    'about:blank'
  ], { stdio: 'ignore' });

  let targets = null;
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`);
      targets = await res.json();
      if (targets.some(t => t.type === 'page')) break;
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 250));
  }
  if (!targets) { console.error('Edge debug port never came up'); browser.kill(); process.exit(1); }

  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map();
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    }
  };
  await new Promise(r => { ws.onopen = r; });
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.enable');

  let ok = 0, failed = 0;
  for (const id of ids) {
    try {
      await send('Page.navigate', { url: `${SERVER}/host?game=${encodeURIComponent(id)}` });
      await new Promise(r => setTimeout(r, 3000));
      const clicks = OVERRIDES[id] ? OVERRIDES[id].clicks : DEFAULT_CLICKS;
      const evalRes = await send('Runtime.evaluate', { expression: driverJs(clicks), awaitPromise: true });
      if (evalRes.exceptionDetails) {
        throw new Error(JSON.stringify(evalRes.exceptionDetails.exception || evalRes.exceptionDetails.text));
      }
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(OUT_DIR, `${id}.png`), Buffer.from(shot.data, 'base64'));
      console.log(`  \x1b[32mok\x1b[0m ${id}`);
      ok++;
    } catch (err) {
      console.log(`  \x1b[31mFAILED\x1b[0m ${id}: ${err.message}`);
      failed++;
    }
  }

  ws.close();
  browser.kill();
  console.log(`\n${ok} captured, ${failed} failed -> ${OUT_DIR}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
