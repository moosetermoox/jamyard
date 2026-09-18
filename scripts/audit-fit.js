/**
 * Fit audit: does every projector and student screen fit its viewport?
 * (owner 2026-09-18: "during an activity the entire screen should fit so you
 * don't have to scroll down. most projectors fit 16:9")
 *
 * Drives /prototype (Try it out) in headless Edge with the host frame at
 * 1920x1080 and the student frame at 1366x768, walks activities forward
 * with pretend students, measures scrollHeight vs innerHeight per phase,
 * and screenshots the frames that overflow (every frame with SHOT_ALL=1).
 * results.json in the out dir holds every measurement.
 */
//
// Usage: node scripts/audit-fit.js <outDir> game1 game2 ...   (starts its own server on :3005)
//   env: FIT_PORT, HOST_W/HOST_H (1920x1080), STU_W/STU_H (1366x768), PLAYERS (6), SHOT_ALL=1 (shoot every screen)
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, createWriteStream } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2];
const GAMES = process.argv.slice(3);
const PORT = Number(process.env.FIT_PORT) || 3005;
const SERVER = `http://localhost:${PORT}`;
const HOST_W = Number(process.env.HOST_W) || 1920, HOST_H = Number(process.env.HOST_H) || 1080;
const STU_W = Number(process.env.STU_W) || 1366, STU_H = Number(process.env.STU_H) || 768;
const PLAYERS = Number(process.env.PLAYERS) || 6;
const SHOT_ALL = process.env.SHOT_ALL === '1';
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const log = (m) => console.log(`[${new Date().toLocaleTimeString('en-US', { hour12: false })}] ${m}`);

class CDP {
  constructor(ws) {
    this.ws = ws; this.nextId = 0; this.pending = new Map(); this.handlers = new Map();
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id) {
        const p = this.pending.get(m.id); this.pending.delete(m.id);
        if (!p) return;
        m.error ? p.reject(new Error(`${p.method}: ${m.error.message}`)) : p.resolve(m.result);
      } else {
        for (const h of this.handlers.get(m.method) || []) h(m.params, m.sessionId);
      }
    });
  }
  send(method, params = {}, sessionId, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => { if (this.pending.delete(id)) reject(new Error(`${method}: no reply in ${timeout}ms`)); }, timeout);
      this.pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); }, method });
      this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
}

const EDGE_PATHS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
];

async function launchBrowser() {
  const exe = EDGE_PATHS.find(p => existsSync(p));
  const port = 9400 + Math.floor(Math.random() * 400);
  const profile = join(process.env.TEMP || '/tmp', 'fit-audit-profile-' + port);
  const proc = spawn(exe, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--window-size=3600,2400', '--force-device-scale-factor=1', '--hide-scrollbars', '--mute-audio',
    'about:blank'
  ], { stdio: 'ignore' });
  let info = null;
  for (let i = 0; i < 60 && !info; i++) {
    await sleep(250);
    try { info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { /* not up */ }
  }
  if (!info) { proc.kill(); throw new Error('Browser never came up'); }
  const ws = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  return { proc, cdp: new CDP(ws) };
}

async function startServer() {
  const env = { ...process.env, PORT: String(PORT), ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', DATABASE_URL: '', POSTHOG_KEY: '', POSTHOG_REPLAY: '0' };
  const proc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const logStream = createWriteStream(join(OUT, 'server.log'));
  proc.stdout.pipe(logStream); proc.stderr.pipe(logStream);
  for (let i = 0; i < 120; i++) {
    await sleep(250);
    try { const r = await fetch(`${SERVER}/api/games`); if (r.ok) return proc; } catch { /* not up */ }
  }
  throw new Error('server never answered');
}

const FORCE_CSS = `
  html, body { overflow: visible !important; }
  #iframe-container { display: block !important; width: max-content !important; max-width: none !important; }
  #host-mat, #student-mat, .screen-mat, #student-column, #player-holder, .player-panel {
    width: max-content !important; height: auto !important; max-width: none !important; max-height: none !important;
    aspect-ratio: auto !important; overflow: visible !important; transform: none !important; flex: none !important; }
  #host-mat iframe.host-frame { width: ${HOST_W}px !important; height: ${HOST_H}px !important; min-height: 0 !important; max-height: none !important; flex: none !important; }
  .player-panel iframe { width: ${STU_W}px !important; height: ${STU_H}px !important; min-height: 0 !important; max-height: none !important; flex: none !important; }
`;

const MEASURE_JS = `(function(){
  Array.prototype.slice.call(playerHolder.querySelectorAll('.player-panel iframe')).forEach(function(f){ try { var d=f.contentDocument; var c=d&&d.getElementById('early-joke'); if(c&&!c.hidden){ var b=d.getElementById('early-joke-dismiss'); if(b) b.click(); } } catch(e){} });
  function m(f){
    if(!f) return null;
    var w=f.contentWindow, d=f.contentDocument; if(!d||!d.body) return null;
    var de=d.documentElement;
    var secs=Array.prototype.slice.call(d.querySelectorAll('section'));
    var vis=secs.filter(function(s){ return s.offsetParent!==null && !s.hidden; }).map(function(s){ return s.id; });
    var r=f.getBoundingClientRect();
    return { sh: Math.max(de.scrollHeight, d.body.scrollHeight), ih: w.innerHeight, sw: Math.max(de.scrollWidth, d.body.scrollWidth), iw: w.innerWidth,
      sections: vis, bodyClass: d.body.className, rect: { x: r.x + window.scrollX, y: r.y + window.scrollY, w: r.width, h: r.height } };
  }
  var h = hostFrame();
  var panels = Array.prototype.slice.call(playerHolder.querySelectorAll('.player-panel iframe'));
  var p = panels.filter(function(f){ return f.offsetParent!==null; })[0] || panels[0] || null;
  return { phaseId: railPhaseId, phaseType: railPhaseType, pos: livePos(), code: currentCode, host: m(h), student: m(p) };
})()`;

async function main() {
  const server = await startServer();
  const { proc: browser, cdp } = await launchBrowser();
  const results = [];
  try {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const S = (m, p) => cdp.send(m, p, sessionId);
    await S('Page.enable'); await S('Runtime.enable');
    await S('Emulation.setDeviceMetricsOverride', { width: 3600, height: 2400, deviceScaleFactor: 1, mobile: false });
    const ev = async (expr) => {
      const r = await S('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result.value;
    };
    const shot = async (rect, file) => {
      const r = await S('Page.captureScreenshot', { format: 'png', clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 1 }, captureBeyondViewport: true });
      writeFileSync(file, Buffer.from(r.data, 'base64'));
    };

    for (const game of GAMES) {
      log(`=== ${game}`);
      const dir = join(OUT, game); mkdirSync(dir, { recursive: true });
      await S('Page.navigate', { url: `${SERVER}/prototype?game=${encodeURIComponent(game)}` });
      await sleep(2500);
      await ev(`try { localStorage.setItem('jamyardBenchTourDone','1'); } catch (e) {} 1`);
      await ev(`(function(){ var st=document.createElement('style'); st.textContent=${JSON.stringify(FORCE_CSS)}; document.head.appendChild(st); return 1; })()`);
      const ok = await ev(`(function(){ if(!gameSelect.value) return 'no-select'; playerCount.value = ${PLAYERS}; launchBtn.click(); return gameSelect.value; })()`);
      if (ok === 'no-select') { log(`  ${game}: not in the bench select, skipped`); continue; }
      // wait for the room
      let code = null;
      for (let i = 0; i < 40 && !code; i++) { await sleep(500); code = await ev('currentCode'); }
      if (!code) { log(`  ${game}: no room`); continue; }
      await sleep(3500); // students join
      let lastPos = null, stuck = 0, step = 0;
      const seenPhases = new Set();
      for (let iter = 0; iter < 90; iter++) {
        let m = await ev(MEASURE_JS);
        if (m.pos !== lastPos) { lastPos = m.pos; stuck = 0; step++; } else { stuck++; }
        const tag = `${String(step).padStart(2, '0')}-${(m.phaseId || 'lobby').replace(/[^a-z0-9_-]/gi, '_')}`;
        const record = (m, suffix) => {
          const row = { game, step, phaseId: m.phaseId, phaseType: m.phaseType, suffix, host: m.host && { sh: m.host.sh, ih: m.host.ih, sw: m.host.sw, iw: m.host.iw, sections: m.host.sections }, student: m.student && { sh: m.student.sh, ih: m.student.ih, sw: m.student.sw, iw: m.student.iw, sections: m.student.sections } };
          row.hostOver = row.host ? Math.max(0, row.host.sh - row.host.ih) : null;
          row.stuOver = row.student ? Math.max(0, row.student.sh - row.student.ih) : null;
          results.push(row);
          return row;
        };
        if (!seenPhases.has(m.pos)) {
          seenPhases.add(m.pos);
          await sleep(900);
          m = await ev(MEASURE_JS);
          const row = record(m, 'arrive');
          log(`  ${tag} arrive  host +${row.hostOver} (${row.host?.sections?.join(',')})  student +${row.stuOver} (${row.student?.sections?.join(',')})`);
          if (m.host && (SHOT_ALL || row.hostOver > 0)) await shot(m.host.rect, join(dir, `${tag}-arrive-host.png`));
          if (m.student && (SHOT_ALL || row.stuOver > 0)) await shot(m.student.rect, join(dir, `${tag}-arrive-student.png`));
          if (m.phaseType === 'end') break;
          // pretend students answer, then measure with answers in
          await ev('fireBotFill(); 1');
          await sleep(1800);
          const m2 = await ev(MEASURE_JS);
          if (m2.pos === m.pos) {
            const row2 = record(m2, 'filled');
            log(`  ${tag} filled  host +${row2.hostOver}  student +${row2.stuOver}`);
            if (m2.host && (SHOT_ALL || row2.hostOver > 0)) await shot(m2.host.rect, join(dir, `${tag}-filled-host.png`));
            if (m2.student && (SHOT_ALL || row2.stuOver > 0)) await shot(m2.student.rect, join(dir, `${tag}-filled-student.png`));
          }
        }
        if (m.phaseType === 'end') break;
        await ev('fireSkip(false); 1');
        // wait for a move
        let moved = false;
        for (let k = 0; k < 24; k++) { await sleep(400); const p = await ev('livePos()'); if (p !== lastPos) { moved = true; break; } }
        if (!moved) { stuck++; if (stuck > 4) { log(`  ${game}: stuck at ${m.phaseId}, giving up`); break; } }
      }
      log(`  ${game}: ${step} steps`);
    }
  } finally {
    writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 2));
    browser.kill(); server.kill();
  }
  // summary
  const over = results.filter(r => r.hostOver > 2 || r.stuOver > 2);
  console.log('\n=== OVERFLOW SUMMARY (px beyond the viewport) ===');
  for (const r of over) console.log(`${r.game}  ${r.phaseId} (${r.phaseType}) ${r.suffix}: host +${r.hostOver} [${r.host?.sections}]  student +${r.stuOver} [${r.student?.sections}]`);
  console.log(`${over.length} of ${results.length} measurements overflow`);
}

main().catch(e => { console.error(e); process.exit(1); });
