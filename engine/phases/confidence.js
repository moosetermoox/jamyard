/**
 * Confidence after the answer (2026-10-01, the mechanics inventory's
 * Part 3): right after a graded question, a pick-one step asks "How sure
 * are you of your answer?" and names the question in `confidenceFor`. At
 * its close the class's confidence is split by who got the question right,
 * so the answer card can show how sure the right ones were beside how
 * sure the wrong ones were (calibration, the thing a class can talk
 * about: "five of you were certain and wrong").
 *
 *  - localizeConfidence: the room's own copy of the config with the fixed
 *    English prompt and levels in the activity's language (the compiler
 *    cannot know the language; the engine resolves it per room).
 *  - splitByRight: {right, wrong} tallies over the levels, only students
 *    who answered the question AND said how sure they were.
 *  - formatConfidenceDial: the class's average confidence as a dial
 *    (shared/chart-render.js draws the "◔" line) with its nearest level.
 *  - sureButWrongLine: how many of the students who were sure got it
 *    wrong, the one line a class can talk about.
 *  - averageConfidence: the average and its level, for the report too.
 *
 * Pure: data in, strings out. No engine, no sockets.
 */
import { translate } from '../i18n/index.js';

export const CONFIDENCE_PROMPT = 'How sure are you of your answer?';
export const CONFIDENCE_LEVELS = ['Just guessing', 'Not sure', 'Pretty sure', 'Certain'];

/**
 * A copy of the config whose confidence steps speak `lang`. Only the
 * fixed English words are translated (a teacher's own wording stays as
 * written); the config passed in is never changed.
 */
export function localizeConfidence(config, lang) {
  const phases = config && config.phases;
  if (!phases || !lang || lang === 'en') return config;
  const ids = Object.keys(phases).filter(id => phases[id] && phases[id].confidenceFor);
  if (ids.length === 0) return config;
  const copy = { ...phases };
  for (const id of ids) {
    const p = phases[id];
    copy[id] = {
      ...p,
      prompt: typeof p.prompt === 'string' ? translate(lang, p.prompt) : p.prompt,
      choices: Array.isArray(p.choices) ? p.choices.map(c => (typeof c === 'string' ? translate(lang, c) : c)) : p.choices
    };
  }
  return { ...config, phases: copy };
}

/**
 * @param {Object} gradedScores  the graded step's .scores ({playerId: points}, 0 = wrong)
 * @param {Object} sureByPlayer  the confidence step's byPlayer ({playerId: level})
 * @returns {{ right: Object, wrong: Object, total: number }}
 */
export function splitByRight(gradedScores, sureByPlayer) {
  const scores = gradedScores && typeof gradedScores === 'object' ? gradedScores : {};
  const sure = sureByPlayer && typeof sureByPlayer === 'object' ? sureByPlayer : {};
  const right = {};
  const wrong = {};
  let total = 0;
  for (const [id, level] of Object.entries(sure)) {
    if (!(id in scores) || level == null || level === '') continue;
    const key = String(level);
    const bucket = (Number(scores[id]) || 0) > 0 ? right : wrong;
    bucket[key] = (bucket[key] || 0) + 1;
    total++;
  }
  return { right, wrong, total };
}

// ---- The dial (owner 2026-10-01: the right/wrong chart "is not easy to
// understand"; a dial of the class's confidence and one line instead,
// each student's confidence in the report) ----

/** The head of a dial line chart-render draws: "◔ 2.3/4 | Just guessing | Certain". */
export const DIAL_PREFIX = '◔ ';

/**
 * The class's average place on the scale, 1 = the first level, and the
 * level nearest it. Over every student who said how sure they were.
 * @returns {{ value: number, label: string, count: number } | null}
 */
export function averageConfidence(sureByPlayer, levels) {
  const list = (Array.isArray(levels) ? levels : []).map(String);
  if (list.length < 2) return null;
  let sum = 0;
  let count = 0;
  for (const level of Object.values(sureByPlayer || {})) {
    const at = list.indexOf(String(level));
    if (at === -1) continue;
    sum += at + 1;
    count++;
  }
  if (count === 0) return null;
  const value = sum / count;
  // The nearest level; a tie goes to the less sure one (one Pretty sure
  // and one Certain is not "Certain on average")
  const nearest = Math.ceil(value - 0.5);
  return { value, label: list[Math.min(list.length, Math.max(1, nearest)) - 1], count };
}

/**
 * The title, the dial line, and the caption, one per line:
 *   How sure the class was
 *   ◔ 2.3/4 | Just guessing | Certain
 *   Not sure on average
 * Empty when nobody said how sure they were.
 */
export function formatConfidenceDial(sureByPlayer, levels, lang) {
  const avg = averageConfidence(sureByPlayer, levels);
  if (!avg) return '';
  const list = levels.map(String);
  return [
    translate(lang, 'How sure the class was'),
    `${DIAL_PREFIX}${avg.value.toFixed(1)}/${list.length} | ${list[0]} | ${list[list.length - 1]}`,
    translate(lang, '{level} on average').replace('{level}', avg.label)
  ].join('\n');
}

/**
 * The one line under the dial, about the students who were sure (the top
 * half of the scale): "Sure but wrong: 3 of 5." or, when every sure
 * student was right, "Everyone who was sure got it right." Empty when
 * nobody who answered was sure.
 */
export function sureButWrongLine(split, levels, lang) {
  const list = (Array.isArray(levels) ? levels : []).map(String);
  const sure = list.slice(Math.ceil(list.length / 2));
  let wrong = 0;
  let total = 0;
  for (const level of sure) {
    wrong += split.wrong[level] || 0;
    total += (split.wrong[level] || 0) + (split.right[level] || 0);
  }
  if (total === 0) return '';
  if (wrong === 0) return translate(lang, 'Everyone who was sure got it right.');
  return translate(lang, 'Sure but wrong: {wrong} of {total}.')
    .replace('{wrong}', String(wrong)).replace('{total}', String(total));
}
