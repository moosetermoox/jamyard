/**
 * StateMachine — a tiny, game-agnostic finite state machine.
 *
 * States are phase ids; `transitions` is the legal next-phase graph
 * (built from the game config by GameEngine.buildStateMachineConfig).
 * `transition()` refuses any move not in that graph — that guard is what
 * makes illegal phase jumps (and typos in `next`/branch fields) fail loudly
 * instead of silently corrupting a game. Emits 'stateChange' on every move.
 *
 * Deliberately knows nothing about phases, players, or games — just states
 * and edges. All game meaning lives one layer up, in GameEngine.
 */
export class StateMachine {
  constructor(config) {
    this.state = config.initialState;
    this.transitions = config.transitions;
    this.listeners = {};
  }

  getState() {
    return this.state;
  }

  transition(newState) {
    const allowed = this.transitions[this.state] || [];

    if (!allowed.includes(newState)) {
      throw new Error(`Invalid transition from '${this.state}' to '${newState}'`);
    }

    const from = this.state;
    this.state = newState;
    this.emit('stateChange', { from, to: newState });
  }

  on(event, handler) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(handler);
  }

  addDynamicTransition(fromState, toState) {
    if (!this.transitions[fromState]) {
      this.transitions[fromState] = [];
    }
    if (!this.transitions[fromState].includes(toState)) {
      this.transitions[fromState].push(toState);
    }
  }

  emit(event, data) {
    const handlers = this.listeners[event] || [];
    for (const handler of handlers) {
      handler(data);
    }
  }
}
