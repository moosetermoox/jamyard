/**
 * GameEngine — the per-room orchestrator that actually "runs" a game.
 *
 * One instance per live room. It wraps a validated game config and owns
 * everything that changes as the class plays:
 *   - stateMachine: the phase graph (which phase is current, what's legal next)
 *   - players:      the PlayerRegistry (who's in, who's eliminated)
 *   - phaseData:    each phase's collected/computed output, keyed by phase id
 *                   (and a versioned `phaseId~N` copy while inside a loop)
 *   - loopState / foreachState: bookkeeping for loop and foreach iteration
 *
 * It also resolves `{{phase.field}}` data references (via resolver-grammar)
 * and runs the pure phase-logic helpers (eliminate/vote/winner). The socket
 * layer (server.js) drives it; the engine itself has no I/O.
 */
import { formatCloud, formatCards, pickRandom, listOf } from './phases/word-cloud.js';
import { StateMachine } from './state-machine.js';
import { foreachRoundOf } from './phases/foreach-rounds.js';
import { PlayerRegistry } from './player-registry.js';
import { runEliminate } from './phases/eliminate-handler.js';
import { generateMatchups, getEligibleVoters } from './phases/vote-handler.js';
import { orderedTally } from './phases/stance-shift.js';
import { determineWinner, traceEntryRef, findWinnerEntries } from './phases/winner-handler.js';
import { parseRef } from './resolver-grammar.js';
import { resolveLanguage } from './i18n/index.js';
import { localizeConfidence } from './phases/confidence.js';
import { guessesAuthors } from './names-needed.js';
import { markPromisedUnattributed } from './anonymity-promise.js';
import { transitionTargets, primaryNext } from './transitions.js';

export class GameEngine {
  constructor(config) {
    // The language the room's fixed labels speak (engine/i18n): an
    // explicit config.language, else detected from the activity's text.
    this.language = resolveLanguage(config);
    // A confidence step's fixed English words in that language, on this
    // room's own copy (engine/phases/confidence.js); the loaded config is
    // shared and never changed.
    this.config = localizeConfidence(config, this.language);
    // Guessing who wrote what needs the real names (engine/names-needed.js):
    // such a room runs with names shown, on its own shallow copy
    if (this.config.anonymous === true && guessesAuthors(this.config)) {
      this.config = { ...this.config, anonymous: false };
    }
    // A step whose words promised students the teacher will not know who
    // said what keeps its answers unnamed on the console and the report too
    // (engine/anonymity-promise.js, 2026-10-02: a Create-page question box
    // said "Nobody will know who asked what" and the console listed names)
    if (!guessesAuthors(this.config)) this.config = markPromisedUnattributed(this.config);
    this.players = new PlayerRegistry();
    this.phaseData = {};
    this.hooks = {};
    this.loopState = {};
    this.foreachState = {};      // { foreachPhaseId: { items, currentIndex, scores, subPhaseIds } }
    this._currentForeachItem = null;  // current iteration item for template resolution
    this._foreachCandidates = null;   // generated candidates for current iteration

    const smConfig = buildStateMachineConfig(config.phases);
    this.stateMachine = new StateMachine(smConfig);
  }

  getCurrentPhase() {
    const phaseId = this.stateMachine.getState();
    return { id: phaseId, ...this.config.phases[phaseId] };
  }

  getPhaseData(phaseId) {
    return this.phaseData[phaseId];
  }

  storePhaseData(phaseId, data) {
    this.phaseData[phaseId] = data;

    // If inside an active loop, also store versioned copy (phaseId~N)
    const loopInfo = this._getActiveLoopFor(phaseId);
    if (loopInfo) {
      this.phaseData[phaseId + '~' + loopInfo.iteration] = data;
    }

    // A For Each round's step (`_fe:<foreach>:<sub>`) runs once per item
    // under the same id, so each round also keeps its own copy
    // (`_fe:<foreach>:<sub>@<round>`) for the activity report, which
    // showed only the last round (a reviewer, 2026-10-02). Live room
    // state only, like the rest of phaseData.
    const round = foreachRoundOf(phaseId, this.foreachState);
    if (round) this.phaseData[phaseId + '@' + round] = data;
  }

  _getActiveLoopFor(phaseId) {
    for (const [loopPhaseId, state] of Object.entries(this.loopState)) {
      const phase = this.config.phases[loopPhaseId];
      if (!phase || !phase.loopBack) continue;
      // Phase is in this loop's body if it's between loopBack target and the loop phase
      if (this._isInLoopBody(phaseId, phase.loopBack, loopPhaseId)) {
        return state;
      }
    }
    return null;
  }

  _isInLoopBody(phaseId, loopStart, loopEnd) {
    // Walk from loopStart along the primary path until we hit loopEnd
    let current = loopStart;
    const visited = new Set();
    while (current && !visited.has(current)) {
      if (current === phaseId) return true;
      if (current === loopEnd) return true;
      visited.add(current);
      const p = this.config.phases[current];
      if (!p) break;
      current = primaryNext(p);
    }
    return false;
  }

  transition(nextPhaseId) {
    this.stateMachine.transition(nextPhaseId);
  }

  getBuiltInVariables() {
    return {
      remaining: this.players.getRemaining(),
      eliminated: this.players.getEliminated(),
      players: this.players.list()
    };
  }

  resolve(reference) {
    // Single source of truth for ref parsing — see engine/resolver-grammar.js.
    // Validator (game-loader) and engine both run refs through parseRef so the
    // two can't drift on what's a valid token shape.
    const parsed = parseRef(reference);
    const segments = parsed.segments;

    // _current.x.y.z — current foreach iteration item
    if (parsed.kind === 'foreachItem') {
      if (!this._currentForeachItem) return undefined;
      let value = this._currentForeachItem;
      for (let i = 1; i < segments.length; i++) {
        if (value == null) return undefined;
        value = value[segments[i]];
      }
      return value;
    }

    // _foreach.<foreachPhaseId>.index / .total / .scores
    if (parsed.kind === 'foreachScope') {
      if (segments.length < 3) return undefined;
      const fePhaseId = segments[1];
      const field = segments[2];
      const state = this.foreachState[fePhaseId];
      if (!state) return undefined;
      if (field === 'index') return state.currentIndex + 1; // 1-based
      if (field === 'total') return state.items.length;
      if (field === 'scores') return state.scores;
      return undefined;
    }

    // _candidates — dynamically generated candidate list for foreach
    if (parsed.kind === 'foreachCandidates') {
      return this._foreachCandidates || [];
    }

    // _pair.* — pair-scoped reveal tokens have no value at this layer; the
    // reveal handler substitutes them per-recipient AFTER normal template
    // resolution. Returning undefined keeps the literal token in place.
    if (parsed.kind === 'pairScope') {
      return undefined;
    }

    // _loop.<phaseId>.iteration / .total
    if (parsed.kind === 'loopScope') {
      if (segments.length < 3) return undefined;
      const loopPhaseId = segments[1];
      const field = segments[2];
      const state = this.loopState[loopPhaseId];
      if (state) {
        if (field === 'iteration') return state.iteration;
        if (field === 'total') return state.total;
        return undefined;
      }
      // Loop hasn't started yet — return defaults from config
      const loopPhase = this.config.phases[loopPhaseId];
      if (loopPhase && loopPhase.loopCount) {
        if (field === 'iteration') return 1;
        if (field === 'total') return loopPhase.loopCount;
      }
      return undefined;
    }

    // Built-ins (remaining/eliminated/players)
    if (parsed.kind === 'builtin') {
      const builtIns = this.getBuiltInVariables();
      const head = segments[0];
      if (!(head in builtIns)) return undefined;
      let value = builtIns[head];
      // {{players.random}} (2026-09-30): one student's name at random, a
      // fair cold call or the next presenter; .cards lists them
      if (segments.length === 2 && Array.isArray(value) && (segments[1] === 'random' || segments[1] === 'cards')) {
        const names = value.map(p => (p && typeof p === 'object' && p.name) ? p.name : '').filter(Boolean);
        return segments[1] === 'random' ? pickRandom(names) : formatCards(names);
      }
      for (let i = 1; i < segments.length; i++) {
        if (value == null) return undefined;
        value = value[segments[i]];
      }
      return value;
    }

    // phaseField — refs into phase data
    if (parsed.kind !== 'phaseField' || segments.length === 0) return undefined;
    const phaseId = segments[0];
    const data = this.phaseData[phaseId];
    if (data === undefined) return undefined;

    // Renderer suffix: .list / .barChart / .pieChart / .chart format the
    // resolved prefix as a string. Other grammar suffixes (.count, .json,
    // .mine) are handled outside this resolver — .mine is rewritten by the
    // server's per-player template helper before resolve() runs; .count and
    // .json are validator-only annotations.
    const renderableSuffix = parsed.suffix === 'list'
      || parsed.suffix === 'barChart'
      || parsed.suffix === 'pieChart'
      || parsed.suffix === 'chart'
      || parsed.suffix === 'cloud'
      || parsed.suffix === 'cards'
      || parsed.suffix === 'random';

    if (renderableSuffix) {
      let value = data;
      for (let i = 1; i < segments.length; i++) {
        if (value == null) return '';
        value = value[segments[i]];
      }
      if (parsed.suffix === 'list') return formatList(value);
      // Reveal styles over a list (2026-09-30): a sized word cloud, every
      // answer as a card, one at random; the screens draw the line shapes
      if (parsed.suffix === 'cloud') return formatCloud(listOf(value));
      if (parsed.suffix === 'cards') return formatCards(value);
      if (parsed.suffix === 'random') return pickRandom(value);
      // bare {{X.barChart}} reads X.tally (backward compat).
      // Deeper paths (e.g. {{X.tally.barChart}}) use the resolved value directly.
      const tally = (segments.length === 1) ? (data && data.tally) : value;
      // Graded collect-choice stores its RESOLVED correctAnswer in phase
      // data at close (server close-submissions) — bare charts of such a
      // phase mark that row. Deeper paths chart arbitrary data; no marking.
      const markCorrect = (segments.length === 1) ? (data && data.correctAnswer) : undefined;
      // A step with chartOrder: "choices" stored its choice order at close:
      // the chart keeps it and shows zero rows (a before/after pair must
      // line up, 2026-09-26)
      const order = (segments.length === 1) ? (data && data.chartOrder) : undefined;
      return formatBarChart(tally, markCorrect, order);
    }

    // Suffix not handled by engine (.count/.json/.mine) or no suffix —
    // walk full segment path. For .mine the server-side helper rewrites
    // before this point; if it doesn't, the literal "mine" lookup mirrors
    // the prior behavior (returns undefined unless data has a .mine key).
    let value = data;
    const fullPath = parsed.suffix ? [...segments, parsed.suffix] : segments;
    for (let i = 1; i < fullPath.length; i++) {
      if (value == null) return undefined;
      value = value[fullPath[i]];
    }
    return value;
  }

  runPhase(phaseId) {
    const phase = this.config.phases[phaseId];
    if (!phase) {
      throw new Error(`Phase "${phaseId}" not found in config`);
    }

    let result;

    switch (phase.type) {
      case 'eliminate':
        result = this._runEliminate(phase);
        break;
      case 'vote':
        result = this._runVote(phase);
        break;
      case 'winner':
        result = this._runWinner(phase);
        break;
      default:
        throw new Error(`No handler for phase type "${phase.type}"`);
    }

    this.storePhaseData(phaseId, result);
    return result;
  }

  _runEliminate(phase) {
    let input;

    if (phase.method === 'bottom-percent') {
      const ref = phase.input || phase.from;
      const scores = ref ? this.resolve(ref) : {};
      input = { scores, percent: phase.percent };
    } else if (phase.method === 'most-votes') {
      const ref = phase.input || phase.from;
      const scores = ref ? this.resolve(ref) : {};
      input = { scores, count: phase.count };
    } else if (phase.method === 'hook') {
      const data = phase.input ? this.resolve(phase.input) : null;
      const context = {
        players: this.players.list(),
        remaining: this.players.getRemaining(),
        eliminated: this.players.getEliminated(),
        phases: this.phaseData
      };
      input = { hookFn: phase.hook, data, context };
    }

    return runEliminate({
      method: phase.method,
      input,
      hooks: this.hooks,
      players: this.players
    });
  }

  _runVote(phase) {
    const candidates = phase.candidates ? this.resolve(phase.candidates) : [];
    const candidateIds = candidates.map(c => c.playerId || c.id || c);
    const voters = getEligibleVoters(this.players, phase.voters || 'all');

    if (phase.mode === 'head-to-head') {
      const { matchups, comparisons } = generateMatchups(candidateIds);
      return { matchups, comparisons, candidateIds, voters };
    }

    if (phase.mode === 'pick-one') {
      return { candidateIds, voters };
    }

    throw new Error(`Unknown vote mode: "${phase.mode}"`);
  }

  _runWinner(phase) {
    const scores = phase.from ? this.resolve(phase.from) : {};
    const result = determineWinner(scores, this.players);

    // What they won FOR: trace the scores back to the submissions they
    // judged and attach each winner's own entry. Display nicety — a broken
    // trace must never crash the crown, so failures resolve to no entry.
    result.winnerEntry = null;
    result.winnerEntries = [];
    const entryRef = traceEntryRef(phase, this.config.phases);
    if (entryRef && result.winnerIds.length > 0) {
      let records = null;
      try {
        records = this.resolve(entryRef);
      } catch (err) {
        console.warn(`[winner] could not resolve entry source "${entryRef}": ${err.message}`);
      }
      result.winnerEntries = findWinnerEntries(result.winnerIds, Array.isArray(records) ? records : []);
      const own = result.winnerEntries.find(e => e.playerId === result.winnerId);
      result.winnerEntry = own && own.text ? own.text : null;
      // The winning drawing, full strokes, for the projector's crown.
      result.winnerDrawing = own && Array.isArray(own.drawing) ? own.drawing : null;
    }
    return result;
  }
}

function buildStateMachineConfig(phases) {
  const phaseNames = Object.keys(phases);
  const lobbyPhase = phaseNames.find(name => phases[name].type === 'lobby');

  // Every transition field (a branching vote's targets included) is a
  // legal move; the list lives in engine/transitions.js.
  const transitions = {};
  for (const [name, phase] of Object.entries(phases)) {
    transitions[name] = transitionTargets(phase);
  }

  return { initialState: lobbyPhase, transitions };
}

/**
 * Format a tally object as a plain-text bar chart.
 * Input: { "Yes": 4, "No": 2 }
 * Output: "Yes  ████████ 4\nNo   ████ 2"
 * @param {Object} tally
 * @returns {string}
 */
/**
 * Format a value as a numbered, newline-separated list.
 * Accepts: an array, or an object with a .result/.responses/.standings array.
 * Each item: if string, used directly; if object, prefers .text, then .name,
 * then .response, falling back to JSON.
 */
function formatList(value) {
  let arr = null;
  if (Array.isArray(value)) {
    arr = value;
  } else if (value && typeof value === 'object') {
    if (Array.isArray(value.result)) arr = value.result;
    else if (Array.isArray(value.responses)) arr = value.responses;
    else if (Array.isArray(value.standings)) arr = value.standings;
  }
  if (!arr || arr.length === 0) return '';
  return arr.map((item, i) => {
    let text;
    if (typeof item === 'string') text = item;
    else if (item && typeof item === 'object') {
      text = item.text || item.name || item.response || JSON.stringify(item);
    } else {
      text = String(item);
    }
    return `${i + 1}. ${text}`;
  }).join('\n');
}

function formatBarChart(tally, correctAnswer, order) {
  if (!tally || typeof tally !== 'object') return '';
  // With an order (the step's own choices), rows keep that order and a
  // choice nobody picked still shows as a zero row; without one, by count.
  const keepOrder = Array.isArray(order) && order.length > 0;
  let entries = keepOrder ? orderedTally(tally, order) : Object.entries(tally);
  if (entries.length === 0) return '(no responses)';

  const max = Math.max(...entries.map(([, n]) => Number(n) || 0));
  if (max === 0) return '(no responses)';

  // Graded charts mark the correct answer's row with a trailing ✓ (same
  // trim+lowercase match as speed-scoring). The screens color THAT row
  // green — without the mark they colored the most-picked row, which read
  // as "this was right" whenever the class guessed wrong. If nobody picked
  // the correct answer it gets a zero row, the most confusing case of all.
  const norm = (s) => String(s).trim().toLowerCase();
  const normAnswer = correctAnswer == null || String(correctAnswer).trim() === ''
    ? null : norm(correctAnswer);
  if (normAnswer && !entries.some(([label]) => norm(label) === normAnswer)) {
    entries = entries.concat([[String(correctAnswer), 0]]);
  }

  const maxBar = 20;
  const maxLabelLen = Math.max(...entries.map(([label]) => String(label).length));
  const total = entries.reduce((sum, [, n]) => sum + (Number(n) || 0), 0);

  if (!keepOrder) entries = entries.slice().sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0));
  return entries
    .map(([label, count]) => {
      const n = Number(count) || 0;
      const barLen = Math.round((n / max) * maxBar);
      const bar = '█'.repeat(barLen) + '░'.repeat(maxBar - barLen);
      const pct = total > 0 ? Math.round((n / total) * 100) : 0;
      const paddedLabel = String(label).padEnd(maxLabelLen);
      const mark = normAnswer && norm(label) === normAnswer ? ' ✓' : '';
      return `${paddedLabel}  ${bar}  ${n} (${pct}%)${mark}`;
    })
    .join('\n');
}
