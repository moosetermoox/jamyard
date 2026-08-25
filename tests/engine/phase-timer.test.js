import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { armPhaseTimer, extendPhaseTimer } from '../../engine/phase-timer.js';

// The server-armed countdown behind timed phases (merge, rank, sort...),
// and the re-arm that "A bit more time" depends on: without it the server
// would still close the phase at the original deadline no matter what the
// projector countdown shows.
describe('phase timer', () => {
  let room;
  let fired;

  beforeEach(() => {
    vi.useFakeTimers();
    fired = 0;
    room = { phaseInstanceId: 7, phaseState: { kind: 'rank', phaseId: 'p1' } };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires at the deadline', () => {
    armPhaseTimer(room, 60, () => { fired++; });
    vi.advanceTimersByTime(59000);
    expect(fired).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(fired).toBe(1);
  });

  it('does not fire after the room moved on (phaseInstanceId bumped)', () => {
    armPhaseTimer(room, 60, () => { fired++; });
    room.phaseInstanceId = 8;
    room.phaseState = {};
    vi.advanceTimersByTime(120000);
    expect(fired).toBe(0);
  });

  it('extend pushes the close back by addSeconds', () => {
    armPhaseTimer(room, 60, () => { fired++; });
    vi.advanceTimersByTime(50000);
    expect(extendPhaseTimer(room, 30)).toBe(true);
    vi.advanceTimersByTime(30000); // original deadline (60s) is long past
    expect(fired).toBe(0);
    vi.advanceTimersByTime(10000); // 90s total
    expect(fired).toBe(1);
  });

  it('extends stack', () => {
    armPhaseTimer(room, 60, () => { fired++; });
    extendPhaseTimer(room, 30);
    extendPhaseTimer(room, 30);
    vi.advanceTimersByTime(119000);
    expect(fired).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(fired).toBe(1);
  });

  it('an extended timer still respects the staleness guard', () => {
    armPhaseTimer(room, 60, () => { fired++; });
    extendPhaseTimer(room, 30);
    room.phaseInstanceId = 8;
    vi.advanceTimersByTime(120000);
    expect(fired).toBe(0);
  });

  it('extend returns false when nothing is armed', () => {
    expect(extendPhaseTimer(room, 30)).toBe(false);
    expect(extendPhaseTimer({ phaseInstanceId: 1, phaseState: null }, 30)).toBe(false);
  });

  it('extend returns false after cleanup cleared the handle (manual close)', () => {
    armPhaseTimer(room, 60, () => { fired++; });
    clearTimeout(room.phaseState.timer);
    room.phaseState.timer = null;
    expect(extendPhaseTimer(room, 30)).toBe(false);
    vi.advanceTimersByTime(120000);
    expect(fired).toBe(0);
  });

  it('arming without a timer value is a no-op', () => {
    armPhaseTimer(room, 0, () => { fired++; });
    expect(room.phaseState.timer).toBeUndefined();
    vi.advanceTimersByTime(120000);
    expect(fired).toBe(0);
  });
});
