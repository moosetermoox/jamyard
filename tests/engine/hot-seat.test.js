/**
 * The hot seat (2026-10-01, the mechanics inventory's Part 3): a
 * reveal-one with `to` sends every item to ONE student's screen while the
 * projector and the class see only the count; the hotseat brick wires a
 * question step, the teacher's look, and that reveal (after a vote over
 * the students when pick is "vote").
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { hotSeatFor } from '../../engine/phase-handlers/reveal-one.js';
import { validate } from '../../engine/game-loader.js';
import { STRINGS } from '../../engine/i18n/index.js';
import { STORYBOARD_BRICKS, validateSuggestions } from '../../engine/suggest-validate.js';
import '../../screens/shared/step-suggestions.js';

const S = globalThis.StepSuggestions;
const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

function ctxWith(to, resolved) {
  const players = [{ id: 's1', name: 'Maya' }, { id: 's2', name: 'Jordan  Lee' }];
  return {
    phase: { id: 'seat', to },
    engine: { players: { list: () => players } },
    resolveTemplate: () => resolved
  };
}

describe('hot seat: who sits in it', () => {
  it('matches a player id, then a name with case and spaces ignored', () => {
    expect(hotSeatFor(ctxWith('{{pick.winner}}', 's2'))).toEqual({ id: 's2', name: 'Jordan  Lee' });
    expect(hotSeatFor(ctxWith('{{pick.winnerText}}', ' maya '))).toEqual({ id: 's1', name: 'Maya' });
    expect(hotSeatFor(ctxWith('{{pick.winnerText}}', 'jordan lee'))).toEqual({ id: 's2', name: 'Jordan  Lee' });
  });

  it('no `to`, or nobody matches: an ordinary reveal for everyone', () => {
    expect(hotSeatFor(ctxWith(undefined, ''))).toBeNull();
    expect(hotSeatFor(ctxWith('{{pick.winnerText}}', 'Nobody'))).toBeNull();
  });
});

describe('hot seat: the rooms and the screens', () => {
  it('the handler leaves the seat\'s own item out and tells each screen who sits', () => {
    const src = read('engine/phase-handlers/reveal-one.js');
    expect(src).toMatch(/if \(seat\) items = items\.filter\(it => !\(it && typeof it === 'object' && it\.playerId === seat\.id\)\);/);
    expect(src).toMatch(/inHotSeat: !!\(seat && seat\.id === player\.id\)/);
    expect(src).toMatch(/item: hidden \? null : roState\.items\[ri\]/);
  });

  it('the next press sends the words to the seat only, the count to the rest', () => {
    const src = read('server.js');
    expect(src).toMatch(/io\.to\(code\)\.except\(state\.hotSeatId\)\.emit\(EVENTS\.REVEAL_ONE_ITEM, \{\s+item: null, index: state\.revealed, total: state\.items\.length, hotSeat: state\.hotSeatName/);
    expect(src).toMatch(/io\.to\(state\.hotSeatId\)\.emit\(EVENTS\.REVEAL_ONE_ITEM, \{\s+item, index/);
  });

  it('the projector and the class show the count, the seat is told, in every language', () => {
    expect(read('screens/host/host.js')).toMatch(/UiLang\.t\('\{index\} of \{total\} sent to \{name\}'\)/);
    const player = read('screens/player/player.js');
    expect(player).toMatch(/UiLang\.t\('You are in the hot seat\. The questions come to your screen\.'\)/);
    expect(player).toMatch(/showHotSeatCount\(index, total, hotSeat\)/);
    for (const [lang, table] of Object.entries(STRINGS)) {
      expect(table['{index} of {total} sent to {name}'], lang).toBeTruthy();
      expect(table['You are in the hot seat. The questions come to your screen.'], lang).toBeTruthy();
    }
  });
});

describe('hot seat: the brick', () => {
  const order = (config) => { const out = []; let id = 'lobby'; while (id) { out.push(id); id = config.phases[id].next || config.phases[id].approveNext; } return out; };

  it('random: questions, the teacher\'s look, then one student drawn when they go out', () => {
    const { config, problems } = S.compileStoryboard({ name: 'H', steps: [{ brick: 'hotseat', text: 'Ask the hot seat one question.' }, { brick: 'end', text: 'Bye' }] });
    expect(problems).toEqual([]);
    const ids = order(config);
    expect(ids.map(i => config.phases[i].type)).toEqual(['lobby', 'collect', 'preview', 'reveal-one', 'end']);
    const [ask, gate, seat] = [ids[1], ids[2], ids[3]];
    expect(config.phases[gate]).toMatchObject({ approveNext: seat, rejectNext: ask });
    expect(config.phases[seat]).toMatchObject({ from: ask + '.responses', to: '{{players.random}}', message: 'Your classmates ask:' });
    expect(validate({ name: 'H', description: 'h', phases: config.phases }, 'h1', { returnResults: true }).errors).toEqual([]);
  });

  it('vote: the class picks by name first, and the seat follows the pick', () => {
    const { config, problems } = S.compileStoryboard({ name: 'H', steps: [{ brick: 'hotseat', pick: 'vote', voteText: 'Who plays Brian?', text: 'Ask Brian.', heading: 'Brian, the class asks:' }, { brick: 'end', text: 'Bye' }] });
    expect(problems).toEqual([]);
    const ids = order(config);
    expect(ids.map(i => config.phases[i].type)).toEqual(['lobby', 'vote', 'reveal', 'collect', 'preview', 'reveal-one', 'end']);
    expect(config.phases[ids[1]]).toMatchObject({ candidates: 'players', excludeAuthors: true, question: 'Who plays Brian?' });
    expect(config.phases[ids[5]].to).toBe('{{' + ids[1] + '.winnerText}}');
    expect(config.phases[ids[5]].message).toBe('Brian, the class asks:');
    expect(validate({ name: 'H', description: 'h', phases: config.phases }, 'h2', { returnResults: true }).errors).toEqual([]);
  });

  it('needs words to write', () => {
    expect(S.compileStoryboard({ name: 'H', steps: [{ brick: 'hotseat' }, { brick: 'end', text: 'Bye' }] }).problems.join(' ')).toMatch(/the hot seat needs "text"/);
  });

  it('the validator passes it, the prompts and the plan dialog name it', () => {
    expect(STORYBOARD_BRICKS).toContain('hotseat');
    const { suggestions } = validateSuggestions([{ kind: 'storyboard', storyboard: { name: 'X', steps: [
      { brick: 'hotseat', pick: 'vote', voteText: 'Who?', text: 'Ask.' }, { brick: 'end', text: 'Bye' }
    ] } }], { gameIds: [], recipes: {} });
    expect(suggestions[0].storyboard.steps[0]).toMatchObject({ brick: 'hotseat', pick: 'vote', voteText: 'Who?' });
    const src = read('services/ai-service.js');
    expect(src).toMatch(/- hotseat: one student answers the class's questions out loud/);
    expect(src).toMatch(/hotseat \(everyone writes a question, the teacher looks them over/);
    expect(src).toMatch(/a hot seat \(the class's questions to one student\) is hotseat\./);
    expect(src).toMatch(/THE HOT SEAT \(items to one student's screen\)/);
    expect(read('screens/designer/designer.js')).toMatch(/step\.brick === 'hotseat'/);
    expect(read('screens/shared/phase-names.js')).toMatch(/'hotseat': 'Hot seat'/);
  });
});
