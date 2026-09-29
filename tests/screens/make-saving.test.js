// How the make page keeps what a teacher changed (review eighteen,
// 2026-09-28): a question and a timer vanished on reload; Make it yours
// then Try it made two identical Water Cycle quizzes; some copies never
// showed in My yard. Source guards over make.js and make-it-yours.js.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const make = readFileSync('screens/make/make.js', 'utf8');
const miy = readFileSync('screens/shared/make-it-yours.js', 'utf8');
const html = readFileSync('screens/make/index.html', 'utf8');

describe('the draft', () => {
  it('is written on every edit and on the settings rows', () => {
    expect(make).toMatch(/function scheduleMap\(\) \{\s*saveDraftSoon\(\);/);
    expect(make).toContain("state.anonymous = true; buildRows(); saveDraftSoon();");
    expect(make).toContain("state.earlyJoke = false; buildRows(); saveDraftSoon();");
  });
  it('lives in this tab per activity (owner 2026-09-28: a reload or Back, never a later visit), and goes back into the boxes on load', () => {
    expect(make).toContain("var DRAFT_KEY = 'jamyard.makeDraft.' + gameId;");
    expect(make).not.toMatch(/localStorage\.\w+Item\(DRAFT_KEY/);
    expect(make).toMatch(/state\.wordsSnapshot = wordsNow\(\);\s*\/\/[^\n]*\n\s*restoreDraft\(\);/);
  });
  it('is only for a template page (no class example, no recipe panel)', () => {
    expect(make).toMatch(/function draftAllowed\(\) \{\s*return !exKey && !state\.panel && !state\.exampleParams/);
  });
  it('says so, with the way back to the template', () => {
    expect(make).toContain('Your changes are back.');
    expect(make).toMatch(/draft-note[\s\S]*Use the original words[\s\S]*sessionStorage\.removeItem\(DRAFT_KEY\)/);
  });
  it('is cleared once the copy is saved', () => {
    expect(make).toMatch(/rememberSessionCopy\(id\);\s*clearDraft\(\);/);
  });
});

describe('one copy per page, never two', () => {
  it('reuses the copy this tab made from the template', () => {
    expect(make).toContain("var COPY_KEY = 'jamyard.makeCopy.' + gameId;");
    expect(make).toContain('var target = isOwn ? gameId : sessionCopyId();');
    expect(make).toMatch(/method: 'PUT'/);
  });
  it('the quiz and bluff panels save through the page', () => {
    expect(make).toMatch(/save: function \(working, dest\) \{ return saveReady\(working, dest\); \}/);
    expect(miy).toContain('panelSave = (opts && typeof opts.save === \'function\') ? opts.save : null;');
    expect((miy.match(/return savePanelCopy\(working, dest\);/g) || []).length).toBe(2);
  });
  it('a dialog never inherits a page\'s saver', () => {
    expect(miy).toMatch(/function customizeCopy\(game, btn\) \{\s*refreshKnownIds\(\);\s*panelSave = null;/);
  });
});

describe('every saved copy lands in My yard', () => {
  it('saveCopy adds the id before anything navigates', () => {
    expect(miy).toMatch(/var savedId = d\.id \|\| copyId;\s*knownIds\.push\(savedId\);\s*if \(window\.MyGames\) MyGames\.add\(savedId\);/);
  });
  it('a taken id moves on to the next number instead of failing (the server dedupes)', () => {
    expect(miy).toContain('body: JSON.stringify({ id: copyId, config: config, dedupe: true })');
  });
});

describe('words edited below the buttons are pointed to from the screen above', () => {
  it('the pairs and a panel that holds the words get a jump line', () => {
    expect(make).toContain("jumpNote(el.pairsSection, 'The pairs');");
    expect(make).toMatch(/if \(state\.panel !== 'knobs' \|\| state\.contentKnobs\) jumpNote\(section, heading\.textContent\);/);
    expect(make).toContain("', below the buttons.'");
  });
});

describe('the keep note says what is true', () => {
  it('names the two buttons that save the copy', () => {
    expect(html).toContain('Your changes wait on this page until you close the tab. Press Host it now or Try it with pretend students and they are saved as your copy');
  });
});
