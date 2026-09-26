/**
 * A reviewer's sixth round (2026-09-26): a backhanded line passed the
 * filter and the teacher had no way to keep it off the wall. Hide now
 * reaches the stored rows after a close, the review screen has a Hide per
 * line, the teacher hears about blocked messages, and the refusals read as
 * a no. Source guards plus a unit test of the hide-after-close rule.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { hideStoredResponse } from '../../engine/moderation.js';
import { EVENTS } from '../../engine/events.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

function roomWith(phaseType) {
  const phaseData = {
    write: { responses: [{ playerId: 'p1', name: 'Maya', text: 'kind' }, { playerId: 'p2', name: 'Sam', text: 'mean' }], byPlayer: {} },
    review: { content: 'x', responses: [{ playerId: 'p1', name: 'Maya', response: 'kind' }, { playerId: 'p2', name: 'Sam', response: 'mean' }] }
  };
  return {
    lastClosedCollectId: 'write',
    phaseState: phaseType === 'reveal-one'
      ? { kind: 'reveal-one', phaseId: 'wall', revealed: 1, items: [{ playerId: 'p1', text: 'kind' }, { playerId: 'p2', text: 'mean' }, { playerId: 'p3', text: 'ok' }] }
      : { kind: phaseType },
    engine: {
      phaseData,
      getCurrentPhase: () => ({ id: 'review', type: phaseType }),
      storePhaseData: (id, data) => { phaseData[id] = data; }
    }
  };
}

describe('hideStoredResponse', () => {
  it('moves the line out of the closed step and the open preview, and back on unhide', () => {
    const room = roomWith('preview');
    const out = hideStoredResponse(room, 'p2', true);
    expect(out).toEqual({ collect: true, preview: true, revealOne: false });
    expect(room.engine.phaseData.write.responses.map(r => r.playerId)).toEqual(['p1']);
    expect(room.engine.phaseData.review.responses.map(r => r.playerId)).toEqual(['p1']);
    hideStoredResponse(room, 'p2', false);
    expect(room.engine.phaseData.write.responses.map(r => r.playerId).sort()).toEqual(['p1', 'p2']);
    expect(room.engine.phaseData.review.responses.map(r => r.playerId).sort()).toEqual(['p1', 'p2']);
  });
  it('drops an unrevealed item from a one-by-one reveal, never one already shown', () => {
    const room = roomWith('reveal-one');
    expect(hideStoredResponse(room, 'p2', true).revealOne).toBe(true);
    expect(room.phaseState.items.map(i => i.playerId)).toEqual(['p1', 'p3']);
    expect(room.engine.phaseData.wall.items.length).toBe(2);
    const shown = roomWith('reveal-one');
    expect(hideStoredResponse(shown, 'p1', true).revealOne).toBe(false);
    expect(shown.phaseState.items.length).toBe(3);
  });
  it('moves the line out of the byPlayer map too, so a return-to-author chain never carries it (2026-09-26, a live Someone\'s Got You room)', async () => {
    const { buildChainViews } = await import('../../engine/phases/chain-reveal.js');
    const room = roomWith('preview');
    const write = room.engine.phaseData.write;
    write.byPlayer = { p1: 'kind', p2: 'mean' };
    write.assignedFrom = {};
    // p2's line was written for p1's note; p1's for p2's
    const notes = { byPlayer: { p1: 'my note', p2: 'their note' }, assignedFrom: { p1: 'p2', p2: 'p1' } };
    hideStoredResponse(room, 'p2', true);
    expect(write.byPlayer).toEqual({ p1: 'kind' });
    expect(write.hiddenByPlayer).toEqual({ p2: 'mean' });
    const views = buildChainViews([notes, write]);
    // p1's note went to p2, whose reply is hidden: no hop, and not a wifi loss
    expect(views.get('p1')).toEqual({ original: 'my note', steps: [], complete: true });
    expect(views.get('p2')).toEqual({ original: 'their note', steps: ['kind'], complete: true });
    hideStoredResponse(room, 'p2', false);
    expect(write.byPlayer).toEqual({ p1: 'kind', p2: 'mean' });
    expect(write.hiddenByPlayer).toEqual({});
    expect(buildChainViews([notes, write]).get('p1').steps).toEqual(['mean']);
  });
  it('is a no-op on a room with nothing stored', () => {
    expect(hideStoredResponse({ engine: { phaseData: {}, getCurrentPhase: () => null } }, 'p1', true)).toEqual({ collect: false, preview: false, revealOne: false });
  });
});

describe('the surfaces', () => {
  it('the console review screen has a Hide per line and hears about blocked messages', () => {
    const teacher = read('screens/teacher/teacher.js');
    expect(teacher).toContain("socket.emit('moderate-hide', { code: currentCode, playerId: row.playerId, hidden: true });");
    expect(teacher).toContain("socket.on('teacher-blocked'");
    expect(read('engine/phase-handlers/preview.js')).toContain('playerId: r.playerId,');
    expect(EVENTS.TEACHER_BLOCKED).toBe('teacher-blocked');
    expect(EVENTS.REVEAL_ONE_COUNT).toBe('reveal-one-count');
    const server = read('server.js');
    expect(server).toContain('hideStoredResponse(room, playerId, newHidden)');
    expect(server).toContain('EVENTS.TEACHER_BLOCKED, { name: player.name, reason: check.reason }');
    expect(server.match(/room\.lastClosedCollectId = collectPhase\.id;/g).length).toBe(2);
  });
  it('the projector lists a pick-one step\'s options while the class picks, and follows a shrinking reveal queue', () => {
    const host = read('screens/host/host.js');
    expect(host).toContain("socket.on('reveal-one-count'");
    expect(host).toContain("document.getElementById('collect-choices')");
    expect(read('screens/host/index.html')).toContain('id="collect-choices" class="vote-proposals" hidden');
  });
  it('a refusal on purpose reads as a no, with no Plan it step by step', () => {
    const designer = read('screens/designer/designer.js');
    expect(designer).toContain("data && data.harm ? \"We won't build that one\"");
    expect(designer).toContain('if (!(data && data.harm)) btnRow.appendChild(storyboardBtn);');
    expect(designer).toContain('resp.harm ? ' + String.fromCharCode(39) + 'We won' + String.fromCharCode(92, 39) + 't build that one' + String.fromCharCode(39));
    const ai = read('services/ai-service.js');
    expect(ai).toContain('"harm": true');
    expect(ai).toContain('harm: parsed.harm === true');
  });
  it('an AI step that promised JSON retries once and then stops with a clear error', () => {
    const ai = read('engine/phase-handlers/ai-process.js');
    expect(ai).toContain('const maxAttempts = (phase.perPlayer || expectJson) ? 2 : 1;');
    expect(ai).toContain('did not come back in a usable shape');
  });
  it('the map shows no AI instruction, the bench names the round count, the bluff button says Start the round', () => {
    expect(read('engine/activity-map.js')).toContain("if (phase.type === 'ai-process' || phase.type === 'ai-eliminate') return undefined;");
    expect(read('screens/prototype/bench-logic.js')).toContain("return stop.rounds + ' rounds';");
    const cfg = JSON.parse(read('games/trivia-bluff/config.json'));
    expect(cfg.phases.fact1.continueLabel).toBe('Start the round');
    expect(cfg.phases.fact1.instruction).toContain('exactly ONE correct answer');
  });
});
