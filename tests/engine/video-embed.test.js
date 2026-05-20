/**
 * resolveVideoEmbed — turns assorted YouTube URL forms into embed URLs,
 * and returns null for anything unrecognized.
 */

import { describe, it, expect } from 'vitest';
import { resolveVideoEmbed } from '../../engine/video.js';

describe('resolveVideoEmbed', () => {
  it('handles a standard watch URL', () => {
    expect(resolveVideoEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ'))
      .toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  it('handles a youtu.be short link', () => {
    expect(resolveVideoEmbed('https://youtu.be/dQw4w9WgXcQ'))
      .toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  it('handles an already-embed URL', () => {
    expect(resolveVideoEmbed('https://www.youtube.com/embed/dQw4w9WgXcQ'))
      .toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  it('handles a shorts URL', () => {
    expect(resolveVideoEmbed('https://www.youtube.com/shorts/dQw4w9WgXcQ'))
      .toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  it('ignores extra query params and watch?v= in any position', () => {
    expect(resolveVideoEmbed('https://www.youtube.com/watch?list=abc&v=dQw4w9WgXcQ&feature=share'))
      .toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  it('preserves a numeric start time (t=)', () => {
    expect(resolveVideoEmbed('https://youtu.be/dQw4w9WgXcQ?t=90'))
      .toBe('https://www.youtube.com/embed/dQw4w9WgXcQ?start=90');
  });

  it('parses a 1m30s style start time', () => {
    expect(resolveVideoEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s'))
      .toBe('https://www.youtube.com/embed/dQw4w9WgXcQ?start=90');
  });

  it('trims surrounding whitespace', () => {
    expect(resolveVideoEmbed('  https://youtu.be/dQw4w9WgXcQ  '))
      .toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  it('returns null for a non-YouTube URL', () => {
    expect(resolveVideoEmbed('https://vimeo.com/12345')).toBeNull();
  });

  it('returns null for empty / nullish input', () => {
    expect(resolveVideoEmbed('')).toBeNull();
    expect(resolveVideoEmbed(null)).toBeNull();
    expect(resolveVideoEmbed(undefined)).toBeNull();
  });

  it('returns null for non-string input', () => {
    expect(resolveVideoEmbed(42)).toBeNull();
    expect(resolveVideoEmbed({})).toBeNull();
  });
});
