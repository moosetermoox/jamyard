// A collect or collect-choice that opens with students in the room and none
// able to answer closes itself (engine/phases/nobody-can-answer.js). Found by
// the small-class sweep: two students in Doodle Bluff both sit out every
// round, and the teacher pressed through six blank steps a round.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { nobodyCanAnswer } from '../../engine/phases/nobody-can-answer.js';

const engine = (n, start) => ({ config: start ? { start } : {}, players: { list: () => Array.from({ length: n }, (_, i) => ({ id: 'p' + i })) } });

describe('nobodyCanAnswer', () => {
  it('is true when students are in the room and none can answer', () => {
    expect(nobodyCanAnswer(engine(2), 0)).toBe(true);
  });
  it('is false while anyone can answer', () => {
    expect(nobodyCanAnswer(engine(2), 1)).toBe(false);
    expect(nobodyCanAnswer(engine(5), 5)).toBe(false);
  });
  it('never fires in a rolling room: the step is open to students still joining', () => {
    expect(nobodyCanAnswer(engine(0, 'rolling'), 0)).toBe(false);
    expect(nobodyCanAnswer(engine(3, 'rolling'), 0)).toBe(false);
  });
  it('never fires with no students at all', () => {
    expect(nobodyCanAnswer(engine(0), 0)).toBe(false);
  });
  it('both answer handlers use it, through the same close the teacher presses', () => {
    for (const f of ['collect', 'collect-choice']) {
      const src = readFileSync(new URL(`../../engine/phase-handlers/${f}.js`, import.meta.url), 'utf8');
      expect(src).toContain('nobodyCanAnswer(');
      expect(src).toContain('ctx.services.closeCollect(ctx.code, ctx.room)');
    }
    const server = readFileSync(new URL('../../server.js', import.meta.url), 'utf8');
    expect(server).toMatch(/closeCollect: \(code, room\) => closeCollect\(code, room\)/);
  });
});
