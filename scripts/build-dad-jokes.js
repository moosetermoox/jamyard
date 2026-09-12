/**
 * build-dad-jokes.js — turn docs/500-all-ages-dad-jokes.md (a numbered
 * markdown list, some entries spanning several lines) into
 * engine/dad-jokes.json, the plain array the early-bird joke reads at
 * runtime (engine/early-joke.js).
 *
 *   node scripts/build-dad-jokes.js
 *
 * The numbers come off; continuation lines (a punchline on its own line,
 * a two-voice exchange) fold into the joke with single newlines, blank
 * lines dropped; em dashes become commas (students read them as an AI
 * tell, tests/style/no-em-dash.test.js). Re-run after editing the list;
 * tests/engine/early-joke.test.js fails when the JSON is stale.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJokeList } from '../engine/early-joke.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'docs', '500-all-ages-dad-jokes.md'), 'utf8');
const jokes = parseJokeList(source);
writeFileSync(join(root, 'engine', 'dad-jokes.json'), JSON.stringify(jokes, null, 2) + '\n');
console.log(`Wrote ${jokes.length} jokes to engine/dad-jokes.json`);
