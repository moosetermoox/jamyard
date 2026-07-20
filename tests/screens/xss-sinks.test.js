/**
 * XSS sink enforcement — the regression net for the 2026-07-19 sweep.
 *
 * Rendering contract: any statement on a runtime screen that builds HTML
 * (innerHTML assignment or html-accumulator) with interpolated values must
 * pass the value through an escaper — escapeHtml()/escapeHtmlText(), or a
 * helper that escapes internally (previewEl/previewBtn/previewInput) — OR
 * every interpolation in the statement must be audited-numeric and the
 * statement matched by SAFE_STATEMENTS below.
 *
 * If this test fails on your new code: wrap the dynamic value in
 * escapeHtml(). Only extend SAFE_STATEMENTS when you can explain, in its
 * comment, why the value can never carry markup.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const FILES = [
  'screens/host/host.js',
  'screens/player/player.js',
  'screens/teacher/teacher.js',
  'screens/prototype/prototype.js',
  'screens/designer/designer.js',
  'screens/designer/editor.js',
  'screens/designer/simple-view.js'
];

// Escapers, and helpers verified (2026-07-19) to escape their args internally.
const ESCAPER_RE = /escapeHtml\s*\(|escapeHtmlText\s*\(|previewEl\s*\(|previewBtn\s*\(|previewInput\s*\(/;

// Statement-level allowlist: every interpolated value in these statements is
// a number computed in code (percentage, degree, count, score, loop index)
// or an hsl() color from a numeric formula. Matched by substring.
const SAFE_STATEMENTS = [
  "match-accuracy-pct\">' + r.pct",                 // server-computed accuracy int
  "stats.count + ' guesses",                        // estimate stats numerics
  "Class average: ' + Math.round(stats.average",    // estimate stats numerics (player)
  "raterCount + ' rater'",                          // rate header count
  "Class results (' + raterCount",                  // rate header count (player)
  'conic-gradient(',                                // pie: hsl colors + degrees only
  'rate-pie-legend-row',                            // pie legend: color/value/count numerics
  "panel-label\">Player ' + i",                     // prototype panel: loop index
  "aiInject.count || 1",                            // foreach preview: numeric count
  "+ choicesHtml +",                                // editor preview: built solely from escapeHtml(choices[i]) upstream
];

// Group physical lines into statements: from a sink-start line, accumulate
// until a line ends the statement (';' or '`;' etc.). Good enough for these
// files' concatenation style.
function statementsFrom(src) {
  const lines = src.split('\n');
  const statements = [];
  let buf = null;
  let startLine = 0;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (buf === null) {
      if (/(\.innerHTML\s*\+?=|html\s*\+=|return\s*['"`]<)/.test(t)) {
        buf = t;
        startLine = i + 1;
      }
    } else {
      buf += ' ' + t;
    }
    if (buf !== null && /;\s*$/.test(t)) {
      statements.push({ line: startLine, text: buf });
      buf = null;
    }
  }
  if (buf !== null) statements.push({ line: startLine, text: buf });
  return statements;
}

const INTERPOLATION_RE = /\$\{(?!\d)|['"`]\s*\+\s*(?!['"`])|(?<!['"`])\s*\+\s*['"`]/;
const CLEARING_RE = /\.innerHTML\s*=\s*(['"`])\s*\1\s*;?\s*$/;

function violationsIn(file) {
  const src = readFileSync(join(root, file), 'utf8');
  const out = [];
  for (const stmt of statementsFrom(src)) {
    if (CLEARING_RE.test(stmt.text)) continue;
    if (!INTERPOLATION_RE.test(stmt.text)) continue;   // pure static markup
    if (ESCAPER_RE.test(stmt.text)) continue;
    if (SAFE_STATEMENTS.some(s => stmt.text.includes(s))) continue;
    out.push(`${file}:${stmt.line}  ${stmt.text.slice(0, 120)}`);
  }
  return out;
}

describe('XSS sink enforcement (screens render untrusted text)', () => {
  for (const file of FILES) {
    it(`${file} has no unescaped HTML interpolation`, () => {
      const violations = violationsIn(file);
      expect(violations, 'Unescaped HTML interpolation — wrap in escapeHtml() or audit into SAFE_STATEMENTS:\n' + violations.join('\n')).toEqual([]);
    });
  }

  it('the scanner itself still detects a seeded violation', () => {
    const seeded = statementsFrom("el.innerHTML = '<b>' + studentText + '</b>';");
    expect(seeded.length).toBe(1);
    expect(INTERPOLATION_RE.test(seeded[0].text)).toBe(true);
    expect(ESCAPER_RE.test(seeded[0].text)).toBe(false);
  });
});
