import { describe, it, expect } from 'vitest';
import { validatePayload } from '../../engine/event-schemas.js';

describe('validatePayload', () => {
  it('accepts events with no registered schema', () => {
    expect(validatePayload('some-unknown-event', { anything: 1 })).toEqual({ ok: true });
  });

  it('rejects non-object payload', () => {
    const result = validatePayload('submit-response', null);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/object/);
  });

  it('rejects array payload as non-object', () => {
    const result = validatePayload('submit-response', ['a', 'b']);
    expect(result.ok).toBe(false);
  });

  it('accepts valid submit-response payload', () => {
    expect(validatePayload('submit-response', { code: 'ABCD', response: 'hi' })).toEqual({ ok: true });
  });

  it('rejects submit-response missing required code', () => {
    const result = validatePayload('submit-response', { response: 'hi' });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/code/);
  });

  it('rejects submit-response with wrong type for code', () => {
    const result = validatePayload('submit-response', { code: 123, response: 'hi' });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/code/);
    expect(result.reason).toMatch(/string/);
  });

  it('accepts rank-submit with array ranking', () => {
    expect(validatePayload('rank-submit', { code: 'X', ranking: ['a', 'b'] })).toEqual({ ok: true });
  });

  it('rejects rank-submit with non-array ranking', () => {
    const result = validatePayload('rank-submit', { code: 'X', ranking: 'abc' });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/array/);
  });

  it('accepts optional phaseInstanceId when omitted', () => {
    expect(validatePayload('submit-response', { code: 'X', response: 'y' })).toEqual({ ok: true });
  });

  it('rejects when optional field present with wrong type', () => {
    const result = validatePayload('submit-response', { code: 'X', response: 'y', phaseInstanceId: 'oops' });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/phaseInstanceId/);
  });

  it('accepts "any" type for submit-vote choice regardless of value', () => {
    expect(validatePayload('submit-vote', { code: 'X', choice: 'player-a' })).toEqual({ ok: true });
    expect(validatePayload('submit-vote', { code: 'X', choice: 42 })).toEqual({ ok: true });
  });

  it('rejects wager-submit missing amount', () => {
    const result = validatePayload('wager-submit', { code: 'X', option: 'yes' });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/amount/);
  });
});
