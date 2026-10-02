/**
 * An outside reviewer's findings on jamyard.org (2026-10-02, part I).
 * One block per finding that was real; each names what the reviewer saw.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import '../../screens/shared/step-suggestions.js';
import { promisesAnonymity, promisedCollectIds, markPromisedUnattributed } from '../../engine/anonymity-promise.js';
import { GameEngine } from '../../engine/game-engine.js';
import { rolesForGroup } from '../../engine/phases/checklist-state.js';
import { retagGroups, itemRolesFor } from '../../engine/phase-handlers/checklist.js';
import { submissionCountPayload } from '../../engine/moderation.js';
import { extraTimeCap, pressMoreTime, MORE_TIME_CEILING } from '../../engine/more-time.js';
import { isEarlyBirdJoin, isJokeReconnect, splitJoke, ROLLING_EARLY_MS } from '../../engine/early-joke.js';
import { STRINGS } from '../../engine/i18n/index.js';

const S = globalThis.StepSuggestions;
const read = (rel) => readFileSync(new URL('../../' + rel, import.meta.url), 'utf8');
const golden = JSON.parse(read('tests/designer/golden-prompts.json'));
const goldenList = Array.isArray(golden) ? golden : (golden.prompts || golden.cases || []);
const plan = (id) => goldenList.find(g => g.id === id).expect.storyboard;

describe('A. a step that promised anonymity keeps its answers unnamed for the teacher', () => {
  it('reads the promises, and not the ones about passing or about one classmate', () => {
    expect(promisesAnonymity('Nobody will know who asked what.')).toBe(true);
    expect(promisesAnonymity('No names on these. Ask the thing you have been wondering.')).toBe(true);
    expect(promisesAnonymity('Your teacher will see a summary, not who said what.')).toBe(true);
    expect(promisesAnonymity('Your answers are anonymous.')).toBe(true);
    // Closer's promise is about passing, Feedback Academy's about one classmate
    expect(promisesAnonymity('You can pass on any question, anytime. Nobody will know.')).toBe(false);
    expect(promisesAnonymity('It will be shared anonymously with one classmate, who will write you feedback.')).toBe(false);
    expect(promisesAnonymity('Guess who said what!')).toBe(false);
  });

  it('the Create page\'s question box comes out unattributed in the room', () => {
    const { config } = S.compileStoryboard(plan('anonymous-question-box'));
    const ask = Object.entries(config.phases).find(([, p]) => p.type === 'collect');
    expect(ask[1].unattributed).toBeUndefined();
    expect(promisedCollectIds(config)).toEqual([ask[0]]);
    const engine = new GameEngine(config);
    expect(engine.config.phases[ask[0]].unattributed).toBe(true);
    // the loaded config is never changed
    expect(config.phases[ask[0]].unattributed).toBeUndefined();
  });

  it('a collect\'s own words count, a reviewed `unattributed: false` stands, and an anonymous room needs nothing', () => {
    const base = { name: 'x', phases: {
      lobby: { type: 'lobby', next: 'ask' },
      ask: { type: 'collect', prompt: 'Ask anything. Nobody will know who asked what.', next: 'other' },
      other: { type: 'collect', prompt: 'Your name and your favorite fruit.', next: 'end' },
      end: { type: 'end' }
    } };
    expect(promisedCollectIds(base)).toEqual(['ask']);
    expect(markPromisedUnattributed(base).phases.other.unattributed).toBeUndefined();
    const reviewed = { ...base, phases: { ...base.phases, ask: { ...base.phases.ask, unattributed: false } } };
    expect(promisedCollectIds(reviewed)).toEqual([]);
    expect(promisedCollectIds({ ...base, anonymous: true })).toEqual([]);
  });

  it('every built-in and recipe that promises anonymity says unattributed (or plays anonymous)', () => {
    const offenders = [];
    for (const dir of readdirSync(new URL('../../games/', import.meta.url))) {
      const file = 'games/' + dir + '/config.json';
      if (!existsSync(new URL('../../' + file, import.meta.url))) continue;
      const config = JSON.parse(read(file));
      for (const id of promisedCollectIds(config)) {
        if (config.phases[id].unattributed !== true) offenders.push(file + ' ' + id);
      }
    }
    for (const name of readdirSync(new URL('../../recipes/', import.meta.url)).filter(f => f.endsWith('.json'))) {
      const recipe = JSON.parse(read('recipes/' + name));
      const template = recipe.template;
      if (!template || !template.phases) continue;
      for (const id of promisedCollectIds(template)) {
        if (template.phases[id].unattributed !== true) offenders.push('recipes/' + name + ' ' + id);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('12. a jigsaw hands each expert group its section', () => {
  it('the expert step gets numbered stations from the first split, the regroup none', () => {
    const { config, problems } = S.compileStoryboard(plan('jigsaw-reading'));
    expect(problems).toEqual([]);
    const ask = config.phases.ask;
    expect(ask.stations).toEqual(['Section 1', 'Section 2', 'Section 3', 'Section 4']);
    expect(ask.stationsFrom).toBe('teams');
    expect(ask.prompt).toContain('{{ask.station}}');
    const three = S.compileStoryboard(plan('jigsaw-three-expert-groups')).config;
    expect(three.phases.ask.stations).toEqual(['Section 1', 'Section 2', 'Section 3']);
  });

  it('the plan\'s own stations win, and a Spanish plan reads Sección', () => {
    const own = plan('jigsaw-reading');
    const steps = own.steps.map(s => s.brick === 'collect' ? { ...s, stations: ['The water cycle', 'Clouds'] } : s);
    expect(S.compileStoryboard({ ...own, steps }).config.phases.ask.stations).toEqual(['The water cycle', 'Clouds']);
    const es = S.compileStoryboard({ ...own, language: 'es' }).config;
    expect(es.phases.ask.stations[0]).toBe('Sección 1');
  });

  it('the storyboard prompt says so', () => {
    expect(read('services/ai-service.js')).toContain('never tell students to read "your assigned section" without them');
  });
});

describe('13. a job nobody in the group holds goes to someone who is there', () => {
  const roles = ['Facilitator', 'Recorder', 'Timekeeper', 'Reporter'];
  it('a team of two gets every task tagged with a job one of them has', () => {
    const tags = ['Facilitator', 'Recorder', 'Timekeeper', 'Reporter', null];
    const out = rolesForGroup(tags, ['a', 'b'], { a: 'Facilitator', b: 'Recorder' });
    expect(out.slice(0, 2)).toEqual(['Facilitator', 'Recorder']);
    expect(out.slice(2, 4).every(r => r === 'Facilitator' || r === 'Recorder')).toBe(true);
    expect(new Set(out.slice(2, 4)).size).toBe(2); // spread, not piled on one
    expect(out[4]).toBeNull();
    // a full team keeps every tag as written
    expect(rolesForGroup(tags, ['a', 'b', 'c', 'd'], { a: roles[0], b: roles[1], c: roles[2], d: roles[3] })).toEqual(tags);
    // nobody holds a job: untagged
    expect(rolesForGroup(['Timekeeper'], ['a'], {})).toEqual([null]);
  });

  it('the handler sends each student their own group\'s tags', () => {
    const state = {
      solo: false,
      itemRoles: ['Timekeeper', 'Recorder'],
      playerRole: { a: 'Recorder', b: 'Facilitator', c: 'Timekeeper' },
      groups: { 'Group 1': { memberIds: ['a', 'b'] }, 'Group 2': { memberIds: ['c'] } },
      playerGroup: { a: 'Group 1', b: 'Group 1', c: 'Group 2' }
    };
    retagGroups(state);
    expect(itemRolesFor(state, 'a')[0]).not.toBe('Timekeeper');
    expect(itemRolesFor(state, 'c')).toEqual(['Timekeeper', 'Timekeeper']);
  });
});

describe('14. the end of work time says how many finished once', () => {
  it('the live counter goes when the results line comes up', () => {
    const host = read('screens/host/host.js');
    const results = host.indexOf("socket.on('checklist-results'");
    expect(host.indexOf('checklistSummary.hidden = true;', results)).toBeGreaterThan(results);
    expect(host).toContain('checklistSummary.hidden = false;');
  });
});

describe('25 to 27. Remove recounts, says so, and works during any step', () => {
  it('the counter is read fresh: a removed student who answered leaves both numbers', () => {
    const before = [{ id: 'a', response: 'x' }, { id: 'b', response: null }];
    expect(submissionCountPayload(before, 7)).toEqual({ count: 1, total: 2, phaseInstanceId: 7 });
    expect(submissionCountPayload(before.slice(1), 7)).toEqual({ count: 0, total: 1, phaseInstanceId: 7 });
    const server = read('server.js');
    const kick = server.indexOf('socket.on(EVENTS.MODERATE_KICK');
    const rename = server.indexOf('socket.on(EVENTS.MODERATE_RENAME');
    const recount = server.indexOf('emitSubmissionCount(code, room);', kick);
    expect(recount).toBeGreaterThan(kick);
    expect(recount).toBeLessThan(rename);
  });

  it('the removed student gets a removed screen, in every language, and a second try lands there too', () => {
    const html = read('screens/player/index.html');
    expect(html).toContain('<section id="removed-section" hidden>');
    expect(html).toContain('<h1>You were removed from this room.</h1>');
    expect(html).toContain('<button type="button" id="removed-join-other">Join a different room</button>');
    for (const lang of Object.keys(STRINGS)) {
      for (const key of ['You were removed from this room.', 'Ask your teacher if you think this was a mistake.', 'Join a different room']) {
        expect(typeof STRINGS[lang][key], lang + ': ' + key).toBe('string');
      }
    }
    const player = read('screens/player/player.js');
    const kicked = player.indexOf("socket.on('kicked'");
    expect(player.indexOf('showRemovedScreen();', kicked)).toBeGreaterThan(kicked);
    expect(player).toContain("socket.on('join-error', ({ message, removed }) => {");
    expect(read('server.js')).toContain("{ message: 'You have been removed from this session.', removed: true }");
  });

  it('the console lists the class with Remove on every step after the lobby', () => {
    expect(read('screens/teacher/index.html')).toContain('<details id="class-list-block" class="class-list-block" hidden>');
    const teacher = read('screens/teacher/teacher.js');
    expect(teacher).toContain("classListBlock.hidden = isLobby || phaseType === 'end' || !phaseType;");
    expect(teacher).toContain('function renderClassList()');
    expect(teacher).toContain("removeBtn.addEventListener('click', function () { confirmRemove(p); });");
  });
});

describe('28. "A bit more time" has a ceiling', () => {
  it('a 45-second step gains at most 135 seconds; forty presses never pass it', () => {
    expect(extraTimeCap(45)).toBe(135);
    expect(extraTimeCap(10)).toBe(90);
    expect(extraTimeCap(600)).toBe(MORE_TIME_CEILING);
    let used = 0;
    let accepted = 0;
    let lastAtCap = false;
    for (let i = 0; i < 40; i++) {
      const press = pressMoreTime(used, 45, 30);
      if (press.ok) { accepted++; lastAtCap = press.atCap; }
      used = press.used;
    }
    expect(used).toBe(120);
    expect(accepted).toBe(4);
    expect(lastAtCap).toBe(true);
  });

  it('the server refuses past it and every screen hides the button', () => {
    const server = read('server.js');
    expect(server).toContain('const press = pressMoreTime(usedNow, phase.timer, EXTEND_TIMER_SECONDS);');
    expect(server).toContain('const message = { addSeconds: EXTEND_TIMER_SECONDS, atCap: press.atCap };');
    expect(read('screens/host/host.js')).toContain('if (atCap) moreTimeBtn.hidden = true;');
    expect(read('screens/teacher/teacher.js')).toContain('if (data && data.atCap) {');
  });
});

describe('29. "You got here fast" is for the first minutes of a rolling room', () => {
  it('a together room past its lobby never deals one; a rolling room stops after five minutes', () => {
    expect(isEarlyBirdJoin({ phaseType: 'collect', rolling: false })).toBe(false);
    expect(isEarlyBirdJoin({ phaseType: 'lobby' })).toBe(true);
    expect(isEarlyBirdJoin({ phaseType: 'collect', rolling: true, msSinceOpen: 60 * 1000 })).toBe(true);
    expect(isEarlyBirdJoin({ phaseType: 'collect', rolling: true, msSinceOpen: ROLLING_EARLY_MS + 1 })).toBe(false);
    // a reconnect keeps the joke it already holds
    expect(isJokeReconnect({ phaseType: 'collect', rolling: true })).toBe(true);
    expect(read('server.js')).toContain('msSinceOpen: room.createdAt ? Date.now() - room.createdAt : undefined');
  });
});

describe('30. the joke list splits where the joke turns, and suits a class', () => {
  const built = JSON.parse(read('engine/dad-jokes.json'));
  it('the reviewer\'s bad splits and unsuitable jokes are gone', () => {
    const gone = /To be Frank|cats meds|how to scam|invisible ink|light bulbs\. They|food coloring|stethoscope|sky diving|organ donor|fallen through the ice|cement mixer|barbed wire|Michael Jackson|naming a disease|Every night at 11:11/i;
    expect(built.filter(j => gone.test(j))).toEqual([]);
    // no markdown escapes, no duplicates
    expect(built.filter(j => j.includes('\\&'))).toEqual([]);
    expect(new Set(built).size).toBe(built.length);
  });

  it('the jokes that split in the wrong place now turn on their own line', () => {
    const find = (re) => splitJoke(built.find(j => re.test(j)));
    expect(find(/make me a sandwich/).punchline).toBe('Dad: Poof! You\'re a sandwich.');
    expect(find(/book mark/).setup).toMatch(/burst into tears\.$/);
    expect(find(/seconds are in a year/).setup).toBe('How many seconds are in a year?');
  });
});

describe('45. the report never asks for a PIN nobody showed', () => {
  it('the console shows the PIN beside the room code, the server sends it to the console only', () => {
    const teacher = read('screens/teacher/teacher.js');
    expect(teacher).toContain("(currentPin ? ' · Teacher PIN ' + currentPin : '')");
    expect(read('server.js')).toContain('socket.emit(EVENTS.TEACHER_JOINED, { ...buildTeacherSnapshot(code, room), teacherPin: room.teacherPin });');
  });
  it('a refreshed report tab reloads from this tab\'s memory, and the form says where the PIN is', () => {
    const report = read('screens/teacher/report.js');
    expect(report).toContain("var REPORT_SEAT = 'jamyard.reportSeat';");
    expect(report).toContain('sessionStorage.getItem(REPORT_SEAT)');
    expect(read('screens/teacher/report.html')).toContain('both shown at the top of your teacher console');
  });
});

describe('46. the console page says where each tab goes', () => {
  it('the projector opens in a new tab, the console in the tab Host was pressed in', () => {
    const html = read('screens/teacher/index.html');
    expect(html).not.toContain('stays behind it');
    expect(html).toContain('this console opens in the tab where you pressed Host');
  });
  it('My yard\'s play and Host this go through HostLaunch (the console opens)', () => {
    const yard = read('screens/shared/my-yard.js');
    expect((yard.match(/HostLaunch\.launch\(game\.id\)/g) || []).length).toBe(2);
    expect(read('screens/home/index.html').indexOf('/shared/host-launch.js')).toBeLessThan(read('screens/home/index.html').indexOf('/shared/my-yard.js'));
  });
});
