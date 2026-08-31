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
 * SECOND LEG: for entries expecting "storyboard" or "cantBuild", the LIVE
 * storyboard generator also runs (one Sonnet call each): a storyboard
 * entry passes when the generated storyboard compiles through
 * compileStoryboard with zero problems and validates clean; a cantBuild
 * entry passes when the generator honestly refuses. This is the gate for
 * storyboard-prompt edits (e.g. teaching it a new brick).
 *
 * Requires ANTHROPIC_API_KEY (~12 Haiku + ~3 Sonnet calls per run):
 *   node scripts/eval-designer-prompts.js
 */
import 'dotenv/config';
import { readFile, readdir } from 'node:fs/promises';
import { AIService } from '../services/ai-service.js';
import { validate } from '../engine/game-loader.js';
import '../screens/shared/step-suggestions.js';

const StepSuggestions = globalThis.StepSuggestions;

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

console.log(`\n${hits}/${corpus.prompts.length} prompts resolved as expected (matcher leg).`);
const misses = rows.filter(r => !r.hit);
if (misses.length) {
  console.log('Misses:', misses.map(m => m.id).join(', '));
  console.log('A single flip is Haiku wobble; a cluster after a prompt edit is a regression.');
}

// ---- Second leg: the live storyboard generator ----
const sbEntries = corpus.prompts.filter(e =>
  e.expect.kind === 'storyboard' || e.expect.kind === 'cantBuild');
let sbHits = 0;
const sbMisses = [];
console.log(`\n--- storyboard generator leg (${sbEntries.length} Sonnet calls) ---`);
for (const entry of sbEntries) {
  let verdict;
  let ok = false;
  try {
    const result = await service.generateStoryboard(entry.prompt);
    if (entry.expect.kind === 'cantBuild') {
      ok = result.cantBuild === true;
      verdict = result.cantBuild ? `cantBuild: "${result.reason}"`
        : result.error ? `error: ${result.error}`
        : `built a storyboard anyway (${(result.steps || []).map(s => s.brick).join(' → ')})`;
    } else if (result.cantBuild) {
      verdict = `cantBuild: "${result.reason}"`;
    } else if (result.error) {
      verdict = `error: ${result.error}`;
    } else {
      const { config, problems } = StepSuggestions.compileStoryboard(result);
      const bricks = (result.steps || []).map(s => s.brick).join(' → ');
      if (!config || problems.length) {
        verdict = `compiled with problems [${bricks}]: ${problems.join(' | ')}`;
      } else {
        const { errors } = validate(
          { name: result.name || entry.id, description: result.description || '', phases: config.phases },
          entry.id, { returnResults: true }
        );
        ok = errors.length === 0;
        verdict = ok ? `hostable storyboard [${bricks}]`
          : `validator errors [${bricks}]: ${errors.join(' | ')}`;
      }
    }
  } catch (e) {
    verdict = `ERROR: ${e.message}`;
  }
  if (ok) sbHits++; else sbMisses.push(entry.id);
  console.log(`${ok ? '✓' : '✗'} ${entry.id}\n    ${verdict}`);
}
console.log(`\n${sbHits}/${sbEntries.length} storyboard-leg entries as expected.`);

process.exit(misses.length + sbMisses.length > 0 ? 1 : 0);
