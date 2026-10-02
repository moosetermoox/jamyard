/**
 * Review eighteen, the designer slice (2026-09-28): a reviewer's ten Create
 * page ideas and a design chat that promised a shuffle it could not make.
 *
 *   - the plan (storyboard) path carries the settings an idea names in
 *     words ("no names"), as the recipe match already did;
 *   - the console's Show lives only where the class sees the words anyway,
 *     and the console's list matches the server's;
 *   - a vote may shuffle each student's ballot.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { spotlightAllowed } from '../../engine/spotlight.js';
import { validate } from '../../engine/game-loader.js';

const read = (rel) => readFileSync(new URL('../../' + rel, import.meta.url), 'utf8');

describe('the plan keeps the settings the idea named', () => {
  it('the storyboard route reads anonymity and the plan writes it on the config', () => {
    const server = read('server.js');
    expect(server).toMatch(/const anonymous = parseAnonymity\(description\);[\s\S]{0,200}json: \{ storyboard, settings, ideaId(, questionNote)? \}/);
    const designer = read('screens/designer/designer.js');
    expect(designer).toContain("if (typeof ideaSettings.anonymous === 'boolean') result.config.anonymous = ideaSettings.anonymous;");
    expect(designer).toContain("showStoryboardFlow(description, partial, resp.settings)");
  });
});

describe('Show on the console', () => {
  it('the console offers Show on exactly the audiences the server allows', () => {
    const teacher = read('screens/teacher/teacher.js');
    const list = JSON.parse(teacher.match(/var SHOW_AUDIENCES = (\[[^\]]*\]);/)[1].replace(/'/g, '"'));
    for (const key of list) expect(spotlightAllowed(key, 'collect')).toBe(true);
    for (const key of ['teacher', 'tally', 'guessed', 'guessed-after-review', 'ai', 'classmate']) {
      expect(list).not.toContain(key);
    }
    expect(read('server.js')).toContain('spotlightAllowed(audienceKeyFor(room.engine, phase), phase.type)');
  });
});

describe('a vote can shuffle each ballot', () => {
  it('validates with shuffle on a pick-one vote', () => {
    const config = {
      name: 'x', minPlayers: 2, maxPlayers: 30,
      phases: {
        lobby: { type: 'lobby', next: 'v' },
        v: { type: 'vote', mode: 'pick-one', candidates: ['A', 'B', 'C'], shuffle: true, next: 'w' },
        w: { type: 'reveal', template: '{{v.resultsList}}', next: 'end' },
        end: { type: 'end' }
      }
    };
    expect(validate(config, 'shuffle', { returnResults: true }).errors).toEqual([]);
  });
  it('the handler deals each voter their own order, and a reconnect keeps the seed', () => {
    const handler = read('engine/phase-handlers/vote.js');
    expect(handler).toContain("shuffleSeed: phase.shuffle === true ? phase.id : null");
    expect(handler).toContain('ballotFor(vs.candidates, socket.id, !!vs.excludeAuthors, vs.shuffleSeed || null)');
  });
});
