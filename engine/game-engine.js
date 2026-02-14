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
    transitions[name] = targets;
  }

  return { initialState: lobbyPhase, transitions };
}
