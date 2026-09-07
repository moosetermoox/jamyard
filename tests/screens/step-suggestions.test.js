/**
 * Builder suggestion engine — the load-bearing rule is HOSTABLE-AS-IS:
 * every step the + button can land, in every context it can land in, must
 * pass the real validator with zero edits. A suggestion that needs typing
 * before it works is a bug.
 */

import { describe, it, expect } from 'vitest';
import '../../screens/shared/step-suggestions.js';
import { validate } from '../../engine/game-loader.js';

const S = globalThis.StepSuggestions;

function validateGame(phases, label) {
  const config = {
    name: 'Suggestion Test',
    description: 'built by the suggestion engine test',
    phases
  };
  const result = validate(config, 'suggestion-test', { returnResults: true });
  const errors = result.errors.map(e => (typeof e === 'string' ? e : e.message));
  expect(errors, `${label} should be hostable as-is`).toEqual([]);
}

function baseGame() {
  return {
    lobby: { type: 'lobby', next: 'ask' },
    ask: { type: 'collect', prompt: 'What did you learn today?', timer: 60, next: 'end' },
    end: { type: 'end', message: 'Done!' }
  };
}

describe('ordering + ids', () => {
  it('orders phases by the next-chain from lobby', () => {
    const phases = baseGame();
    expect(S.orderedPhaseIds(phases)).toEqual(['lobby', 'ask', 'end']);
  });

  it('still lists unreachable phases at the end', () => {
    const phases = baseGame();
    phases.stray = { type: 'announce', message: 'hi' };
    expect(S.orderedPhaseIds(phases)).toEqual(['lobby', 'ask', 'end', 'stray']);
  });

  it('freshId avoids collisions', () => {
    const phases = { reveal: {}, 'reveal-2': {} };
    expect(S.freshId(phases, 'reveal')).toBe('reveal-3');
    expect(S.freshId(phases, 'vote')).toBe('vote');
  });
});

describe('every opening suggestion is hostable as-is', () => {
  for (const sug of S.suggestOpening()) {
    it(`opening: ${sug.type}`, () => {
      const phases = { lobby: { type: 'lobby', next: 'first' } };
      const phase = S.defaultPhaseFor(sug.type, { phases });
      expect(phase, `no default builder for ${sug.type}`).toBeTruthy();
      phase.next = 'end';
      phases.first = phase;
      phases.end = { type: 'end', message: 'Done!' };
      validateGame(phases, `opening ${sug.type}`);
    });
  }
});

describe('every after-collect suggestion is hostable as-is', () => {
  const ctx = () => ({ phases: baseGame(), afterId: 'ask' });
  for (const sug of S.suggestAfter('collect', { phases: baseGame(), afterId: 'ask' })) {
    if (sug.type === 'ai') continue; // pairs tested separately
    if (sug.type === 'guessing-rounds') continue; // composite, tested separately
    it(`after collect: ${sug.type}`, () => {
      const c = ctx();
      const phase = S.defaultPhaseFor(sug.type, c);
      expect(phase, `no default builder for ${sug.type}`).toBeTruthy();
      const id = S.freshId(c.phases, 'step-' + sug.type);
      S.insertAfter(c.phases, 'ask', id, phase);
      validateGame(c.phases, `after-collect ${sug.type}`);
    });
  }
});

describe('suggestions without answers never point at answers', () => {
  it('no vote/ai suggestions after a reveal when nothing was collected', () => {
    const phases = {
      lobby: { type: 'lobby', next: 'intro' },
      intro: { type: 'announce', message: 'welcome', next: 'end' },
      end: { type: 'end', message: 'bye' }
    };
    const sugs = S.suggestAfter('announce', { phases, afterId: 'intro' });
    expect(sugs.some(s => s.ai)).toBe(false);
  });

  it('reveal default without a collect upstream uses static text', () => {
    const phases = { lobby: { type: 'lobby', next: 'end' }, end: { type: 'end' } };
    const phase = S.defaultPhaseFor('reveal', { phases });
    expect(phase.template).not.toContain('{{');
  });
});

describe('AI pair', () => {
  it('lands as ai-process + reveal, both hostable as-is', () => {
    const phases = baseGame();
    for (const flavor of S.aiFlavors()) {
      const test = JSON.parse(JSON.stringify(phases));
      const pair = S.buildAiPair(flavor, { phases: test, afterId: 'ask' });
      expect(pair, `${flavor.key} should build a pair`).toBeTruthy();
      expect(pair).toHaveLength(2);
      S.insertAfter(test, 'ask', pair[0].id, pair[0].phase);
      S.insertAfter(test, pair[0].id, pair[1].id, pair[1].phase);
      validateGame(test, `ai flavor ${flavor.key}`);
    }
  });

  it('refuses to build when no answers exist upstream', () => {
    const phases = { lobby: { type: 'lobby', next: 'end' }, end: { type: 'end' } };
    expect(S.buildAiPair(S.aiFlavors()[0], { phases })).toBeNull();
  });

  it('every flavor carries real instructions', () => {
    for (const flavor of S.aiFlavors()) {
      expect(flavor.instructions.length).toBeGreaterThan(40);
      expect(flavor.title.length).toBeGreaterThan(3);
    }
  });
});

describe('arc detection gates the wrap-up', () => {
  it('no arc: ask without show', () => {
    expect(S.hasArc(baseGame())).toBe(false);
  });

  it('arc: ask + reveal', () => {
    const phases = baseGame();
    phases.show = { type: 'reveal', template: 'here it is' };
    expect(S.hasArc(phases)).toBe(true);
  });

  it('wrap-up tile appears only with an arc and leads the row', () => {
    const noArc = S.suggestAfter('collect', { phases: baseGame(), afterId: 'ask' });
    expect(noArc.some(s => s.type === 'end')).toBe(false);

    const phases = baseGame();
    delete phases.end; // building in progress, no end yet
    phases.ask.next = 'show';
    phases.show = { type: 'reveal', template: 'answers!' };
    const withArc = S.suggestAfter('reveal', { phases, afterId: 'show' });
    expect(withArc[0].type).toBe('end');
    expect(withArc[0].feelsComplete).toBe(true);
  });

  it('wrap-up never offered twice', () => {
    const phases = baseGame();
    phases.show = { type: 'reveal', template: 'answers!' };
    const sugs = S.suggestAfter('reveal', { phases, afterId: 'show' });
    expect(sugs.some(s => s.type === 'end')).toBe(false); // end already exists
  });

  it('end default is hostable', () => {
    const phases = baseGame();
    phases.ask.next = 'wrap';
    phases.wrap = S.defaultPhaseFor('end', { phases });
    delete phases.end;
    validateGame(phases, 'wrap-up');
  });
});

describe('guessing-rounds brick', () => {
  it('after a plain collect: shows text, reveals the author, hostable as-is', () => {
    const phases = baseGame();
    const rounds = S.buildGuessingRounds({ phases, afterId: 'ask' });
    expect(rounds).toBeTruthy();
    expect(rounds.phase.type).toBe('foreach');
    expect(rounds.phase.subPhases.show.message).toContain('{{_current.text}}');
    S.insertAfter(phases, 'ask', rounds.id, rounds.phase);
    validateGame(phases, 'guessing rounds (plain collect)');
  });

  it('after a secret+clue collect: shows the clue, reveals the secret', () => {
    const phases = baseGame();
    phases.ask = S.defaultPhaseFor('collect-two', { phases });
    phases.ask.next = 'end';
    const rounds = S.buildGuessingRounds({ phases, afterId: 'ask' });
    expect(rounds.phase.subPhases.show.message).toContain('{{_current.fields.clue}}');
    expect(rounds.phase.subPhases.reveal.message).toContain('{{_current.fields.secret}}');
    S.insertAfter(phases, 'ask', rounds.id, rounds.phase);
    validateGame(phases, 'guessing rounds (secret+clue)');
  });

  it('refuses without a collect upstream', () => {
    const phases = { lobby: { type: 'lobby', next: 'end' }, end: { type: 'end' } };
    expect(S.buildGuessingRounds({ phases })).toBeNull();
  });

  // 2026-09-07: "share a fear, guess who shared what" had no brick. The
  // typed-guess rounds guess the SECRET; guess:'who' compiles the Who Said
  // It? shape (roster choices + decoys, author revealed), no points.
  it('guess "who": roster choices with decoys, the author revealed, no scores', () => {
    const phases = baseGame();
    const rounds = S.buildGuessingRounds({ phases, afterId: 'ask', guess: 'who' });
    expect(rounds.phase.type).toBe('foreach');
    expect(rounds.phase.candidateSource).toBe('players');
    expect(rounds.phase.decoyCount).toBeGreaterThanOrEqual(2);
    expect(rounds.phase.subPhases.guess.type).toBe('collect-choice');
    expect(rounds.phase.subPhases.guess.choices).toBe('_candidates');
    expect(rounds.phase.subPhases.guess.prompt).toContain('{{_current.text}}');
    expect(rounds.phase.subPhases.reveal.message).toContain('{{_current.playerName}}');
    expect(rounds.phase.scoring).toBeUndefined();
    S.insertAfter(phases, 'ask', rounds.id, rounds.phase);
    validateGame(phases, 'guessing rounds (guess who)');
  });

  it('guess "who" after a secret+clue collect shows the clue and reveals both', () => {
    const phases = baseGame();
    phases.ask = S.defaultPhaseFor('collect-two', { phases });
    phases.ask.next = 'end';
    const rounds = S.buildGuessingRounds({ phases, afterId: 'ask', guess: 'who' });
    expect(rounds.phase.subPhases.guess.prompt).toContain('{{_current.fields.clue}}');
    expect(rounds.phase.subPhases.reveal.message).toContain('{{_current.fields.secret}}');
    expect(rounds.phase.subPhases.reveal.message).toContain('{{_current.playerName}}');
    S.insertAfter(phases, 'ask', rounds.id, rounds.phase);
    validateGame(phases, 'guessing rounds (guess who, secret+clue)');
  });
});

// The deal brick (2026-09-07): Story Ingredients' shape as a mechanic.
// Everyone contributes one item per pile, the piles are shuffle-dealt so
// each student holds one item per pile from (usually) different
// classmates, then writes from that hand; the share-out is built in.
describe('deal brick', () => {
  const dealStep = {
    brick: 'deal',
    piles: [
      { label: 'A person', prompt: 'Name a person a story could be about: a lighthouse keeper, your dentist, a retired spy...' },
      { label: 'A circumstance', prompt: 'Name a circumstance: stuck in an elevator, the last day of summer, a power cut mid-exam...' }
    ],
    text: 'Write the opening paragraph of a story that puts your person in your circumstance.',
    timer: 60,
    writeTimer: 300
  };

  it('compiles piles, a shuffle-dealt hand, a writing step, and a share-out, hostable as-is', () => {
    const { config, problems } = S.compileStoryboard({
      name: 'Prompt Generator',
      description: 'People and circumstances, shuffled and dealt.',
      steps: [
        { brick: 'announce', text: 'We are building writing prompts together.' },
        dealStep,
        { brick: 'end', text: 'Every prompt was built by three people.' }
      ]
    });
    expect(problems).toEqual([]);
    const ids = S.orderedPhaseIds(config.phases);
    const types = ids.map(id => config.phases[id].type);
    expect(types).toEqual(['lobby', 'announce', 'collect', 'collect', 'collect', 'reveal-one', 'end']);
    const [, , p1, p2, write, share] = ids;
    expect(config.phases[p1].prompt).toContain('lighthouse keeper');
    expect(config.phases[p1].rotateFrom).toBeUndefined();
    expect(config.phases[p1].timer).toBe(60);
    // Each later step deals the previous pile, shuffled, without showing it (a blind hand-off).
    expect(config.phases[p2].rotateFrom).toBe(p1);
    expect(config.phases[p2].rotateShuffle).toBe(true);
    expect(config.phases[p2].prompt).not.toContain('{{');
    expect(config.phases[write].rotateFrom).toBe(p2);
    expect(config.phases[write].rotateShuffle).toBe(true);
    expect(config.phases[write].prompt).toContain('opening paragraph');
    expect(config.phases[write].prompt).toContain('YOUR PERSON: {{' + p1 + '.assigned}}');
    expect(config.phases[write].prompt).toContain('YOUR CIRCUMSTANCE: {{' + p2 + '.assigned}}');
    expect(config.phases[write].prompt).not.toContain('YOUR A ');
    expect(config.phases[write].timer).toBe(300);
    expect(config.phases[write].simultaneousReveal).toBe(true);
    expect(config.phases[share].from).toBe(write + '.responses');
    expect(config.phases[share].timer).toBeUndefined();
    validateGame(config.phases, 'deal storyboard');
  });

  it('names the pile steps after their labels, uniquely', () => {
    const { config } = S.compileStoryboard({
      name: 'X',
      steps: [
        { brick: 'deal', piles: [{ label: 'A person', prompt: 'p' }, { label: 'A person', prompt: 'q' }, { label: '!!!', prompt: 'r' }], text: 'Write.' },
        { brick: 'end', text: 'Bye' }
      ]
    });
    const ids = S.orderedPhaseIds(config.phases);
    expect(ids.slice(1, 4)).toEqual(['person', 'person-2', 'pile-3']);
    validateGame(config.phases, 'deal ids');
  });

  it('defaults the writing instruction and timers when the AI leaves them out', () => {
    const { config, problems } = S.compileStoryboard({
      name: 'X',
      steps: [{ brick: 'deal', piles: [{ label: 'Hero', prompt: 'p' }, { label: 'Villain', prompt: 'q' }] }, { brick: 'end', text: 'Bye' }]
    });
    expect(problems).toEqual([]);
    const write = Object.values(config.phases).find(p => p.simultaneousReveal);
    expect(write.prompt).toContain('HERO: {{');
    expect(write.timer).toBeGreaterThanOrEqual(120);
    validateGame(config.phases, 'deal defaults');
  });

  it('refuses fewer than two piles and trims past four, in plain sentences', () => {
    const one = S.compileStoryboard({ name: 'X', steps: [{ brick: 'deal', piles: [{ label: 'A', prompt: 'p' }] }, { brick: 'end' }] });
    expect(one.problems.some(p => /deal/.test(p) && /two piles/.test(p))).toBe(true);
    const six = S.compileStoryboard({ name: 'X', steps: [
      { brick: 'deal', piles: ['a', 'b', 'c', 'd', 'e', 'f'].map(l => ({ label: l, prompt: l })) }, { brick: 'end' }
    ] });
    expect(six.problems.some(p => /deal/.test(p) && /four/.test(p))).toBe(true);
    expect(S.orderedPhaseIds(six.config.phases).filter(id => six.config.phases[id].type === 'collect').length).toBe(5);
    validateGame(six.config.phases, 'deal trimmed to four piles');
  });
});

describe('rank brick', () => {
  it('after a collect: the class orders the answers, the order goes on the projector', () => {
    const phases = baseGame();
    const rank = S.defaultPhaseFor('rank', { phases, afterId: 'ask' });
    expect(rank.type).toBe('rank');
    expect(rank.candidates).toBe('ask.responses');
    expect(rank.prompt).toBeTruthy();
    S.insertAfter(phases, 'ask', 'order', rank);
    validateGame(phases, 'rank (from a collect)');
  });

  it('without a collect: no certified default', () => {
    const phases = { lobby: { type: 'lobby', next: 'end' }, end: { type: 'end' } };
    expect(S.defaultPhaseFor('rank', { phases, afterId: 'lobby' })).toBeNull();
  });
});

describe('storyboard compiler', () => {
  it('compiles the Emoji Movies shape to a hostable config', () => {
    const { config, problems } = S.compileStoryboard({
      name: 'Emoji Movies',
      description: 'Guess movies from emoji clues',
      steps: [
        { brick: 'announce', text: 'Think of a movie — you will describe it in emojis only!' },
        { brick: 'collect-two', text: 'Your movie, in emojis!', secretLabel: 'The movie title (secret)', clueLabel: 'Emoji clues only', timer: 120 },
        { brick: 'guessing-rounds' },
        { brick: 'end', text: 'That was Emoji Movies!' }
      ]
    });
    expect(problems).toEqual([]);
    expect(config.name).toBe('Emoji Movies');
    const types = Object.values(config.phases).map(p => p.type);
    expect(types).toContain('foreach');
    const share = Object.values(config.phases).find(p => p.fields);
    expect(share.fields[0].label).toBe('The movie title (secret)');
    const fe = Object.values(config.phases).find(p => p.type === 'foreach');
    expect(fe.subPhases.reveal.message).toContain('{{_current.fields.secret}}');
    validateGame(config.phases, 'emoji movies storyboard');
  });

  it('auto-appends a wrap-up when the storyboard forgets one', () => {
    const { config, problems } = S.compileStoryboard({
      name: 'Quick Ask',
      steps: [{ brick: 'collect', text: 'What did you learn?' }]
    });
    expect(problems).toEqual([]);
    const types = Object.values(config.phases).map(p => p.type);
    expect(types).toContain('end');
    validateGame(config.phases, 'auto-end storyboard');
  });

  // 2026-09-07: the fear activity, brick by brick: share, guess who, then
  // rank them together. Rank compiles to the rank step PLUS a host-paced
  // reveal of the class order (a payoff beat, never timed).
  it('compiles share, guess who, rank to a hostable config', () => {
    const { config, problems } = S.compileStoryboard({
      name: 'Fear Factor',
      description: 'Share a fear, guess whose it is, rank them together.',
      steps: [
        { brick: 'announce', text: 'Everyone shares one fear. Then we guess who shared what.' },
        { brick: 'collect', text: 'What are you most afraid of?', timer: 60 },
        { brick: 'guessing-rounds', guess: 'who' },
        { brick: 'reveal', text: 'Every fear the class shared:' },
        { brick: 'rank', text: 'Put these in order, scariest first.', timer: 90 },
        { brick: 'end', text: 'Brave room.' }
      ]
    });
    expect(problems).toEqual([]);
    const order = S.orderedPhaseIds(config.phases).map(id => config.phases[id].type);
    expect(order).toEqual(['lobby', 'announce', 'collect', 'foreach', 'reveal', 'rank', 'reveal', 'end']);
    const fe = Object.values(config.phases).find(p => p.type === 'foreach');
    expect(fe.candidateSource).toBe('players');
    const rank = Object.values(config.phases).find(p => p.type === 'rank');
    expect(rank.prompt).toBe('Put these in order, scariest first.');
    expect(rank.timer).toBe(90);
    expect(rank.candidates).toBe('ask.responses');
    const orderReveal = config.phases[rank.next];
    expect(orderReveal.type).toBe('reveal');
    expect(orderReveal.template).toContain('{{' + Object.keys(config.phases).find(id => config.phases[id] === rank) + '.rankedList}}');
    expect(orderReveal.timer).toBeUndefined();
    validateGame(config.phases, 'fear factor storyboard');
  });

  it('rank takes a literal items list when nothing was collected', () => {
    const { config, problems } = S.compileStoryboard({
      name: 'Trip Vote',
      steps: [
        { brick: 'rank', text: 'Favorite first.', items: ['Museum', 'Aquarium', 'Zoo'] },
        { brick: 'end', text: 'Decided.' }
      ]
    });
    expect(problems).toEqual([]);
    const rank = Object.values(config.phases).find(p => p.type === 'rank');
    expect(rank.candidates).toEqual(['Museum', 'Aquarium', 'Zoo']);
    validateGame(config.phases, 'rank literal items');
  });

  it('rank with nothing to rank is a plain-sentence problem', () => {
    const { problems } = S.compileStoryboard({
      name: 'X',
      steps: [{ brick: 'rank', text: 'Order these.' }, { brick: 'end', text: 'Bye' }]
    });
    expect(problems.some(p => /rank/i.test(p) && /question step|items/i.test(p))).toBe(true);
  });

  it('reports problems in plain sentences', () => {
    const bad = S.compileStoryboard({
      name: 'X',
      steps: [{ brick: 'guessing-rounds' }, { brick: 'zorp' }]
    });
    expect(bad.problems.length).toBe(2);
    expect(bad.problems[0]).toContain('need a question step');
    expect(bad.problems[1]).toContain('unknown brick');
  });

  // The quiz brick — graded rounds compiled to the proven Speed Quiz shape:
  // collect-choice with correctAnswer + speedBonus, an answer announce per
  // question, then a leaderboard summing every question's scores.
  it('compiles a quiz brick to graded rounds + leaderboard, hostable as-is', () => {
    const { config, problems } = S.compileStoryboard({
      name: 'Conjugation Showdown',
      steps: [
        { brick: 'announce', text: 'Verbs. Speed. Glory.' },
        {
          brick: 'quiz',
          timer: 20,
          questions: [
            { text: 'YO + HABLAR (present)?', choices: ['hablo', 'hablas', 'habla'], correct: 'hablo' },
            { text: 'ELLA + COMER (preterite)?', choices: ['comió', 'come', 'comí'], correct: 'comió' }
          ]
        },
        { brick: 'end', text: 'Adiós!' }
      ]
    });
    expect(problems).toEqual([]);
    const phases = config.phases;
    const graded = Object.entries(phases).filter(([, p]) => p.type === 'collect-choice' && p.correctAnswer);
    expect(graded.length).toBe(2);
    for (const [, p] of graded) {
      expect(p.pointsCorrect).toBe(1000);
      expect(p.speedBonus).toBe(true);
      expect(p.timer).toBe(20);
      expect(p.choices).toContain(p.correctAnswer);
    }
    // Each question is followed by an announce that shows the answer + bar chart.
    for (const [id, p] of graded) {
      const reveal = phases[p.next];
      expect(reveal.type).toBe('announce');
      expect(reveal.message).toContain('{{' + id + '.barChart}}');
      expect(reveal.message).toContain(p.correctAnswer);
    }
    const lb = Object.values(phases).find(p => p.type === 'leaderboard');
    expect(lb, 'quiz brick must end in a leaderboard').toBeTruthy();
    expect(lb.from.sort()).toEqual(graded.map(([id]) => id + '.scores').sort());
    validateGame(phases, 'quiz storyboard');
  });

  it('quiz: speedBonus false scores correctness only', () => {
    const { config, problems } = S.compileStoryboard({
      name: 'Slow Quiz',
      steps: [{
        brick: 'quiz',
        speedBonus: false,
        questions: [{ text: '2+2?', choices: ['3', '4'], correct: '4' }]
      }]
    });
    expect(problems).toEqual([]);
    const q = Object.values(config.phases).find(p => p.type === 'collect-choice');
    expect(q.speedBonus).toBe(false);
    validateGame(config.phases, 'no-speed-bonus quiz');
  });

  // leaderboard: false — the no-winners quiz (2026-08-25: a teacher's
  // "classify these, reveal results, no winners" idea couldn't one-shot
  // because the quiz brick always crowned somebody). Every question still
  // grades and reveals the class split + answer; nothing ranks anyone.
  it('quiz: leaderboard false keeps graded reveals but crowns no one', () => {
    const { config, problems } = S.compileStoryboard({
      name: 'Good Question or Bad Question',
      steps: [
        { brick: 'announce', text: 'Judge each question.' },
        {
          brick: 'quiz',
          leaderboard: false,
          speedBonus: false,
          questions: [
            { text: 'Do you think it is a good idea?', choices: ['Good question', 'Bad question'], correct: 'Bad question' },
            { text: 'What else have you tried?', choices: ['Good question', 'Bad question'], correct: 'Good question' }
          ]
        },
        { brick: 'end', text: 'No winners, just sharper questions.' }
      ]
    });
    expect(problems).toEqual([]);
    const phases = config.phases;
    expect(Object.values(phases).find(p => p.type === 'leaderboard')).toBeUndefined();
    const graded = Object.entries(phases).filter(([, p]) => p.type === 'collect-choice' && p.correctAnswer);
    expect(graded.length).toBe(2);
    for (const [id, p] of graded) {
      const reveal = phases[p.next];
      expect(reveal.type).toBe('announce');
      expect(reveal.message).toContain('{{' + id + '.barChart}}');
    }
    // The last answer announce flows straight on to the end step.
    const endId = Object.keys(phases).find(id => phases[id].type === 'end');
    const intoEnd = Object.values(phases).filter(p => p.next === endId);
    expect(intoEnd.length).toBe(1);
    expect(intoEnd[0].type).toBe('announce');
    validateGame(phases, 'no-winners quiz storyboard');
  });

  it('quiz: a correct answer that is not among the choices is a plain-sentence problem', () => {
    const { config, problems } = S.compileStoryboard({
      name: 'Broken Quiz',
      steps: [{
        brick: 'quiz',
        questions: [
          { text: 'Good?', choices: ['yes', 'no'], correct: 'yes' },
          { text: 'Bad?', choices: ['a', 'b'], correct: 'c' }
        ]
      }]
    });
    expect(problems.length).toBe(1);
    expect(problems[0]).toContain('question 2');
    // The good question still compiles.
    const graded = Object.values(config.phases).filter(p => p.type === 'collect-choice' && p.correctAnswer);
    expect(graded.length).toBe(1);
    validateGame(config.phases, 'partial quiz');
  });

  it('quiz with no usable questions fails with a plain sentence', () => {
    const bad = S.compileStoryboard({
      name: 'Empty Quiz',
      steps: [{ brick: 'quiz', questions: [] }]
    });
    expect(bad.problems.length).toBeGreaterThan(0);
    expect(bad.problems[0]).toContain('question');
  });

  it('compiles a teams brick to a valid random team-split', () => {
    const { config, problems } = S.compileStoryboard({
      name: 'Team Time',
      steps: [
        { brick: 'teams', teamCount: 3 },
        { brick: 'collect', text: 'Talk in your team: what is our answer?' }
      ]
    });
    expect(problems).toEqual([]);
    const split = Object.values(config.phases).find(p => p.type === 'team-split');
    expect(split.method).toBe('random');
    expect(split.teamCount).toBe(3);
    validateGame(config.phases, 'teams storyboard');
  });

  it('teams: groupSize wins when given, defaults apply otherwise', () => {
    const bySize = S.compileStoryboard({
      name: 'G', steps: [{ brick: 'teams', groupSize: 4 }]
    });
    const split = Object.values(bySize.config.phases).find(p => p.type === 'team-split');
    expect(split.groupSize).toBe(4);
    expect(split.teamCount).toBeUndefined();
    const byDefault = S.compileStoryboard({ name: 'D', steps: [{ brick: 'teams' }] });
    const dflt = Object.values(byDefault.config.phases).find(p => p.type === 'team-split');
    expect(dflt.teamCount).toBe(4);
    validateGame(bySize.config.phases, 'groupSize teams');
    validateGame(byDefault.config.phases, 'default teams');
  });

  it('a teams step before a quiz makes the leaderboard team-scored', () => {
    const { config, problems } = S.compileStoryboard({
      name: 'Team Quiz',
      steps: [
        { brick: 'teams', teamCount: 3 },
        { brick: 'quiz', questions: [{ text: '2+2?', choices: ['3', '4'], correct: '4' }] }
      ]
    });
    expect(problems).toEqual([]);
    const lb = Object.values(config.phases).find(p => p.type === 'leaderboard');
    const splitId = Object.keys(config.phases).find(id => config.phases[id].type === 'team-split');
    expect(lb.teamsFrom).toBe(splitId);
    validateGame(config.phases, 'team-scored quiz storyboard');
  });

  it('a quiz without a teams step stays an individual board', () => {
    const { config } = S.compileStoryboard({
      name: 'Solo Quiz',
      steps: [{ brick: 'quiz', questions: [{ text: '2+2?', choices: ['3', '4'], correct: '4' }] }]
    });
    const lb = Object.values(config.phases).find(p => p.type === 'leaderboard');
    expect(lb.teamsFrom).toBeUndefined();
    validateGame(config.phases, 'individual quiz storyboard');
  });

  it('compiles the full Spanish-review shape: announce → teams → quiz → end', () => {
    const { config, problems } = S.compileStoryboard({
      name: 'Conjugation Showdown',
      description: 'Teams review Spanish present and past tense.',
      steps: [
        { brick: 'announce', text: 'Welcome to Conjugation Showdown!' },
        { brick: 'teams', teamCount: 4 },
        {
          brick: 'quiz',
          timer: 15,
          questions: [
            { text: 'YO + HABLAR (present)?', choices: ['hablo', 'hablas', 'habla', 'hablan'], correct: 'hablo' },
            { text: 'ELLA + COMER (preterite)?', choices: ['comió', 'come', 'comí', 'comen'], correct: 'comió' },
            { text: 'NOSOTROS + VIVIR (present)?', choices: ['vivimos', 'viven', 'vivo', 'vives'], correct: 'vivimos' }
          ]
        },
        { brick: 'end', text: 'That is the showdown!' }
      ]
    });
    expect(problems).toEqual([]);
    const types = Object.values(config.phases).map(p => p.type);
    expect(types).toContain('team-split');
    expect(types).toContain('leaderboard');
    expect(types.filter(t => t === 'collect-choice').length).toBe(3);
    validateGame(config.phases, 'Spanish review storyboard');
  });
});

describe('moveStep reorders the chain', () => {
  function fiveStep() {
    return {
      lobby: { type: 'lobby', next: 'a' },
      a: { type: 'announce', message: 'a', next: 'b' },
      b: { type: 'collect', prompt: 'b?', next: 'c' },
      c: { type: 'reveal', template: 'c', next: 'end' },
      end: { type: 'end', message: 'bye' }
    };
  }

  it('moves a step down', () => {
    const p = fiveStep();
    expect(S.moveStep(p, 'b', 'down')).toBe(true);
    expect(S.orderedPhaseIds(p)).toEqual(['lobby', 'a', 'c', 'b', 'end']);
    validateGame(p, 'after move down');
  });

  it('moves a step up', () => {
    const p = fiveStep();
    expect(S.moveStep(p, 'c', 'up')).toBe(true);
    expect(S.orderedPhaseIds(p)).toEqual(['lobby', 'a', 'c', 'b', 'end']);
    validateGame(p, 'after move up');
  });

  it('refuses illegal moves', () => {
    const p = fiveStep();
    expect(S.moveStep(p, 'lobby', 'down')).toBe(false);
    expect(S.moveStep(p, 'end', 'up')).toBe(false);
    expect(S.moveStep(p, 'a', 'up')).toBe(false);      // already first
    expect(S.moveStep(p, 'c', 'down')).toBe(false);    // end is below
    expect(S.orderedPhaseIds(p)).toEqual(['lobby', 'a', 'b', 'c', 'end']);
  });

  it('leaves branch fields untouched', () => {
    const p = fiveStep();
    p.a.approveNext = 'c';
    S.moveStep(p, 'b', 'down');
    expect(p.a.approveNext).toBe('c');
  });
});

describe('insertAfter rewires the chain', () => {
  it('splices into the next-pointers', () => {
    const phases = baseGame();
    S.insertAfter(phases, 'ask', 'mid', { type: 'announce', message: 'pause' });
    expect(phases.ask.next).toBe('mid');
    expect(phases.mid.next).toBe('end');
    expect(S.orderedPhaseIds(phases)).toEqual(['lobby', 'ask', 'mid', 'end']);
  });
});

// The chain brick — pass-around mechanics (telephone, consequences,
// exquisite corpse) compiled deterministically: the AI supplies only the
// per-hop instructions and a visibility choice; every rotateFrom link,
// accumulate flag, and the return-to-author reveal is emitted here.
// Bricks are mechanics, not phases: the AI never wires a chain itself.
describe('chain brick', () => {
  function compile(step, extra) {
    return S.compileStoryboard({
      name: 'Chain Test',
      steps: [step].concat(extra || [{ brick: 'end', text: 'Done!' }])
    });
  }

  it('visibility "all" compiles an accumulating add-only chain + final reveal, hostable as-is', () => {
    const { config, problems } = compile({
      brick: 'chain',
      start: 'Write the opening line of a story.',
      hops: ['Add the next line.', 'Add one more line.'],
      visibility: 'all',
      timer: 90
    });
    expect(problems).toEqual([]);
    const phases = config.phases;
    const collects = S.orderedPhaseIds(phases).filter(id => phases[id].type === 'collect');
    expect(collects.length).toBe(3);
    const [startId, hop1, hop2] = collects;
    expect(phases[startId].prompt).toContain('opening line');
    expect(phases[startId].rotateFrom).toBeUndefined();
    expect(phases[hop1].rotateFrom).toBe(startId);
    expect(phases[hop2].rotateFrom).toBe(hop1);
    for (const id of [hop1, hop2]) {
      expect(phases[id].prefillFromAssigned).toBe(true);
      expect(phases[id].appendOnly).toBe(true);
      expect(phases[id].showTail).toBeUndefined();
      expect(phases[id].timer).toBe(90);
    }
    const reveal = Object.values(phases).find(p => p.type === 'reveal');
    expect(reveal.scope).toBe('own');
    expect(reveal.chainFrom).toEqual(collects);
    expect(reveal.chainDisplay).toBe('final');
    validateGame(phases, 'chain all');
  });

  it('visibility "tail" adds the fold (showTail on every hop)', () => {
    const { config, problems } = compile({
      brick: 'chain',
      start: 'Start a story.',
      hops: ['Continue from the last words you can see.'],
      visibility: 'tail'
    });
    expect(problems).toEqual([]);
    const phases = config.phases;
    const hop = Object.values(phases).find(p => p.type === 'collect' && p.rotateFrom);
    expect(hop.appendOnly).toBe(true);
    expect(hop.showTail).toBe(3);
    validateGame(phases, 'chain tail');
  });

  it('visibility "blind" with a sentence assembles via the template reveal', () => {
    const { config, problems } = compile({
      brick: 'chain',
      start: 'Write one adjective.',
      hops: ['Write one noun.', 'Write one verb ending in s.'],
      visibility: 'blind',
      sentence: 'The {1} {2} {3}.'
    });
    expect(problems).toEqual([]);
    const phases = config.phases;
    const collects = S.orderedPhaseIds(phases).filter(id => phases[id].type === 'collect');
    for (const id of collects) {
      expect(phases[id].prefillFromAssigned, id).toBeUndefined();
      expect(phases[id].appendOnly, id).toBeUndefined();
      expect(phases[id].prompt, id).not.toContain('{{');
      expect(phases[id].maxLength, id).toBe(40);
    }
    const reveal = Object.values(phases).find(p => p.type === 'reveal');
    expect(reveal.chainDisplay).toBe('template');
    expect(reveal.chainTemplate).toBe('The {1} {2} {3}.');
    validateGame(phases, 'chain blind + sentence');
  });

  it('visibility "blind" without a sentence lists the hops instead', () => {
    const { config, problems } = compile({
      brick: 'chain',
      start: 'Write a prediction.',
      hops: ['Write a consequence of the prediction you cannot see.'],
      visibility: 'blind'
    });
    expect(problems).toEqual([]);
    const reveal = Object.values(config.phases).find(p => p.type === 'reveal');
    expect(reveal.chainDisplay).toBe('steps');
    expect(reveal.chainTemplate).toBeUndefined();
    validateGame(config.phases, 'chain blind steps');
  });

  it('strips template tokens from blind prompts and says so (the fold must hold)', () => {
    const { config, problems } = compile({
      brick: 'chain',
      start: 'Write a word.',
      hops: ['You got: {{chain-start.assigned}}. Add a word.'],
      visibility: 'blind'
    });
    expect(problems.some(p => p.includes('blind'))).toBe(true);
    const hop = Object.values(config.phases).find(p => p.type === 'collect' && p.rotateFrom);
    expect(hop.prompt).not.toContain('{{');
    validateGame(config.phases, 'chain blind sanitized');
  });

  it('a sentence on a non-blind chain is refused, not silently mis-assembled', () => {
    const { config, problems } = compile({
      brick: 'chain',
      start: 'Start.',
      hops: ['Add.'],
      visibility: 'all',
      sentence: 'The {1} {2}.'
    });
    expect(problems.some(p => p.includes('sentence'))).toBe(true);
    const reveal = Object.values(config.phases).find(p => p.type === 'reveal');
    expect(reveal.chainDisplay).toBe('final');
    validateGame(config.phases, 'chain sentence refused');
  });

  it('rejects a chain with no start or no hops', () => {
    const noStart = compile({ brick: 'chain', hops: ['Add.'] });
    expect(noStart.problems.some(p => p.includes('start'))).toBe(true);
    const noHops = compile({ brick: 'chain', start: 'Start.', hops: [] });
    expect(noHops.problems.some(p => p.includes('hand-off'))).toBe(true);
  });

  it('caps hops at 6 and reports the trim', () => {
    const { config, problems } = compile({
      brick: 'chain',
      start: 'Start.',
      hops: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(x => 'Add ' + x + '.'),
      visibility: 'all'
    });
    expect(problems.some(p => p.includes('6'))).toBe(true);
    const collects = Object.values(config.phases).filter(p => p.type === 'collect');
    expect(collects.length).toBe(7); // start + 6 hops
    validateGame(config.phases, 'chain trimmed');
  });

  it('composes with other bricks and gets the auto-end', () => {
    const { config, problems } = S.compileStoryboard({
      name: 'Warm-up Chain',
      steps: [
        { brick: 'announce', text: 'We are writing together, one hand at a time.' },
        { brick: 'chain', start: 'Write a line.', hops: ['Add a line.'], visibility: 'all' }
      ]
    });
    expect(problems).toEqual([]);
    const order = S.orderedPhaseIds(config.phases).map(id => config.phases[id].type);
    expect(order[0]).toBe('lobby');
    expect(order[1]).toBe('announce');
    expect(order[order.length - 1]).toBe('end');
    validateGame(config.phases, 'chain composed');
  });
});
