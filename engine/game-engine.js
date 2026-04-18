import { StateMachine } from './state-machine.js';
import { PlayerRegistry } from './player-registry.js';
import { runEliminate } from './phases/eliminate-handler.js';
import { generateMatchups, getEligibleVoters } from './phases/vote-handler.js';
import { determineWinner } from './phases/winner-handler.js';

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
    const parts = reference.split('.');
    const firstPart = parts[0];

    // Handle _current — refers to the current foreach iteration item
    if (firstPart === '_current') {
      if (!this._currentForeachItem) return undefined;
      let value = this._currentForeachItem;
      for (let i = 1; i < parts.length; i++) {
        if (value == null) return undefined;
        value = value[parts[i]];
      }
      return value;
    }

    // Handle _foreach.<foreachPhaseId>.index / .total / .scores
    if (firstPart === '_foreach' && parts.length >= 3) {
      const fePhaseId = parts[1];
      const field = parts[2];
      const state = this.foreachState[fePhaseId];
      if (!state) return undefined;
      if (field === 'index') return state.currentIndex + 1; // 1-based
      if (field === 'total') return state.items.length;
      if (field === 'scores') return state.scores;
      return undefined;
    }

    // Handle _candidates — dynamically generated candidate list for foreach
    if (firstPart === '_candidates') {
      return this._foreachCandidates || [];
    }

    // Handle _loop variables: _loop.<phaseId>.iteration / .total
    if (firstPart === '_loop' && parts.length >= 3) {
      const loopPhaseId = parts[1];
      const field = parts[2];
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

    // Check built-in variables first
    const builtIns = this.getBuiltInVariables();
    if (firstPart in builtIns) {
      let value = builtIns[firstPart];
      for (let i = 1; i < parts.length; i++) {
        if (value == null) return undefined;
        value = value[parts[i]];
      }
      return value;
    }

    // Then check phase data
    const data = this.phaseData[firstPart];
    if (data === undefined) return undefined;

    // Synthetic: phaseId.barChart renders a tally as an ASCII bar chart
    if (parts.length === 2 && parts[1] === 'barChart') {
      return formatBarChart(data.tally);
    }

    let value = data;
    for (let i = 1; i < parts.length; i++) {
      if (value == null) return undefined;
      value = value[parts[i]];
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
