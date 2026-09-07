/**
 * Accessibility audit: axe-core over headless Edge (CDP), one pass per page.
 *
 * Loads each page, injects node_modules/axe-core/axe.min.js, runs axe.run()
 * and prints the violations grouped by page: impact, rule id, help text, and
 * up to three target selectors each. Exits 1 when any serious or critical
 * violation is found so it can gate a check.
 *
 * Usage:
 *   node scripts/a11y-audit.js [baseUrl] [--json out.json] [--wait ms] [--only /path,/path] [--detail]
 *   node scripts/a11y-audit.js http://localhost:3000
 *   node scripts/a11y-audit.js http://localhost:3005 --only /prototype,/player
 *
 * Needs a running server (default http://localhost:3000). Drives its own
 * headless Edge the way scripts/screenshot.js does: pages that hold a
 * socket.io connection never reach network-idle, so a plain wait is used.
 */

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1];
};
const baseUrl = (args.find(a => a.startsWith('http')) || 'http://localhost:3000').replace(/\/$/, '');
const jsonOut = flag('--json');
const waitMs = parseInt(flag('--wait'), 10) || 3000;
const detail = args.includes('--detail');

const DEFAULT_PAGES = ['/', '/library', '/designer', '/prototype', '/guide', '/privacy', '/host?game=snowball', '/player'];
const pages = flag('--only') ? flag('--only').split(',') : DEFAULT_PAGES;

const here = dirname(fileURLToPath(import.meta.url));
const axePath = join(here, '..', 'node_modules', 'axe-core', 'axe.min.js');
if (!existsSync(axePath)) {
  console.error('axe-core not installed: run `npm install` first (' + axePath + ')');
  process.exit(1);
}
const axeSource = readFileSync(axePath, 'utf8');

const EDGE_PATHS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
];
const edge = EDGE_PATHS.find(p => existsSync(p));
if (!edge) { console.error('Edge not found'); process.exit(1); }

const port = 9222 + Math.floor(Math.random() * 500);
const profile = `${process.env.TEMP || '/tmp'}/cdp-a11y-${port}`;
const browser = spawn(edge, [
  '--headless=new', '--disable-gpu', '--no-first-run',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  '--window-size=1280,900',
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

async function evaluate(expression, awaitPromise = false) {
  const res = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (res.exceptionDetails) {
    const d = res.exceptionDetails;
    throw new Error(d.exception?.description || d.text || 'evaluate failed');
  }
  return res.result.value;
}

const IMPACT_ORDER = { critical: 0, serious: 1, moderate: 2, minor: 3 };
const results = [];

await send('Page.enable');
await send('Runtime.enable');

for (const path of pages) {
  const url = baseUrl + path;
  try {
    await send('Page.navigate', { url });
    await new Promise(r => setTimeout(r, waitMs));
    await evaluate(axeSource);
    const run = await evaluate(
      'axe.run(document, { resultTypes: ["violations"] }).then(r => JSON.stringify(r.violations))',
      true
    );
    const violations = JSON.parse(run)
      .map(v => ({
        id: v.id,
        impact: v.impact || 'minor',
        help: v.help,
        helpUrl: v.helpUrl,
        count: v.nodes.length,
        targets: v.nodes.slice(0, 3).map(n => n.target.join(' ')),
        // What axe measured for each node (the contrast ratio, the colors);
        // the JSON always carries it, --detail prints it.
        notes: v.nodes.slice(0, detail ? v.nodes.length : 3).map(n => ({
          target: n.target.join(' '),
          why: (n.any.concat(n.all)).map(c => c.message).join(' | ')
        }))
      }))
      .sort((a, b) => (IMPACT_ORDER[a.impact] ?? 9) - (IMPACT_ORDER[b.impact] ?? 9));
    results.push({ path, violations });
  } catch (err) {
    results.push({ path, error: err.message, violations: [] });
  }
}

ws.close();
browser.kill();

let seriousTotal = 0;
for (const r of results) {
  const bySeverity = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const v of r.violations) bySeverity[v.impact] = (bySeverity[v.impact] || 0) + v.count;
  const summary = Object.entries(bySeverity).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(', ') || 'clean';
  console.log(`\n== ${r.path}  (${summary})`);
  if (r.error) console.log(`   ERROR: ${r.error}`);
  for (const v of r.violations) {
    if (v.impact === 'critical' || v.impact === 'serious') seriousTotal += v.count;
    console.log(`   [${v.impact}] ${v.id}: ${v.help} (${v.count})`);
    if (detail) for (const n of v.notes) console.log(`       ${n.target}\n         ${n.why}`);
    else for (const t of v.targets) console.log(`       ${t}`);
  }
}
console.log(`\n${seriousTotal} serious/critical node(s) across ${results.length} page(s)`);

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify(results, null, 2));
  console.log(`wrote ${jsonOut}`);
}

process.exit(seriousTotal ? 1 : 0);
