/**
 * The self-paced quiz handler (engine/phase-handlers/solo-quiz.js): what
 * the projector and each student receive on enter, and that a restart
 * resumes everyone from the progress mirrored into phaseData.
 */
import { describe, it, expect } from 'vitest';
import '../../../engine/phase-handlers/solo-quiz.js';
import { getHandler } from '../../../engine/phase-handlers/phase-registry.js';
import { GameEngine } from '../../../engine/game-engine.js';

const questions = [
  { question: 'Capital of Australia?', choices: ['Sydney', 'Canberra'], correct: 'Canberra' },
  { question: 'Closest planet?', choices: ['Mercury', 'Venus'], correct: 'Mercury' },
  { question: 'Broken one', choices: ['only'], correct: 'only' }
];

function run(priorProgress) {
  const phases = {
    lobby: { type: 'lobby', next: 'quiz' },
    quiz: { type: 'solo-quiz', title: 'Warm-up', questions, pointsPerQuestion: 5, next: 'end' },
    end: { type: 'end' }
  };
  const engine = new GameEngine({ phases });
  engine.players.add('p1', 'Maya');
  engine.players.add('p2', 'Sam');
  engine.stateMachine.transition('quiz');
  if (priorProgress) engine.storePhaseData('quiz', { progress: priorProgress });
  const room = { phaseState: {}, gameId: 'x' };
  const phase = { id: 'quiz', ...phases.quiz };
  const host = [];
  const players = [];
  const ctx = {
    phase, engine, room,
    resolveScreenControl: () => ({}),
    resolveTemplate: (t) => t,
    emitToHost: (event, payload) => host.push({ event, payload }),
    emitToPlayer: (id, event, payload) => players.push({ id, event, payload }),
    services: {}
  };
  return getHandler('solo-quiz').onEnter(ctx).then(() => ({ host, players, room }));
}

describe('solo-quiz onEnter', () => {
  it('tells the projector the shape of the quiz and nothing about the questions', async () => {
    const { host } = await run();
    expect(host).toHaveLength(1);
    const p = host[0].payload;
    expect(host[0].event).toBe('solo-quiz-start');
    expect(p.title).toBe('Warm-up');
    // the unplayable third question is dropped
    expect(p.questionCount).toBe(2);
    expect(p.started).toBe(0);
    expect(p.finished).toBe(0);
    expect(p.total).toBe(2);
    expect(p.perQuestion).toHaveLength(2);
    expect(JSON.stringify(p)).not.toContain('Canberra');
  });

  it('hands every student their first question with its choices', async () => {
    const { players } = await run();
    expect(players.map(x => x.id).sort()).toEqual(['p1', 'p2']);
    const first = players[0].payload;
    expect(players[0].event).toBe('solo-quiz-question');
    expect(first.done).toBe(false);
    expect(first.index).toBe(0);
    expect(first.total).toBe(2);
    expect(first.question).toBe('Capital of Australia?');
    expect(first.choices).toEqual(['Sydney', 'Canberra']);
    expect(first.score).toBe(0);
  });

  it('resumes from mirrored progress after a restart', async () => {
    const prior = {
      p1: { index: 2, answers: [{ choice: 'Canberra', correct: true }, { choice: 'Venus', correct: false }] },
      p2: { index: 1, answers: [{ choice: 'Sydney', correct: false }] }
    };
    const { host, players, room } = await run(prior);
    expect(room.phaseState.kind).toBe('solo-quiz');
    expect(host[0].payload.finished).toBe(1);
    expect(host[0].payload.started).toBe(2);
    const maya = players.find(x => x.id === 'p1').payload;
    expect(maya.done).toBe(true);
    expect(maya.correct).toBe(1);
    expect(maya.score).toBe(5);
    const sam = players.find(x => x.id === 'p2').payload;
    expect(sam.done).toBe(false);
    expect(sam.index).toBe(1);
    expect(sam.question).toBe('Closest planet?');
  });
});
