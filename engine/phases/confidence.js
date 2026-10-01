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
 *  - formatConfidenceChart: a head line naming the two columns, then the
 *    paired rows (shared/chart-render.js draws both).
 *  - confidenceLine: the most-sure and least-sure levels anyone picked,
 *    each with how many of them were right.
 *
 * Pure: data in, strings out. No engine, no sockets.
 */
import { translate } from '../i18n/index.js';
import { formatPairedChart } from './stance-shift.js';

export const CONFIDENCE_PROMPT = 'How sure are you of your answer?';
export const CONFIDENCE_LEVELS = ['Just guessing', 'Not sure', 'Pretty sure', 'Certain'];

/** The head line chart-render reads over a paired chart: "↔ Right | Wrong". */
export const PAIR_HEAD_PREFIX = '↔ ';

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

/** The head line, then one row per level: "Certain  ███  4 → █  1". Empty when nobody counted. */
export function formatConfidenceChart(split, levels, lang) {
  const rows = formatPairedChart(split.right, split.wrong, levels);
  if (!rows) return '';
  return `${PAIR_HEAD_PREFIX}${translate(lang, 'Right')} | ${translate(lang, 'Wrong')}\n${rows}`;
}

/**
 * "Certain: 4 of 5 were right. Just guessing: 1 of 3 were right." The
 * most-sure and the least-sure level anyone picked (one line when only
 * one level was picked). Empty when nobody counted.
 */
export function confidenceLine(split, levels, lang) {
  const used = (Array.isArray(levels) ? levels : [])
    .map(String)
    .filter(l => (split.right[l] || 0) + (split.wrong[l] || 0) > 0);
  if (used.length === 0) return '';
  const pick = used.length === 1 ? [used[0]] : [used[used.length - 1], used[0]];
  return pick.map(level => {
    const r = split.right[level] || 0;
    const n = r + (split.wrong[level] || 0);
    return translate(lang, '{level}: {right} of {total} were right.')
      .replace('{level}', level)
      .replace('{right}', String(r))
      .replace('{total}', String(n));
  }).join(' ');
}
