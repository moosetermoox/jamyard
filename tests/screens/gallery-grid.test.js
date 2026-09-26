/**
 * A reviewer's fifth round (2026-09-26): Draw Gallery, the big editor, the
 * guide, a live room. Source guards for what changed; the claims that were
 * wrong (the drawing pad has colours, undo and clear; the editor adds and
 * removes steps) are pinned here too so they stay true.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { STRINGS } from '../../engine/i18n/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

describe('Draw Gallery on the projector', () => {
  it('hangs drawings as a wall, three across', () => {
    const host = read('screens/host/host.js');
    expect(host).toContain("revealOneItems.classList.add('is-gallery')");
    expect(host).toContain("revealOneItems.classList.remove('is-gallery')");
    const css = read('screens/host/styles.css');
    expect(css).toMatch(/#reveal-one-items\.is-gallery \{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  });
  it('the student pad still has colours, undo, and clear (a reviewer said it had none)', () => {
    const html = read('screens/player/index.html');
    expect(html).toContain('id="draw-colors"');
    expect(html).toContain('id="draw-undo"');
    expect(html).toContain('id="draw-clear"');
  });
  it('tells the AI a drawing carries no words, and the preview step where Hide lives', () => {
    expect(read('services/ai-service.js')).toContain('never ask students to label, caption, or write on it');
    expect(read('screens/shared/step-suggestions.js')).toContain('Press Hide beside it on your Teacher view');
  });
});

describe('closing on nothing', () => {
  it('the projector asks first when nobody has answered', () => {
    const host = read('screens/host/host.js');
    expect(host).toContain("if (submittedSoFar === 0 && window.Dialog && Dialog.confirm)");
    expect(host).toContain("confirmLabel: 'Close anyway', cancelLabel: 'Wait'");
    expect(read('screens/host/index.html')).toContain('<script src="/shared/dialog.js"></script>');
  });
  it('a pair with no answers is told so, in every language', () => {
    expect(read('screens/player/player.js')).toContain("UiLang.t('Nobody in your group wrote anything last step. Start from scratch together.')");
    for (const lang of Object.keys(STRINGS)) {
      expect(STRINGS[lang]['Nobody in your group wrote anything last step. Start from scratch together.']).toBeTruthy();
    }
  });
});

describe('the make page and the editor', () => {
  it('keeps See how it reads when the fit asks no questions', () => {
    const make = read('screens/make/make.js');
    expect(make).toContain('el.fitFoot.hidden = !!state.panelApi || !!(state.print && state.print.scalesEditable);');
    expect(make).not.toContain('el.fitFoot.hidden = n === 0');
  });
  it('warns on a picture that is not a web address, and puts no mic on a link field', () => {
    const sv = read('screens/designer/simple-view.js');
    expect(sv).toContain("var row = el('label', 'sv-media-row no-mic');");
    expect(sv).toContain('That is not a web address.');
    expect(sv).toContain('id="simple-add-step"'.replace('id="', '').replace('"', '')); // the add-step button is wired
    expect(read('screens/designer/editor.html')).toContain('id="simple-add-step"');
  });
  it('the console header wraps instead of running its links together', () => {
    expect(read('screens/teacher/styles.css')).toMatch(/header \{[^}]*flex-wrap: wrap;/);
  });
});

describe('the guide', () => {
  const guide = read('screens/guide/index.html');
  it('names the buttons as the site does and mentions building with AI', () => {
    expect(guide).toContain('<strong>Pick this one</strong>');
    expect(guide).toContain('<strong>Host it now</strong>');
    expect(guide).not.toContain('press <strong>Host this</strong>');
    expect(guide).toContain('Have an idea? Make it real');
    expect(guide).toContain('Copy teacher link');
  });
});
