/**
 * No em dashes in user-facing text (teacher rule, 2026-08-08: students read
 * them as an AI tell). Scanned: game configs, recipes, screens HTML, and JS
 * STRING LITERALS in screens/engine/services (code comments are internal
 * and exempt). The attributed Along prompt bank is exempt too — its prompts
 * are quoted third-party content we keep verbatim.
 * En dashes (–, numeric ranges like 20–45 min) are allowed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const EM = '—';

function listFiles(dir, suffix) {
  const out = [];
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(rel, suffix));
    else if (entry.name.endsWith(suffix)) out.push(rel);
  }
  return out;
}

function jsStringLiteralOffenses(source) {
  const offenses = [];
  acorn.parse(source, {
    ecmaVersion: 'latest',
    sourceType: source.includes('import ') || source.includes('export ') ? 'module' : 'script',
    onToken: (tok) => {
      if (tok.type.label !== 'string' && tok.type.label !== 'template') return;
      const raw = source.slice(tok.start, tok.end);
      // Check the DECODED value too — '—' in source contains no literal
      // em dash but renders one to students (how the leaderboard dash hid
      // from this test until 2026-08-08).
      const cooked = typeof tok.value === 'string' ? tok.value : '';
      if (raw.includes(EM) || cooked.includes(EM)) {
        // The one legitimate mention: the AI style rule must NAME the
        // character it bans.
        if (raw.includes('Never use an em dash')) return;
        offenses.push(raw.slice(0, 80));
      }
    }
  });
  return offenses;
}

describe('no em dashes in user-facing text', () => {
  it('game configs and recipes are clean (Along bank exempt)', () => {
    const files = [
      ...listFiles('games', 'config.json'),
      ...listFiles('recipes', '.json')
    ].filter(f => !f.includes('along.json'));
    const dirty = files.filter(f => readFileSync(join(root, f), 'utf8').includes(EM));
    expect(dirty).toEqual([]);
  });

  it('screens HTML is clean', () => {
    const dirty = listFiles('screens', '.html')
      .filter(f => readFileSync(join(root, f), 'utf8').includes(EM));
    expect(dirty).toEqual([]);
  });

  it('JS string literals in screens/engine/services are clean', () => {
    const files = [
      ...listFiles('screens', '.js'),
      ...listFiles('engine', '.js'),
      ...listFiles('services', '.js')
    ];
    const dirty = [];
    for (const f of files) {
      const src = readFileSync(join(root, f), 'utf8');
      // Short-circuit only when the file has neither a literal em dash nor
      // an escape sequence that decodes to one.
      if (!src.includes(EM) && !src.includes('\\u2014') && !src.includes('\\u{2014}')) continue;
      const offenses = jsStringLiteralOffenses(src);
      if (offenses.length > 0) dirty.push(f + ': ' + offenses[0]);
    }
    expect(dirty).toEqual([]);
  });

  it('self-test: the scanner actually catches an em dash in a string', () => {
    expect(jsStringLiteralOffenses('var x = "oops — an em dash";').length).toBe(1);
    expect(jsStringLiteralOffenses('// a comment — with a dash\nvar x = 1;').length).toBe(0);
    expect(jsStringLiteralOffenses('var t = `template — dash`;').length).toBe(1);
    // Escaped forms decode to an em dash at runtime and must be caught too.
    expect(jsStringLiteralOffenses('var x = "a \\u2014 b";').length).toBe(1);
    expect(jsStringLiteralOffenses('var x = "a \\u{2014} b";').length).toBe(1);
    expect(jsStringLiteralOffenses('var t = `a \\u2014 b`;').length).toBe(1);
  });
});
