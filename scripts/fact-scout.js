/**
 * Fact scout, the command line: rounds for Trivia Bluff found where facts
 * sit unlabeled (the pipeline is services/fact-scout.js, the prompts and
 * filters engine/fact-scout.js, the owner's taste engine/fact-scout-taste.json).
 *
 * Usage:
 *   node scripts/fact-scout.js "<topic>" [--pages 10] [--want 20] [--rated more.json]
 *
 * Prints the rounds best first with the quoted sentence, the scores, and
 * the lineup judge's pick, and writes them as JSON in the working
 * directory. To teach it your taste, add hits and misses ({question,
 * truth, why}) to engine/fact-scout-taste.json, or pass an extra file
 * with --rated.
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { AIService } from '../services/ai-service.js';
import { scoutFacts } from '../services/fact-scout.js';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });

const args = process.argv.slice(2);
const topic = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--'))).join(' ').trim();
const flag = (name, dflt) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : dflt; };

if (!topic) { console.error('Usage: node scripts/fact-scout.js "<topic>" [--pages 10] [--want 20] [--rated more.json]'); process.exit(1); }
if (!process.env.ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY is not set (.env)'); process.exit(1); }

async function main() {
  console.log(`Topic: ${topic}`);
  const start = Date.now();
  const result = await scoutFacts({
    topic,
    aiService: new AIService({ mode: 'real' }),
    pages: parseInt(flag('pages', '10'), 10),
    want: parseInt(flag('want', '20'), 10),
    tastePath: flag('rated', null),
    log: (line) => console.log(line)
  });
  console.log(`${result.rounds.length} round(s) in ${((Date.now() - start) / 1000).toFixed(0)}s, ${result.dropped} dropped\n`);
  result.judged.forEach((c, i) => {
    console.log(`${String(i + 1).padStart(2)}. ${c.question}`);
    console.log(`    truth: ${c.truth}   lies: ${[c.houseLie, ...(c.lies || [])].join(', ')}`);
    console.log(`    ridiculous ${c.ridiculous}   checkable ${c.checkable}   lineup ${c.lineup}/5 (judge ${c.judge})   picturable ${c.picturable}   wide ${c.wide}`);
    console.log(`    source: ${c.source}`);
    console.log(`    quote: "${c.quote}"`);
    if (c.note) console.log(`    note: ${c.note}`);
    console.log('');
  });
  const out = `fact-scout-${topic.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
  await writeFile(out, JSON.stringify(result, null, 2));
  console.log(`Saved ${out}.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
