/**
 * A late joiner who makes a merge trio changes the projector's words too.
 *
 * The student screens already read "sit with your group" for a group of
 * three (partner-words.js), but the projector's line was sent once at
 * enter, for the largest group then, so after a late joiner turned a pair
 * into a trio it kept saying "sit next to your partner" (noticed on
 * jamyard.org, 2026-10-03). The merge handler's onLateJoin now re-sends
 * the projector line, without a timer so the clock keeps running.
 */
import { describe, it, expect } from 'vitest';
import '../../engine/phase-handlers/merge.js';
import { getHandler } from '../../engine/phase-handlers/phase-registry.js';
import { EVENTS } from '../../engine/events.js';

function group(id, members) {
  return { groupId: id, members: members.slice(), seeds: [], draft: '', penHolder: null, penAt: 0, agreed: new Set(), submitted: false };
}

function mergeCtx(groups) {
  const byPlayer = {};
  for (const g of groups) for (const id of g.members) byPlayer[id] = g;
  const state = { phaseId: 'merge', kind: 'merge', agreeMode: 'both', groups, byPlayer, timer: null };
  const sent = { host: [], players: [] };
  const ctx = {
    room: { phaseState: state },
    phase: { id: 'merge', type: 'merge', instruction: 'Go sit next to your partner and combine your answers.' },
    engine: { language: 'en' },
    resolveTemplate: (t) => t,
    resolveScreenControl: () => ({ hostTemplate: 'plain', hostShow: { timer: false } }),
    emitToHost: (e, p) => sent.host.push({ event: e, payload: p }),
    emitToPlayer: (id, e, p) => sent.players.push({ id, event: e, payload: p })
  };
  return { ctx, sent, state };
}

describe('merge onLateJoin and the projector line', () => {
  it('a newcomer who makes a trio turns the projector line into group words, with no timer', () => {
    const { ctx, sent } = mergeCtx([group('g1', ['a', 'b']), group('g2', ['c', 'd'])]);
    getHandler('merge').onLateJoin(ctx, 'z');
    const host = sent.host.filter(s => s.event === EVENTS.MERGE_PROGRESS);
    expect(host.length).toBe(1);
    expect(host[0].payload.instruction).toBe('Go sit with your group and combine your answers.');
    expect(host[0].payload.totalGroups).toBe(2);
    expect(host[0].payload.submittedGroups).toBe(0);
    expect('timer' in host[0].payload).toBe(false);
    expect(host[0].payload.hostTemplate).toBe('plain');
  });

  it('a newcomer who completes a pair leaves the projector line alone', () => {
    const { ctx, sent } = mergeCtx([group('g1', ['a']), group('g2', ['c', 'd'])]);
    getHandler('merge').onLateJoin(ctx, 'z');
    expect(sent.host).toEqual([]);
    // the partner still hears the new agree count
    expect(sent.players.map(p => p.id)).toEqual(['a']);
  });

  it('a submitted group is counted on the re-sent line', () => {
    const groups = [group('g1', ['a', 'b']), group('g2', ['c', 'd'])];
    groups[1].submitted = true;
    const { ctx, sent } = mergeCtx(groups);
    getHandler('merge').onLateJoin(ctx, 'z');
    expect(sent.host[0].payload.submittedGroups).toBe(1);
  });
});
