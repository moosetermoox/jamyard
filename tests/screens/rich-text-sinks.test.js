/**
 * Bold is `**word**` and nothing else, and every prompt sink paints it
 * (CLAUDE.md standing rule). Two regressions this guards against:
 *
 *  1. The student screen's setRichText applied the bold and then, with
 *     word help OFF, fell into an `else el.textContent = text` that
 *     overwrote it with the raw markers (2026-09-06 to 2026-09-07: "it
 *     works in the designer but I see the markup in the activity").
 *  2. Teacher-text sinks that bypass setRichText: screen templates and
 *     the reveal-one heading used textContent.
 *
 * Source-level checks, because both screens are DOM-bound scripts.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const player = readFileSync('screens/player/player.js', 'utf8');
const host = readFileSync('screens/host/host.js', 'utf8');

function setRichTextBody(src) {
  const m = src.match(/function setRichText\(el, text\) \{([\s\S]*?)\n\}/);
  expect(m, 'setRichText found').toBeTruthy();
  return m[1];
}

describe('setRichText paints bold and never overwrites it', () => {
  for (const [name, src] of [['player', player], ['host', host]]) {
    it(`${name}: the plain-text fallback is the else of the RichText branch only`, () => {
      const body = setRichTextBody(src);
      // The fallback must directly follow the applyInline line...
      expect(body).toMatch(/RichText\.applyInline\(el, text\);\s*\r?\n\s*else el\.textContent = text;/);
      // ...and nothing else in the body may assign textContent.
      const assignments = body.match(/el\.textContent = /g) || [];
      expect(assignments.length).toBe(1);
    });
  }
});

describe('teacher-text sinks go through setRichText', () => {
  it('screen templates paint bold on both screens', () => {
    for (const src of [player, host]) {
      const m = src.match(/function applyTemplate\(section, templateText\) \{([\s\S]*?)\n\}/);
      expect(m).toBeTruthy();
      expect(m[1]).toContain('setRichText(tmplDiv, templateText)');
      expect(m[1]).not.toContain('tmplDiv.textContent = templateText');
    }
  });

  it('the reveal-one heading paints bold on both screens', () => {
    expect(player).toContain("setRichText(revealOneMessage, message || 'Revealing...')");
    expect(host).toContain("setRichText(revealOneMessage, message || 'Reveal Time!')");
  });
});
