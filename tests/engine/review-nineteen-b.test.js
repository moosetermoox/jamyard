// Review nineteen, part two (2026-09-29): emoji-only clues, the lie kept
// out of the summary, private copy ids, the designer's own dialogs.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSubmission, isEmojiOnly, EMOJI_ONLY_MESSAGE } from '../../engine/content-filter.js';
import { mintPrivateId, PRIVATE_TAIL_LENGTH } from '../../engine/share-copy.js';
import { PHASE_SCHEMAS } from '../../engine/phase-schemas.js';
import { translate, LANGUAGE_CODES } from '../../engine/i18n/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const others = LANGUAGE_CODES.filter(l => l !== 'en');

describe('an emoji-only box takes emoji and nothing else', () => {
  it('knows emoji from letters', () => {
    for (const s of ['🦁👑', '🚢💔🧊', '🇫🇷🥖', '👨‍👩‍👧', '1️⃣2️⃣', '🎬 🍿', '👍🏽']) expect(isEmojiOnly(s), s).toBe(true);
    for (const s of ['Titanic', '🎬 the lion king', '2', '🤖 2', '', '   ', 'abc🙂']) expect(isEmojiOnly(s), s).toBe(false);
  });
  it('checkSubmission refuses letters in a field marked emojiOnly, with a line of its own', () => {
    const fields = [{ key: 'movie', label: 'Title' }, { key: 'clues', label: 'Clues', emojiOnly: true }];
    const bad = checkSubmission({ movie: 'Titanic', clues: 'Titanic' }, { fields });
    expect(bad.ok).toBe(false);
    expect(bad.reason).toBe('not_emoji');
    expect(bad.message).toBe(EMOJI_ONLY_MESSAGE);
    expect(checkSubmission({ movie: 'Titanic', clues: '🚢💔🧊' }, { fields }).ok).toBe(true);
    // the title box is free text, so letters there are fine
    expect(checkSubmission({ movie: 'The Lion King', clues: '🦁👑' }, { fields }).ok).toBe(true);
  });
  it("Emoji Movies' clue box is marked, and the line is in every language", () => {
    const cfg = JSON.parse(read('games/emoji-movies/config.json'));
    const clues = cfg.phases.share.fields.find(f => f.key === 'clues');
    expect(clues.emojiOnly).toBe(true);
    for (const lang of others) expect(translate(lang, EMOJI_ONLY_MESSAGE), lang).not.toBe(EMOJI_ONLY_MESSAGE);
  });
});

describe('the lie never reaches the summary', () => {
  it('the AI step names the boxes it may read, and the schema knows the field', () => {
    const cfg = JSON.parse(read('games/two-truths-a-lie/config.json'));
    expect(cfg.phases['ai-analyze'].inputFields).toEqual(['truth1', 'truth2']);
    expect(cfg.phases['ai-analyze'].instruction).toContain('the lies were left out');
    expect(cfg.phases['ai-analyze'].instruction).not.toContain('never treat the last part');
    expect(PHASE_SCHEMAS['ai-process'].fields.inputFields).toBeTruthy();
  });
  it('the handler rebuilds each answer from those boxes', () => {
    const src = read('engine/phase-handlers/ai-process.js');
    expect(src).toContain('phase.inputFields.map(k => r.fields[k])');
  });
});

describe('a copy id cannot be guessed', () => {
  it('is the readable stem plus a random tail', async () => {
    const id = await mintPrivateId('Speed Quiz: my version', async () => false);
    expect(id).toMatch(new RegExp('^speed-quiz-my-version-[a-z2-9]{' + PRIVATE_TAIL_LENGTH + '}$'));
  });
  it('two mints of the same stem differ, and a taken id is skipped', async () => {
    const a = await mintPrivateId('exit-ticket', async () => false);
    const b = await mintPrivateId('exit-ticket', async () => false);
    expect(a).not.toBe(b);
    const taken = new Set([a]);
    let calls = 0;
    const seq = [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9];
    const first = await mintPrivateId('exit-ticket', async () => false, () => seq[calls++ % seq.length]);
    calls = 0;
    taken.add(first);
    const second = await mintPrivateId('exit-ticket', async (c) => taken.has(c), () => seq[calls++ % seq.length]);
    expect(second).not.toBe(first);
  });
  it('a copy of a copy keeps one tail', async () => {
    const first = await mintPrivateId('snowball', async () => false);
    const again = await mintPrivateId(first, async () => false);
    expect(again).toMatch(new RegExp('^snowball-[a-z2-9]{' + PRIVATE_TAIL_LENGTH + '}$'));
  });
  it('the save and copy routes mint this way', () => {
    const server = read('server.js');
    expect(server).toContain('id = await mintPrivateId(id, gameIdTaken);');
    expect(server).toContain('const newId = await mintPrivateId(req.params.gameId, gameIdTaken);');
  });
});

describe('the designer asks through the site box, never the browser', () => {
  it('no native alert or confirm is left', () => {
    for (const f of ['screens/designer/designer.js', 'screens/designer/builder-view.js']) {
      const src = read(f);
      expect(src, f).not.toMatch(/(?<![.\w])(alert|confirm)\(/);
      expect(src, f).toContain('Dialog.');
    }
  });
  it('Dialog.alert exists and is a one-button box', () => {
    const dlg = read('screens/shared/dialog.js');
    expect(dlg).toContain('function alert(opts)');
    expect(dlg).toContain('cancelLabel: null');
    expect(dlg).toContain('alert: alert');
  });
});
