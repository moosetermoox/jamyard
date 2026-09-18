/**
 * Tapping the room-code blocks on /player focuses an invisible input, and
 * nothing on screen changed (owner 2026-09-18: "so the person knows that
 * clicking there worked"). The row must wake up on focus: the next empty
 * block gets a solid edge and a caret. Guards the CSS hooks.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../../screens/player/styles.css', import.meta.url), 'utf8');

describe('join form: the code blocks show focus', () => {
  it('the empty blocks wake up while the code input has focus', () => {
    expect(css).toMatch(/\.code-entry:focus-within \.code-slot:not\(\.code-slot-filled\) \{/);
  });
  it('the next block to fill gets a solid edge and a blinking caret', () => {
    expect(css).toMatch(/\.code-entry:focus-within[^{]*:is\(\.code-slot-0, \.code-slot-filled \+ \.code-slot\) \{[^}]*border: 3px solid/);
    expect(css).toMatch(/:is\(\.code-slot-0, \.code-slot-filled \+ \.code-slot\)::after \{[^}]*animation: codeCaret/);
    expect(css).toMatch(/@keyframes codeCaret/);
  });
  it('the caret holds still for reduced motion', () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.code-entry:focus-within \.code-slot::after \{ animation: none; \}/);
  });
});
