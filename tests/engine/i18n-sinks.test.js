/**
 * The label tables, swept from the sinks (cause 4 of
 * docs/ARCHITECTURE-REVIEW-2026-10.md, seventh pass, 2026-10-03). CLAUDE.md's
 * rule: "a new student- or projector-facing label needs a row in every
 * language table". The tables already agree with each other
 * (tests/engine/i18n.test.js); this reads the OTHER side: every fixed
 * string the code hands to a translating sink must be a key, or the
 * sink falls back to English without a word.
 *
 * Sinks: UiLang.t('...') on the screens, translate(lang, '...') on the
 * server, and the `message` of every WAITING / PLAYER_DONE / PHASE_PAUSED
 * payload (the student screen's waiting sink translates it). First run:
 * forty-one waiting lines, twenty-four distinct, were not in the tables,
 * and the waiting sink did not translate at all.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STRINGS } from '../../engine/i18n/index.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const KEYS = new Set(Object.keys(STRINGS.es));

// A fixed string at a sink that stays English on purpose, with the reason.
const ALLOWED = new Set([
  // (none yet)
]);

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (f !== 'node_modules') walk(p, out); }
    else if (f.endsWith('.js')) out.push(p);
  }
  return out;
}

// A quoted JS string literal, either quote, with escapes
const STR = `(?:'((?:[^'\\\\\\n]|\\\\.)*)'|"((?:[^"\\\\\\n]|\\\\.)*)")`;
function unquote(m1, m2) {
  const raw = m1 != null ? m1 : m2;
  // JS escapes as the engine reads them (…, \', \")
  try { return JSON.parse('"' + raw.replace(/\\'/g, "'").replace(/"/g, '\\"') + '"'); } catch (e) { return raw; }
}

function literalsAt(src, re) {
  const out = [];
  for (const m of src.matchAll(re)) out.push(unquote(m[1], m[2]));
  return out;
}

// Every string literal inside the `message:` expression of a waiting-style
// payload (a ternary gives two; a variable gives none, those are
// translated where they are built)
function waitingMessages(src) {
  const out = [];
  const re = /EVENTS\.(WAITING|PLAYER_DONE|PHASE_PAUSED)\s*,\s*\{([\s\S]*?)\}\s*\)/g;
  for (const m of src.matchAll(re)) {
    const body = m[2];
    const at = body.indexOf('message:');
    if (at === -1) continue;
    const expr = body.slice(at + 'message:'.length).split(/,\s*\n|,\s*[a-zA-Z_]+\s*:/)[0]
      // a ternary's test ("mode === 'teacher' ? ...") is not a label
      .replace(/[=!]==\s*(?:'[^']*'|"[^"]*")/g, '');
    if (/translate\(|UiLang\.t\(/.test(expr)) continue; // translated at the source
    for (const s of literalsAt(expr, new RegExp(STR, 'g'))) out.push(s);
  }
  return out;
}

const files = [...walk(join(ROOT, 'engine')), ...walk(join(ROOT, 'screens')), join(ROOT, 'server.js')]
  .filter(p => !p.includes(`${join('engine', 'i18n')}`));

describe('every fixed label at a translating sink is in the language tables', () => {
  const findings = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    const found = [
      ...literalsAt(src, new RegExp(`UiLang\\.t\\(\\s*${STR}`, 'g')),
      ...literalsAt(src, new RegExp(`\\btranslate\\(\\s*[A-Za-z_.]+\\s*,\\s*${STR}`, 'g')),
      ...waitingMessages(src)
    ];
    for (const s of found) {
      if (!s.trim()) continue;
      if (!KEYS.has(s) && !ALLOWED.has(s)) findings.push(`${rel}: ${JSON.stringify(s)}`);
    }
  }

  it('finds labels to check (the regexes still match the code)', () => {
    let total = 0;
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      total += literalsAt(src, new RegExp(`UiLang\\.t\\(\\s*${STR}`, 'g')).length + waitingMessages(src).length;
    }
    expect(total).toBeGreaterThan(100);
  });

  it('every one is a key (or in ALLOWED with a reason)', () => {
    expect(findings, 'labels that reach a translating sink with no row in the tables:\n  ' + findings.join('\n  ')).toEqual([]);
  });

  it('ALLOWED names nothing the tables already have', () => {
    for (const s of ALLOWED) expect(KEYS.has(s), `${s} is in the tables; drop it from ALLOWED`).toBe(false);
  });
});

describe('the student screen translates the waiting line', () => {
  const player = readFileSync(join(ROOT, 'screens', 'player', 'player.js'), 'utf8');
  it('waiting and phase-paused go through UiLang.t', () => {
    expect(player).toMatch(/socket\.on\('waiting'[\s\S]{0,200}UiLang\.t\(message/);
    expect(player).toMatch(/socket\.on\('phase-paused'[\s\S]{0,200}UiLang\.t\(message/);
  });
});
