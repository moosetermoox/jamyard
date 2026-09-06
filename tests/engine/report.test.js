/**
 * Activity report builder — the printable end-of-activity record.
 *
 * The report is generated on demand from live room state and handed straight
 * to the teacher's device; it is never stored server-side (teacher-save
 * purity: saved objects never contain student content). These tests pin the
 * shape: ordered sections from phaseData, tier-1 renderers per phase type,
 * a generic scores fallback, loop-round expansion, and no token leakage.
 */
import { describe, it, expect } from 'vitest';
import { buildActivityReport } from '../../engine/report.js';
import { PlayerRegistry } from '../../engine/player-registry.js';

function stubEngine({ phases = {}, phaseData = {}, players = [], name = 'Test Activity', anonymous = false } = {}) {
  const registry = new PlayerRegistry();
  for (const [id, playerName] of players) registry.add(id, playerName, 'secret-token-' + id);
  return {
    config: { name, anonymous, phases },
    phaseData,
    players: registry
  };
}

const TWO_PLAYERS = [['p1', 'Ada'], ['p2', 'Ben']];

function sectionFor(report, id) {
  return report.sections.find(s => s.id === id);
}

function blocksOfKind(section, kind) {
  return (section ? section.blocks : []).filter(b => b.kind === kind);
}

describe('buildActivityReport', () => {
  it('carries top-level activity facts and a token-free roster', () => {
    const engine = stubEngine({
      players: TWO_PLAYERS,
      phases: { lobby: { type: 'lobby', next: 'q' }, q: { type: 'collect', prompt: 'Why?' } },
      phaseData: { q: { responses: [{ playerId: 'p1', name: 'Ada', text: 'Because' }] } }
    });
    const report = buildActivityReport(engine, { code: 'ABCD' });
    expect(report.game).toBe('Test Activity');
    expect(report.code).toBe('ABCD');
    expect(report.playerCount).toBe(2);
    expect(report.roster).toEqual(['Ada', 'Ben']);
    expect(typeof report.generatedAt).toBe('string');
    expect(JSON.stringify(report)).not.toContain('secret-token');
  });

  it('renders collect responses as entries, with drawings and pass counts', () => {
    const strokes = [{ points: [[0.1, 0.2]], color: '#111111', width: 4 }];
    const engine = stubEngine({
      players: TWO_PLAYERS,
      phases: { q: { type: 'collect', prompt: 'Draw or write', passAllowed: true } },
      phaseData: {
        q: {
          responses: [
            { playerId: 'p1', name: 'Ada', text: 'Words' },
            { playerId: 'p2', name: 'Ben', text: '[drawing]', drawing: strokes }
          ],
          passedIds: ['p3']
        }
      }
    });
    const section = sectionFor(buildActivityReport(engine), 'q');
    expect(section.heading).toBe('Draw or write');
    const [entries] = blocksOfKind(section, 'entries');
    expect(entries.items).toEqual([
      { name: 'Ada', text: 'Words' },
      { name: 'Ben', text: '[drawing]', drawing: strokes }
    ]);
    const facts = blocksOfKind(section, 'fact');
    expect(facts.some(f => f.value === '1 passed')).toBe(true);
  });

  it('omits a heading whose template tokens would render unresolved', () => {
    const engine = stubEngine({
      phases: { q: { type: 'collect', prompt: 'Improve this: {{seed.assigned}}' } },
      phaseData: { q: { responses: [{ playerId: 'p1', name: 'Ada', text: 'ok' }] } }
    });
    expect(sectionFor(buildActivityReport(engine), 'q').heading).toBeUndefined();
  });

  it('renders collect-choice as a tally table with the correct answer marked, plus per-student picks', () => {
    const engine = stubEngine({
      players: TWO_PLAYERS,
      phases: { quiz: { type: 'collect-choice', prompt: 'Pick one', correctAnswer: 'B' } },
      phaseData: {
        quiz: {
          responses: [
            { playerId: 'p1', name: 'Ada', choice: 'B', text: 'B' },
            { playerId: 'p2', name: 'Ben', choice: 'A', text: 'A' }
          ],
          tally: { A: 1, B: 1 },
          correctAnswer: 'B'
        }
      }
    });
    const section = sectionFor(buildActivityReport(engine), 'quiz');
    const tables = blocksOfKind(section, 'table');
    const tallyTable = tables[0];
    expect(tallyTable.columns).toEqual(['Choice', 'Picks']);
    expect(tallyTable.rows).toContainEqual(['B ✓', 1]);
    const picks = tables[1];
    expect(picks.nameCol).toBe(0);
    expect(picks.rows).toContainEqual(['Ada', 'B', '✓']);
    expect(picks.rows).toContainEqual(['Ben', 'A', '']);
  });

  it('renders ai-process text results, and perPlayer maps as named entries', () => {
    const engine = stubEngine({
      players: TWO_PLAYERS,
      phases: {
        sum: { type: 'ai-process', task: 'summarize', instruction: 'Summarize the class' },
        per: { type: 'ai-process', task: 'generate', perPlayer: true, instruction: 'One each' }
      },
      phaseData: {
        sum: { result: 'A tidy summary.' },
        per: { result: ['x', 'y'], byPlayer: { p1: 'x', p2: 'y' } }
      }
    });
    const report = buildActivityReport(engine);
    const [text] = blocksOfKind(sectionFor(report, 'sum'), 'text');
    expect(text.text).toBe('A tidy summary.');
    // The AI instruction is a model prompt, not a document heading.
    expect(sectionFor(report, 'sum').heading).toBeUndefined();
    const [entries] = blocksOfKind(sectionFor(report, 'per'), 'entries');
    expect(entries.items).toEqual([{ name: 'Ada', text: 'x' }, { name: 'Ben', text: 'y' }]);
  });

  it('maps vote score keys through player names but leaves literal candidates alone', () => {
    const engine = stubEngine({
      players: TWO_PLAYERS,
      phases: { v: { type: 'vote', mode: 'pick-one' } },
      phaseData: { v: { scores: { p1: 3, 'Pizza party': 1 }, winner: 'p1', tied: false, totalVotes: 4 } }
    });
    const section = sectionFor(buildActivityReport(engine), 'v');
    const [table] = blocksOfKind(section, 'table');
    expect(table.rows).toEqual([['Ada', 3], ['Pizza party', 1]]);
    expect(blocksOfKind(section, 'fact').some(f => f.label === 'Winner' && f.value === 'Ada')).toBe(true);
  });

  it('renders leaderboard standings ranked, with team standings when present', () => {
    const engine = stubEngine({
      players: TWO_PLAYERS,
      phases: { board: { type: 'leaderboard' } },
      phaseData: {
        board: {
          standings: [
            { rank: 1, playerId: 'p2', name: 'Ben', score: 10 },
            { rank: 2, playerId: 'p1', name: 'Ada', score: 5 }
          ],
          teamStandings: [{ name: 'Red', score: 15 }]
        }
      }
    });
    const tables = blocksOfKind(sectionFor(buildActivityReport(engine), 'board'), 'table');
    expect(tables[0].columns).toEqual(['Rank', 'Student', 'Points']);
    expect(tables[0].rows[0]).toEqual([1, 'Ben', 10]);
    expect(tables[0].nameCol).toBe(1);
    expect(tables[1].rows).toEqual([['Red', 15]]);
  });

  it('renders estimate stats as facts and scores as a named table', () => {
    const engine = stubEngine({
      players: TWO_PLAYERS,
      phases: { guess: { type: 'estimate', question: 'How many?', unit: 'kg' } },
      phaseData: { guess: { scores: { p1: 10, p2: 5 }, count: 2, average: 42.5, median: 42.5, closest: 40, answer: 41 } }
    });
    const section = sectionFor(buildActivityReport(engine), 'guess');
    const facts = blocksOfKind(section, 'fact');
    expect(facts.some(f => f.label === 'Answer' && f.value === '41 kg')).toBe(true);
    expect(facts.some(f => f.label === 'Class average' && f.value === '42.5')).toBe(true);
    const [table] = blocksOfKind(section, 'table');
    expect(table.rows[0]).toEqual(['Ada', 10]);
  });

  it('renders foreach as a round count plus final scores by name', () => {
    const engine = stubEngine({
      players: TWO_PLAYERS,
      phases: { rounds: { type: 'foreach' } },
      phaseData: { rounds: { scores: { p2: 200, p1: 900 }, itemCount: 3 } }
    });
    const section = sectionFor(buildActivityReport(engine), 'rounds');
    expect(blocksOfKind(section, 'fact').some(f => f.value === '3 rounds')).toBe(true);
    const [table] = blocksOfKind(section, 'table');
    expect(table.rows).toEqual([['Ada', 900], ['Ben', 200]]);
  });

  it('expands loop-versioned copies into per-round sections and skips the duplicate base', () => {
    const engine = stubEngine({
      phases: { q: { type: 'collect', prompt: 'Again' } },
      phaseData: {
        q: { responses: [{ playerId: 'p1', name: 'Ada', text: 'round two' }] },
        'q~1': { responses: [{ playerId: 'p1', name: 'Ada', text: 'round one' }] },
        'q~2': { responses: [{ playerId: 'p1', name: 'Ada', text: 'round two' }] }
      }
    });
    const sections = buildActivityReport(engine).sections.filter(s => s.id === 'q');
    expect(sections.map(s => s.round)).toEqual([1, 2]);
    expect(sections[0].blocks[0].items[0].text).toBe('round one');
  });

  it('skips pacing beats and phases that produced no data', () => {
    const engine = stubEngine({
      phases: {
        lobby: { type: 'lobby' },
        intro: { type: 'announce', message: 'Hi' },
        show: { type: 'reveal', content: 'x' },
        gate: { type: 'preview', content: 'x' },
        gallery: { type: 'reveal-one' },
        q: { type: 'collect', prompt: 'Q' },
        fin: { type: 'end' }
      },
      phaseData: { intro: { message: 'Hi' }, gallery: { items: [], revealed: 0 } }
    });
    expect(buildActivityReport(engine).sections).toEqual([]);
  });

  it('falls back to a scores table for types without a dedicated renderer', () => {
    const engine = stubEngine({
      players: TWO_PLAYERS,
      phases: { z: { type: 'buzz' } },
      phaseData: { z: { scores: { p1: 2 }, questions: 4 } }
    });
    const [table] = blocksOfKind(sectionFor(buildActivityReport(engine), 'z'), 'table');
    expect(table.rows).toEqual([['Ada', 2]]);
  });

  it('renders the winner with what they won for', () => {
    const engine = stubEngine({
      players: TWO_PLAYERS,
      phases: { crown: { type: 'winner' } },
      phaseData: { crown: { winnerId: 'p1', winnerNames: ['Ada'], winnerScore: 12, isTie: false, winnerEntry: 'The moon poem' } }
    });
    const section = sectionFor(buildActivityReport(engine), 'crown');
    const facts = blocksOfKind(section, 'fact');
    expect(facts.some(f => f.label === 'Winner' && f.value === 'Ada (12 points)')).toBe(true);
    expect(blocksOfKind(section, 'text')[0].text).toContain('The moon poem');
  });

  it('renders merged group answers with member attribution', () => {
    const engine = stubEngine({
      players: TWO_PLAYERS,
      phases: { m: { type: 'merge', instruction: 'Combine' } },
      phaseData: { m: { merged: [{ groupId: 'g1', text: 'Our answer', members: ['p1', 'p2'] }] } }
    });
    const [entries] = blocksOfKind(sectionFor(buildActivityReport(engine), 'm'), 'entries');
    expect(entries.items).toEqual([{ name: 'Ada + Ben', text: 'Our answer' }]);
  });

  it('renders teams as a roster table', () => {
    const engine = stubEngine({
      players: TWO_PLAYERS,
      phases: { split: { type: 'team-split' } },
      phaseData: {
        split: {
          teams: { 'Team Red': [{ playerId: 'p1', name: 'Ada' }], 'Team Blue': [{ playerId: 'p2', name: 'Ben' }] },
          playerTeam: { p1: 'Team Red', p2: 'Team Blue' }
        }
      }
    });
    const [table] = blocksOfKind(sectionFor(buildActivityReport(engine), 'split'), 'table');
    expect(table.rows).toEqual([['Team Red', 'Ada'], ['Team Blue', 'Ben']]);
    expect(table.nameCol).toBe(1);
  });

  it('renders preformatted result lists for match, sort and checklist', () => {
    const engine = stubEngine({
      phases: { c: { type: 'checklist' } },
      phaseData: { c: { results: [], resultsList: 'Group 1: 3/3 ✓', doneCount: 1, groupCount: 1, itemCount: 3 } }
    });
    const [pre] = blocksOfKind(sectionFor(buildActivityReport(engine), 'c'), 'pre');
    expect(pre.text).toBe('Group 1: 3/3 ✓');
  });

  it('renders one-voice run stats as facts', () => {
    const engine = stubEngine({
      phases: { ov: { type: 'one-voice' } },
      phaseData: { ov: { success: true, attempts: 2, resets: 1, bestRun: 20, target: 20, finalCount: 20 } }
    });
    const facts = blocksOfKind(sectionFor(buildActivityReport(engine), 'ov'), 'fact');
    expect(facts.some(f => f.label === 'Reached' && f.value === '20 of 20')).toBe(true);
    expect(facts.some(f => f.label === 'Attempts' && f.value === '2')).toBe(true);
  });
});

// Rolling start: the report is read while the step is still open (an
// exit ticket has no close moment the teacher waits for), so the current
// step's live answers must show up, marked as still open.
describe('live sections for the step that is still open', () => {
  function liveEngine(phaseType, extra = {}) {
    const engine = stubEngine({
      phases: {
        lobby: { type: 'lobby', next: 'q' },
        q: { type: phaseType, prompt: 'One thing you learned?', next: 'end', ...extra },
        end: { type: 'end' }
      },
      players: TWO_PLAYERS
    });
    engine.getCurrentPhase = () => ({ id: 'q', ...engine.config.phases.q });
    return engine;
  }

  it('reads an open collect step from the players, skipping hidden and passed', () => {
    const engine = liveEngine('collect', { fields: [{ label: 'Learned', key: 'q1' }, { label: 'Question', key: 'q2' }] });
    engine.players.update('p1', { response: { q1: 'Fractions', q2: 'Why decimals?' } });
    engine.players.update('p2', { response: { q1: 'Nothing', q2: 'None' }, responseHidden: true });
    const section = sectionFor(buildActivityReport(engine), 'q');
    expect(section).toBeDefined();
    expect(section.live).toBe(true);
    expect(section.blocks[0]).toMatchObject({ kind: 'fact', label: 'Status' });
    const entries = blocksOfKind(section, 'entries')[0];
    expect(entries.items).toHaveLength(1);
    // Two questions, two labeled lines (not the stored "a | b" join)
    expect(entries.items[0]).toMatchObject({ name: 'Ada', text: 'Learned: Fractions\nQuestion: Why decimals?' });
  });

  it('tallies an open multiple-choice step', () => {
    const engine = liveEngine('collect-choice', { choices: ['Got it', 'Lost'] });
    engine.players.update('p1', { response: 'Got it' });
    engine.players.update('p2', { response: 'Got it' });
    const section = sectionFor(buildActivityReport(engine), 'q');
    const table = blocksOfKind(section, 'table')[0];
    expect(table.rows[0]).toEqual(['Got it', 2]);
  });

  it('grades an unfinished solo quiz from its mirrored progress', () => {
    const questions = [
      { question: 'A?', choices: ['x', 'y'], correct: 'x' },
      { question: 'B?', choices: ['x', 'y'], correct: 'y' }
    ];
    const engine = liveEngine('solo-quiz', { questions });
    engine.phaseData.q = { progress: { p1: { index: 2, answers: [{ choice: 'x', correct: true }, { choice: 'x', correct: false }] } } };
    const section = sectionFor(buildActivityReport(engine), 'q');
    expect(section.live).toBe(true);
    const tables = blocksOfKind(section, 'table');
    expect(tables[1].rows[0][0]).toBe('Ada');
    expect(tables[1].rows[0][1]).toBe(1);
  });

  it('leaves a closed step alone (stored data wins, no live mark)', () => {
    const engine = liveEngine('collect');
    engine.phaseData.q = { responses: [{ playerId: 'p1', name: 'Ada', text: 'Stored' }] };
    engine.players.update('p1', { response: 'Newer' });
    const section = sectionFor(buildActivityReport(engine), 'q');
    expect(section.live).toBeUndefined();
    expect(blocksOfKind(section, 'entries')[0].items[0].text).toBe('Stored');
  });

  it('adds a words-looked-up table from word-help meta, counts only', () => {
    const engine = stubEngine({ phases: {}, players: TWO_PLAYERS });
    const report = buildActivityReport(engine, {
      code: 'ABCD',
      wordHelp: [{ word: 'escuela', count: 3 }, { word: 'libro', count: 1 }]
    });
    const section = sectionFor(report, 'word-help');
    expect(section.heading).toBe('Words the class looked up');
    const table = blocksOfKind(section, 'table')[0];
    expect(table.columns).toEqual(['Word', 'Times tapped']);
    expect(table.rows).toEqual([['escuela', 3], ['libro', 1]]);
    expect(JSON.stringify(section)).not.toContain('Ada'); // counts, never who
  });

  it('has no words section when nothing was tapped', () => {
    const engine = stubEngine({ phases: {}, players: TWO_PLAYERS });
    expect(sectionFor(buildActivityReport(engine, { wordHelp: [] }), 'word-help')).toBeUndefined();
    expect(sectionFor(buildActivityReport(engine, {}), 'word-help')).toBeUndefined();
  });
});
