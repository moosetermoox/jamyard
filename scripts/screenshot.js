/**
 * Headless screenshot via Chrome DevTools Protocol.
 *
 * Why not `msedge --headless --screenshot`? Pages that hold a socket.io
 * connection open (host, player, /teacher) never reach network-idle, so
 * `--virtual-time-budget` hangs forever. This script drives a headless
 * Edge over CDP with a plain real-time wait instead. No dependencies —
 * uses Node's built-in WebSocket and fetch.
 *
 * Usage:
 *   node scripts/screenshot.js <url> <outfile.png> [waitMs] [WxH]
 *   node scripts/screenshot.js http://localhost:3000/teacher shot.png 3000 420x900
 *
 * Spawns its own Edge instance on a random debug port and kills it when done.
 */

import { spawn } from 'node:child_process';
import { writeFileSync, existsSync } from 'node:fs';

const url = process.argv[2];
const outfile = process.argv[3];
const waitMs = parseInt(process.argv[4], 10) || 2500;
// SHOT_CLICK (env) clicks a selector before the capture, see below.
const [w, h] = (process.argv[5] || '900x1300').split('x').map(Number);

if (!url || !outfile) {
  console.error('usage: node scripts/screenshot.js <url> <outfile.png> [waitMs] [WxH]');
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

// Wait for the debug port to come up
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
  await new Promise(r => setTimeout(r, waitMs));
  // SHOT_CLICK=<css selector[ ; selector ...]>: click each in order, a
  // beat apart (SHOT_CLICK_WAIT ms, default 600), before the capture, for
  // states a URL cannot reach (an opened Launch row, a popup's button).
  if (process.env.SHOT_CLICK) {
    const pause = parseInt(process.env.SHOT_CLICK_WAIT || '600', 10);
    for (const one of process.env.SHOT_CLICK.split(' ; ')) {
      const sel = JSON.stringify(one.trim());
      await send('Runtime.evaluate', { expression: `(function(){var el=document.querySelector(${sel});if(el)el.click();return !!el;})()` });
      await new Promise(r => setTimeout(r, pause));
    }
  }
  // SHOT_FOCUS=<css selector>: tap an element with a real mouse press so it
  // takes focus (el.click() never focuses a box), with focus emulation on
  // so :focus and :focus-within styles paint in a headless page.
  if (process.env.SHOT_FOCUS) {
    const sel = JSON.stringify(process.env.SHOT_FOCUS.trim());
    await send('Emulation.setFocusEmulationEnabled', { enabled: true });
    const box = await send('Runtime.evaluate', { returnByValue: true, expression: `(function(){var el=document.querySelector(${sel});if(!el)return null;var r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()` });
    const pt = box.result && box.result.value;
    if (pt) {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
      await new Promise(r => setTimeout(r, 500));
    }
  }
  // SHOT_EVAL=<js>: run a snippet in the page after the clicks (typing
  // into a box, flipping a state), then wait SHOT_EVAL_WAIT ms (default 800).
  if (process.env.SHOT_EVAL) {
    const evalRes = await send('Runtime.evaluate', { expression: process.env.SHOT_EVAL, awaitPromise: true, returnByValue: true });
    if (evalRes.result && evalRes.result.value !== undefined) console.log('eval: ' + JSON.stringify(evalRes.result.value));
    await new Promise(r => setTimeout(r, parseInt(process.env.SHOT_EVAL_WAIT || '800', 10)));
  }
  // SHOT_HOVER=<css selector>: park the mouse over an element before the
  // capture (real CDP mouse move, so :hover styles apply).
  if (process.env.SHOT_HOVER) {
    const sel = JSON.stringify(process.env.SHOT_HOVER.trim());
    const box = await send('Runtime.evaluate', { returnByValue: true, expression: `(function(){var el=document.querySelector(${sel});if(!el)return null;var r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()` });
    const pt = box.result && box.result.value;
    if (pt) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y });
      await new Promise(r => setTimeout(r, 400));
    }
  }
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(outfile, Buffer.from(shot.data, 'base64'));
  console.log(`saved ${outfile} (${w}x${h}, waited ${waitMs}ms)`);
} catch (err) {
  die('screenshot failed: ' + err.message, 1);
}

ws.close();
browser.kill();
process.exit(0);
