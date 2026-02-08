import { StateMachine } from './state-machine.js';
import { PlayerRegistry } from './player-registry.js';

export class GameEngine {
  constructor(config) {
    this.config = config;
    this.players = new PlayerRegistry();
    this.phaseData = {};

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

  resolve(reference) {
    const parts = reference.split('.');
    const phaseId = parts[0];
    const data = this.phaseData[phaseId];

    if (data === undefined) {
      return undefined;
    }

    let value = data;
    for (let i = 1; i < parts.length; i++) {
      if (value == null) {
        return undefined;
      }
      value = value[parts[i]];
    }
    return value;
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
