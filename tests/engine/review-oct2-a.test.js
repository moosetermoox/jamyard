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
import { GameEngine } from '../../engine/game-engine.js';
import { guessesAuthors } from '../../engine/names-needed.js';
import { validate } from '../../engine/game-loader.js';
import { paceGuessWhoReveals } from '../../engine/review-gate.js';
import { guessedRightLine } from '../../engine/phases/guessed-right.js';
import { withZeroRows, foolLine } from '../../engine/phases/bluff-results.js';

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

// The live Guess Who: Rose, Bud, Thorn shape: a timed reveal, names hidden
function guessWho({ anonymous = false, revealTimer = 5 } = {}) {
  return {
    name: 'Guess Who: Rose, Bud, Thorn',
    ...(anonymous ? { anonymous: true } : {}),
    phases: {
      lobby: { type: 'lobby', next: 'ask' },
      ask: { type: 'collect', prompt: 'Rose, bud, thorn?', timer: 60, next: 'check' },
      check: { type: 'preview', template: 'Read these', approveNext: 'rounds', rejectNext: 'ask' },
      rounds: {
        type: 'foreach', data: 'ask.responses', shuffle: true, candidateSource: 'players', decoyCount: 3,
        subPhases: {
          show: { type: 'announce', message: '{{_current.text}}\n\nWho said it?', timer: 5 },
          guess: { type: 'collect-choice', prompt: 'Who?', choices: '_candidates', timer: 20 },
          reveal: { type: 'announce', message: 'It was {{_current.playerName}}!', ...(revealTimer ? { timer: revealTimer } : {}) }
        },
        next: 'end'
      },
      end: { type: 'end' }
    }
  };
}

describe('36. Guess Who runs with names shown', () => {
  it('the room drops "anonymous" for an activity that guesses who wrote what', () => {
    const cfg = guessWho({ anonymous: true });
    const engine = new GameEngine(cfg);
    expect(engine.config.anonymous).toBe(false);
    // the loaded config is shared: never changed
    expect(cfg.anonymous).toBe(true);
    // any other anonymous activity keeps its names hidden
    const other = { name: 'Feedback', anonymous: true, phases: { lobby: { type: 'lobby', next: 'end' }, end: { type: 'end' } } };
    expect(new GameEngine(other).config.anonymous).toBe(true);
  });

  it('the validator says so, and the make page offers no Hidden chip for it', async () => {
    expect(guessesAuthors(guessWho())).toBe(true);
    const warnings = validate(guessWho({ anonymous: true }), 'guess-who', { returnResults: true }).warnings.join('\n');
    expect(warnings).toContain('ANON_GUESS_WHO');
    expect(validate(guessWho(), 'guess-who', { returnResults: true }).warnings.join('\n')).not.toContain('ANON_GUESS_WHO');
    const make = await read('screens/make/make.js');
    expect(make).toContain('var needsNames = guessesAuthors(state.config);');
    expect(make).toContain("p.type === 'foreach' && p.candidateSource === 'players'");
  });
});

describe('37. A guess-who reveal waits for the teacher and says who guessed right', () => {
  it('the read repair takes the timer off the "It was" step and adds who had it', () => {
    const cfg = guessWho();
    expect(paceGuessWhoReveals(cfg)).toEqual(['rounds.reveal']);
    const reveal = cfg.phases.rounds.subPhases.reveal;
    expect(reveal.timer).toBeUndefined();
    expect(reveal.message).toBe('It was {{_current.playerName}}!\n\n{{guess.rightLine}}');
    // the "Who said it?" card keeps its own timing
    expect(cfg.phases.rounds.subPhases.show.timer).toBe(5);
    // twice is the same as once
    expect(paceGuessWhoReveals(cfg)).toEqual([]);
    expect(validate(cfg, 'guess-who', { returnResults: true }).errors).toEqual([]);
  });

  it('the line names the students who picked the author, or says nobody did', () => {
    const picks = [
      { name: 'Jordan', choice: 'Maya' },
      { name: 'Sam', choice: 'Maya' },
      { name: 'Ada', choice: 'Ben' }
    ];
    expect(guessedRightLine('en', picks, 'Maya')).toBe('Guessed right: Jordan, Sam');
    expect(guessedRightLine('en', picks, 'Lee')).toBe('Nobody guessed right.');
    expect(guessedRightLine('es', picks, 'Lee')).toBe('Nadie acertó.');
    expect(guessedRightLine('en', [], 'Maya')).toBe('');
  });

  it('the close stores it, the schema lists it, and the builder and Who Said It? show it', async () => {
    const server = await read('server.js');
    expect(server).toContain('if (rightAnswer != null) stored.rightLine = guessedRightLine(room.engine.language, choiceResponses, rightAnswer);');
    expect(server).toContain('const paced = paceGuessWhoReveals(config);');
    expect(PHASE_SCHEMAS['collect-choice'].output.fields.rightLine.type).toBe('string');
    const who = JSON.parse(await read('games/who-said-it/config.json'));
    expect(who.phases['guess-loop'].subPhases.reveal.message).toContain('{{guess.rightLine}}');
    expect(who.phases['guess-loop'].subPhases.reveal.timer).toBeUndefined();
    const steps = await read('screens/shared/step-suggestions.js');
    expect(steps).toContain("'\\n\\n{{guess.rightLine}}'");
  });
});

describe('42. Doodle Bluff: every fake on the chart, and the right words when none drew a vote', () => {
  it('a fake nobody picked keeps a zero row', () => {
    const tally = { 'A cat on a hat': 3 };
    withZeroRows(tally, ['A cat on a hat', 'A dog in fog', 'Moon soup']);
    expect(tally).toEqual({ 'A cat on a hat': 3, 'A dog in fog': 0, 'Moon soup': 0 });
  });

  it('the line under the chart says whether a fake fooled anyone', () => {
    const truth = 'A cat on a hat';
    expect(foolLine('en', [{ choice: truth }, { choice: truth }], truth)).toBe('Nobody fell for a fake this time.');
    expect(foolLine('en', [{ choice: truth }, { choice: 'Moon soup' }], truth)).toBe('Fake authors, own up! Whose fake pulled the votes?');
    expect(foolLine('fr', [{ choice: truth }], truth)).toBe("Cette fois, personne ne s'est fait avoir.");
    expect(foolLine('en', [], truth)).toBe('');
  });

  it('the recipe and the built-in show the line, never the fixed question', async () => {
    for (const file of ['recipes/doodle-bluff.json', 'games/doodle-bluff/config.json']) {
      const text = await read(file);
      expect(text, file).toContain('{{guess.foolLine}}');
      expect(text, file).not.toContain('Whose fake pulled the votes?');
    }
    expect(PHASE_SCHEMAS['collect-choice'].output.fields.foolLine.type).toBe('string');
    const server = await read('server.js');
    expect(server).toContain('withZeroRows(tally, ballot);');
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
