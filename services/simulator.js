/**
 * Robot playtest — a headless multi-client simulation the server runs
 * against ITSELF during a deep review ("Check for Errors").
 *
 * Why self-connection instead of an in-process engine walk: the bugs that
 * embarrass a teacher mid-class live in the full stack — socket handlers,
 * close-submissions data storage, foreach orchestration, phase handlers.
 * Driving real sockets exercises exactly what a classroom would, the same
 * way prototype mode does, just with bots.
 *
 * Safety properties:
 *   - Simulated rooms run with the MOCK AI service (room.simulated is set
 *     by the server for `_sim-tmp-` games) — a review never spends API money.
 *   - Every bot emit echoes the phaseInstanceId it saw, so the server's
 *     stale-event guard drops any late/duplicate action. Double-advances
 *     are structurally impossible.
 *   - Hard time cap + stall watchdog: the review request can never hang.
 *
 * Returns structured findings instead of console output:
 *   { completed, durationMs, phaseLog: [...], findings: [{severity, phaseId, message}] }
 *
 * Findings try to attach a phaseId by matching the payload's prompt/message
 * text back to the config — best-effort; unmatched findings render unlinked
 * in the editor (same as structural errors).
 */

import { io as ioClient } from 'socket.io-client';

const BOT_NAMES = ['Robo-Ava', 'Robo-Ben', 'Robo-Cal', 'Robo-Dee', 'Robo-Eli', 'Robo-Fay'];

const BOT_ANSWERS = [
  'A treehouse library with a rope bridge and a snack drawer.',
  'Teaching my dog to fetch the newspaper from the future.',
  'Pancakes for dinner because rules are made of syrup.',
  'A field trip to the moon but we are back before the bell.',
  'My answer is a robot who tells extremely gentle jokes.',
  'Building the world\'s longest domino chain across the gym.'
];

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = ioClient(url, { forceNew: true, timeout: 5000 });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', (err) => reject(new Error(`sim connect failed: ${err.message}`)));
  });
}

/**
 * Best-effort: map an emitted prompt/message back to the phase that
 * produced it, so findings can deep-link in the editor. Resolved
 * templates won't exact-match, so fall back to a prefix comparison on
 * the static lead of the configured text.
 */
export function matchPhaseId(config, text) {
  if (!config || !config.phases || !text) return null;
  const t = String(text).trim();
  for (const [id, phase] of Object.entries(config.phases)) {
    for (const field of ['prompt', 'message', 'template', 'content', 'instruction']) {
      const v = phase[field];
      if (typeof v !== 'string' || v.length === 0) continue;
      if (v === t) return id;
      // Compare the static prefix before the first {{token}}
      const staticLead = v.split('{{')[0].trim();
      if (staticLead.length >= 12 && t.startsWith(staticLead)) return id;
    }
  }
  return null;
}

/**
 * Payload sanity checks — the "blank screen in front of 30 kids" class of
 * bug that static validation can't see because the data only exists at
 * runtime. Returns findings (possibly empty).
 */
export function checkPayload(eventName, data, config) {
  const findings = [];
  const add = (severity, message, text) => findings.push({
    severity,
    phaseId: matchPhaseId(config, text),
    message,
    source: 'simulation'
  });

  const hasUnresolved = (s) => typeof s === 'string' && /\{\{[^}]+\}\}/.test(s);
  const hasObjectGoo = (s) => typeof s === 'string' && s.includes('[object Object]');

  switch (eventName) {
    case 'game-started': {
      if (!data.prompt || !String(data.prompt).trim()) {
        add('error', 'A question step showed students an empty prompt.', data.prompt);
      } else if (hasUnresolved(data.prompt)) {
        add('warning', `A prompt still contains unresolved placeholders: "${String(data.prompt).slice(0, 80)}"`, data.prompt);
      }
      if (data.isChoice && (!Array.isArray(data.choices) || data.choices.length < 2)) {
        add('error', `A multiple-choice step offered ${(data.choices || []).length} choice(s) — students need at least 2.`, data.prompt);
      }
      break;
    }
    case 'rank-start': {
      if (!Array.isArray(data.candidates) || data.candidates.length === 0) {
        add('error', 'A ranking step started with NOTHING to rank — students saw an empty list with a Submit button.', data.prompt);
      }
      break;
    }
    case 'vote-start': {
      if (data.mode === 'head-to-head') {
        if (Array.isArray(data.matchups) && data.matchups.length === 0) {
          add('error', 'A head-to-head voting step started with no matchups to vote on.', null);
        }
      } else if (Array.isArray(data.candidates) && data.candidates.length === 0) {
        add('error', 'A voting step started with no options to vote on.', null);
      }
      if (data.totalVoters === 0) {
        add('error', 'A voting step started with NOBODY eligible to vote — check its "who can vote" setting.', null);
      }
      break;
    }
    case 'wager-start': {
      if (!Array.isArray(data.options) || data.options.length === 0) {
        add('error', 'A wager step offered nothing to bet on.', data.prompt);
      }
      break;
    }
    case 'announce': {
      if (!data.message || !String(data.message).trim()) {
        add('warning', 'An announcement step showed an empty message.', data.message);
      } else if (hasUnresolved(data.message)) {
        add('warning', `An announcement still contains unresolved placeholders: "${String(data.message).slice(0, 80)}"`, data.message);
      }
      break;
    }
    case 'show-results': {
      const content = data.content || data.aiResult || '';
      if (hasObjectGoo(content)) {
        add('error', 'A results screen rendered "[object Object]" — a template is showing a raw list. Add .list to the token.', content);
      } else if (hasUnresolved(content)) {
        add('warning', `A results screen still contains unresolved placeholders: "${String(content).slice(0, 80)}"`, content);
      } else if (!String(content).trim() && !data.image && !data.video) {
        add('warning', 'A results screen showed students nothing (empty content, no image or video).', content);
      }
      break;
    }
    case 'merge-start': {
      if (!Array.isArray(data.seeds) || data.seeds.length === 0) {
        add('warning', 'A merge step started with no answers to merge — students got an empty shared box.', data.instruction);
      }
      break;
    }
  }
  return findings;
}

/**
 * Run one robot playthrough of a loadable game.
 *
 * @param {Object} opts
 * @param {string} opts.serverUrl   e.g. http://localhost:3000
 * @param {string} opts.gameId     Loadable game id (usually a _sim-tmp- temp game)
 * @param {Object} [opts.config]   The config (for phase-id matching in findings)
 * @param {number} [opts.numPlayers=4]
 * @param {number} [opts.timeLimitMs=45000]
 * @param {number} [opts.stallMs=8000]
 */
export async function simulateGame({ serverUrl, gameId, config = null, numPlayers = 4, timeLimitMs = 45000, stallMs = 8000 }) {
  const start = Date.now();
  const findings = [];
  const phaseLog = [];
  let completed = false;
  let lastScreen = 'lobby';

  const host = await connect(serverUrl);
  const players = [];
  try {
    for (let i = 0; i < numPlayers; i++) players.push(await connect(serverUrl));

    // --- Room setup ---
    host.emit('create-room', { gameId });
    const roomData = await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('room creation timed out')), 5000);
      host.once('room-created', d => { clearTimeout(t); resolve(d); });
      host.once('create-room-error', d => { clearTimeout(t); reject(new Error(d.message || 'create-room failed')); });
    });
    const code = roomData.code;

    for (let i = 0; i < players.length; i++) {
      players[i].emit('join-room', { code, name: BOT_NAMES[i % BOT_NAMES.length] });
      await new Promise((resolve) => {
        const t = setTimeout(resolve, 2000);
        players[i].once('join-success', () => { clearTimeout(t); resolve(); });
      });
    }

    // --- Event queue: every event from every socket lands here ---
    const queue = [];
    const pushEvent = (who, role) => (ev, data) => queue.push({ who, role, ev, data: data || {} });
    host.onAny(pushEvent(host, 'host'));
    players.forEach(p => p.onAny(pushEvent(p, 'player')));

    let lastActivity = Date.now();
    const onceKeys = new Set();          // dedupe once-per-phase actions
    const once = (key, fn, delayMs) => {
      if (onceKeys.has(key)) return;
      onceKeys.add(key);
      setTimeout(fn, delayMs);
    };
    const seq = (data) => data.phaseInstanceId; // echo for stale-safety
    let oneVoiceTurn = 0;
    let stallUnstickTried = false;

    host.emit('start-game', { code });

    // --- Main loop ---
    while (!completed && Date.now() - start < timeLimitMs) {
      if (queue.length === 0) {
        if (Date.now() - lastActivity > stallMs) {
          if (!stallUnstickTried) {
            // One generic unstick attempt: force-advance past whatever is
            // waiting. If this works, the game CAN continue but only with
            // manual teacher intervention — worth telling the teacher.
            stallUnstickTried = true;
            findings.push({
              severity: 'warning',
              phaseId: null,
              source: 'simulation',
              message: `The game got stuck after ${lastScreen} — nothing happened for ${Math.round(stallMs / 1000)}s until the bots force-skipped it. In class you would have to manually skip this step.`
            });
            host.emit('advance-phase', { code });
            lastActivity = Date.now();
            continue;
          }
          findings.push({
            severity: 'error',
            phaseId: null,
            source: 'simulation',
            message: `The game STALLED after "${lastScreen}" — the bots waited ${Math.round(stallMs / 1000)}s and nothing happened. Students would be stuck on a frozen screen here.`
          });
          break;
        }
        await wait(80);
        continue;
      }

      const { who, role, ev, data } = queue.shift();
      lastActivity = Date.now();
      if (ev !== 'response-received' && ev !== 'submissions-update' && ev !== 'player-joined') {
        stallUnstickTried = false;
      }

      // Sanity-check what students/teacher would actually see
      findings.push(...checkPayload(ev, data, config));

      switch (ev) {
        case 'game-ended':
          completed = true;
          phaseLog.push({ type: 'end' });
          break;

        case 'phase-error':
          findings.push({
            severity: 'error',
            phaseId: data.phaseId || null,
            source: 'simulation',
            message: `The "${data.phaseId || 'unknown'}" step CRASHED while running: ${data.message || 'unknown error'}. The teacher would see the error-recovery screen here.`
          });
          // Skip past it so the rest of the game still gets checked
          once(`skip:${data.phaseId}:${seq(data)}`, () => host.emit('skip-phase', { code }), 200);
          break;

        // --- Collect / collect-choice ---
        case 'game-started': {
          if (role !== 'player') break;
          lastScreen = `the question "${String(data.prompt || '').slice(0, 50)}"`;
          if (onceKeys.has(`logged:collect:${seq(data)}`)) { /* already logged */ } else {
            onceKeys.add(`logged:collect:${seq(data)}`);
            phaseLog.push({ type: data.isChoice ? 'collect-choice' : 'collect', prompt: String(data.prompt || '').slice(0, 60) });
          }
          const idx = players.indexOf(who);
          if (data.isChoice && Array.isArray(data.choices) && data.choices.length) {
            const pick = data.choices[idx % data.choices.length];
            const text = typeof pick === 'string' ? pick : (pick.text || pick.name || String(pick));
            who.emit('submit-response', { code, response: text, phaseInstanceId: seq(data) });
          } else if (Array.isArray(data.fields) && data.fields.length) {
            const obj = {};
            for (const f of data.fields) obj[f.key || f] = BOT_ANSWERS[idx % BOT_ANSWERS.length];
            who.emit('submit-response', { code, response: obj, phaseInstanceId: seq(data) });
          } else {
            who.emit('submit-response', { code, response: BOT_ANSWERS[idx % BOT_ANSWERS.length], phaseInstanceId: seq(data) });
          }
          once(`close:collect:${seq(data)}`, () => host.emit('close-submissions', { code, phaseInstanceId: seq(data) }), 900);
          break;
        }

        // --- Vote ---
        case 'vote-start': {
          lastScreen = 'a voting step';
          if (!onceKeys.has(`logged:vote:${seq(data)}`)) {
            onceKeys.add(`logged:vote:${seq(data)}`);
            phaseLog.push({ type: 'vote', mode: data.mode });
          }
          if (role !== 'player') break;
          if (data.mode === 'head-to-head' && Array.isArray(data.matchups) && data.matchups.length) {
            // One pick per matchup; the server expects { votes: [{choice}] }
            const votes = data.matchups.map(m => {
              const winner = (players.indexOf(who) % 2 === 0) ? m.optionA : m.optionB;
              return { choice: (winner && (winner.playerId || winner.id)) || winner };
            });
            who.emit('submit-vote', { code, votes, phaseInstanceId: seq(data) });
          } else if (Array.isArray(data.candidates) && data.candidates.length) {
            const pick = data.candidates[players.indexOf(who) % data.candidates.length];
            who.emit('submit-vote', { code, choice: (pick && (pick.playerId || pick.id)) || pick, phaseInstanceId: seq(data) });
          }
          once(`close:vote:${seq(data)}`, () => host.emit('close-voting', { code, phaseInstanceId: seq(data) }), 1000);
          break;
        }

        // --- Rank ---
        case 'rank-start': {
          if (role !== 'player') break;
          lastScreen = 'a ranking step';
          if (!onceKeys.has(`logged:rank:${seq(data)}`)) {
            onceKeys.add(`logged:rank:${seq(data)}`);
            phaseLog.push({ type: 'rank' });
          }
          const ranking = Array.isArray(data.candidates) ? [...data.candidates] : [];
          if (players.indexOf(who) % 2 === 1) ranking.reverse();
          who.emit('rank-submit', { code, ranking, phaseInstanceId: seq(data) });
          once(`close:rank:${seq(data)}`, () => host.emit('close-ranking', { code, phaseInstanceId: seq(data) }), 900);
          break;
        }

        // --- Rate ---
        case 'rate-start': {
          if (role !== 'player') break;
          lastScreen = 'a rating step';
          if (!onceKeys.has(`logged:rate:${seq(data)}`)) {
            onceKeys.add(`logged:rate:${seq(data)}`);
            phaseLog.push({ type: 'rate' });
          }
          const ratings = {};
          for (const s of (data.scales || [])) {
            ratings[s.id] = Math.round(((s.min ?? 1) + (s.max ?? 5)) / 2);
          }
          who.emit('rate-submit', { code, ratings, phaseInstanceId: seq(data) });
          once(`close:rate:${seq(data)}`, () => host.emit('close-rating', { code, phaseInstanceId: seq(data) }), 900);
          break;
        }

        // --- Wager ---
        case 'wager-start': {
          if (role !== 'player') break;
          lastScreen = 'a wager step';
          if (!onceKeys.has(`logged:wager:${seq(data)}`)) {
            onceKeys.add(`logged:wager:${seq(data)}`);
            phaseLog.push({ type: 'wager' });
          }
          const opts = data.options || [];
          if (opts.length) {
            const pick = opts[players.indexOf(who) % opts.length];
            const amount = Math.max(1, Math.floor((data.availablePoints || 10) * 0.3));
            who.emit('wager-submit', { code, option: String(pick), amount, phaseInstanceId: seq(data) });
          }
          once(`close:wager:${seq(data)}`, () => host.emit('close-wager', { code, phaseInstanceId: seq(data) }), 1000);
          break;
        }
        case 'wager-need-resolve': {
          const opt = (data.options || [])[0];
          if (opt) host.emit('wager-resolve', { code, winningOption: String(opt), phaseInstanceId: seq(data) });
          break;
        }

        // --- Relay ---
        case 'relay-turn': {
          if (role !== 'player') break;
          lastScreen = 'a relay step';
          if (!onceKeys.has(`logged:relay:${seq(data)}`)) {
            onceKeys.add(`logged:relay:${seq(data)}`);
            phaseLog.push({ type: 'relay' });
          }
          who.emit('relay-submit', { code, text: 'And then something wonderful happened.', phaseInstanceId: seq(data) });
          break;
        }

        // --- Turn (charades) — only the describer may capture items ---
        case 'turn-item': {
          if (role !== 'player' || data.role !== 'describer' || !data.item) break;
          lastScreen = 'a charades turn';
          const captured = `turn:${data.item}:${seq(data)}`;
          if (!onceKeys.has(captured)) {
            onceKeys.add(captured);
            setTimeout(() => who.emit('turn-got-it', { code, phaseInstanceId: seq(data) }), 250);
          }
          break;
        }

        // --- Merge ---
        case 'merge-start': {
          if (role !== 'player') break;
          lastScreen = 'a merge step';
          if (!onceKeys.has(`logged:merge:${seq(data)}`)) {
            onceKeys.add(`logged:merge:${seq(data)}`);
            phaseLog.push({ type: 'merge' });
          }
          const idx = players.indexOf(who);
          // First group-mate writes the shared draft; everyone agrees after.
          setTimeout(() => {
            who.emit('merge-draft', { code, text: 'Our combined answer: ' + BOT_ANSWERS[idx % BOT_ANSWERS.length], phaseInstanceId: seq(data) });
          }, 100 + idx * 120);
          setTimeout(() => {
            who.emit('merge-agree', { code, phaseInstanceId: seq(data) });
          }, 900 + idx * 60);
          // Backstop: force-close in case agreeMode is "timer" or a group stalls
          once(`close:merge:${seq(data)}`, () => host.emit('close-merge', { code, phaseInstanceId: seq(data) }), 2200);
          break;
        }

        // --- One Voice — alternate bots, gaps safely outside the window ---
        case 'one-voice-start': {
          if (role !== 'host') break;
          lastScreen = 'a One Voice counting step';
          phaseLog.push({ type: 'one-voice', target: data.target });
          const gap = (data.collisionWindowMs || 400) + 120;
          const maxTaps = Math.min((data.target || 20) + 5, 40);
          once(`ov:${seq(data)}`, async () => {
            for (let i = 0; i < maxTaps && !completed; i++) {
              players[oneVoiceTurn++ % players.length].emit('one-voice-tap', { code, phaseInstanceId: seq(data) });
              await wait(gap);
            }
            // If the target was too high to reach quickly, move on with stats
            host.emit('close-one-voice', { code, phaseInstanceId: seq(data) });
          }, 100);
          break;
        }

        // --- Preview (teacher approval) ---
        case 'preview-content': {
          if (role !== 'host') break;
          lastScreen = 'a teacher preview';
          phaseLog.push({ type: 'preview' });
          once(`preview:${seq(data)}`, () => host.emit('preview-approve', { code, phaseInstanceId: seq(data) }), 400);
          break;
        }

        // --- Reveal-one (host steps through items) ---
        case 'reveal-one-start':
        case 'reveal-one-item': {
          if (role !== 'host') break;
          lastScreen = 'a reveal-one step';
          once(`ro:${ev}:${seq(data)}:${data.index || 0}`, () => host.emit('reveal-next', { code, phaseInstanceId: seq(data) }), 350);
          break;
        }
        case 'reveal-one-complete': {
          once(`roc:${seq(data)}`, () => host.emit('advance-phase', { code, phaseInstanceId: seq(data) }), 350);
          break;
        }

        // --- Display screens: log + schedule a host advance.
        //     If the phase auto-advances first, our advance carries the old
        //     phaseInstanceId and the server drops it as stale. ---
        case 'announce':
          if (role === 'host') {
            lastScreen = `the announcement "${String(data.message || '').slice(0, 50)}"`;
            if (!onceKeys.has(`logged:announce:${seq(data)}`)) {
              onceKeys.add(`logged:announce:${seq(data)}`);
              phaseLog.push({ type: 'announce', message: String(data.message || '').slice(0, 60) });
            }
            once(`adv:announce:${seq(data)}`, () => host.emit('advance-phase', { code, phaseInstanceId: seq(data) }), 500);
          }
          break;
        case 'show-results':
          if (role === 'host') {
            lastScreen = 'a results screen';
            if (!onceKeys.has(`logged:reveal:${seq(data)}`)) {
              onceKeys.add(`logged:reveal:${seq(data)}`);
              phaseLog.push({ type: 'reveal' });
            }
            once(`adv:reveal:${seq(data)}`, () => host.emit('advance-phase', { code, phaseInstanceId: seq(data) }), 500);
          }
          break;
        case 'leaderboard':
        case 'team-split':
        case 'elimination-results':
        case 'winner-announced':
        case 'rate-results':
        case 'one-voice-success':
        case 'turn-complete':
          if (role === 'host') {
            lastScreen = `a ${ev} screen`;
            if (!onceKeys.has(`logged:${ev}:${seq(data)}`)) {
              onceKeys.add(`logged:${ev}:${seq(data)}`);
              phaseLog.push({ type: ev });
            }
            once(`adv:${ev}:${seq(data)}`, () => host.emit('advance-phase', { code, phaseInstanceId: seq(data) }), 600);
          }
          break;

        case 'processing-started':
          if (role === 'host') lastScreen = 'an AI processing step';
          break;

        default:
          break; // counters, personal confirmations, etc. — no action needed
      }
    }

    if (!completed && Date.now() - start >= timeLimitMs) {
      findings.push({
        severity: 'warning',
        phaseId: null,
        source: 'simulation',
        message: `The playtest hit its ${Math.round(timeLimitMs / 1000)}s limit before reaching the end (last seen: ${lastScreen}). The game may just be long — or something near the end never finishes.`
      });
    }
  } finally {
    try { host.disconnect(); } catch {}
    for (const p of players) { try { p.disconnect(); } catch {} }
  }

  return {
    completed,
    durationMs: Date.now() - start,
    phaseLog,
    findings: dedupeFindings(findings)
  };
}

/** The same empty-payload bug often fires once per bot — collapse repeats. */
export function dedupeFindings(findings) {
  const seen = new Set();
  return findings.filter(f => {
    const key = `${f.severity}|${f.phaseId}|${f.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
