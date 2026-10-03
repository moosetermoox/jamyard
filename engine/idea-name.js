/**
 * A recipe's name template can open with an English word ("Discussion:
 * ${question}", "Poll: ${question}"). For an idea in another language the
 * route puts the activity's words into that language, but the prefix can
 * come back untouched (the model reads it as a label), so a Spanish class
 * saw "Discussion: ¿Qué prefieres...?" on its projector (the owner's
 * re-check, 2026-10-03). Pure: the name without the template's literal
 * opening when it is still there, otherwise the name as it is.
 *
 * @param {string} name          the compiled (and maybe translated) name
 * @param {string} templateName  the recipe template's name, e.g. "Discussion: ${question}"
 * @returns {string}
 */
export function withoutEnglishPrefix(name, templateName) {
  const current = String(name || '');
  const prefix = String(templateName || '').split('${')[0];
  if (!prefix.trim() || !/[A-Za-z]/.test(prefix)) return current;
  if (!current.startsWith(prefix)) return current;
  const rest = current.slice(prefix.length).trim();
  return rest || current;
}
