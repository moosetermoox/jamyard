// Review eighteen, the live check (2026-09-28): the rough edges a reviewer
// found while confirming the fixes on jamyard.org.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const read = (p) => readFileSync(p, 'utf8');

describe('a reloaded console reconnects by itself', () => {
  it('a saved code with a PIN or teacher key joins without a tap', () => {
    const js = read('screens/teacher/teacher.js');
    expect(js).toMatch(/if \(savedCode && \(savedPin \|\| linkKey\)\) tryJoin\(\);/);
  });
});

describe('Solo Quiz feedback', () => {
  const js = read('screens/player/player.js');
  it('the wrong-answer line ends with a period', () => {
    expect(js).toContain('function withPeriod(text)');
    expect(js).toContain("UiLang.t('The answer was') + ' ' + withPeriod(data.correctAnswer)");
  });
  it('the right choice is marked on the student screen', () => {
    expect(js).toContain("classList.add('is-answer')");
    expect(read('screens/player/styles.css')).toContain('.choice-btn.is-answer');
  });
});

describe('the Vote / Submit button stays in reach', () => {
  it('sticks to the bottom of the screen when the list runs long', () => {
    const css = read('screens/player/styles.css');
    expect(css).toMatch(/\.ballot-confirm \{[^}]*position: sticky;[^}]*bottom:/);
  });
});

describe('the long-question note on the make page', () => {
  const js = read('screens/make/make.js');
  it('only speaks about a question the teacher typed, and re-checks after a restore', () => {
    expect(js).toContain('state.watchLength = function () {');
    expect(js).toMatch(/value !== print\.prompt\.text && value\.length > LONG_QUESTION_CHARS/);
    expect(js).toMatch(/function scheduleMap\(\) \{\s*saveDraftSoon\(\);\s*if \(state\.watchLength\) state\.watchLength\(\);/);
  });
});
