/**
 * suggest-time.js — the "Not sure what to make?" ideas, in order of how
 * well they fill the time the teacher picked.
 *
 * A reviewer picked "The whole period" and the top idea ran about ten
 * minutes (2026-10-02). The AI's order is a guess about fit; the running
 * time is not its to judge (engine/duration-estimate.js computes it from
 * the timers). So the route estimates every idea, and this module puts
 * the ones that fill the chosen time first, the AI's order breaking ties.
 *
 * Pure: no AI, no I/O.
 */

import { parseRequestedMinutes } from './duration-estimate.js';

// The concierge's four time chips (screens/designer/designer.js
// CONCIERGE_TIMES) as minute windows. A period is taken as 45 minutes.
const CHIP_WINDOWS = [
  { test: /whole period/i, min: 30, max: 60, label: 'the whole period' },
  { test: /half the period/i, min: 15, max: 30, label: 'half the period' },
  { test: /10 to 20 minutes/i, min: 10, max: 20, label: '10 to 20 minutes' },
  { test: /about 5 minutes/i, min: 1, max: 8, label: 'about 5 minutes' }
];

/**
 * @param {string} time  the chip's words, or anything a teacher typed
 * @returns {{min: number, max: number, label: string}|null}
 */
export function timeWindow(time) {
  const text = String(time || '').trim();
  if (!text) return null;
  for (const w of CHIP_WINDOWS) {
    if (w.test.test(text)) return { min: w.min, max: w.max, label: w.label };
  }
  const minutes = parseRequestedMinutes(text);
  if (!minutes) return null;
  return { min: Math.max(1, Math.round(minutes * 0.6)), max: minutes, label: minutes + ' minutes' };
}

/**
 * How far an estimate sits outside the window, in minutes (0 = inside).
 * @param {number|null} minutes
 * @param {{min: number, max: number}} win
 */
export function missBy(minutes, win) {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes)) return null;
  if (minutes < win.min) return win.min - minutes;
  if (minutes > win.max) return minutes - win.max;
  return 0;
}

/**
 * The ideas in order of fit: inside the window first, then the nearest,
 * an idea with no estimate after every estimated one. Stable, so the AI's
 * order breaks ties. Never drops an idea.
 * @template {{minutes?: number|null}} T
 * @param {T[]} suggestions
 * @param {{min: number, max: number}|null} win
 * @returns {T[]}
 */
export function rankByTime(suggestions, win) {
  const list = Array.isArray(suggestions) ? suggestions.slice() : [];
  if (!win) return list;
  return list
    .map((s, i) => ({ s, i, miss: missBy(s && s.minutes, win) }))
    .sort((a, b) => {
      const am = a.miss === null ? Infinity : a.miss;
      const bm = b.miss === null ? Infinity : b.miss;
      return am - bm || a.i - b.i;
    })
    .map(x => x.s);
}

/**
 * One honest line when nothing fills the time: every estimated idea runs
 * short of the window (the whole period is longer than any one activity).
 * @param {Array<{minutes?: number|null}>} suggestions
 * @param {{min: number, max: number, label: string}|null} win
 * @returns {string|null}
 */
export function timeNote(suggestions, win) {
  if (!win) return null;
  const known = (suggestions || []).map(s => s && s.minutes).filter(m => typeof m === 'number' && Number.isFinite(m));
  if (!known.length) return null;
  if (known.some(m => missBy(m, win) === 0)) return null;
  const longest = Math.max(...known);
  if (longest < win.min) {
    return 'None of these fills ' + win.label + ' on its own: the longest runs about ' + longest +
      ' minutes. Two back to back would fill more of it.';
  }
  const shortest = Math.min(...known);
  if (shortest > win.max) {
    return 'Each of these runs longer than ' + win.label + ': the shortest takes about ' + shortest + ' minutes.';
  }
  return null;
}
