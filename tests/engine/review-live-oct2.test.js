/**
 * A reviewer's ten findings on jamyard.org (2026-10-02): a yard pick wrote
 * over the copy already made in that tab, sample answers off the topic or
 * off the card, a right answer nobody picked missing from the report, the
 * report's raw markdown and internal step name, a button over the
 * projector's cards, Whose Eyes?'s doubled sentence starters, stitched
 * merges, odd copy names, "none s", and a false odd-class warning.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { buildActivityReport } from '../../engine/report.js';
import { PlayerRegistry } from '../../engine/player-registry.js';
import { nameFor } from '../../engine/make-print.js';
import '../../screens/shared/bot-brain.js';

const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

function stubEngine(phases, phaseData) {
  const players = new PlayerRegistry();
  players.add('p1', 'Ada', 't1');
  players.add('p2', 'Ben', 't2');
  return { config: { name: 'T', phases }, phaseData, players };
}

describe('a fresh pick from the yard makes a new copy', () => {
  it('the make page reuses its tab copy only on Back or a reload', () => {
    const js = read('screens/make/make.js');
    expect(js).toContain("return !!nav && (nav.type === 'back_forward' || nav.type === 'reload');");
    expect(js).toContain('if (!sameVisit()) forgetSessionCopy();');
  });
});

describe('pretend answers fit the topic and the card', () => {
  it('a typed card finds the reply that shares its words', () => {
    const games = JSON.parse(read('games/someones-got-you/config.json'));
    const line = globalThis.pickSampleAnswer(games.sampleAnswers, 'boost',
      'A classmate wrote:\n\n“Trying to get more sleep”\n\nWrite them ONE kind, specific sentence.', 0);
    expect(line).toMatch(/sleep/i);
  });
  it('the writer reads the activity\'s other screens, where the topic is', () => {
    const svc = read('services/ai-service.js');
    expect(svc).toContain('const screens = otherScreensText(phases);');
    expect(svc).toContain('What the class reads on the other screens');
  });
});

describe('the report', () => {
  it('keeps the right answer when nobody picked it', () => {
    const engine = stubEngine(
      { q: { type: 'collect-choice', prompt: 'Which?', choices: ['DNA', 'RNA'], correctAnswer: 'DNA' } },
      { q: { correctAnswer: 'DNA', tally: { RNA: 2 }, responses: [{ playerId: 'p1', name: 'Ada', choice: 'RNA' }, { playerId: 'p2', name: 'Ben', choice: 'RNA' }] } }
    );
    const section = buildActivityReport(engine).sections.find(s => s.id === 'q');
    const table = section.blocks.find(b => b.kind === 'table' && b.columns[0] === 'Choice');
    expect(table.rows).toContainEqual(['DNA ✓', 0]);
  });
  it('an AI step is named by what it made, its prose kept as formatting', () => {
    const engine = stubEngine(
      { sum: { type: 'ai-process', task: 'summarize', instruction: 'Sum up' } },
      { sum: { result: '**YES side**\n- one\n- two' } }
    );
    const section = buildActivityReport(engine).sections.find(s => s.id === 'sum');
    expect(section.kindLabel).toBe('The answers, summed up');
    expect(section.blocks.find(b => b.kind === 'rich').text).toContain('**YES side**');
    const client = read('screens/teacher/report.js');
    expect(client).toContain("if (block.kind === 'rich') return renderRich(block.text);");
    expect(client).toContain('var kind = (section.kindLabel || stepName(section.type))');
  });
});

describe('the projector and the cards', () => {
  it('the newest reveal card scrolls above the pinned buttons', () => {
    expect(read('screens/host/host.js')).toContain("div.scrollIntoView({ block: 'end', behavior: 'smooth' })");
    expect(read('screens/host/styles.css')).toContain('#reveal-one-section.active { padding-bottom: 96px; }');
  });
  it('Whose Eyes? asks questions and leads each card with the viewpoint', () => {
    const c = JSON.parse(read('games/whose-eyes/config.json'));
    expect(c.phases['step-inside'].fields.map(f => f.label).some(l => /^From this viewpoint/.test(l))).toBe(false);
    expect(c.phases.circle.itemTemplate.startsWith('**{{_current.assigned}}**')).toBe(true);
    expect(c.phases.circle.itemTemplate).not.toContain('They feel:');
  });
  it('a pretend merge sets two answers side by side as sentences', () => {
    const js = read('screens/player/player.js');
    expect(js).not.toContain("', and also '");
    expect(js).toContain("asSentence(seedTexts[0]) + ' ' + asSentence(seedTexts[1])");
  });
});

describe('names and labels', () => {
  it('a copy is named by its topic, cleanly', () => {
    expect(nameFor('Whose Eyes?', 'gene editing')).toBe('Whose Eyes? Gene editing');
    expect(nameFor('Both Sides of the Rope', 'Editing human genes should be allowed.')).toBe('Both Sides of the Rope: Editing human genes should be allowed');
    expect(nameFor('Snowball', 'Why does natural selection work?')).toBe('Snowball: Why does natural selection work?');
    expect(read('server.js')).toContain('const swapTopic = Array.isArray(edits.swaps) && out.swapped');
  });
  it('an empty timer shows no "s"', () => {
    expect(read('screens/designer/simple-view.js')).toContain("unit.textContent = phase.timer ? 's' : '';");
  });
  it('a step with no icon has no leading space, and merges never warn about odd classes', () => {
    expect(read('screens/designer/editor.js')).toContain("(withIcon && cat.icon ? cat.icon + ' ' : '')");
    expect(read('services/ai-service.js')).toContain('Never flag an odd number of students on a merge step.');
  });
});
