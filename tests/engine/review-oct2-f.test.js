/**
 * A reviewer's four findings on jamyard.org (2026-10-02, items 51 to 54):
 * Doodle Bluff's report kept only the last round, after the leaderboard,
 * with no question over the drawings, an internal "For each answer"
 * heading, and the points twice; One More Thing's pretend answers on a
 * copy were the keyword bot's ("A missing point", "Homework should be
 * banned"); two pretend students wrote the same fake title, so the ballot
 * had one option fewer.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { buildActivityReport } from '../../engine/report.js';
import { PlayerRegistry } from '../../engine/player-registry.js';
import { GameEngine } from '../../engine/game-engine.js';
import { foreachRoundOf, foreachRounds } from '../../engine/phases/foreach-rounds.js';
import { foolPoints, authorsByTextOf } from '../../engine/phases/bluff-scoring.js';
import { AIService } from '../../services/ai-service.js';
import '../../screens/shared/bot-brain.js';

const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const doodle = JSON.parse(read('games/doodle-bluff/config.json'));
const omt = JSON.parse(read('games/one-more-thing/config.json'));

const STROKES = [{ color: '#000', points: [[0, 0], [1, 1]] }];

function doodleRoom() {
  const players = new PlayerRegistry();
  players.add('p1', 'Ada', 't1');
  players.add('p2', 'Ben', 't2');
  players.add('p3', 'Cy', 't3');
  const phases = JSON.parse(JSON.stringify(doodle.phases));
  // what the engine injects while the rounds run (always after every real step)
  phases['_fe:rounds:titles'] = { ...phases.rounds.subPhases.titles, id: '_fe:rounds:titles' };
  phases['_fe:rounds:guess'] = { ...phases.rounds.subPhases.guess, id: '_fe:rounds:guess' };
  phases['_fe:rounds:_advance'] = { type: '_foreach_advance' };
  const round = (n, truth, fake) => ({
    titles: { responses: [{ playerId: 'p3', name: 'Cy', text: fake }] },
    guess: {
      responses: [{ playerId: 'p3', name: 'Cy', choice: truth, text: truth }],
      tally: { [truth]: 1 }, correctAnswer: truth, scores: { p3: 100 }
    }
  });
  const r1 = round(1, 'a cat running for mayor', 'a dog at the dentist');
  const r2 = round(2, 'an octopus learning to knit', 'a squid doing yoga');
  const phaseData = {
    phrases: { responses: [{ playerId: 'p1', name: 'Ada', text: 'a cat running for mayor' }] },
    draw: { responses: [
      { playerId: 'p1', name: 'Ada', text: '[drawing]', drawing: STROKES, assigned: 'an octopus learning to knit' },
      { playerId: 'p2', name: 'Ben', text: '[drawing]', drawing: STROKES, assigned: 'a cat running for mayor' }
    ] },
    rounds: { scores: { p3: 200 }, itemCount: 2, skipped: [] },
    scoreboard: { standings: [{ rank: 1, name: 'Cy', playerId: 'p3', score: 200 }] },
    // the last round, under the injected ids
    '_fe:rounds:titles': r2.titles, '_fe:rounds:guess': r2.guess,
    // every round's own copy
    '_fe:rounds:titles@1': r1.titles, '_fe:rounds:guess@1': r1.guess,
    '_fe:rounds:titles@2': r2.titles, '_fe:rounds:guess@2': r2.guess
  };
  const foreachState = { rounds: { currentIndex: 1, items: [
    { playerId: 'p2', name: 'Ben', drawing: STROKES, assigned: 'a cat running for mayor' },
    { playerId: 'p1', name: 'Ada', drawing: STROKES, assigned: 'an octopus learning to knit' }
  ] } };
  return { config: { name: 'Doodle Bluff', phases }, phaseData, players, foreachState };
}

describe('51: every For Each round is kept and reported in order', () => {
  it('the engine keeps a copy of each round of a round step', () => {
    const engine = new GameEngine(doodle);
    engine.foreachState.rounds = { currentIndex: 0, items: [{}, {}] };
    engine.storePhaseData('_fe:rounds:titles', { responses: ['one'] });
    engine.foreachState.rounds.currentIndex = 1;
    engine.storePhaseData('_fe:rounds:titles', { responses: ['two'] });
    expect(engine.phaseData['_fe:rounds:titles@1']).toEqual({ responses: ['one'] });
    expect(engine.phaseData['_fe:rounds:titles@2']).toEqual({ responses: ['two'] });
    expect(engine.phaseData['_fe:rounds:titles']).toEqual({ responses: ['two'] });
    // a top-level step and the advance marker never get round copies
    engine.storePhaseData('phrases', { responses: [] });
    expect(Object.keys(engine.phaseData).filter(k => k.startsWith('phrases@'))).toEqual([]);
    expect(foreachRoundOf('_fe:rounds:_advance', engine.foreachState)).toBeNull();
    expect(foreachRounds(engine.phaseData, 'rounds', ['titles', 'guess']).map(r => r.round)).toEqual([1, 2]);
  });

  it('the report lists both rounds, in order, before the leaderboard', () => {
    const report = buildActivityReport(doodleRoom());
    const order = report.sections.map(s => s.id + (s.round ? '@' + s.round : ''));
    expect(order).toEqual([
      'phrases', 'draw', 'rounds',
      '_fe:rounds:titles@1', '_fe:rounds:guess@1',
      '_fe:rounds:titles@2', '_fe:rounds:guess@2',
      'scoreboard'
    ]);
    const round1 = report.sections.find(s => s.id === '_fe:rounds:titles' && s.round === 1);
    // the drawing the round was about, with what it was drawn from, on top
    expect(round1.blocks[0].items[0]).toMatchObject({ name: 'Ben', assigned: 'a cat running for mayor' });
    expect(JSON.stringify(round1)).toContain('a dog at the dentist');
  });
});

describe('52: the drawings have their question, no internal heading, the points once', () => {
  const report = buildActivityReport(doodleRoom());

  it('the drawing step keeps its question, the handed phrase said in words', () => {
    const draw = report.sections.find(s => s.id === 'draw');
    expect(draw.heading).toMatch(/^Draw this: what each student was handed/);
    expect(draw.blocks[0].items[0].assigned).toBe('an octopus learning to knit');
    expect(read('screens/teacher/report.js')).toContain("'Drawn from: ' + item.assigned");
  });

  it('the rounds read as Rounds, and the points table is the leaderboard\'s alone', () => {
    const rounds = report.sections.find(s => s.id === 'rounds');
    expect(rounds.kindLabel).toBe('Rounds');
    expect(rounds.blocks.some(b => b.kind === 'table')).toBe(false);
    const pointTables = report.sections.flatMap(s => s.blocks)
      .filter(b => b.kind === 'table' && b.columns.includes('Points'));
    expect(pointTables).toHaveLength(1);
  });
});

describe('53: One More Thing\'s pretend answers', () => {
  it('the template\'s add-a-line answers match the list on screen', () => {
    const s = omt.sampleAnswers;
    for (let seat = 0; seat < s.recall.length; seat++) {
      const k = (seat + 3) % s.recall.length; // a classmate's list, not their own
      const screen = omt.phases['add-one'].prompt + '\n' + s.recall[k];
      expect(globalThis.pickSampleAnswer(s, 'add-one', screen, seat)).toBe(s['add-one'].lines[k]);
      const grown = omt.phases['add-again'].prompt + '\n' + s.recall[k] + '\n' + s['add-one'].lines[k];
      expect(globalThis.pickSampleAnswer(s, 'add-again', grown, seat)).toBe(s['add-again'].lines[k]);
    }
  });

  it('a copy\'s written set covers the add-a-line steps, answering the list they add to', async () => {
    const service = new AIService({ mode: 'real' });
    let prompt = '';
    const recall = ['a', 'b', 'c'].map(x => 'list ' + x);
    service._callClaude = async (params) => {
      prompt = params.messages[0].content;
      return { content: [{ type: 'text', text: JSON.stringify({
        recall, 'add-one': ['one more a', 'one more b', 'one more c'], 'add-again': ['again a', 'again b', 'again c']
      }) }] };
    };
    const { sampleAnswers } = await service.writeSampleAnswers({ config: omt, seats: 3 });
    expect(prompt).toContain('step "add-one"');
    expect(prompt).toMatch(/ADDS one line under it/);
    expect(sampleAnswers['add-one']).toEqual({ respondsTo: 'recall', lines: ['one more a', 'one more b', 'one more c'] });
    expect(sampleAnswers['add-again']).toEqual({ respondsTo: 'add-one', lines: ['again a', 'again b', 'again c'] });
  });

  it('Add sample answers waits for a set still being written', () => {
    const js = read('screens/prototype/prototype.js');
    expect(js).toContain('if (!currentSamples && samplesWriting) {');
    expect(js).toContain('Promise.race([waitFor,');
  });
});

describe('54: pretend students never send the same fake', () => {
  it('a keyword answer is dealt by seat: eight seats, eight different titles', () => {
    const prompt = doodle.phases.rounds.subPhases.titles.prompt;
    for (const salt of [3, 17, 42]) {
      const lines = Array.from({ length: 8 }, (_, seat) => globalThis.botAnswerFor(prompt, { seat, salt }));
      expect(new Set(lines).size).toBe(8);
    }
    // without a seat it still answers
    expect(typeof globalThis.botAnswerFor(prompt)).toBe('string');
  });

  it('the student screen passes its seat and the step id', () => {
    const js = read('screens/player/player.js');
    expect(js).toContain('botAnswerFor(promptText, botFillSeat === null ? undefined : { seat: botFillSeat, salt: latestPhaseInstanceId })');
    expect(js).toContain("botFillSeat = typeof e.data.seat === 'number' ? e.data.seat : null;");
  });

  it('two students with the same fake share its option and both earn its points', () => {
    const authors = authorsByTextOf([
      { playerId: 'p1', text: 'A ghost doing laundry' },
      { playerId: 'p2', text: 'a ghost doing laundry ' }
    ]);
    expect(authors).toEqual({ 'a ghost doing laundry': ['p1', 'p2'] });
    const scores = foolPoints({
      responses: [{ playerId: 'p3', choice: 'A ghost doing laundry' }, { playerId: 'p1', choice: 'A ghost doing laundry' }],
      authorsByText: authors, correctAnswer: 'the truth', pointsPerFool: 50
    });
    // p3 fooled by both; p1 picking a text p2 also wrote pays p2 only
    expect(scores).toEqual({ p1: 50, p2: 100 });
  });
});
