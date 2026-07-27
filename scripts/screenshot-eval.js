/**
 * Screenshot after running a JS snippet on the page — for states you can't
 * reach by URL alone (open a modal, click a tab, focus a field).
 *
 * Usage:
 *   node scripts/screenshot-eval.js <url> <outfile.png> "<js>" [waitBeforeMs] [waitAfterMs] [WxH]
 *   node scripts/screenshot-eval.js http://localhost:3000/designer shot.png \
 *     "document.getElementById('use-recipe-link').click()" 2500 1500 1100x900
 *
 * Same CDP approach as screenshot.js (socket pages never reach network-idle).
 */

import { spawn } from 'node:child_process';
import { writeFileSync, existsSync } from 'node:fs';

const url = process.argv[2];
const outfile = process.argv[3];
const evalJs = process.argv[4];
const waitBeforeMs = parseInt(process.argv[5], 10) || 2500;
const waitAfterMs = parseInt(process.argv[6], 10) || 1500;
const [w, h] = (process.argv[7] || '1100x900').split('x').map(Number);

if (!url || !outfile || !evalJs) {
  console.error('usage: node scripts/screenshot-eval.js <url> <outfile.png> "<js>" [waitBeforeMs] [waitAfterMs] [WxH]');
  process.exit(1);
}

const EDGE_PATHS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
];
const edge = EDGE_PATHS.find(p => existsSync(p));
if (!edge) { console.error('Edge not found'); process.exit(1); }

const port = 9222 + Math.floor(Math.random() * 500);
const profile = `${process.env.TEMP || '/tmp'}\\cdp-shot-${port}`;
const browser = spawn(edge, [
  '--headless=new', '--disable-gpu', '--no-first-run',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  `--window-size=${w},${h}`,
  'about:blank'
], { stdio: 'ignore' });

const die = (msg, code) => { console.error(msg); browser.kill(); process.exit(code); };

let targets = null;
for (let i = 0; i < 40; i++) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json`);
    targets = await res.json();
    if (targets.some(t => t.type === 'page')) break;
  } catch { /* not up yet */ }
  await new Promise(r => setTimeout(r, 250));
}
if (!targets) die('Edge debug port never came up', 1);

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
ws.onerror = () => die('CDP websocket error', 1);

await new Promise(r => { ws.onopen = r; });

try {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
  await send('Page.enable');
  await send('Page.navigate', { url });
  await new Promise(r => setTimeout(r, waitBeforeMs));
  const evalRes = await send('Runtime.evaluate', { expression: evalJs, awaitPromise: true });
  if (evalRes.exceptionDetails) {
    die('eval failed: ' + JSON.stringify(evalRes.exceptionDetails.exception || evalRes.exceptionDetails.text), 1);
  }
  await new Promise(r => setTimeout(r, waitAfterMs));
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(outfile, Buffer.from(shot.data, 'base64'));
  console.log(`saved ${outfile} (${w}x${h})`);
} catch (err) {
  die('screenshot failed: ' + err.message, 1);
}

ws.close();
browser.kill();
