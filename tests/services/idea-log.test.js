/**
 * Ideas log (2026-09-19): what teachers try to make on the Create page,
 * how it landed, and whether they saved it. Teacher text only, contact
 * patterns scrubbed, read on the owner-only /ideas page.
 */

import { describe, it, expect } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { createIdeaLog, summarizeIdeaLog, cleanIdea, isIdeaId, IDEA_MAX_LENGTH } from '../../services/idea-log.js';

async function tempLog() {
  const dir = await mkdtemp(join(tmpdir(), 'jamyard-idea-log-'));
  const log = createIdeaLog({ filePath: join(dir, 'idea-log.ndjson') });
  return { log, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

describe('cleanIdea', () => {
  it('trims, scrubs contact patterns, and caps the length', () => {
    expect(cleanIdea('  a quiz on fractions  ')).toBe('a quiz on fractions');
    const scrubbed = cleanIdea('email me at ms.rivera@school.org or 555-123-4567 about http://x.y/z');
    expect(scrubbed).not.toContain('ms.rivera@school.org');
    expect(scrubbed).not.toContain('555-123-4567');
    expect(scrubbed).not.toContain('http://x.y/z');
    expect(cleanIdea('x'.repeat(IDEA_MAX_LENGTH + 50)).length).toBe(IDEA_MAX_LENGTH);
    expect(cleanIdea(null)).toBe('');
  });
});

describe('isIdeaId', () => {
  it('accepts a positive integer or a short safe string, nothing else', () => {
    expect(isIdeaId(7)).toBe(true);
    expect(isIdeaId('1726700000000-ab12cd')).toBe(true);
    expect(isIdeaId(0)).toBe(false);
    expect(isIdeaId(-3)).toBe(false);
    expect(isIdeaId('')).toBe(false);
    expect(isIdeaId('1 OR 1=1')).toBe(false);
    expect(isIdeaId({})).toBe(false);
  });
});

describe('createIdeaLog, file mode', () => {
  it('open + list round-trips newest first with the fields the owner reads', async () => {
    const { log, cleanup } = await tempLog();
    try {
      const first = await log.open({ idea: 'a bluffing game about state capitals', stage: 'match', result: 'match', target: 'trivia-bluff', targetName: 'Trivia Bluff', minutes: 10, browser: 'a1b2c3d4e5f60718' });
      await log.open({ idea: 'students act out a scene and the class guesses the emotion', stage: 'storyboard', result: 'cant-build', reason: 'needs live performance' });
      const rows = await log.list();
      expect(rows.map(r => r.result)).toEqual(['cant-build', 'match']);
      expect(rows[1].id).toBe(first);
      expect(rows[1]).toMatchObject({ idea: 'a bluffing game about state capitals', stage: 'match', target: 'trivia-bluff', target_name: 'Trivia Bluff', minutes: 10, browser: 'a1b2c3d4e5f60718', saved_game_id: null });
      expect(rows[0]).toMatchObject({ reason: 'needs live performance', minutes: null, browser: null });
    } finally {
      await cleanup();
    }
  });

  it('stores a storyboard\'s bricks as a short list and refuses unknown stages, results, and browser ids', async () => {
    const { log, cleanup } = await tempLog();
    try {
      await log.open({ idea: 'pass a story around', stage: 'weird', result: 'huh', steps: ['announce', 'chain', 'reveal-one', 'end'], browser: 'rivera@school.org' });
      const [row] = await log.list();
      expect(row.stage).toBe('match');
      expect(row.result).toBe('error');
      expect(row.steps).toBe('announce,chain,reveal-one,end');
      expect(row.browser).toBeNull();
    } finally {
      await cleanup();
    }
  });

  it('markSaved records the saved activity, and is a quiet no-op for an unknown id or no game id', async () => {
    const { log, cleanup } = await tempLog();
    try {
      const id = await log.open({ idea: 'exit ticket on photosynthesis', stage: 'match', result: 'match', target: 'exit-ticket' });
      expect(await log.markSaved(id, { gameId: 'exit-ticket-2', name: 'Exit Ticket: Photosynthesis' })).toBe(true);
      expect(await log.markSaved('nope', { gameId: 'x', name: 'y' })).toBe(false);
      expect(await log.markSaved(id, { gameId: '', name: 'y' })).toBe(false);
      const [row] = await log.list();
      expect(row.saved_game_id).toBe('exit-ticket-2');
      expect(row.saved_name).toBe('Exit Ticket: Photosynthesis');
    } finally {
      await cleanup();
    }
  });

  it('list honours a limit and a missing file is empty', async () => {
    const { log, cleanup } = await tempLog();
    try {
      expect(await log.list()).toEqual([]);
      for (let i = 0; i < 4; i++) await log.open({ idea: 'idea ' + i, stage: 'match', result: 'none' });
      expect((await log.list(2)).length).toBe(2);
    } finally {
      await cleanup();
    }
  });
});

describe('createIdeaLog, db mode', () => {
  it('delegates to the injected db functions with cleaned rows', async () => {
    const calls = [];
    const db = {
      addIdeaLog: async (row) => { calls.push(['add', row]); return 3; },
      markIdeaLogSaved: async (id, saved) => { calls.push(['mark', id, saved]); return true; },
      listIdeaLog: async (limit) => { calls.push(['list', limit]); return [{ id: 3 }]; }
    };
    const log = createIdeaLog({ db });
    expect(await log.open({ idea: ' a poll ', stage: 'storyboard', result: 'storyboard', steps: ['collect-choice', 'reveal', 'end'] })).toBe(3);
    expect(calls[0][1]).toMatchObject({ idea: 'a poll', stage: 'storyboard', result: 'storyboard', steps: 'collect-choice,reveal,end' });
    await log.markSaved(3, { gameId: 'poll-1', name: 'Poll' });
    expect(calls[1]).toEqual(['mark', 3, { gameId: 'poll-1', name: 'Poll' }]);
    expect(await log.list(20)).toEqual([{ id: 3 }]);
    expect(calls[2]).toEqual(['list', 20]);
  });
});

describe('summarizeIdeaLog', () => {
  it('counts tries by outcome, saves, and keeps alternate re-runs out of the tries', () => {
    const rows = [
      { stage: 'match', result: 'match', saved_game_id: 'a' },
      { stage: 'match', result: 'match', saved_game_id: null },
      { stage: 'alternate', result: 'match', saved_game_id: 'b' },
      { stage: 'match', result: 'existing' },
      { stage: 'match', result: 'none' },
      { stage: 'storyboard', result: 'storyboard', saved_game_id: 'c' },
      { stage: 'storyboard', result: 'cant-build' },
      { stage: 'match', result: 'error' }
    ];
    expect(summarizeIdeaLog(rows)).toEqual({
      tries: 7, matched: 2, existing: 1, storyboard: 1, couldNot: 3, none: 1, cantBuild: 1, errors: 1, saved: 2, alternates: 1
    });
    expect(summarizeIdeaLog([]).tries).toBe(0);
  });
});
