// A reviewer's live-play findings on jamyard.org (2026-10-02, items 30 to
// 50 of their list): the Spanish room that came out half English, Submit
// Ratings that did nothing, the solo quiz's "0 of 0" check, the squeezed
// quiz results, the joke over the final screen, the phone checklist, the
// red Submit Guess after the reveal, the console's block-character bars,
// and the editor's feedback corner over the settings column.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { STRINGS, translate } from '../../engine/i18n/index.js';

const read = (p) => readFileSync(p, 'utf8');

const NEW_KEYS = [
  'The room is', 'open.', 'Playing as:', 'A bit more time', 'Add 30 seconds',
  'Pick a rating on each scale.', 'The quiz is over.', 'You did not answer any questions this time.'
];

describe('a Spanish room reads Spanish (item 31)', () => {
  it('every new label has a row in every language table', () => {
    for (const lang of Object.keys(STRINGS)) {
      for (const key of NEW_KEYS) {
        expect(STRINGS[lang][key], lang + ': ' + key).toBeTruthy();
        expect(STRINGS[lang][key]).not.toBe(key);
      }
    }
    expect(translate('es', 'Playing as:')).toBe('Juegas como:');
  });

  it('the projector headline splits into two labels apply() can swap', () => {
    expect(read('screens/host/index.html')).toContain('<h2 class="room-open-headline">The room is <span class="t-painted-word">open.</span></h2>');
    expect(read('screens/player/index.html')).toContain('<p>Playing as: <strong id="player-name"></strong></p>');
  });

  it('the more-time button takes its label when it is shown, after the language arrived', () => {
    const host = read('screens/host/host.js');
    expect(host).toContain("moreTimeBtn.textContent = UiLang.t('A bit more time');");
  });

  it('a room in another language deals no English joke', () => {
    expect(read('server.js')).toContain('room.earlyJoke = createEarlyJokeState(config, room.engine.language);');
  });
});

describe('Submit Ratings says what is missing (item 34)', () => {
  it('stays pressable and shows the line when a scale has no pick', () => {
    const js = read('screens/player/player.js');
    expect(js).toContain("rateNotice.textContent = UiLang.t('Pick a rating on each scale.');");
    expect(js).toContain('if (!allScalesRated()) {');
    expect(js).not.toContain('rateSubmitBtn.disabled = !ready;');
    expect(read('screens/player/index.html')).toContain('<div id="rate-notice" class="response-notice" role="status" hidden></div>');
  });
});

describe('the solo quiz with nothing answered is honest (item 38)', () => {
  it('drops the check and the "0 of 0" for a student who answered none', () => {
    const js = read('screens/player/player.js');
    expect(js).toContain('var none = answered === 0;');
    expect(js).toContain('if (sqDoneMark) sqDoneMark.hidden = none;');
    expect(js).toContain("UiLang.t('You did not answer any questions this time.')");
    expect(read('screens/player/styles.css')).toContain('.done-mark[hidden] { display: none; }');
  });
});

describe('the solo quiz results take the whole projector (item 39)', () => {
  it('a rolling room whose doorway card has gone gives the section its width back', () => {
    expect(read('screens/host/styles.css')).toContain('body.rolling:has(#rolling-door[hidden]) section.active { padding-right: 0; }');
    // the results hide the door, which is what the rule keys on
    expect(read('screens/host/host.js')).toMatch(/socket\.on\('solo-quiz-results'[\s\S]{0,200}hideRollingDoor\(\);/);
  });
});

describe('the joke never sits over the final screen (item 40)', () => {
  it('the end and the done screen fold it, and a reconnect at the end gets none', () => {
    const js = read('screens/player/player.js');
    expect(js).toMatch(/socket\.on\('game-ended'[\s\S]{0,200}hideEarlyJoke\(\);/);
    expect(js).toMatch(/socket\.on\('player-done'[\s\S]{0,250}hideEarlyJoke\(\);/);
    expect(read('server.js')).toContain('isJokeReconnect({ phaseType: rjPhase ? rjPhase.type : null, rolling: rjRolling })');
  });
});

describe('a phone checklist shows its tasks (item 44)', () => {
  it('the heading steps down at narrow widths', () => {
    const css = read('screens/player/styles.css');
    expect(css).toMatch(/@media \(max-width: 600px\) \{\s*#checklist-prompt-display \{ font-size: 1\.15rem;/);
  });
});

describe('the guess closes with the reveal (item 48)', () => {
  it('the input and Submit Guess leave the screen, and a disabled red action reads grey', () => {
    const js = read('screens/player/player.js');
    expect(js).toMatch(/socket\.on\('estimate-results'[\s\S]{0,600}estimateSubmitBtn\.hidden = true;/);
    expect(js).toContain('estimateSubmitBtn.hidden = false;');
    const css = read('screens/player/styles.css');
    expect(css).toContain('#estimate-submit-btn:disabled,');
    expect(css).toContain('.estimate-input-row[hidden] { display: none; }');
  });
});

describe('the console draws a chart, not block characters (item 49)', () => {
  it('loads the shared chart module and renders the step words through it', () => {
    expect(read('screens/teacher/index.html')).toContain('<script src="/shared/chart-render.js"></script>');
    const js = read('screens/teacher/teacher.js');
    expect(js).toContain('renderStepText(stepText, words);');
    expect(js).toContain('ChartRender.buildSegment(seg)');
    expect(read('screens/teacher/styles.css')).toContain('.step-text .msg-chart {');
  });
});

describe('the feedback corner sits over nothing in the editor (item 30)', () => {
  it('the settings column stops short of the bottom edge', () => {
    expect(read('screens/designer/editor.css')).toContain('body.editor-page #editor-body > #settings-panel { margin-bottom: 64px;');
  });
});
