/**
 * Golden-prompt matcher eval — the AI half of the one-shot guarantee.
 *
 * Runs every prompt in tests/designer/golden-prompts.json through the LIVE
 * matcher (real Haiku call per prompt, same catalog the Create page sends)
 * and diffs what it chose against the corpus's expectation.
 *
 * The deterministic half (the expected deliverables all compile and
 * validate) runs in CI via tests/designer/golden-prompts.test.js. This
 * script is the manual half: run it BEFORE and AFTER touching a matcher or
 * storyboard prompt, and compare the two reports. AI answers wobble; treat
 * a single flip as noise and a cluster of flips as a regression.
 *
 * The matcher never emits storyboards itself — the Create flow falls back
 * to the storyboard generator after a noMatch — so corpus entries expecting
 * "storyboard" or "cantBuild" count as matched when the matcher says
 * noMatch (handing off is the right behavior).
 *
 * Requires ANTHROPIC_API_KEY (~12 Haiku calls per run):
 *   node scripts/eval-designer-prompts.js
 */
import 'dotenv/config';
import { readFile, readdir } from 'node:fs/promises';
import { AIService } from '../services/ai-service.js';

const ROOT = new URL('..', import.meta.url);

async function loadJson(rel) {
  return JSON.parse(await readFile(new URL(rel, ROOT), 'utf8'));
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY is not set — this eval needs the real matcher, mock answers would be meaningless.');
  process.exit(1);
}

const corpus = await loadJson('tests/designer/golden-prompts.json');

const recipeFiles = (await readdir(new URL('recipes', ROOT))).filter(f => f.endsWith('.json'));
const recipes = [];
for (const f of recipeFiles) recipes.push(await loadJson(`recipes/${f}`));

const gameDirs = (await readdir(new URL('games', ROOT)))
  .filter(g => !g.startsWith('_') && g !== 'user');
const games = [];
for (const id of gameDirs) {
  const config = await loadJson(`games/${id}/config.json`);
  games.push({
    id,
    name: config.name,
    description: config.description || '',
    playTime: config.playTime || null
  });
}

const service = new AIService({ mode: 'real' });

function expectedLabel(expect) {
  if (expect.kind === 'host') return `host:${expect.game}`;
  if (expect.kind === 'recipe') return `recipe:${expect.recipe}`;
  return `${expect.kind} (matcher should say noMatch)`;
}

function gotLabel(result) {
  if (result.game) return `host:${result.game}`;
  if (result.recipe) return `recipe:${result.recipe}`;
  if (result.noMatch) return 'noMatch';
  return 'unrecognized: ' + JSON.stringify(result).slice(0, 80);
}

function isHit(expect, result) {
  // acceptAlso: defensible near-matches ("host:<id>" / "recipe:<id>")
  // whitelisted per entry so honest wobble doesn't read as regression.
  if (Array.isArray(expect.acceptAlso) && expect.acceptAlso.includes(gotLabel(result))) return true;
  if (expect.kind === 'host') return result.game === expect.game;
  if (expect.kind === 'recipe') return result.recipe === expect.recipe;
  // storyboard / cantBuild: the matcher's job is to hand off, not to fake a fit.
  return result.noMatch === true;
}

let hits = 0;
const rows = [];
for (const entry of corpus.prompts) {
  let result;
  try {
    result = await service.matchRecipe(entry.prompt, recipes, { games });
  } catch (e) {
    result = { noMatch: true, reason: `ERROR: ${e.message}` };
  }
  const hit = isHit(entry.expect, result);
  if (hit) hits++;
  rows.push({ id: entry.id, hit, expected: expectedLabel(entry.expect), got: gotLabel(result) });
  console.log(`${hit ? '✓' : '✗'} ${entry.id}\n    expected ${expectedLabel(entry.expect)}\n    got      ${gotLabel(result)}`);
}

console.log(`\n${hits}/${corpus.prompts.length} prompts resolved as expected.`);
const misses = rows.filter(r => !r.hit);
if (misses.length) {
  console.log('Misses:', misses.map(m => m.id).join(', '));
  console.log('A single flip is Haiku wobble; a cluster after a prompt edit is a regression.');
}
process.exit(misses.length > 0 ? 1 : 0);
