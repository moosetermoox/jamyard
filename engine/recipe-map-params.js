/**
 * The parameters a recipe's "What happens" map is drawn with before the
 * teacher fills anything in: every default, and a required text with no
 * default takes its placeholder (the example the form already shows).
 *
 * Creative Vote, Question & Share, Anonymous Feedback, Idea Chain and
 * others drew no map at all, since a required question has no default and
 * the compile refused (a reviewer, 2026-10-02).
 */

const TEXT_TYPES = new Set(['string', 'templateString', 'text']);

export function mapPreviewParams(recipe) {
  const params = {};
  for (const [name, spec] of Object.entries((recipe && recipe.parameters) || {})) {
    if (!spec) continue;
    if (spec.default !== undefined) {
      params[name] = spec.default;
    } else if (TEXT_TYPES.has(spec.type) && typeof spec.placeholder === 'string' && spec.placeholder.trim()) {
      params[name] = spec.placeholder;
    }
  }
  return params;
}
