/**
 * A fourteenth outside review (2026-09-27, Doodle Bluff and Convince Me!
 * with pretend students): a join that lands while Start is moving the room
 * waits for the first step, the projector's confirm line agrees with its
 * number, Doodle Bluff's asks say what they mean, Convince Me!'s lines,
 * Try it out's Reset starts the same activity over, the student screen
 * never scrolls sideways.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { compileRecipe } from '../../engine/recipe-compiler.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

describe('a join during Start', () => {
  const server = read('server.js');
  it('start-game holds a promise while the first step enters, and join-room waits on it', () => {
    expect(server).toContain('room.starting = new Promise((resolve) => { settleStart = resolve; });');
    expect(server).toContain('room.starting = null;');
    expect(server).toContain('if (room.starting) { try { await room.starting; } catch {} }');
    // the wait sits in join-room, after the room is found
    const joinAt = server.indexOf("socket.on(EVENTS.JOIN_ROOM");
    const waitAt = server.indexOf('if (room.starting) { try { await room.starting; } catch {} }');
    expect(joinAt).toBeGreaterThan(-1);
    expect(waitAt).toBeGreaterThan(joinAt);
  });
  it('the proof script exists and checks the count and the lobby roster', () => {
    const sim = read('scripts/simulate-join-at-start.js');
    expect(sim).toContain("waitForEvent(p, 'game-started', 30000)");
    expect(sim).toContain("no lobby roster reached the late joiners after Start");
  });
});

describe('the smaller answers', () => {
  it("the projector's Approve & Show line agrees with its number", () => {
    const js = read('screens/host/host.js');
    expect(js).toContain("(count === 1 ? thing + ' goes' : thing + 's go')");
    expect(js).not.toContain("+ ' goes on this screen for everyone");
  });
  it("Doodle Bluff asks for a fake title, and hints at kinds instead of one copyable example", () => {
    const recipe = JSON.parse(read('recipes/doodle-bluff.json'));
    const text = JSON.stringify(recipe);
    expect(text).toContain('Make up a fake title for this drawing, one so convincing your classmates pick it over the real one.');
    expect(text).not.toContain('What is the REAL title of this drawing?');
    expect(text).not.toContain('Example: a nervous volcano');
    expect(text).toContain('an animal somewhere it should not be, an object with a feeling, a job nobody has.');
    // the built-in follows: its stamped prompt and a fresh compile agree
    const config = JSON.parse(read('games/doodle-bluff/config.json'));
    expect(config.recipe.params.phrasePrompt).not.toContain('Example:');
    const { config: compiled } = compileRecipe(recipe, config.recipe.params);
    expect(config.phases).toEqual(compiled.phases);
  });
  it("Convince Me! reads cleanly: no stray comma, topics land on the next screen, the projector has its own line", () => {
    const cfg = JSON.parse(read('games/convince-me/config.json'));
    const text = JSON.stringify(cfg);
    expect(text).not.toContain("up for it!,");
    expect(text).toContain('Topics are going out now. Yours shows on your device on the next screen.');
    const collect = Object.values(cfg.phases).find(p => p.type === 'collect' && /get-topics\.mine/.test(p.prompt || ''));
    expect(collect.hostTemplate).toBe('Everyone has their own topic on their device.');
  });
  it('Try it out: Reset starts the same activity over', () => {
    const js = read('screens/prototype/prototype.js');
    expect(js).toContain('function resetBench()');
    expect(js).toMatch(/resetBtn\.addEventListener\('click', \(\) => \{\s*resetBench\(\);\s*if \(gameSelect\.value\) launchBtn\.click\(\);/);
    expect(js).not.toMatch(/resetBtn\.click\(\);\s*launchBtn\.click\(\);/);
  });
  it('the student screen never scrolls sideways', () => {
    expect(read('screens/player/styles.css')).toContain('html, body { overflow-x: hidden; }');
  });
});
