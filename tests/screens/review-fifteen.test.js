/**
 * A fifteenth outside review (2026-09-27, the reviewer tried to break
 * things on purpose): a rude name went up on the projector unfiltered, a
 * closed projector tab could not be brought back, removing a student was
 * a hover-only x on the projector with nothing on the console, a removed
 * student stayed locked out, the AI builder offered a plan it already
 * knew would fail, the console never said which question was up, a long
 * question and long names on the projector, and a room left open after
 * the projector closed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { filterName, NAME_REFUSED_MESSAGE } from '../../engine/content-filter.js';
import { EVENTS } from '../../engine/events.js';
import { EVENT_SCHEMAS } from '../../engine/event-schemas.js';
import { STRINGS } from '../../engine/i18n/index.js';
import '../../screens/host/host-session.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const server = read('server.js');

describe('student names go through the filter', () => {
  it('a blocked word alone, glued to a tail, or behind a head is refused, in leet and with separators', () => {
    for (const name of ['shithead', 'ShitHead', 'Fuckface', 'asshole', 's.h.i.t.head', 'bigdick', 'shit', 'Mr Shit', 'shitty', 'fuckers', 'Sh1thead']) {
      expect(filterName(name).blocked, name).toBe(true);
    }
  });
  it('surnames and words that merely contain a fragment pass', () => {
    for (const name of ['Dickson', 'Cummings', 'Spicer', 'Spicy', 'Mississippi', 'Cassandra', 'Sam', 'Maximilian', 'Scunthorpe', 'Fagan', 'Dickens', 'Cockburn', 'Shitake']) {
      expect(filterName(name).blocked, name).toBe(false);
    }
    expect(filterName('').blocked).toBe(false);
    expect(filterName(null).blocked).toBe(false);
  });
  it('join-room refuses a blocked name before it is seated, never in an anonymous room', () => {
    const joinAt = server.indexOf('socket.on(EVENTS.JOIN_ROOM');
    const checkAt = server.indexOf('if (!anonymousRoom && filterName(name).blocked) {', joinAt);
    const classifyAt = server.indexOf('const verdict = classifyJoin(players', joinAt);
    expect(checkAt).toBeGreaterThan(joinAt);
    expect(checkAt).toBeLessThan(classifyAt);
    expect(server).toContain('socket.emit(EVENTS.JOIN_ERROR, { message: NAME_REFUSED_MESSAGE });');
  });
  it('the refused line has a row in every language table and names no word', () => {
    expect(NAME_REFUSED_MESSAGE).toBe('That name cannot go on the big screen. Use your first name.');
    for (const code of Object.keys(STRINGS)) {
      expect(STRINGS[code][NAME_REFUSED_MESSAGE], code).toBeTruthy();
    }
  });
});

describe('a closed projector tab comes back', () => {
  const { connectAction, urlAfterCreate, REMEMBER_MS } = globalThis.HostSession;
  it('host-rejoin takes the teacher PIN when the tab has no token left, through the console throttle', () => {
    expect(EVENT_SCHEMAS['host-rejoin']).toEqual({ code: 'string:required', hostToken: 'string:optional', pin: 'string:optional' });
    const at = server.indexOf('socket.on(EVENTS.HOST_REJOIN');
    const block = server.slice(at, server.indexOf('socket.on(EVENTS.START_GAME'));
    expect(block).toContain('if (hostToken !== room.hostToken) {');
    expect(block).toContain('pinThrottle.check(code, Date.now())');
    expect(block).toContain('checkTeacherAccess(');
    expect(block).toContain("message: 'Wrong PIN for that room.'");
    // a second projector takes the room over and the first is told
    expect(block).toContain('replaced: true');
  });
  it('the host page reads ?room= with the PIN in the hash, and remembers its last room for six hours', () => {
    expect(connectAction({ search: '?room=lmrj', hash: '#pin=1234' })).toEqual({ kind: 'rejoin-pin', code: 'LMRJ', pin: '1234' });
    expect(connectAction({ search: '?room=LMRJ' })).toEqual({ kind: 'none' });
    const rem = { code: 'LMRJ', hostToken: 'tok', at: 1000 };
    expect(connectAction({ search: '', remembered: rem, now: 1000 + 60 * 60 * 1000 })).toEqual({ kind: 'rejoin', code: 'LMRJ', hostToken: 'tok' });
    expect(connectAction({ search: '', remembered: rem, now: 1000 + REMEMBER_MS + 1 })).toEqual({ kind: 'none' });
    // a launch for a new room still starts fresh
    expect(connectAction({ search: '?game=closer', remembered: rem, now: 2000 })).toEqual({ kind: 'fresh' });
    expect(urlAfterCreate('?room=LMRJ')).toBe('/host');
    const js = read('screens/host/host.js');
    expect(js).toContain("const HOST_MEMORY_KEY = 'jamyard.hostRoom';");
    expect(js).toContain("socket.emit('host-rejoin', { code: action.code, pin: action.pin });");
    expect(js).toContain('if (!IS_PROTOTYPE_HOST) rememberHostRoom(code, hostToken);');
  });
  it('the console offers Open the projector again and says the room stays while it is on', () => {
    const html = read('screens/teacher/index.html');
    expect(html).toContain('id="reopen-projector-btn"');
    expect(html).toContain('The room stays open while you are on this console.');
    expect(html).not.toContain('Reload the host tab on the projector');
    const js = read('screens/teacher/teacher.js');
    expect(js).toContain("var url = '/host?room=' + encodeURIComponent(currentCode) + '#pin=' + encodeURIComponent(currentPin || '');");
    expect(js).toContain("socket.on('room-closed', function () {");
  });
  it('the room is held while a console is connected and closed otherwise, and a restored room is held too', () => {
    expect(server).toContain('function holdRoomForHost(code, room) {');
    expect(server).toContain('if (consoleOn && heldFor < ROOM_SNAPSHOT_TTL_MS) {');
    // the disconnect path and the snapshot restore both use it
    const disconnectAt = server.indexOf("console.log(`[disconnect] Host left ${roomCode}");
    expect(server.indexOf('holdRoomForHost(roomCode, room);', disconnectAt)).toBeGreaterThan(disconnectAt);
    const restoreAt = server.indexOf('async function tryRestoreRoom');
    expect(server.indexOf('holdRoomForHost(code, room);', restoreAt)).toBeGreaterThan(restoreAt);
    expect(server).toContain('io.to(teachersChannel(code)).emit(EVENTS.ROOM_CLOSED);');
  });
});

describe('Rename and Remove on the console', () => {
  it('the console lobby lists every student with Rename and Remove, and Remove asks first', () => {
    const js = read('screens/teacher/teacher.js');
    expect(js).toContain("renameBtn.textContent = 'Rename';");
    expect(js).toContain("removeBtn.textContent = 'Remove';");
    expect(js).toContain("socket.emit('moderate-rename', { code: currentCode, playerId: p.id, name: wanted });");
    expect(js).toContain("socket.on('teacher-rename-error'");
    expect(js).not.toContain("lobbyRoster.textContent = names.length ? names.join(' · ')");
    expect(read('screens/teacher/index.html')).toContain('<ul id="lobby-roster" class="lobby-roster"');
  });
  it('the server renames through the same name checks and tells every screen', () => {
    expect(EVENTS.MODERATE_RENAME).toBe('moderate-rename');
    expect(EVENTS.RENAMED).toBe('renamed');
    expect(EVENT_SCHEMAS['moderate-rename']).toEqual({ code: 'string:required', playerId: 'string:required', name: 'string:required' });
    const at = server.indexOf('socket.on(EVENTS.MODERATE_RENAME');
    const block = server.slice(at, server.indexOf('socket.on(EVENTS.EXTEND_TIMER'));
    expect(block).toContain('if (!isTeacherSocket(code, room, socket.id)) return;');
    expect(block).toContain('if (room.engine.config && room.engine.config.anonymous) return;');
    expect(block).toContain('if (filterName(wanted).blocked) {');
    expect(block).toContain('players.update(playerId, { name: wanted });');
    expect(block).toContain('renamed.emit(EVENTS.RENAMED, { name: wanted');
    expect(block).toContain('emitRoomRoster(code, room);');
    expect(block).toContain('emitTeacherRoster(code, room);');
  });
  it('the student screen takes the new name; the projector asks through the site box, not the browser', () => {
    const player = read('screens/player/player.js');
    expect(player).toContain("socket.on('renamed', ({ name, message } = {}) => {");
    expect(player).toContain('playerNameDisplay.textContent = name;');
    const host = read('screens/host/host.js');
    expect(host).not.toContain("window.confirm('Remove '");
    expect(host).toContain("confirmLabel: 'Remove', cancelLabel: 'Keep them'");
  });
});

describe('the AI builder and the console', () => {
  it('an idea that lives off the screens leads with the close matches and offers no plan', () => {
    const designer = read('screens/designer/designer.js');
    expect(designer).toContain("offScreen ? 'Screens cannot do that part'");
    expect(designer).toContain('if (!harm && !offScreen) btnRow.appendChild(storyboardBtn);');
    expect(designer).toContain("pickBtn.className = 'recipe-create-btn';");
    const ai = read('services/ai-service.js');
    expect(ai).toContain('"offScreen": false');
    expect(ai).toContain('offScreen: parsed.offScreen === true');
  });
  it('the match and storyboard routes forward harm (and offScreen) to the card', () => {
    expect(server).toContain('harm: match.harm === true,');
    expect(server).toContain('offScreen: match.offScreen === true,');
    expect(server).toContain('json: { cantBuild: true, harm: storyboard.harm === true, reason: storyboard.reason');
  });
  it("the console shows the step's words on the phase change and the join snapshot", () => {
    expect(server).toContain('function stepTextFor(phase, engine) {');
    expect(server.match(/stepText: stepTextFor\(phase, engine\)/g).length).toBe(2);
    expect(server).toContain('snap.stepText = stepTextFor(phase, engine);');
    const js = read('screens/teacher/teacher.js');
    expect(js).toContain("var stepText = document.getElementById('step-text');");
    expect(js).toContain("stepText.hidden = !words || phaseType === 'lobby' || phaseType === 'end';");
  });
});

describe('long questions and long names', () => {
  it('the make page says a long question shows smaller on the projector, at the length the projector shrinks it', () => {
    const js = read('screens/make/make.js');
    expect(js).toContain('var LONG_QUESTION_CHARS = 160;');
    expect(js).toContain("longNote.textContent = 'Long questions show smaller on the projector. A shorter one reads from the back of the room.';");
    expect(read('screens/host/host.js')).toContain("promptDisplay.classList.toggle('prompt-long', String(prompt || '').length > 160);");
  });
  it('a long name wraps at a smaller size instead of ending in dots', () => {
    const css = read('screens/host/styles.css');
    expect(css).toContain('#player-list li.long-name > span:not(.player-avatar) {');
    expect(css).toContain('overflow-wrap: anywhere;');
    expect(read('screens/host/host.js')).toContain("if (String(player.name || '').length > 11) li.classList.add('long-name');");
  });
  it('the proof script covers the name, the rename, the PIN rejoin, and the step words', () => {
    const sim = read('scripts/simulate-review-fifteen.js');
    expect(sim).toContain("name: 'shithead'");
    expect(sim).toContain("'moderate-rename'");
    expect(sim).toContain("host2.emit('host-rejoin', { code, pin: roomData.teacherPin })");
    expect(sim).toContain('stepText');
  });
});
