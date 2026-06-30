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
import { StateMachine } from './state-machine.js';
import { PlayerRegistry } from './player-registry.js';
import { runEliminate } from './phases/eliminate-handler.js';
import { generateMatchups, getEligibleVoters } from './phases/vote-handler.js';
import { determineWinner } from './phases/winner-handler.js';
import { parseRef } from './resolver-grammar.js';

export class GameEngine {
  constructor(config) {
    this.config = config;
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
    // Walk from loopStart following next/approveNext until we hit loopEnd
    let current = loopStart;
    const visited = new Set();
    while (current && !visited.has(current)) {
      if (current === phaseId) return true;
      if (current === loopEnd) return true;
      visited.add(current);
      const p = this.config.phases[current];
      if (!p) break;
      current = p.next || p.approveNext || null;
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
      || parsed.suffix === 'chart';

    if (renderableSuffix) {
      let value = data;
      for (let i = 1; i < segments.length; i++) {
        if (value == null) return '';
        value = value[segments[i]];
      }
      if (parsed.suffix === 'list') return formatList(value);
      // bare {{X.barChart}} reads X.tally (backward compat).
      // Deeper paths (e.g. {{X.tally.barChart}}) use the resolved value directly.
      const tally = (segments.length === 1) ? (data && data.tally) : value;
      return formatBarChart(tally);
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
    const candidateIds = candidates.map(c => c.playerId || c);
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
    return determineWinner(scores, this.players);
  }
}

function buildStateMachineConfig(phases) {
  const phaseNames = Object.keys(phases);
  const lobbyPhase = phaseNames.find(name => phases[name].type === 'lobby');

  const transitions = {};
  for (const [name, phase] of Object.entries(phases)) {
    const targets = [];
    if (phase.next) targets.push(phase.next);
    if (phase.approveNext) targets.push(phase.approveNext);
    if (phase.rejectNext) targets.push(phase.rejectNext);
    if (phase.loopBack) targets.push(phase.loopBack);
    // Branching votes: every nextByWinner target is a legal transition
    if (phase.nextByWinner && typeof phase.nextByWinner === 'object') {
      for (const target of Object.values(phase.nextByWinner)) {
        if (typeof target === 'string' && target) targets.push(target);
      }
    }
    transitions[name] = targets;
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

function formatBarChart(tally) {
  if (!tally || typeof tally !== 'object') return '';
  const entries = Object.entries(tally);
  if (entries.length === 0) return '(no responses)';

  const max = Math.max(...entries.map(([, n]) => Number(n) || 0));
  if (max === 0) return '(no responses)';

  const maxBar = 20;
  const maxLabelLen = Math.max(...entries.map(([label]) => String(label).length));
  const total = entries.reduce((sum, [, n]) => sum + (Number(n) || 0), 0);

  return entries
    .sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0))
    .map(([label, count]) => {
      const n = Number(count) || 0;
      const barLen = Math.round((n / max) * maxBar);
      const bar = '█'.repeat(barLen) + '░'.repeat(maxBar - barLen);
      const pct = total > 0 ? Math.round((n / total) * 100) : 0;
      const paddedLabel = String(label).padEnd(maxLabelLen);
      return `${paddedLabel}  ${bar}  ${n} (${pct}%)`;
    })
    .join('\n');
}
