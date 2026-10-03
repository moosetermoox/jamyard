/**
 * The owner's reviewer walked the night's seven checks (2026-10-01) and
 * found: the second peer reader's pretend answers replied to the first
 * comment, the feedback return showed Folded Pass's projector line, a
 * hot seat of four questions under a turn of five never moved, the vote's
 * own question never reached a screen, empty "…" cards on the projector,
 * and answer-box lines that named the wrong reader.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { audienceFor } from '../../engine/audience.js';
import { planHotSeat } from '../../engine/phases/hot-seat.js';
import { withoutPlaceholderLines } from '../../engine/phases/host-prompt.js';
import { hasMisreadSecondReader } from '../../engine/sample-answers.js';
import { translate } from '../../engine/i18n/index.js';

const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const config = (id) => JSON.parse(read(`games/${id}/config.json`));

// The reviewer's copy: a draft, two readers in boxes, the return
const feedback = {
  name: 'Two Stars and a Wish',
  phases: {
    lobby: { type: 'lobby', next: 'draft' },
    draft: { type: 'collect', prompt: 'Write your lab conclusion.', next: 'feedback' },
    feedback: { type: 'collect', prompt: 'Two stars and a wish.\n\n“{{draft.assigned}}”', rotateFrom: 'draft', next: 'feedback-2' },
    'feedback-2': { type: 'collect', prompt: 'Two stars and a wish.\n\n“{{feedback.assigned}}”', rotateFrom: 'feedback', showOriginal: true, next: 'back' },
    back: { type: 'reveal', scope: 'own', chainFrom: ['draft', 'feedback', 'feedback-2'], chainDisplay: 'steps', chainQuoted: true, next: 'end' },
    end: { type: 'end' }
  }
};

describe('who reads it, on the answer box', () => {
  it('the draft with two readers says two classmates', () => {
    expect(audienceFor(feedback, 'draft').label).toBe('Two classmates will read this.');
  });

  it('each feedback step goes back to the writer, never "one classmate"', () => {
    expect(audienceFor(feedback, 'feedback').key).toBe('author');
    expect(audienceFor(feedback, 'feedback-2').key).toBe('author');
    expect(audienceFor(feedback, 'feedback').label).toBe('The classmate who wrote it gets this back.');
  });

  it('a one-reader feedback keeps "one classmate" on the draft', () => {
    const one = JSON.parse(JSON.stringify(feedback));
    delete one.phases['feedback-2'];
    one.phases.feedback.next = 'back';
    one.phases.back.chainFrom = ['draft', 'feedback'];
    expect(audienceFor(one, 'draft').label).toBe('One classmate will read this.');
  });

  it('a folded chain keeps its classmate line (the next hop reads it)', () => {
    const corpse = config('exquisite-corpse');
    const hops = Object.entries(corpse.phases).filter(([, p]) => p.type === 'collect' && p.rotateFrom);
    expect(hops.length).toBeGreaterThan(1);
    expect(audienceFor(corpse, hops[0][0]).key).toBe('classmate');
  });

  it('a secret card and a how-sure step show only totals', () => {
    expect(audienceFor(config('_sim-find-match'), 'find').key).toBe('tally');
    expect(audienceFor(config('_sim-confidence'), 'sure').key).toBe('tally');
  });

  it('the new lines are in every language table', () => {
    for (const lang of ['es', 'fr', 'de', 'pt', 'it']) {
      expect(translate(lang, 'Two classmates will read this.')).not.toBe('Two classmates will read this.');
      expect(translate(lang, 'The classmate who wrote it gets this back.')).not.toBe('The classmate who wrote it gets this back.');
    }
  });
});

describe('the hot seat moves', () => {
  const players = ['a', 'b', 'c', 'd'].map(id => ({ id, name: id.toUpperCase() }));
  const items = players.map(p => ({ playerId: p.id, text: 'Q from ' + p.id }));

  it('four questions under a turn of five still go to two students', () => {
    const plan = planHotSeat({ items, players, firstId: 'b', rotateEvery: 5, rand: () => 0.3 });
    expect(new Set(plan.seats.map(s => s.id)).size).toBe(2);
    expect(plan.turns.map(t => t.of)).toEqual([2, 2, 2, 2]);
    plan.items.forEach((it, k) => expect(it.playerId).not.toBe(plan.seats[k].id));
  });

  it('a long list keeps the teacher\'s turn', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ playerId: players[i % 4].id, text: 'Q' + i }));
    const plan = planHotSeat({ items: many, players, firstId: 'a', rotateEvery: 3, rand: () => 0.3 });
    expect(plan.turns.slice(0, 3).map(t => t.of)).toEqual([3, 3, 3]);
  });

  it('the Simple view shows the turn as a number to change', () => {
    const sv = read('screens/designer/simple-view.js');
    expect(sv).toContain('function seatFact(phase)');
    expect(sv).toContain('phase.rotateEvery = Math.min(v, 20)');
  });
});

describe('the vote asks its own question', () => {
  it('every vote-start payload carries the question', () => {
    const vote = read('engine/phase-handlers/vote.js');
    expect((vote.match(/question: voteQuestion\(ctx\)/g) || []).length).toBe(5);
  });
  it('both screens put it up in place of the stock title', () => {
    expect(read('screens/player/player.js')).toContain("if (currentVoteQuestion) setRichText(voteTitle, currentVoteQuestion);");
    expect(read('screens/host/host.js')).toContain('if (hasQuestion) setRichText(voteModeDisplay, question);');
  });
});

describe('the projector never shows an empty card', () => {
  it('drops a line that is only the per-student placeholder', () => {
    expect(withoutPlaceholderLines('Give them two stars and a wish.\n\n“…”')).toBe('Give them two stars and a wish.');
    expect(withoutPlaceholderLines('Find your match.\n\n**…**')).toBe('Find your match.');
    expect(withoutPlaceholderLines('Wait… what?')).toBe('Wait… what?');
  });
});

describe('the feedback return on the projector', () => {
  it('a quoted return has its own line, never "who got the best surprise"', () => {
    const reveal = read('engine/phase-handlers/reveal.js');
    expect(reveal).toContain("phase.chainQuoted === true ? FEEDBACK_HOST_CONTENT : OWN_HOST_CONTENT");
    expect(reveal).toContain('ownHostLine(phase, sc)');
  });
});

describe('a second reader\'s pretend answers', () => {
  it('a set that answers the first comment is dropped on read', () => {
    const bad = { ...feedback, sampleAnswers: { 'feedback-2': { respondsTo: 'feedback', lines: ['a', 'b'] } } };
    const good = { ...feedback, sampleAnswers: { 'feedback-2': { respondsTo: 'draft', lines: ['a', 'b'] } } };
    expect(hasMisreadSecondReader(bad)).toBe(true);
    expect(hasMisreadSecondReader(good)).toBe(false);
  });
  it('the writer is told the second reader answers the draft', () => {
    expect(read('services/ai-service.js')).toContain("p.showOriginal === true ? chainOriginId(phases, p.rotateFrom) : p.rotateFrom");
  });
});

describe('a late joiner reaches every name list', () => {
  it('the update handler never reads the game-started local collectMode', () => {
    const js = read('screens/player/player.js');
    const start = js.indexOf("socket.on('classmates-update'");
    const body = js.slice(start, js.indexOf('});', start));
    expect(start).toBeGreaterThan(-1);
    expect(body).not.toMatch(/collectMode\s*[!=]==/);
  });
});
