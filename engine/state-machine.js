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

  emit(event, data) {
    const handlers = this.listeners[event] || [];
    for (const handler of handlers) {
      handler(data);
    }
  }
}
