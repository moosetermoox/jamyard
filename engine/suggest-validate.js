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
  'reveal', 'reveal-one', 'vote', 'guessing-rounds', 'end'
];

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
            secretLabel: typeof s.secretLabel === 'string' ? s.secretLabel.slice(0, 80) : undefined,
            clueLabel: typeof s.clueLabel === 'string' ? s.clueLabel.slice(0, 80) : undefined,
            timer: typeof s.timer === 'number' ? s.timer : undefined
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
