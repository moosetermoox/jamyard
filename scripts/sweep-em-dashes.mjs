// One-shot sweep: replace em dashes in USER-FACING text with punctuation
// that reads naturally. Scope: game configs, recipes (except the attributed
// Along bank), screens HTML, and string literals in screens/engine/services
// JS (comments untouched — they're internal). Review the git diff after.
//
// Heuristics (in order):
//   "#2 — try"                 -> "#2: try"        (numbered lead-ins)
//   "we said —" (end of line)  -> "we said:"       (announcement codas)
//   " — Capital/quote/paren"   -> ". Capital"      (new sentence)
//   " — lowercase"             -> ", lowercase"    (continuation)
//   anything left              -> ", "
// En dashes (–, ranges like 20–45 min) are deliberately untouched.
import fs from 'node:fs';
import path from 'node:path';
import * as acorn from 'acorn';

const EM = '—';

export function fixDashes(s) {
  if (!s.includes(EM)) return s;
  s = s.replace(/(#\d+)\s*—\s*/g, '$1: ');
  s = s.replace(/[ \t]*—[ \t]*(?=\n|$)/g, ':');
  s = s.replace(/[ \t]*—[ \t]*(?=[A-Z“"'(‘])/g, '. ');
  s = s.replace(/[ \t]*—[ \t]*/g, ', ');
  s = s.replace(/—/g, ', ');
  return s;
}

function walkJson(value) {
  if (typeof value === 'string') return fixDashes(value);
  if (Array.isArray(value)) return value.map(walkJson);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = walkJson(v);
    return out;
  }
  return value;
}

function listFiles(dir, ext) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(p, ext));
    else if (entry.name.endsWith(ext)) out.push(p);
  }
  return out;
}

let changed = 0;

// --- JSON content files ---
const jsonFiles = [
  ...listFiles('games', 'config.json'),
  ...listFiles('recipes', '.json')
].filter(f => !f.includes('along.json'));
for (const f of jsonFiles) {
  const raw = fs.readFileSync(f, 'utf8');
  if (!raw.includes(EM)) continue;
  const fixed = JSON.stringify(walkJson(JSON.parse(raw)), null, 2) + '\n';
  fs.writeFileSync(f, fixed);
  changed++;
  console.log('json ', f);
}

// --- HTML (strip nothing; comments in our HTML are rare and internal-only,
//     but transforming them too is harmless) ---
for (const f of listFiles('screens', '.html')) {
  const raw = fs.readFileSync(f, 'utf8');
  if (!raw.includes(EM)) continue;
  fs.writeFileSync(f, fixDashes(raw));
  changed++;
  console.log('html ', f);
}

// --- JS string literals (acorn tokens; comments left alone) ---
const jsFiles = [
  ...listFiles('screens', '.js'),
  ...listFiles('engine', '.js'),
  ...listFiles('services', '.js')
];
for (const f of jsFiles) {
  const raw = fs.readFileSync(f, 'utf8');
  if (!raw.includes(EM)) continue;
  const edits = [];
  try {
    acorn.parse(raw, {
      ecmaVersion: 'latest',
      sourceType: raw.includes('import ') || raw.includes('export ') ? 'module' : 'script',
      onToken: (tok) => {
        if (tok.type.label === 'string' && raw.slice(tok.start, tok.end).includes(EM)) {
          edits.push({ start: tok.start, end: tok.end });
        }
        if (tok.type.label === 'template' && raw.slice(tok.start, tok.end).includes(EM)) {
          edits.push({ start: tok.start, end: tok.end });
        }
      }
    });
  } catch (e) {
    console.error('PARSE FAIL', f, e.message);
    continue;
  }
  if (edits.length === 0) continue;
  let out = raw;
  for (const e of edits.reverse()) {
    out = out.slice(0, e.start) + fixDashes(out.slice(e.start, e.end)) + out.slice(e.end);
  }
  fs.writeFileSync(f, out);
  changed++;
  console.log('js   ', f);
}

console.log('files changed:', changed);
