/**
 * A reviewer's phone-sized round (2026-09-26): one tap on Reject wiped a
 * class's drawings, a refresh mid-drawing lost the work and the timer, an
 * old host link opened a different activity, the picked colour looked like
 * the rest, and the Submit button moved under the thumb. Source guards for
 * every fix; the room-level proof is scripts/simulate-phone-round.js.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { STRINGS } from '../../engine/i18n/index.js';
import { EVENTS } from '../../engine/events.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

describe('Reject asks first, on both teacher surfaces', () => {
  it('the projector button reads as the console does, and as the review text names it', () => {
    expect(read('screens/host/index.html')).toContain('id="preview-reject-btn" class="btn-danger" title="Don’t show it, the whole class does this step again">Try again</button>');
  });
  it('the projector confirms through Dialog.confirm and offers Hide instead', () => {
    const host = read('screens/host/host.js');
    expect(host).toContain('Dialog.confirm(rejectQuestion())');
    expect(host).toContain("title: 'Start this step over?'");
    expect(host).toContain("confirmLabel: 'Start over', cancelLabel: 'Keep them'");
    expect(host).toMatch(/use Hide on that one instead/);
    // the projector loads the dialog module (it did already, for Close on nothing)
    expect(read('screens/host/index.html')).toContain('/shared/dialog.js');
  });
  it('the console confirms the same way and loads the dialog module before its script', () => {
    const teacher = read('screens/teacher/teacher.js');
    expect(teacher).toContain("title: 'Start this step over?'");
    expect(teacher).toContain('if (yes) sendReject()');
    const html = read('screens/teacher/index.html');
    expect(html.indexOf('/shared/dialog.js')).toBeGreaterThan(-1);
    expect(html.indexOf('/shared/dialog.js')).toBeLessThan(html.indexOf('src="teacher.js"'));
    // never the browser's confirm (it freezes the page, a reviewer found it foreign)
    expect(teacher).not.toMatch(/window\.confirm|[^.\w]confirm\(/);
  });
  it('names drawings when the review is over drawings', () => {
    expect(read('screens/host/host.js')).toContain("previewHasDrawings ? 'drawing' : 'answer'");
    expect(read('screens/teacher/teacher.js')).toContain("previewHasDrawings ? 'drawing' : 'answer'");
  });
});

describe('Hide one entry from the projector\'s private review list', () => {
  it('every entry with a player id gets a Hide that sends moderate-hide', () => {
    const host = read('screens/host/host.js');
    expect(host).toContain("hideBtn.className = 'preview-hide-btn'");
    expect(host).toContain("socket.emit('moderate-hide', { code: currentRoomCode, playerId, hidden: true })");
    expect(read('screens/host/styles.css')).toContain('.preview-hide-btn {');
  });
  it('a refreshed list keeps the private toggle where the teacher left it', () => {
    const host = read('screens/host/host.js');
    expect(host).toMatch(/socket\.on\('preview-content', \(\{ content, responses, hostTemplate, show, refresh, oneByOne \}\)/);
    expect(host).toContain('if (!refresh) {');
  });
  it('the server re-sends the list to the projector too, marked as a refresh', () => {
    const server = read('server.js');
    expect(server).toMatch(/const again = \{ content: data\.content, responses: data\.responses, phaseInstanceId: room\.phaseInstanceId, refresh: true \};/);
    expect(server).toMatch(/if \(hostId\) io\.to\(hostId\)\.emit\(EVENTS\.PREVIEW_CONTENT, again\);/);
  });
});

describe('The class is told why the step is up again', () => {
  it('a reject sends step-note to every student before the step restarts', () => {
    expect(EVENTS.STEP_NOTE).toBe('step-note');
    const preview = read('engine/phase-handlers/preview.js');
    const note = preview.indexOf('EVENTS.STEP_NOTE');
    const advance = preview.indexOf('await ctx.advanceTo(currentPhase.rejectNext)');
    expect(note).toBeGreaterThan(-1);
    expect(note).toBeLessThan(advance);
    expect(preview).toContain("'Your teacher asked everyone to do this step again.'");
  });
  it('every language table carries the line', () => {
    for (const lang of Object.keys(STRINGS)) {
      expect(STRINGS[lang], lang).toHaveProperty('Your teacher asked everyone to do this step again.');
    }
  });
  it('the student screen shows it over the next prompt, once, and it expires', () => {
    const player = read('screens/player/player.js');
    expect(player).toContain("socket.on('step-note'");
    expect(player).toContain('until: Date.now() + 15000');
    expect(player).toContain("document.getElementById('step-note')");
    expect(read('screens/player/index.html')).toContain('id="step-note"');
    expect(read('screens/player/styles.css')).toContain('.step-note[hidden] { display: none; }');
  });
});

describe('A drawing survives a refresh', () => {
  it('the pad tells its own strokes from inherited ones and takes them back', () => {
    const draw = read('screens/shared/drawing.js');
    expect(draw).toContain('getOwnStrokes: function () { return strokes.slice(preloaded); }');
    expect(draw).toContain('addStrokes: function (s) {');
  });
  it('every stroke saves the draft; the same seat and step restores it; an accepted answer clears it', () => {
    const player = read('screens/player/player.js');
    expect(player).toContain("var DRAW_DRAFT_KEY = 'jamyard.drawDraft'");
    expect(player).toContain('onChange: function () { spendResponseNotice(); saveDrawDraft(); }');
    expect(player).toContain('var draft = readDrawDraft();');
    expect(player).toContain('if (draft) drawPadApi.addStrokes(draft);');
    const accepted = player.indexOf("socket.on('response-accepted'");
    expect(player.indexOf('clearDrawDraft();', accepted)).toBeGreaterThan(accepted);
    expect(player.indexOf('clearDrawDraft();', accepted) - accepted).toBeLessThan(200);
    // the key names the room, the seat, and the step
    expect(player).toMatch(/currentRoomCode \|\| ''\) \+ ':' \+ \(currentPlayerName \|\| ''\) \+ ':' \+ \(currentCollectPhaseId/);
  });
  it('a reconnect gets the seconds left, and more time pushes the deadline back', () => {
    const collect = read('engine/phase-handlers/collect.js');
    expect(collect).toContain('recordDeadline(ctx.room, timer);');
    expect(collect).toContain('timer: secondsLeft(ctx.room)');
    const server = read('server.js');
    expect(server).toContain('room.phaseState.timerEndsAt = Math.max(room.phaseState.timerEndsAt, Date.now()) + EXTEND_TIMER_SECONDS * 1000;');
  });
});

describe('An old host link says so', () => {
  it('a ?game= that no longer exists shows the note and opens nothing', () => {
    const host = read('screens/host/host.js');
    expect(host).toContain("That activity isn't available anymore.");
    expect(read('screens/host/index.html')).toContain('id="game-missing-note"');
    expect(read('screens/host/styles.css')).toContain('.game-missing-note[hidden] { display: none; }');
  });
});

describe('Drawing on a phone', () => {
  it('the picked colour wears a paper gap and an ink ring, and says so to a screen reader', () => {
    const css = read('screens/player/styles.css');
    expect(css).toMatch(/\.draw-swatch-active \{\s*outline: none;\s*box-shadow: [^}]*0 0 0 3px var\(--t-paper\), 0 0 0 6px var\(--t-ink\)/);
    const player = read('screens/player/player.js');
    expect(player).toContain("swatch.setAttribute('aria-pressed', picked ? 'true' : 'false')");
    expect(read('screens/shared/drawing.js')).toContain("var COLOR_NAMES = ['Black', 'Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Orange', 'White']");
    // Totem buttons wear a torn-paper clip that would clip the ring
    expect(css).toContain('.draw-swatch { clip-path: none;');
  });
  it('an answered notice keeps its room so Submit stays put', () => {
    expect(read('screens/player/styles.css')).toContain('.response-notice.is-spent { visibility: hidden; }');
    const player = read('screens/player/player.js');
    expect(player).toContain("responseNotice.classList.add('is-spent')");
    // only the helper hides the notice for real; every activity path spends it
    expect((player.match(/responseNotice.hidden = true/g) || []).length).toBe(1);
  });
  it('the joke bubble is smaller on a phone', () => {
    expect(read('screens/player/styles.css')).toMatch(/@media \(max-width: 480px\) \{\s*\.early-joke \{/);
  });
});
