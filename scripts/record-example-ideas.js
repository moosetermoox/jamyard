/**
 * Records the model's answers for the Create page's example ideas into
 * engine/example-ideas.json (see engine/example-ideas.js). Starts its own
 * server with RECORD_EXAMPLE_IDEAS=1 and the real API key, clears the old
 * answers, then sends each example through the routes the Create page uses:
 * the follow-up questions, the matcher (and any re-run it makes), and the
 * plan when the matcher hands the idea on. Spends a few cents of API time.
 *
 *   node scripts/record-example-ideas.js
 *
 * Re-run after changing a Create prompt or the Sonnet or Haiku model.
 */
import 'dotenv/config';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const FILE = join(ROOT, 'engine', 'example-ideas.json');
const PORT = 3018;
const BASE = `http://127.0.0.1:${PORT}`;

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY is not set: the answers must come from the real models.');
  process.exit(1);
}

// Start clean: every answer in the file comes from this run
const store = JSON.parse(readFileSync(FILE, 'utf8'));
for (const e of store.examples) e.answers = {};
writeFileSync(FILE, JSON.stringify(store, null, 1) + '\n');

const child = spawn(process.execPath, [join(ROOT, 'server.js')], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), RECORD_EXAMPLE_IDEAS: '1', DATABASE_URL: '', POSTHOG_KEY: '', AI_DAILY_CAP: '0', AI_CALLS_PER_MINUTE: '0' },
  stdio: ['ignore', 'pipe', 'pipe']
});
child.stderr.on('data', (d) => process.stderr.write('[server] ' + d));
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('server did not start')), 20000);
  child.stdout.on('data', (d) => { if (String(d).includes(String(PORT))) { clearTimeout(t); resolve(); } });
});

const post = async (path, body) => {
  const res = await fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return res.json();
};

let failed = 0;
try {
  for (const { idea } of store.examples) {
    const q = await post('/api/games/idea-questions', { description: idea });
    const m = await post('/api/games/from-description', { description: idea });
    let line = `${idea}\n  questions: ${(q.questions || []).length}`;
    if (m.config) line += `  match: ${m.recipe && m.recipe.id}`;
    else if (m.existingGame) line += `  existing: ${m.existingGame}`;
    else if (m.noMatch && !m.harm && !m.offScreen) {
      const sb = await post('/api/games/storyboard', { description: idea });
      if (sb.storyboard) line += `  plan: ${(sb.storyboard.steps || []).map(s => s.brick).join(' > ')}`;
      else { line += `  plan FAILED: ${JSON.stringify(sb).slice(0, 120)}`; failed++; }
    } else if (m.error || m.unclear) { line += `  FAILED: ${JSON.stringify(m).slice(0, 120)}`; failed++; }
    else line += `  noMatch: ${m.reason || ''}`;
    console.log(line);
  }
} finally {
  child.kill();
}
const after = JSON.parse(readFileSync(FILE, 'utf8'));
console.log(`\nRecorded ${after.examples.filter(e => Object.keys(e.answers || {}).length).length} of ${after.examples.length} examples on ${after.recordedAt}.`);
process.exit(failed ? 1 : 0);
