/**
 * Concierge suggestion validation. The "not sure what to make" AI may only
 * point at things the platform can actually deliver: an existing activity,
 * a recipe with legal params, or a storyboard made of known bricks. This
 * pure filter is the structural guarantee. Anything that does not resolve
 * is dropped before a teacher ever sees it.
 */

// Must match the brick vocabulary compileStoryboard accepts
// (screens/shared/step-suggestions.js).
export const STORYBOARD_BRICKS = [
  'announce', 'collect', 'collect-two', 'collect-choice', 'estimate',
  'reveal', 'reveal-one', 'vote', 'guessing-rounds', 'rank', 'quiz', 'teams',
  'chain', 'deal', 'assign', 'pairs', 'end'
];

const MAX_PAIR_ROUNDS = 3;

// Pairs fields ride through in trimmed shape; compileStoryboard re-validates
// (sides must be exactly two, rounds cap at three).
function cleanRounds(raw) {
  if (!Array.isArray(raw)) return undefined;
  return raw.filter(r => typeof r === 'string').slice(0, MAX_PAIR_ROUNDS).map(r => r.slice(0, 500));
}
function cleanSides(raw) {
  if (!Array.isArray(raw)) return undefined;
  return raw.filter(s => typeof s === 'string').slice(0, 2).map(s => s.slice(0, 40));
}

const MAX_RANK_ITEMS = 12;
const MAX_DEAL_PILES = 4;

// Deal piles ride through in trimmed shape; compileStoryboard re-validates
// (at least two piles, labels defaulted, prompts scrubbed of tokens).
function cleanPiles(raw) {
  if (!Array.isArray(raw)) return undefined;
  return raw.filter(p => p && typeof p === 'object')
    .slice(0, MAX_DEAL_PILES)
    .map(p => ({
      label: typeof p.label === 'string' ? p.label.slice(0, 80) : '',
      prompt: typeof p.prompt === 'string' ? p.prompt.slice(0, 300) : ''
    }));
}

const MAX_CHAIN_HOPS = 6;

// Chain fields ride through the concierge only in this trimmed shape;
// compileStoryboard re-validates (start/hops required, sentence needs
// blind, template tokens stripped from blind prompts, etc.).
function cleanHops(raw) {
  if (!Array.isArray(raw)) return undefined;
  return raw.slice(0, MAX_CHAIN_HOPS).filter(h => typeof h === 'string').map(h => h.slice(0, 500));
}

const MAX_QUIZ_QUESTIONS = 15;

// Quiz questions ride through the concierge only in this trimmed shape;
// compileStoryboard re-validates (correct must match a choice, etc.).
function cleanQuestions(raw) {
  if (!Array.isArray(raw)) return undefined;
  return raw.slice(0, MAX_QUIZ_QUESTIONS)
    .filter(q => q && typeof q === 'object')
    .map(q => ({
      text: typeof q.text === 'string' ? q.text.slice(0, 300) : '',
      choices: Array.isArray(q.choices) ? q.choices.slice(0, 8).map(String) : [],
      correct: typeof q.correct === 'string' ? q.correct.slice(0, 200) : ''
    }));
}

const MAX_SUGGESTIONS = 3;
const MAX_STORYBOARD_STEPS = 12;

function cleanWhy(why) {
  return typeof why === 'string' ? why.trim().slice(0, 200) : '';
}

/**
 * @param {any} raw - the AI's suggestions array
 * @param {{ gameIds: string[], recipes: Object }} ctx
 *   recipes: { [id]: { parameters: { [name]: spec } } }
 * @returns {{ suggestions: Array, dropped: number }}
 */
export function validateSuggestions(raw, ctx) {
  const gameIds = (ctx && ctx.gameIds) || [];
  const recipes = (ctx && ctx.recipes) || {};
  const list = Array.isArray(raw) ? raw : [];
  const suggestions = [];
  let dropped = 0;

  for (const item of list) {
    if (suggestions.length >= MAX_SUGGESTIONS) break;
    if (!item || typeof item !== 'object') { dropped++; continue; }

    if (item.kind === 'host') {
      if (typeof item.id === 'string' && gameIds.includes(item.id)) {
        suggestions.push({ kind: 'host', id: item.id, why: cleanWhy(item.why) });
      } else {
        dropped++;
      }
      continue;
    }

    if (item.kind === 'recipe') {
      const recipe = typeof item.id === 'string' ? recipes[item.id] : null;
      if (!recipe) { dropped++; continue; }
      const legalParams = recipe.parameters || {};
      const params = {};
      if (item.params && typeof item.params === 'object') {
        for (const [key, value] of Object.entries(item.params)) {
          if (!(key in legalParams)) continue;
          const spec = legalParams[key] || {};
          const numeric = spec.type === 'integer' || spec.type === 'number';
          if (numeric) {
            // The AI thinks in minutes; recipe fields are seconds (min/max
            // bounded). Clamp into the legal range so the prefilled form
            // never fails create with an error the teacher didn't cause.
            if (typeof value !== 'number' || !Number.isFinite(value)) continue;
            let v = value;
            if (typeof spec.min === 'number' && v < spec.min) v = spec.min;
            if (typeof spec.max === 'number' && v > spec.max) v = spec.max;
            params[key] = v;
          } else if (typeof value === 'string' || typeof value === 'number') {
            params[key] = value;
          }
        }
      }
      suggestions.push({ kind: 'recipe', id: item.id, params, why: cleanWhy(item.why) });
      continue;
    }

    if (item.kind === 'storyboard') {
      const sb = item.storyboard;
      const steps = sb && Array.isArray(sb.steps) ? sb.steps : [];
      const legal = steps.length >= 2 && steps.length <= MAX_STORYBOARD_STEPS &&
        steps.every(s => s && typeof s === 'object' && STORYBOARD_BRICKS.includes(s.brick));
      if (!legal) { dropped++; continue; }
      suggestions.push({
        kind: 'storyboard',
        storyboard: {
          name: typeof sb.name === 'string' ? sb.name.slice(0, 80) : 'New Activity',
          description: typeof sb.description === 'string' ? sb.description.slice(0, 200) : '',
          steps: steps.map(s => ({
            brick: s.brick,
            text: typeof s.text === 'string' ? s.text.slice(0, 500) : undefined,
            choices: Array.isArray(s.choices) ? s.choices.slice(0, 8).map(String) : undefined,
            guess: s.guess === 'who' ? 'who' : undefined,
            items: Array.isArray(s.items) ? s.items.slice(0, MAX_RANK_ITEMS).map(String) : undefined,
            // rank: each group decides one order; assign: spots per item
            byGroup: s.byGroup === true ? true : undefined,
            perChoice: typeof s.perChoice === 'number' && Number.isFinite(s.perChoice) ? s.perChoice : undefined,
            secretLabel: typeof s.secretLabel === 'string' ? s.secretLabel.slice(0, 80) : undefined,
            clueLabel: typeof s.clueLabel === 'string' ? s.clueLabel.slice(0, 80) : undefined,
            questions: cleanQuestions(s.questions),
            speedBonus: typeof s.speedBonus === 'boolean' ? s.speedBonus : undefined,
            teamCount: typeof s.teamCount === 'number' ? s.teamCount : undefined,
            groupSize: typeof s.groupSize === 'number' ? s.groupSize : undefined,
            start: typeof s.start === 'string' ? s.start.slice(0, 500) : undefined,
            hops: cleanHops(s.hops),
            visibility: ['all', 'tail', 'blind'].includes(s.visibility) ? s.visibility : undefined,
            sentence: typeof s.sentence === 'string' ? s.sentence.slice(0, 300) : undefined,
            piles: cleanPiles(s.piles),
            writeTimer: typeof s.writeTimer === 'number' ? s.writeTimer : undefined,
            // pairs: follow-up rounds with the same partner, two sides to deal
            rounds: cleanRounds(s.rounds),
            sides: cleanSides(s.sides),
            timer: typeof s.timer === 'number' ? s.timer : undefined,
            // estimate: the scale's ends ("on a scale of 1 to 10")
            min: typeof s.min === 'number' && Number.isFinite(s.min) ? s.min : undefined,
            max: typeof s.max === 'number' && Number.isFinite(s.max) ? s.max : undefined
          }))
        },
        why: cleanWhy(item.why)
      });
      continue;
    }

    dropped++;
  }

  return { suggestions, dropped };
}
