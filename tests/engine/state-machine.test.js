import { describe, it, expect, vi } from 'vitest';
import { StateMachine } from '../../engine/state-machine.js';

const testConfig = {
  initialState: 'lobby',
  transitions: {
    lobby: ['collect'],
    collect: ['process'],
    process: ['reveal'],
    reveal: ['collect', 'end'],
    end: []
  }
};

describe('StateMachine', () => {
  it('can be created with a config', () => {
    const machine = new StateMachine(testConfig);
    expect(machine).toBeDefined();
  });

  it('returns the current state', () => {
    const machine = new StateMachine(testConfig);
    expect(machine.getState()).toBe('lobby');
  });

  it('can transition to a new state when that transition is allowed', () => {
    const machine = new StateMachine(testConfig);
    machine.transition('collect');
    expect(machine.getState()).toBe('collect');
  });

  it('can follow a chain of valid transitions', () => {
    const machine = new StateMachine(testConfig);
    machine.transition('collect');
    machine.transition('process');
    machine.transition('reveal');
    expect(machine.getState()).toBe('reveal');
  });

  it('refuses to transition when that transition is not allowed', () => {
    const machine = new StateMachine(testConfig);
    expect(() => machine.transition('process')).toThrow();
    expect(machine.getState()).toBe('lobby');
  });

  it('refuses to transition from end state', () => {
    const machine = new StateMachine(testConfig);
    machine.transition('collect');
    machine.transition('process');
    machine.transition('reveal');
    machine.transition('end');
    expect(() => machine.transition('lobby')).toThrow();
    expect(machine.getState()).toBe('end');
  });

  it('emits a stateChange event when transitioning', () => {
    const machine = new StateMachine(testConfig);
    const handler = vi.fn();
    machine.on('stateChange', handler);

    machine.transition('collect');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      from: 'lobby',
      to: 'collect'
    });
  });

  it('emits stateChange events for each transition', () => {
    const machine = new StateMachine(testConfig);
    const handler = vi.fn();
    machine.on('stateChange', handler);

    machine.transition('collect');
    machine.transition('process');

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenLastCalledWith({
      from: 'collect',
      to: 'process'
    });
  });

  it('does not emit stateChange event when transition is refused', () => {
    const machine = new StateMachine(testConfig);
    const handler = vi.fn();
    machine.on('stateChange', handler);

    expect(() => machine.transition('process')).toThrow();
    expect(handler).not.toHaveBeenCalled();
  });
});
