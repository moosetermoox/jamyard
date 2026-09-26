/**
 * A reviewer's fourth round (2026-09-26): the My yard tools, search and
 * filters, the quiz panel, a live quiz from the student side. Source-level
 * guards beside the engine tests (tests/engine/solo-quiz-scoring.test.js,
 * tests/engine/early-joke.test.js).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { STRINGS } from '../../engine/i18n/index.js';
import { AUDIENCE_LABELS } from '../../engine/audience.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

describe('the self-paced quiz', () => {
  it('deals each student their own choice order and says how many they answered', () => {
    const handler = read('engine/phase-handlers/solo-quiz.js');
    expect(handler).toContain("shuffledChoices(q.choices, playerId + '|' + p.index)");
    expect(handler).toMatch(/answered,/);
    const player = read('screens/player/player.js');
    expect(player).toContain("UiLang.t('answered')");
    for (const lang of Object.keys(STRINGS)) expect(STRINGS[lang].answered).toBeTruthy();
  });

  it('counts a new seat on the projector before anyone answers, and drops the join card at the results', () => {
    const server = read('server.js');
    const joinLog = server.indexOf('[join-room] Player ${socket.id} joined room');
    expect(server.slice(joinLog, joinLog + 400)).toContain('emitSoloQuizProgress(code, room);');
    const host = read('screens/host/host.js');
    const results = host.indexOf("socket.on('solo-quiz-results'");
    expect(host.slice(results, results + 300)).toContain('hideRollingDoor();');
  });

  it('names the quiz after its topic on the make page and redraws the preview as the list changes', () => {
    const miy = read('screens/shared/make-it-yours.js');
    expect(miy).toContain('function showQuizCustomizeDialog(game, config, recipeSummary, mount, opts)');
    expect(miy).toContain("listWrap.addEventListener('input', notifyChange)");
    expect(miy).toContain('writtenTopic = topic;');
    expect(miy).toContain("listWrap.style.maxHeight = 'none'");
    expect(miy).not.toContain('Check every answer before you save');
    const make = read('screens/make/make.js');
    expect(make).toContain('{ onChange: previewParams }');
    expect(make).toMatch(/if \(data\.print\) applyFittedPrint\(data\.print\);\s*\r?\n\s*if \(data\.map\) redrawMap\(data\.map\);/);
  });

  it('says the answers, not the preview, are what only the teacher sees', () => {
    expect(AUDIENCE_LABELS.teacher).toBe('Only your teacher sees your answers.');
    for (const lang of Object.keys(STRINGS)) {
      expect(STRINGS[lang]['Only your teacher sees your answers.']).toBeTruthy();
      expect(STRINGS[lang]['Only your teacher sees this.']).toBeUndefined();
    }
  });
});

describe('the early-bird joke on the student screen', () => {
  const player = read('screens/player/player.js');
  it('folds on the first answer, stays folded on a refresh, and never moves the screen under it', () => {
    expect(player).toMatch(/STUDENT_ACT_RE = \/\^\(submit-\|solo-quiz-answer/);
    expect(player).toContain("sessionStorage.setItem(key, '1')");
    expect(player).toContain('if (jokeAlreadyDone()) return;');
    expect(player).toContain("earlyJokePunchline.classList.toggle('is-waiting', waiting)");
    const css = read('screens/player/styles.css');
    expect(css).toContain('.early-joke-punchline.is-waiting, .early-joke-dismiss.is-waiting { visibility: hidden; }');
    expect(read('screens/player/index.html')).toContain('class="early-joke-slot"');
  });
});

describe('the student join screen', () => {
  const player = read('screens/player/player.js');
  it('clears Room not found on a new code, joins on Enter, and says where a name stops', () => {
    const codeInput = player.indexOf("roomCodeInput.addEventListener('input'");
    expect(player.slice(codeInput, codeInput + 500)).toContain('errorMessage.hidden = true;');
    expect(player).toContain("if (e.key === 'Enter' && !joinBtn.disabled) { e.preventDefault(); joinBtn.click(); }");
    expect(player).toContain("'Names stop at ' + nameInput.maxLength + ' letters");
    const css = read('screens/player/styles.css');
    expect(css).toMatch(/#error-message \{[^}]*background: var\(--t-paper/);
  });
});

describe('the home', () => {
  const home = read('screens/home/index.html');
  it('keeps Solo Quiz out of the five-minute moment and searches the example words', () => {
    expect(home).toContain("{ label: 'Only 5 minutes left', ids: ['exit-ticket', 'live-poll'] }");
    expect(home).toContain("+ ' ' + exampleWords(g)).toLowerCase()");
  });
  it('deletes through the site\'s own dialog and hearts in place', () => {
    const yard = read('screens/shared/my-yard.js');
    expect(yard).toContain("Dialog.confirm({ title: 'Delete \"' + game.name + '\"?'");
    expect(yard).not.toMatch(/^\s*if \(!window\.confirm/m);
    expect(yard).toContain("opts.onChange({ hearted: game.id, inPlace: true })");
    expect(read('screens/shared/dialog.js')).toContain('globalThis.Dialog = { enhance: enhance, confirm: confirm };');
    expect(home).toContain('change.inPlace');
  });
});
