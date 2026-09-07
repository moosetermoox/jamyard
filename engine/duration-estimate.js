/**
 * duration-estimate.js — how long an activity really takes, computed from
 * its configuration rather than claimed by the AI.
 *
 * Born from a reviewer's finding (2026-09-06): a teacher asked for a
 * five-minute activity, the matcher picked Snowball and said it fit, and the
 * config carried 90s of thinking plus 240s of merging before a single
 * instruction, seat move, or discussion. The AI must never be the source of
 * a timing claim. This module is:
 *
 *   - parseRequestedMinutes(text)   the time budget a teacher named in their
 *                                   idea ("five-minute", "10 min", "5-10
 *                                   minutes" reads as 10), or null
 *   - estimateDuration(config)      timers on the primary path plus the
 *                                   allowances below (join, transitions,
 *                                   reading, the AI wait, a seat move)
 *   - fitToBudget(config, minutes)  a COPY with timers scaled down to the
 *                                   budget, each held at its floor; `fits`
 *                                   is false when even the floors run over
 *                                   (the trim is still returned: it is the
 *                                   best specific adjustment there is)
 *   - timingReport(config, minutes) the sentence the teacher reads, with
 *                                   the trim attached when one helps
 *
 * Pure: no AI, no I/O. The allowances are deliberately generous round
 * numbers; a classroom never runs on the timers alone.
 */

// Seconds. Each is a single, nameable classroom moment.
export const ALLOWANCES = Object.freeze({
  lobbyJoin: 60,        // codes typed, names typed, the last Chromebook waking up
  transition: 10,       // every step change: screens switch, the teacher glances up
  hostPacedRead: 30,    // an untimed screen the class reads and talks about
  timedOverrun: 15,     // after a timer ends: the last submits, the close, the click
  untimedInput: 90,     // an input step with no timer: the teacher closes it by hand
  aiProcess: 25,        // the guide's "around 20 seconds" with a little slack
  seatMove: 30,         // merge: go sit next to your partner
  revealOneItem: 20,    // one-by-one reveals: per item, a few items assumed
  revealOneItems: 4,    // how many one-by-one items to assume when unknown
  soloQuizQuestion: 30, // self-paced quiz, per question
  defaultPlayers: 24    // a class, for rounds that run once per student
});

// The shortest a timer may be trimmed to, by phase type. Below these a step
// stops being the step (a 10-second merge is not a conversation).
export const TIMER_FLOORS = Object.freeze({
  collect: 30,
  'collect-choice': 15,
  vote: 15,
  merge: 90,
  rate: 15,
  rank: 30,
  estimate: 15,
  match: 30,
  sort: 30,
  relay: 30,
  wager: 15,
  announce: 10,
  reveal: 10,
  'reveal-one': 10,
  leaderboard: 10,
  checklist: 60,
  default: 15
});

// Steps whose whole point is something the class does on their devices.
const INPUT_TYPES = new Set([
  'collect', 'collect-choice', 'vote', 'rate', 'rank', 'estimate', 'match',
  'sort', 'wager', 'relay', 'buzz', 'one-voice', 'checklist', 'turn',
  'team-roles', 'eliminate', 'ai-eliminate'
]);

const NUMBER_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, ninety: 90
};

const NUM = '(\\d+|' + Object.keys(NUMBER_WORDS).join('|') + ')';
const MIN = '(?:min|mins|minute|minutes)\\b';
// "5 minute", "five-minute", "5-10 minutes", "five to ten minutes"
const MINUTES_RE = new RegExp(NUM + '\\s*(?:(?:-|–|to)\\s*' + NUM + ')?\\s*-?\\s*' + MIN, 'i');

function toNumber(token) {
  if (!token) return null;
  const t = token.toLowerCase();
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  return NUMBER_WORDS[t] ?? null;
}

/**
 * The time budget a teacher named in their idea, in whole minutes, or null.
 * A range reads as its top ("5-10 minutes" is a ten-minute slot). Hours are
 * understood; seconds are not a budget and are ignored.
 * @param {string} text
 * @returns {number|null}
 */
export function parseRequestedMinutes(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const lower = text.toLowerCase();
  const m = lower.match(MINUTES_RE);
  if (m) {
    const a = toNumber(m[1]);
    const b = toNumber(m[2]);
    const top = Math.max(a ?? 0, b ?? 0);
    if (top > 0) return top;
  }
  if (/\bhalf\s+an?\s+hour\b/.test(lower)) return 30;
  const h = lower.match(new RegExp('\\b(an|' + NUM.slice(1, -1) + ')\\s*-?\\s*hours?\\b', 'i'));
  if (h) {
    const n = h[1] === 'an' ? 1 : toNumber(h[1]);
    if (n) return n * 60;
  }
  return null;
}

// The primary path: next, then a preview's approve door, then a branching
// vote's first branch. Same walk as engine/activity-map.js.
function primaryNext(phase) {
  if (typeof phase.next === 'string') return phase.next;
  if (typeof phase.approveNext === 'string') return phase.approveNext;
  if (phase.nextByWinner && typeof phase.nextByWinner === 'object') {
    for (const target of Object.values(phase.nextByWinner)) {
      if (typeof target === 'string') return target;
    }
  }
  return null;
}

function timerOf(phase) {
  const t = phase.timer;
  return typeof t === 'number' && t > 0 ? t : null;
}

// Seconds for one step (no foreach), and whether a timer drove it.
function stepSeconds(phase, opts) {
  const A = ALLOWANCES;
  const type = phase.type;
  if (type === 'lobby') return { seconds: A.lobbyJoin, timed: false };
  if (type === 'end') return { seconds: 0, timed: false };
  if (type === 'ai-process') return { seconds: A.aiProcess + A.transition, timed: false };
  if (type === 'solo-quiz') {
    const n = Array.isArray(phase.questions) ? phase.questions.length : 5;
    return { seconds: n * A.soloQuizQuestion + A.timedOverrun + A.transition, timed: false };
  }
  const timer = timerOf(phase);
  if (type === 'merge') {
    const body = timer !== null ? timer : A.untimedInput;
    return { seconds: body + A.seatMove + A.timedOverrun + A.transition, timed: timer !== null };
  }
  if (type === 'reveal-one') {
    const items = typeof phase.limit === 'number' ? phase.limit : A.revealOneItems;
    return { seconds: items * A.revealOneItem + A.transition, timed: false };
  }
  if (timer !== null) {
    return { seconds: timer + A.timedOverrun + A.transition, timed: true };
  }
  if (INPUT_TYPES.has(type)) return { seconds: A.untimedInput + A.transition, timed: false };
  // announce, reveal, leaderboard, winner, preview, team-split, ...: the class reads it.
  return { seconds: A.hostPacedRead + A.transition, timed: false };
}

/**
 * Walk the primary path and total it up.
 * @param {object} config
 * @param {{players?: number}} [opts]  class size, for rounds that run once per student
 * @returns {{seconds: number, minutes: number, timerSeconds: number,
 *            steps: Array<{id: string, type: string, seconds: number, timed: boolean, rounds?: number}>}}
 */
export function estimateDuration(config, opts = {}) {
  const phases = (config && config.phases) || {};
  const players = typeof opts.players === 'number' && opts.players > 0 ? opts.players : ALLOWANCES.defaultPlayers;
  let startId = null;
  for (const id of Object.keys(phases)) {
    if (phases[id] && phases[id].type === 'lobby') { startId = id; break; }
  }
  if (!startId) startId = Object.keys(phases)[0] || null;

  const steps = [];
  let seconds = 0;
  let timerSeconds = 0;
  const visited = new Set();
  let current = startId;
  while (current && phases[current] && !visited.has(current)) {
    visited.add(current);
    const phase = phases[current];
    if (phase.type === 'foreach') {
      const rounds = typeof phase.limit === 'number' && phase.limit > 0 ? phase.limit : players;
      let roundSeconds = 0;
      let roundTimers = 0;
      for (const sub of Object.values(phase.subPhases || {})) {
        if (!sub || typeof sub !== 'object') continue;
        const s = stepSeconds(sub, opts);
        roundSeconds += s.seconds;
        if (s.timed) roundTimers += timerOf(sub);
      }
      const total = rounds * roundSeconds;
      steps.push({ id: current, type: 'foreach', seconds: total, timed: roundTimers > 0, rounds });
      seconds += total;
      timerSeconds += rounds * roundTimers;
    } else if (phase.type !== 'end') {
      const s = stepSeconds(phase, opts);
      steps.push({ id: current, type: phase.type, seconds: s.seconds, timed: s.timed });
      seconds += s.seconds;
      if (s.timed) timerSeconds += timerOf(phase);
    }
    current = primaryNext(phase);
  }
  return { seconds, minutes: Math.ceil(seconds / 60), timerSeconds, steps };
}

function floorFor(type) {
  return TIMER_FLOORS[type] ?? TIMER_FLOORS.default;
}

// Round a trimmed timer to something a teacher would set by hand.
function tidy(seconds) {
  return Math.max(5, Math.round(seconds / 5) * 5);
}

/**
 * Scale every timer on the primary path so the estimate fits the budget.
 * Timers inside foreach rounds scale too. Returns a deep copy; the input is
 * never touched (built-ins are drift-guarded).
 * @param {object} config
 * @param {number} budgetMinutes
 * @param {{players?: number}} [opts]
 * @returns {{config: object, fits: boolean, changes: Array<{id: string, type: string, from: number, to: number}>, estimate: object}}
 */
export function fitToBudget(config, budgetMinutes, opts = {}) {
  const before = estimateDuration(config, opts);
  const budget = budgetMinutes * 60;
  if (before.seconds <= budget) return { config, fits: true, changes: [], estimate: before };

  const copy = JSON.parse(JSON.stringify(config));
  const phases = copy.phases || {};
  const fixed = before.seconds - before.timerSeconds;
  const available = Math.max(0, budget - fixed);
  const scale = before.timerSeconds > 0 ? available / before.timerSeconds : 0;
  const changes = [];

  const trimOne = (id, phase) => {
    const t = timerOf(phase);
    if (t === null) return;
    const to = Math.max(floorFor(phase.type), tidy(t * scale));
    if (to < t) {
      phase.timer = to;
      changes.push({ id, type: phase.type, from: t, to });
    }
  };
  for (const step of before.steps) {
    const phase = phases[step.id];
    if (!phase) continue;
    if (phase.type === 'foreach') {
      for (const [subId, sub] of Object.entries(phase.subPhases || {})) {
        if (sub && typeof sub === 'object') trimOne(`${step.id}.${subId}`, sub);
      }
    } else {
      trimOne(step.id, phase);
    }
  }

  const after = estimateDuration(copy, opts);
  return { config: changes.length ? copy : config, fits: after.seconds <= budget, changes, estimate: after };
}

/**
 * Recipe-born configs: a trimmed timer that came from a `${param}` in the
 * recipe template must change the parameter too, or the settings list and
 * the Make it yours knobs keep showing the old number. Returns a new params
 * object (unchanged params when nothing maps).
 * @param {object} templatePhases  recipe.template.phases
 * @param {object} params          the params the config was compiled from
 * @param {Array<{id: string, to: number}>} changes  from fitToBudget
 * @returns {{params: object, changed: string[]}}
 */
export function paramsForTrim(templatePhases, params, changes) {
  const next = { ...(params || {}) };
  const changed = [];
  for (const ch of changes || []) {
    const [phaseId, subId] = String(ch.id).split('.');
    let tpl = templatePhases && templatePhases[phaseId];
    if (tpl && subId && tpl.subPhases) tpl = tpl.subPhases[subId];
    const timer = tpl && tpl.timer;
    const m = typeof timer === 'string' ? timer.match(/^\$\{(\w+)\}$/) : null;
    if (m && Object.prototype.hasOwnProperty.call(next, m[1])) {
      next[m[1]] = ch.to;
      changed.push(m[1]);
    }
  }
  return { params: next, changed };
}

function stepLabel(id) {
  const leaf = String(id).split('.').pop();
  return leaf.replace(/[-_]+/g, ' ').replace(/^\w/, c => c.toUpperCase());
}

/**
 * The sentence a teacher reads next to a match, plus the trim when one helps.
 * @param {object} config
 * @param {number|null} requestedMinutes
 * @param {{players?: number, trim?: boolean}} [opts]  trim:false = report only
 * @returns {{estimatedMinutes: number, requestedMinutes: number|null, over: boolean, note: string,
 *            trim: null|{config: object, changes: Array, estimatedMinutes: number}}}
 */
export function timingReport(config, requestedMinutes, opts = {}) {
  const est = estimateDuration(config, opts);
  const requested = typeof requestedMinutes === 'number' && requestedMinutes > 0 ? requestedMinutes : null;
  const base = { estimatedMinutes: est.minutes, requestedMinutes: requested, over: false, note: '', trim: null };

  if (requested === null) {
    return { ...base, note: `About ${est.minutes} minutes as set up.` };
  }
  if (est.minutes <= requested) {
    return { ...base, note: `About ${est.minutes} minutes as set up, inside your ${requested}.` };
  }

  const over = { ...base, over: true };
  const head = `About ${est.minutes} minutes as set up. Your request said ${requested}.`;
  if (opts.trim === false) {
    return { ...over, note: `${head} Shorten the timers in the editor, or drop a step.` };
  }
  const fit = fitToBudget(config, requested, opts);
  if (!fit.changes.length) {
    return { ...over, note: `${head} No timers to trim; drop a step in the editor to get under.` };
  }
  const detail = fit.changes.map(ch => `${stepLabel(ch.id)} ${ch.from}s to ${ch.to}s`).join(', ');
  const trim = { config: fit.config, changes: fit.changes, estimatedMinutes: fit.estimate.minutes };
  if (fit.fits) {
    return { ...over, note: `${head} Trim the timers (${detail}) and it runs about ${fit.estimate.minutes}.`, trim };
  }
  // Even the floors run over: hand over the floor trim anyway, with the real number.
  return {
    ...over,
    note: `About ${fit.estimate.minutes} minutes even with the shortest timers (${detail}). Your request said ${requested}. Trim, then drop a step in the editor to get under.`,
    trim
  };
}
