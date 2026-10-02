/**
 * An outside reviewer's findings on jamyard.org (2026-10-02, part A).
 * One block per finding that was real; each names what the reviewer saw.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { buildSubmissionList } from '../../engine/moderation.js';
import { buildActivityReport } from '../../engine/report.js';
import { PlayerRegistry } from '../../engine/player-registry.js';
import { loadAllRecipes, getRecipe } from '../../engine/recipe-loader.js';
import { compileRecipe } from '../../engine/recipe-compiler.js';
import { PHASE_SCHEMAS } from '../../engine/phase-schemas.js';
import { stripPlayerIdRefs } from '../../engine/ai-name-fill.js';
import { AIService } from '../../services/ai-service.js';
import { runBottomPercent } from '../../engine/phases/eliminate-handler.js';
import { hasNothingToReview } from '../../engine/phase-handlers/preview.js';
import { getHandler } from '../../engine/phase-handlers/phase-registry.js';

const read = (rel) => readFile(new URL('../../' + rel, import.meta.url), 'utf8');

describe('1. Anonymous Feedback: the teacher sees what was said, not who said it', () => {
  beforeAll(async () => { await loadAllRecipes(); });

  const players = [
    { id: 'p1', name: 'Ada', response: 'More examples please' },
    { id: 'p2', name: 'Ben', response: 'Slow down' }
  ];

  it('an unattributed step sends the console rows without names (Hide keeps the id)', () => {
    const rows = buildSubmissionList(players, { unattributed: true });
    expect(rows.map(r => r.name)).toEqual(['', '']);
    expect(rows.every(r => r.unattributed === true)).toBe(true);
    expect(rows.map(r => r.playerId)).toEqual(['p1', 'p2']);
    expect(JSON.stringify(rows)).not.toContain('Ada');
    // every other step keeps its names
    expect(buildSubmissionList(players).map(r => r.name)).toEqual(['Ada', 'Ben']);
  });

  it('the recipe marks its question step unattributed, and the schema knows the field', () => {
    const recipe = getRecipe('anonymous-feedback');
    const { config } = compileRecipe(recipe, { question: 'How is class going for you?', timer: 90 });
    expect(config.phases.ask.unattributed).toBe(true);
    expect(config.phases.intro.message).toContain('not who said what');
    expect(PHASE_SCHEMAS.collect.fields.unattributed.type).toBe('boolean');
    // copies saved on the older versions are rebuilt on read
    expect(recipe.replaceOnRead).toEqual(['1', '2']);
  });

  it('the activity report prints those answers without names', () => {
    const registry = new PlayerRegistry();
    registry.add('p1', 'Ada', 't1');
    const engine = {
      config: { name: 'Feedback', phases: { ask: { type: 'collect', prompt: 'How is it going?', unattributed: true } } },
      phaseData: { ask: { responses: [{ playerId: 'p1', name: 'Ada', text: 'Good' }] } },
      players: registry
    };
    const section = buildActivityReport(engine).sections.find(s => s.id === 'ask');
    const entries = section.blocks.find(b => b.kind === 'entries');
    expect(entries.items).toEqual([{ name: null, text: 'Good' }]);
  });

  it('the console prints "Anonymous" and offers no Kick on such a row', async () => {
    const src = await read('screens/teacher/teacher.js');
    expect(src).toContain("sub.unattributed ? 'Anonymous' : sub.name");
    expect(src).toContain('if (!sub.unattributed) actions.appendChild(kickBtn);');
  });
});

describe('2. One More Thing: no playerId reaches the projector', () => {
  const ID = '43I2B8I0bvgUMgqiAAAg';

  it('strips the labelled and the bare forms from prose', () => {
    expect(stripPlayerIdRefs(`Only one list caught photosynthesis (from playerId ${ID}).`, [ID]))
      .toBe('Only one list caught photosynthesis.');
    expect(stripPlayerIdRefs(`A great catch [playerId: ${ID}] about mitochondria.`, [ID]))
      .toBe('A great catch about mitochondria.');
    expect(stripPlayerIdRefs(`One list, from playerId ${ID}, named the Treaty.`, [ID]))
      .toBe('One list, named the Treaty.');
    expect(stripPlayerIdRefs(`The catch from ${ID} was the Treaty.`, [ID]))
      .toBe('The catch was the Treaty.');
  });

  it('leaves a JSON reply the server reads back alone', () => {
    const json = `{"winner": "${ID}", "ranking": [{"playerId": "${ID}", "reason": "clear"}]}`;
    expect(stripPlayerIdRefs(json, [ID])).toBe(json);
    expect(JSON.parse(stripPlayerIdRefs(json, [ID])).winner).toBe(ID);
  });

  it('process() scrubs every reply, and the prompt says ids stay out of the words', async () => {
    const ai = new AIService();
    ai._processMock = () => ({ text: `Two lists caught it (from playerId ${ID}).` });
    const out = await ai.process({ instruction: 'Sum up', responses: [{ playerId: ID, text: 'x' }] });
    expect(out.text).toBe('Two lists caught it.');
    const msg = ai._buildUserMessage('Sum up', [{ playerId: ID, text: 'x' }]);
    expect(msg).toContain('Never write a playerId');
  });
});

describe('7. Elimination Tournament: the percent is a cap', () => {
  it("the reviewer's round: 7 students at 60% puts at most 4 out, ties included", () => {
    // two with a vote each, five with none: every zero tied at the cutoff
    const scores = { a: 2, b: 1, c: 0, d: 0, e: 0, f: 0, g: 0 };
    for (let k = 0; k < 20; k++) {
      const out = runBottomPercent({ scores, percent: 60 });
      expect(out.length).toBe(4);
      expect(out).not.toContain('a');
      expect(out).not.toContain('b');
    }
  });

  it('everyone below the cutoff goes before the lot, and a small class still loses one', () => {
    const out = runBottomPercent({ scores: { a: 5, b: 3, c: 1, d: 1, e: 0 }, percent: 60, random: () => 0 });
    expect(out.length).toBe(3);
    expect(out).toContain('e');
    expect(runBottomPercent({ scores: { a: 3, b: 2, c: 1 }, percent: 10 })).toEqual(['c']);
    expect(runBottomPercent({ scores: { a: 0, b: 0, c: 0 }, percent: 60 })).toEqual([]);
  });
});

describe('35. A review gate with nothing in it passes itself', () => {
  function previewCtx(phases, stored) {
    const sent = { host: [], players: [], advancedTo: null };
    const data = { ...stored };
    const ctx = {
      phase: { id: 'check', ...phases.check },
      engine: {
        config: { phases },
        language: 'en',
        getPhaseData: (id) => data[id] || null,
        storePhaseData: (id, d) => { data[id] = d; },
        players: { list: () => [{ id: 'p1', name: 'Ada' }], find: () => null }
      },
      resolveTemplate: (t) => t,
      resolveScreenControl: () => ({}),
      emitToHost: (e, p) => sent.host.push(p),
      emitToTeachers: () => {},
      emitToPlayer: (id, e, p) => sent.players.push(p),
      advanceTo: async (id) => { sent.advancedTo = id; }
    };
    return { ctx, sent };
  }
  const phases = {
    draw: { type: 'collect', inputType: 'drawing', next: 'check' },
    check: { type: 'preview', template: 'Review the drawings below, then open the gallery.', approveNext: 'wall', rejectNext: 'draw' },
    wall: { type: 'reveal-one', from: 'draw.responses' }
  };

  it('zero answers: straight on to the step after, nobody told the teacher is checking', async () => {
    const { ctx, sent } = previewCtx(phases, { draw: { responses: [] } });
    await getHandler('preview').onEnter(ctx);
    expect(sent.advancedTo).toBe('wall');
    expect(sent.host).toEqual([]);
    expect(sent.players).toEqual([]);
  });

  it('with answers the gate waits for the teacher, as before', async () => {
    const { ctx, sent } = previewCtx(phases, { draw: { responses: [{ playerId: 'p1', name: 'Ada', text: '[drawing]' }] } });
    await getHandler('preview').onEnter(ctx);
    expect(sent.advancedTo).toBe(null);
    expect(sent.host.length).toBe(1);
  });

  it('a gate over an AI result, or with the answers turned off, always waits', () => {
    expect(hasNothingToReview({ template: '{{ai.result}}' }, phases, [])).toBe(false);
    expect(hasNothingToReview({ content: 'ai.result' }, phases, [])).toBe(false);
    expect(hasNothingToReview({ template: '{{x.result}}', showResponses: false }, phases, [])).toBe(false);
    expect(hasNothingToReview({ template: 'Read these' }, { a: { type: 'announce' } }, [])).toBe(false);
    expect(hasNothingToReview({ template: 'Read these' }, phases, [])).toBe(true);
  });
});

describe('3. The clock runs out with nobody in: Wait keeps the class able to answer', () => {
  it('a student with nothing to send keeps the box, never "done for now"', async () => {
    const src = await read('screens/player/player.js');
    // nothing typed sends nothing (the server refused the empty line)
    expect(src).not.toContain("response: responseInput.value.trim() || ''");
    expect(src).toContain('collectOpenAfterClock = { onExpire: onCollectClock, phase: latestPhaseInstanceId };');
    // more time brings the clock back on that screen
    expect(src).toContain('if (reopenCollectClock(add)) return;');
  });

  it("the projector's Wait after the clock asks for more time and restarts its own clock", async () => {
    const src = (await read('screens/host/host.js')).replace(/\r\n/g, '\n');
    expect(src).toContain("if (wasByClock) {\n      clockRanOutStep = collectStep;\n      socket.emit('extend-timer', { code: currentRoomCode });");
    expect(src).toContain('if (!timerInterval && add > 0 && clockRanOutStep === collectStep) {');
  });

  it('the server extends a deadline that already passed from now', async () => {
    const src = await read('server.js');
    expect(src).toContain('Math.max(room.phaseState.timerEndsAt, Date.now()) + EXTEND_TIMER_SECONDS * 1000');
  });
});
