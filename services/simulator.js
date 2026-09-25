/**
 * Robot playtest — a headless multi-client simulation the server runs
 * against ITSELF during a deep review ("Test with Robots").
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
        add('error', `A multiple-choice step offered ${(data.choices || []).length} choice(s), students need at least 2.`, data.prompt);
      }
      break;
    }
    case 'rank-start': {
      // Player payloads carry the candidates list; the HOST's rank-start
      // only has a counter — its missing array is not a finding.
      if (Array.isArray(data.candidates) && data.candidates.length === 0) {
        add('error', 'A ranking step started with NOTHING to rank, students saw an empty list with a Submit button.', data.prompt);
      }
      break;
    }
    case 'match-start': {
      // Player payloads carry both columns; the HOST's match-start only
      // has a counter — its missing arrays are not a finding.
      if (Array.isArray(data.rightItems) && data.rightItems.length < 2) {
        add('error', 'A matching step started with fewer than 2 pairs, students saw an unplayable board.', data.prompt);
      }
      break;
    }
    case 'sort-start': {
      // Player payloads carry items + buckets; the HOST's sort-start only
      // has a counter — its missing arrays are not a finding.
      if (Array.isArray(data.items) && data.items.length < 2) {
        add('error', 'A sorting step started with fewer than 2 items, students saw an unplayable board.', data.prompt);
      }
      if (Array.isArray(data.buckets) && data.buckets.length < 2) {
        add('error', 'A sorting step started with fewer than 2 buckets to sort into.', data.prompt);
      }
      break;
    }
    case 'checklist-start': {
      // Player payloads carry the items; the HOST's checklist-start only
      // has progress — its missing array is not a finding.
      if (Array.isArray(data.items) && data.items.length === 0) {
        add('error', 'A checklist step started with no items, students saw an empty list.', data.prompt);
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
        add('error', 'A voting step started with NOBODY eligible to vote, check its "who can vote" setting.', null);
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
        add('error', 'A results screen rendered "[object Object]", a template is showing a raw list. Add .list to the token.', content);
      } else if (hasUnresolved(content)) {
        add('warning', `A results screen still contains unresolved placeholders: "${String(content).slice(0, 80)}"`, content);
      } else if (!String(content).trim() && !data.image && !data.video) {
        add('warning', 'A results screen showed students nothing (empty content, no image or video).', content);
      }
      break;
    }
    case 'merge-start': {
      if (!Array.isArray(data.seeds) || data.seeds.length === 0) {
        add('warning', 'A merge step started with no answers to merge, students got an empty shared box.', data.instruction);
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
 * @param {boolean} [opts.chaos=false]  School-wifi mode: players randomly drop
 *   and reconnect mid-phase (token rebind), ghosts join with dead tokens,
 *   stale/malformed/duplicate events are sprayed at the server — while the
 *   game must STILL complete. Used by scripts/simulate-chaos.js; the deep
 *   review keeps this off.
 * @param {number} [opts.chaosIntervalMs=600]  Time between chaos actions.
 *   600ms ≈ a disconnect every ~1.3s — brutal torture for short games.
 *   Long real-time games (charades) use a gentler-but-still-hostile rate.
 */
export async function simulateGame({ serverUrl, gameId, config = null, numPlayers = 4, timeLimitMs = 45000, stallMs = 8000, chaos = false, chaosIntervalMs = 600 }) {
  const start = Date.now();
  const findings = [];
  const phaseLog = [];
  let completed = false;
  let lastScreen = 'lobby';
  const chaosStats = { reconnects: 0, reconnectFailures: 0, ghosts: 0, staleSpam: 0, malformed: 0 };
  const extraSockets = []; // chaos ghosts/late joiners, cleaned up at the end
  let chaosTimer = null;

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
      // Names must be unique across the roster: the server refuses a name
      // that's already connected (double-join guard, 2026-08-24), so big
      // bot fleets can't reuse the pool bare.
      const botName = BOT_NAMES[i % BOT_NAMES.length] +
        (i >= BOT_NAMES.length ? '-' + (Math.floor(i / BOT_NAMES.length) + 1) : '');
      players[i]._name = botName;
      players[i].emit('join-room', { code, name: botName });
      await new Promise((resolve) => {
        const t = setTimeout(resolve, 2000);
        players[i].once('join-success', (d) => {
          players[i]._token = d && d.token; // chaos reconnects rebind via this
          clearTimeout(t);
          resolve();
        });
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

    // --- Chaos agent: school-wifi hostility while the reactor plays ---
    if (chaos) {
      const chaosTick = () => {
        const roll = Math.random();

        if (roll < 0.45 && players.length > 1) {
          // Drop a random player mid-whatever; reconnect with their token
          // after a wifi-blip delay. The replacement socket takes over the
          // same reactor slot, so the game keeps being driven.
          const i = Math.floor(Math.random() * players.length);
          const victim = players[i];
          if (victim._reconnecting || !victim._token) return;
          victim._reconnecting = true;
          const { _name: name, _token: token } = victim;
          victim.disconnect();
          setTimeout(async () => {
            try {
              const fresh = await connect(serverUrl);
              fresh._name = name;
              fresh._token = token;
              fresh.onAny(pushEvent(fresh, 'player'));
              fresh.emit('join-room', { code, name, token });
              const ok = await new Promise((res) => {
                const t = setTimeout(() => res(false), 4000);
                fresh.once('join-success', (d) => {
                  clearTimeout(t);
                  res(!!(d && d.reconnected));
                });
              });
              if (ok) {
                chaosStats.reconnects++;
              } else {
                chaosStats.reconnectFailures++;
                findings.push({
                  severity: 'error',
                  phaseId: null,
                  source: 'simulation',
                  message: `A player who dropped mid-game was NOT recognized on reconnect (during ${lastScreen}), in class they'd lose their identity/score.`
                });
              }
              players[i] = fresh;
            } catch (e) {
              chaosStats.reconnectFailures++;
            }
          }, 300 + Math.random() * 2500);

        } else if (roll < 0.60) {
          // Spray stale-phase events — the stale guard must drop them all
          const p = players[Math.floor(Math.random() * players.length)];
          if (!p.connected) return;
          chaosStats.staleSpam++;
          p.emit('submit-response', { code, response: 'stale ghost answer', phaseInstanceId: 1 });
          p.emit('submit-vote', { code, choice: 'stale', phaseInstanceId: 1 });
          p.emit('buzz-tap', { code, phaseInstanceId: 1 });

        } else if (roll < 0.75) {
          // Malformed payloads — schema validation must reject, not crash
          const p = players[Math.floor(Math.random() * players.length)];
          if (!p.connected) return;
          chaosStats.malformed++;
          p.emit('submit-response', { code: 12345 });
          p.emit('estimate-submit', { code, value: 'not-a-number' });
          p.emit('rank-submit', { code });
          p.emit('match-submit', { code });
          p.emit('sort-submit', { code });
          p.emit('submit-response', { code, response: { strokes: 'not-an-array' } });
          p.emit('merge-draft', {});

        } else if (roll < 0.85) {
          // Ghost with a dead token / late joiner mid-game — must not crash
          // anything; they either join fresh or get a clean error.
          chaosStats.ghosts++;
          (async () => {
            try {
              const ghost = await connect(serverUrl);
              extraSockets.push(ghost);
              ghost.emit('join-room', { code, name: 'Ghost' + Math.floor(Math.random() * 100), token: 'dead-token-' + Math.random().toString(36).slice(2) });
            } catch (e) { /* server down would surface elsewhere */ }
          })();

        } else {
          // Duplicate rapid-fire from a connected player
          const p = players[Math.floor(Math.random() * players.length)];
          if (!p.connected) return;
          p.emit('one-voice-tap', { code });
          p.emit('one-voice-tap', { code });
          p.emit('submit-response', { code, response: 'double-send' });
        }
      };
      chaosTimer = setInterval(chaosTick, chaosIntervalMs);
    }

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
              message: `The game got stuck after ${lastScreen}, nothing happened for ${Math.round(stallMs / 1000)}s until the bots force-skipped it. In class you would have to manually skip this step.`
            });
            host.emit('advance-phase', { code });
            lastActivity = Date.now();
            continue;
          }
          findings.push({
            severity: 'error',
            phaseId: null,
            source: 'simulation',
            message: `The game STALLED after "${lastScreen}", the bots waited ${Math.round(stallMs / 1000)}s and nothing happened. Students would be stuck on a frozen screen here.`
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
          if (data.inputType === 'drawing') {
            // Synthetic scribble: a couple of wandering polylines
            const strokes = Array.from({ length: 2 + (idx % 3) }, (_, s) => ({
              points: Array.from({ length: 10 }, (_, i) => [
                Math.round((0.1 + ((idx + s + i * 3) % 8) / 10) * 1000) / 1000,
                Math.round((0.1 + ((s + i * 5) % 8) / 10) * 1000) / 1000
              ]),
              color: '#1e88e5',
              width: 4
            }));
            who.emit('submit-response', { code, response: { strokes }, phaseInstanceId: seq(data) });
          } else if (data.isChoice && Array.isArray(data.choices) && data.choices.length) {
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

        // --- Solo quiz (self-paced) ---
        case 'solo-quiz-question': {
          if (role !== 'player') break;
          lastScreen = 'a self-paced quiz';
          if (!onceKeys.has(`logged:solo:${seq(data)}`)) {
            onceKeys.add(`logged:solo:${seq(data)}`);
            phaseLog.push({ type: 'solo-quiz', questions: data.total });
          }
          if (!data.done && Array.isArray(data.choices) && data.choices.length) {
            const pick = data.choices[(players.indexOf(who) + data.index) % data.choices.length];
            who.emit('solo-quiz-answer', { code, index: data.index, choice: pick, phaseInstanceId: seq(data) });
          }
          once(`close:solo:${seq(data)}`, () => host.emit('close-solo-quiz', { code, phaseInstanceId: seq(data) }), 1800);
          break;
        }
        case 'solo-quiz-feedback': {
          if (role !== 'player' || data.done) break;
          if (Array.isArray(data.choices) && data.choices.length) {
            const pick = data.choices[(players.indexOf(who) + data.index) % data.choices.length];
            who.emit('solo-quiz-answer', { code, index: data.index, choice: pick, phaseInstanceId: seq(data) });
          }
          break;
        }
        case 'solo-quiz-results': {
          if (role !== 'host') break;
          once(`solor:${seq(data)}`, () => host.emit('advance-phase', { code, phaseInstanceId: seq(data) }), 400);
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
          } else if (data.mode === 'approve' && Array.isArray(data.candidates) && data.candidates.length) {
            // Yes or no on every entry: a bot says yes to every other entry
            // and no to the one at its own seat, so something passes and
            // something can fail.
            const seat = players.indexOf(who);
            const votes = data.candidates.map((c, i) => ({
              choice: (c && (c.playerId || c.id)) || c,
              approve: i !== seat % data.candidates.length
            }));
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

        // --- Match (pair two lists) ---
        case 'match-start': {
          if (role !== 'player') break;
          lastScreen = 'a matching step';
          if (!onceKeys.has(`logged:match:${seq(data)}`)) {
            onceKeys.add(`logged:match:${seq(data)}`);
            phaseLog.push({ type: 'match' });
          }
          // Half the bots submit the board as dealt, half reverse it —
          // guarantees a mix of right and wrong pairs in the results.
          const matching = Array.isArray(data.rightItems) ? [...data.rightItems] : [];
          if (players.indexOf(who) % 2 === 1) matching.reverse();
          who.emit('match-submit', { code, matching, phaseInstanceId: seq(data) });
          once(`close:match:${seq(data)}`, () => host.emit('close-matching', { code, phaseInstanceId: seq(data) }), 900);
          break;
        }
        case 'match-results': {
          if (role !== 'host') break;
          once(`matchr:${seq(data)}`, () => host.emit('advance-phase', { code, phaseInstanceId: seq(data) }), 400);
          break;
        }

        // --- Sort (place items into named buckets) ---
        case 'sort-start': {
          if (role !== 'player') break;
          lastScreen = 'a sorting step';
          if (!onceKeys.has(`logged:sort:${seq(data)}`)) {
            onceKeys.add(`logged:sort:${seq(data)}`);
            phaseLog.push({ type: 'sort' });
          }
          // Bots cycle buckets by item+player index — guarantees a spread
          // of right and wrong placements in the results.
          const buckets = data.buckets || [];
          const sorting = (data.items || []).map((_, i) =>
            buckets[(i + players.indexOf(who)) % Math.max(1, buckets.length)] || '');
          who.emit('sort-submit', { code, sorting, phaseInstanceId: seq(data) });
          once(`close:sort:${seq(data)}`, () => host.emit('close-sorting', { code, phaseInstanceId: seq(data) }), 900);
          break;
        }
        case 'sort-results': {
          if (role !== 'host') break;
          once(`sortr:${seq(data)}`, () => host.emit('advance-phase', { code, phaseInstanceId: seq(data) }), 400);
          break;
        }

        // --- Checklist (shared group to-do list) ---
        case 'checklist-start': {
          if (role !== 'player') break;
          lastScreen = 'a checklist step';
          if (!onceKeys.has(`logged:checklist:${seq(data)}`)) {
            onceKeys.add(`logged:checklist:${seq(data)}`);
            phaseLog.push({ type: 'checklist' });
          }
          // Each bot checks a couple of items (staggered) — groups end up
          // partly done, exercising both live updates and the final summary.
          const clItemCount = Array.isArray(data.items) ? data.items.length : 0;
          const clIdx = players.indexOf(who);
          for (let ci = 0; ci < clItemCount; ci++) {
            if ((ci + clIdx) % 2 === 0) {
              setTimeout(() => who.emit('check-item', {
                code, index: ci, checked: true, phaseInstanceId: seq(data)
              }), 200 + ci * 120);
            }
          }
          once(`close:checklist:${seq(data)}`, () => host.emit('close-checklist', { code, phaseInstanceId: seq(data) }), 1500);
          break;
        }
        case 'checklist-results': {
          if (role !== 'host') break;
          once(`checklistr:${seq(data)}`, () => host.emit('advance-phase', { code, phaseInstanceId: seq(data) }), 400);
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

        // --- Turn (charades) — only the describer may capture items.
        //     No once-guard: duplicate phrases exist in real pools (and bot
        //     pools), and reconnects re-emit the current item. The server
        //     referees — a stray got-it after capture is simply ignored. ---
        case 'turn-item': {
          if (role !== 'player' || data.role !== 'describer' || !data.item) break;
          lastScreen = 'a charades turn';
          setTimeout(() => who.emit('turn-got-it', { code, phaseInstanceId: seq(data) }), 300);
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

        // --- Buzz — bots buzz, host judges one correct, finishes round ---
        case 'buzz-start': {
          if (role !== 'host') break;
          lastScreen = 'a buzzer round';
          phaseLog.push({ type: 'buzz' });
          once(`buzz:${seq(data)}`, async () => {
            players[0].emit('buzz-tap', { code, phaseInstanceId: seq(data) });
            await wait(200);
            host.emit('buzz-judge', { code, correct: false, phaseInstanceId: seq(data) });
            await wait(200);
            players[1 % players.length].emit('buzz-tap', { code, phaseInstanceId: seq(data) });
            await wait(200);
            host.emit('buzz-judge', { code, correct: true, phaseInstanceId: seq(data) });
            await wait(200);
            host.emit('buzz-finish', { code, phaseInstanceId: seq(data) });
          }, 150);
          break;
        }

        // --- Estimate — bots guess numbers, host reveals, then advances ---
        case 'estimate-start': {
          if (role !== 'host') break;
          lastScreen = 'a guess-the-number step';
          phaseLog.push({ type: 'estimate' });
          once(`est:${seq(data)}`, async () => {
            for (let i = 0; i < players.length; i++) {
              players[i].emit('estimate-submit', { code, value: 10 + i * 17, phaseInstanceId: seq(data) });
            }
            await wait(300);
            host.emit('close-estimates', { code, phaseInstanceId: seq(data) });
          }, 150);
          break;
        }
        case 'estimate-results': {
          if (role !== 'host') break;
          once(`estr:${seq(data)}`, () => host.emit('advance-phase', { code, phaseInstanceId: seq(data) }), 400);
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
        // --- Team-split interactive modes ---
        case 'team-choice-start': {
          // Bots spread across teams by index; a full team just means the
          // server ignores the pick and the confirm auto-fills them.
          if (role === 'player') {
            const rosters = data.rosters || [];
            if (rosters.length > 0) {
              const pick = rosters[players.indexOf(who) % rosters.length];
              who.emit('team-pick', { code, team: pick.name, phaseInstanceId: seq(data) });
            }
          } else {
            lastScreen = 'a pick-your-team screen';
            if (!onceKeys.has(`logged:team-split:${seq(data)}`)) {
              onceKeys.add(`logged:team-split:${seq(data)}`);
              phaseLog.push({ type: 'team-split' });
            }
            // Confirm sweeps up stragglers if the all-placed auto-close didn't fire
            once(`confirm:choice:${seq(data)}`, () => host.emit('team-split-confirm', { code, phaseInstanceId: seq(data) }), 1200);
          }
          break;
        }
        case 'team-roles-start': {
          // Bots spread across roles by index; a full role just means the
          // server re-sends truth and the confirm auto-fills them.
          if (role === 'player') {
            const menu = Array.isArray(data.roles) ? data.roles : [];
            if (menu.length > 0 && menu[0] && menu[0].name) {
              const pick = menu[players.indexOf(who) % menu.length];
              who.emit('role-pick', { code, role: pick.name, phaseInstanceId: seq(data) });
            }
          } else {
            lastScreen = 'a pick-your-role screen';
            if (!onceKeys.has(`logged:team-roles:${seq(data)}`)) {
              onceKeys.add(`logged:team-roles:${seq(data)}`);
              phaseLog.push({ type: 'team-roles' });
            }
            // Confirm sweeps up stragglers if the all-picked auto-close didn't fire
            once(`confirm:roles:${seq(data)}`, () => host.emit('team-split-confirm', { code, phaseInstanceId: seq(data) }), 1200);
          }
          break;
        }
        case 'team-roles-update': {
          // A bot whose pick was rejected (role full) grabs the first open one.
          if (role === 'player' && data.full && !data.yourRole) {
            const open = (data.roles || []).find(r => r && r.open > 0);
            if (open) who.emit('role-pick', { code, role: open.name, phaseInstanceId: seq(data) });
          }
          break;
        }
        case 'team-roles-final': {
          if (role === 'host') {
            once(`adv:team-roles:${seq(data)}`, () => host.emit('advance-phase', { code, phaseInstanceId: seq(data) }), 600);
          }
          break;
        }
        case 'assign-final': {
          // Hand out choices: a host-paced payoff, every row must carry a choice
          if (role === 'host') {
            lastScreen = 'the hand-out of choices';
            const board = Array.isArray(data.board) ? data.board : [];
            if (board.length === 0 || board.some(b => !b || typeof b.choice !== 'string' || !b.choice)) {
              add('error', 'The hand-out step showed a group with no choice.', JSON.stringify(board).slice(0, 200));
            }
            if (!onceKeys.has(`logged:assign:${seq(data)}`)) {
              onceKeys.add(`logged:assign:${seq(data)}`);
              phaseLog.push({ type: 'assign' });
            }
            once(`adv:assign:${seq(data)}`, () => host.emit('advance-phase', { code, phaseInstanceId: seq(data) }), 600);
          }
          break;
        }
        case 'team-split-setup': {
          // Teacher-assign mode: the robot teacher just confirms — the
          // auto-fill places everyone, which is the path we need to prove.
          if (role !== 'host') break;
          lastScreen = 'a make-the-teams screen';
          if (!onceKeys.has(`logged:team-split:${seq(data)}`)) {
            onceKeys.add(`logged:team-split:${seq(data)}`);
            phaseLog.push({ type: 'team-split' });
          }
          once(`confirm:setup:${seq(data)}`, () => host.emit('team-split-confirm', { code, phaseInstanceId: seq(data) }), 700);
          break;
        }

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

              // Decorative-scoring net (runtime half): bots answered every
              // question, so a scoreboard where NOBODY earned a point means
              // the game's scoring can't award — a leaderboard/winner would
              // crown someone off an all-zero board (the two-truths bug
              // class; the static validator catches zero pointMaps, this
              // catches everything else that nets out to zero).
              if (ev === 'leaderboard') {
                const board = data.allStandings || data.standings || [];
                if (board.length > 0 && board.every(s => !s || !s.score)) {
                  findings.push({
                    severity: 'error',
                    phaseId: null,
                    source: 'simulation',
                    message: 'The leaderboard showed with EVERY score at 0 even though the practice players answered everything, the scoring never awards points, so the standings (and any winner) are meaningless. Check the scoring setup on the step the leaderboard reads from.'
                  });
                }
              }
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
        message: `The playtest hit its ${Math.round(timeLimitMs / 1000)}s limit before reaching the end (last seen: ${lastScreen}). The game may just be long, or something near the end never finishes.`
      });
    }
  } finally {
    if (chaosTimer) clearInterval(chaosTimer);
    try { host.disconnect(); } catch {}
    for (const p of players) { try { p.disconnect(); } catch {} }
    for (const s of extraSockets) { try { s.disconnect(); } catch {} }
  }

  return {
    completed,
    durationMs: Date.now() - start,
    phaseLog,
    findings: dedupeFindings(findings),
    chaosStats: chaos ? chaosStats : null
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
