/**
 * The hot seat (2026-10-01, the mechanics inventory's Part 3; reworked the
 * same day on the owner's call: "a lot to send everyone's question to one
 * student ... then the hot seat changes"; "the question should go to the
 * person in the hot seat and also be displayed on the projector"). A
 * reveal-one with `to` and `rotateEvery` hands the class's questions out
 * one at a time, each on the projector and every screen with who answers,
 * the seat moving every few questions (engine/phases/hot-seat.js).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { hotSeatFor, hotSeatItem } from '../../engine/phase-handlers/reveal-one.js';
import { planHotSeat, rankedFromScores } from '../../engine/phases/hot-seat.js';
import { validate } from '../../engine/game-loader.js';
import { STRINGS } from '../../engine/i18n/index.js';
import { STORYBOARD_BRICKS, validateSuggestions } from '../../engine/suggest-validate.js';
import '../../screens/shared/step-suggestions.js';

const S = globalThis.StepSuggestions;
const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };

function ctxWith(to, resolved) {
  const players = [{ id: 's1', name: 'Maya' }, { id: 's2', name: 'Jordan  Lee' }];
  return {
    phase: { id: 'seat', to },
    engine: { players: { list: () => players } },
    resolveTemplate: () => resolved
  };
}

describe('hot seat: who sits first', () => {
  it('matches a player id, then a name with case and spaces ignored', () => {
    expect(hotSeatFor(ctxWith('{{pick.winner}}', 's2'))).toEqual({ id: 's2', name: 'Jordan  Lee' });
    expect(hotSeatFor(ctxWith('{{pick.winnerText}}', ' maya '))).toEqual({ id: 's1', name: 'Maya' });
  });

  it('no `to`, or nobody matches: no first seat', () => {
    expect(hotSeatFor(ctxWith(undefined, ''))).toBeNull();
    expect(hotSeatFor(ctxWith('{{pick.winnerText}}', 'Nobody'))).toBeNull();
  });
});

describe('hot seat: the plan', () => {
  const players = ['a', 'b', 'c', 'd'].map(id => ({ id, name: id.toUpperCase() }));
  const q = (author, n) => ({ playerId: author, text: `Q${n} from ${author}` });

  it('the seat moves every N questions, first seat first, then the vote order', () => {
    const items = [q('a', 1), q('b', 2), q('c', 3), q('d', 4), q('a', 5), q('b', 6)];
    const plan = planHotSeat({ items, players, firstId: 'c', rotateEvery: 2, ranked: ['c', 'a'], rand: seq([0.1]) });
    expect(plan.seats.map(s => s.id)).toEqual(['c', 'c', 'a', 'a', plan.seats[4].id, plan.seats[4].id]);
    expect(['b', 'd']).toContain(plan.seats[4].id);
    expect(plan.turns).toEqual([{ turn: 1, of: 2 }, { turn: 2, of: 2 }, { turn: 1, of: 2 }, { turn: 2, of: 2 }, { turn: 1, of: 2 }, { turn: 2, of: 2 }]);
  });

  it('nobody answers their own question when a swap can avoid it', () => {
    for (let t = 0; t < 20; t++) {
      const items = [q('a', 1), q('a', 2), q('b', 3), q('c', 4), q('d', 5), q('b', 6)];
      const plan = planHotSeat({ items, players, firstId: 'a', rotateEvery: 2 });
      plan.items.forEach((it, k) => expect(it.playerId).not.toBe(plan.seats[k].id));
      expect(plan.items).toHaveLength(6);
    }
  });

  it('one seat throughout without rotateEvery, its own question left out', () => {
    const plan = planHotSeat({ items: [q('a', 1), q('b', 2), q('c', 3)], players, firstId: 'a' });
    expect(plan.items.map(i => i.playerId)).toEqual(['b', 'c']);
    expect(plan.seats.every(s => s.id === 'a')).toBe(true);
    expect(plan.turns).toEqual([{ turn: 1, of: 2 }, { turn: 2, of: 2 }]);
  });

  it('the last run counts only the questions left; more turns than students wrap', () => {
    const items = Array.from({ length: 5 }, (_, i) => ({ text: 'Q' + i }));
    const plan = planHotSeat({ items, players: players.slice(0, 2), firstId: 'a', rotateEvery: 2 });
    expect(plan.seats.map(s => s.id)).toEqual(['a', 'a', 'b', 'b', 'a']);
    expect(plan.turns[4]).toEqual({ turn: 1, of: 1 });
  });

  it('vote order: most votes first, nobody with none', () => {
    expect(rankedFromScores({ a: 1, b: 3, c: 0, d: 2 })).toEqual(['b', 'd', 'a']);
  });

  it('a question as a screen gets it: words, who answers, the turn, and mine for the seat', () => {
    const state = { items: ['Why?', 'How?'], seatPlan: [{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Ben' }], turns: [{ turn: 1, of: 1 }, { turn: 1, of: 1 }] };
    expect(hotSeatItem(state, 1, null)).toEqual({ item: 'How?', index: 2, total: 2, hotSeat: 'Ben', turn: 1, turns: 1, mine: false });
    expect(hotSeatItem(state, 1, 'b').mine).toBe(true);
  });
});

describe('hot seat: the rooms and the screens', () => {
  it('the handler plans the seats and the server sends every question to every screen', () => {
    expect(read('engine/phase-handlers/reveal-one.js')).toMatch(/plan = planHotSeat\(\{/);
    const src = read('server.js');
    expect(src).toMatch(/io\.to\(code\)\.except\(seatId\)\.emit\(EVENTS\.REVEAL_ONE_ITEM, hotSeatItem\(state, i, null\)\);/);
    expect(src).toMatch(/io\.to\(seatId\)\.emit\(EVENTS\.REVEAL_ONE_ITEM, hotSeatItem\(state, i, seatId\)\);/);
  });

  it('the projector and the screens label each question, in every language', () => {
    expect(read('screens/host/host.js')).toMatch(/UiLang\.t\('For \{name\} \(\{turn\} of \{turns\}\)'\)/);
    const player = read('screens/player/player.js');
    expect(player).toMatch(/UiLang\.t\('Your question \(\{turn\} of \{turns\}\)'\)/);
    expect(player).toMatch(/UiLang\.t\('First in the hot seat: \{name\}'\)/);
    for (const [lang, table] of Object.entries(STRINGS)) {
      for (const k of ['For {name} ({turn} of {turns})', 'Your question ({turn} of {turns})', 'First in the hot seat: {name}', 'You are first in the hot seat.']) {
        expect(table[k], `${lang}: ${k}`).toBeTruthy();
      }
      expect(table['{index} of {total} sent to {name}'], lang).toBeUndefined();
    }
  });
});

describe('hot seat: the brick', () => {
  const order = (config) => { const out = []; let id = 'lobby'; while (id) { out.push(id); id = config.phases[id].next || config.phases[id].approveNext; } return out; };

  it('random: questions, the teacher\'s look, then the seat moving every three', () => {
    const { config, problems } = S.compileStoryboard({ name: 'H', steps: [{ brick: 'hotseat', text: 'Ask the hot seat one question.' }, { brick: 'end', text: 'Bye' }] });
    expect(problems).toEqual([]);
    const ids = order(config);
    expect(ids.map(i => config.phases[i].type)).toEqual(['lobby', 'collect', 'preview', 'reveal-one', 'end']);
    expect(config.phases[ids[3]]).toMatchObject({ to: '{{players.random}}', rotateEvery: 3, message: 'Your classmates ask:' });
    expect(config.phases[ids[3]].seatOrderFrom).toBeUndefined();
    expect(validate({ name: 'H', description: 'h', phases: config.phases }, 'h1', { returnResults: true }).errors).toEqual([]);
  });

  it('vote: the class votes first, the seat moves in vote order, perSeat sets the run', () => {
    const { config, problems } = S.compileStoryboard({ name: 'H', steps: [{ brick: 'hotseat', pick: 'vote', voteText: 'Who plays Brian?', text: 'Ask Brian.', perSeat: 2 }, { brick: 'end', text: 'Bye' }] });
    expect(problems).toEqual([]);
    const ids = order(config);
    expect(ids.map(i => config.phases[i].type)).toEqual(['lobby', 'vote', 'reveal', 'collect', 'preview', 'reveal-one', 'end']);
    expect(config.phases[ids[2]].template).toMatch(/^First in the hot seat:/);
    expect(config.phases[ids[5]]).toMatchObject({ to: '{{' + ids[1] + '.winnerText}}', rotateEvery: 2, seatOrderFrom: ids[1] });
    expect(validate({ name: 'H', description: 'h', phases: config.phases }, 'h2', { returnResults: true }).errors).toEqual([]);
  });

  it('the validator passes it, the prompts and the plan dialog describe the rotating seat', () => {
    expect(STORYBOARD_BRICKS).toContain('hotseat');
    const { suggestions } = validateSuggestions([{ kind: 'storyboard', storyboard: { name: 'X', steps: [
      { brick: 'hotseat', pick: 'vote', voteText: 'Who?', text: 'Ask.', perSeat: 4 }, { brick: 'end', text: 'Bye' }
    ] } }], { gameIds: [], recipes: {} });
    expect(suggestions[0].storyboard.steps[0]).toMatchObject({ brick: 'hotseat', pick: 'vote', perSeat: 4 });
    const src = read('services/ai-service.js');
    expect(src).toMatch(/- hotseat: students take turns answering the class's questions out loud/);
    expect(src).toMatch(/THE HOT SEAT \(items answered by one student at a time\)/);
    expect(src).not.toMatch(/3 of 7 sent to Maya/);
    expect(read('screens/designer/designer.js')).toMatch(/a new student takes the seat every/);
    expect(read('screens/shared/phase-names.js')).toMatch(/'hotseat': 'Hot seat'/);
  });
});
