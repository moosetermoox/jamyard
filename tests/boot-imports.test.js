/**
 * Every server-side module must at least parse and import. On 2026-09-19 a
 * three-way merge spliced two functions together in db.js; the suite stayed
 * green because nothing imported db.js, CI deployed, and the server could
 * not start (Render kept the previous deploy up). This is the guard: import
 * the modules the server imports, all side-effect free, so a syntax error
 * or a broken import fails the suite before it can deploy.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const list = (dir) => readdirSync(join(ROOT, dir)).filter(f => f.endsWith('.js')).map(f => join(dir, f));

describe('server-side modules import cleanly', () => {
  const modules = ['db.js', ...list('services'), ...list('engine')];
  it('finds the modules', () => {
    expect(modules.length).toBeGreaterThan(20);
  });
  for (const rel of modules) {
    it(rel, async () => {
      const mod = await import(pathToFileURL(join(ROOT, rel)).href);
      expect(mod).toBeTypeOf('object');
    });
  }
});
