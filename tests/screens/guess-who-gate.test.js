/**
 * A reviewer's Guess Who: Rose, Bud, Thorn round (2026-09-26): a student's
 * private struggle went straight onto the projector with the class asked
 * to guess who wrote it. Source guards for every fix; the rules are unit
 * tested in tests/engine/review-gate.test.js and the room-level proof is
 * scripts/simulate-guess-who-gate.js.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { STRINGS } from '../../engine/i18n/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

describe('a teacher review step before any guessing round', () => {
  it('the storyboard compiler puts a preview between the question and the rounds', () => {
    const src = read('screens/shared/step-suggestions.js');
    expect(src).toContain("var gateId = freshId(phases, 'check');");
    expect(src).toContain('approveNext: rounds.id,');
    expect(src).toContain('rejectNext: rounds.src');
    expect(src).toContain('return { id: id, src: src, phase: phase };');
  });
  it('a copy saved before the gate gets one on read', () => {
    const server = read('server.js');
    expect(server).toContain("import { ensureReviewGate, paceGuessWhoReveals } from './engine/review-gate.js';");
    const fn = server.indexOf('function repairSavedConfig(config) {');
    expect(server.indexOf('const gates = ensureReviewGate(config, { secretOnly: true });', fn) - fn).toBeLessThan(600);
  });
});

describe('the author gives nothing away', () => {
  it('the round is stamped when the author is the secret', () => {
    expect(read('server.js')).toContain("subConfig._foreachSecretAuthor = feConfig.candidateSource === 'players';");
  });
  it('the projector count treats the author as already in, at the start and on every answer', () => {
    expect(read('engine/phase-handlers/collect-choice.js')).toContain('const countStart = phase._foreachSecretAuthor ? sittingOut : 0;');
    expect(read('engine/phase-handlers/collect-choice.js')).toContain('count: countStart, total: countTotal,');
    const server = read('server.js');
    expect(server).toContain('if (secret && secret._foreachSecretAuthor) {');
    expect(server).toContain("import { foreachSitOut, withoutSitOut, sitOutIds } from './engine/phases/sit-out.js';");
  });
  it("the author's waiting line is everyone's waiting line", () => {
    expect(read('engine/phases/sit-out.js')).toContain("if (phase._foreachSecretAuthor) return 'Waiting for the others...';");
  });
});

describe('the answer box says what will happen', () => {
  it('every language table carries the guessed lines', () => {
    for (const lang of Object.keys(STRINGS)) {
      expect(STRINGS[lang], lang).toHaveProperty('Your class will see this and try to guess who wrote it.');
      expect(STRINGS[lang], lang).toHaveProperty('Your class will see this and try to guess who wrote it, after your teacher reviews it.');
    }
  });
});

describe('a heavy topic is flagged for the teacher, never blocked', () => {
  it('the submit path marks it "heavy" when the ladder had no verdict', () => {
    const server = read('server.js');
    expect(server).toContain("import { heavyTopic } from './engine/heavy-topics.js';");
    expect(server).toContain("if (!flaggedCategory && currentPhase && currentPhase.type === 'collect' && heavyTopic(modText)) {");
    expect(server).toContain("flaggedCategory = 'heavy';");
  });
  it('the review list carries the flag and both teacher surfaces show the chip', () => {
    expect(read('engine/phase-handlers/preview.js')).toContain('...(who && who.responseFlagged ? { flagged: true } : {}),');
    expect(read('screens/teacher/teacher.js')).toContain("look.textContent = 'Needs a look';");
    const host = read('screens/host/host.js');
    expect(host).toContain("look.className = 'preview-flag';");
    expect(read('screens/host/styles.css')).toContain('.preview-flag {');
  });
  it('nothing a student or the projector reads names the flag', () => {
    const player = read('screens/player/player.js');
    expect(player).not.toContain('Needs a look');
    expect(player).not.toContain('heavy');
  });
});

describe('smaller things from the round', () => {
  it('the popup keeps room for What happens so the red door never moves under a first click', () => {
    expect(read('screens/shared/my-yard.js')).toContain("var mapHolder = el('div', 'myyard-map-holder');");
    expect(read('screens/shared/my-yard.css')).toContain('.myyard-map-holder { min-height: 220px; }');
  });
});
