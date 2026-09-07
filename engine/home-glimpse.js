/**
 * home-glimpse.js — the projector glimpse the home page draws per activity.
 *
 * The 13a home (2026-09-05) shows "your projector, mid-activity" as a drawn
 * frame, not a screenshot: the class code, the first thing students are
 * asked, and a pile of answers landing. This derives the two facts that
 * frame needs from a config, reusing the activity map's primary-path walk
 * so the prompt shown is the first real student step, not the intro.
 *
 * Shape: { mode: 'answer' | 'join' | 'talk', prompt: string }
 *   answer — students are typing/choosing; `prompt` is what they see
 *   join   — rolling start: the room opens straight into the first step,
 *            so the projector's lasting picture is the doorway (code + QR)
 *   talk   — announce-driven, nothing typed; `prompt` is the first screen
 *
 * `prompt` is teacher config, untrusted for rendering: textContent only.
 * Never throws — a glimpse is decoration, and a broken config must not
 * take the games list down with it.
 */
import { buildActivityMap } from './activity-map.js';

// Steps where the class is doing something on their devices.
const INPUT_TYPES = new Set([
  'collect', 'collect-choice', 'rate', 'estimate', 'vote', 'rank', 'sort',
  'match', 'buzz', 'one-voice', 'relay', 'merge', 'turn', 'wager',
  'solo-quiz', 'checklist'
]);

// The frame has room for more than the map's one-line excerpt.
const PROMPT_MAX = 96;
const PROMPT_FIELDS = ['prompt', 'question', 'message', 'instruction'];

function firstSentence(text) {
  const clean = String(text || '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const m = /^(.+?[.!?])(\s|$)/.exec(clean);
  return m ? m[1] : clean;
}

function cut(text) {
  if (text.length <= PROMPT_MAX) return text;
  let out = text.slice(0, PROMPT_MAX);
  const lastSpace = out.lastIndexOf(' ');
  if (lastSpace > 30) out = out.slice(0, lastSpace);
  return out.trim() + '…';
}

// The step's own words, longer than the map's excerpt; the map's detail
// stays the fallback (it already skipped templated text for us).
function ownWords(config, stop) {
  const id = Array.isArray(stop.ids) ? stop.ids[0] : undefined;
  const phase = id && config.phases && config.phases[id];
  if (!phase) return undefined;
  for (const field of PROMPT_FIELDS) {
    const value = phase[field];
    if (typeof value !== 'string') continue;
    const text = value.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
    if (!text || text.includes('{{')) continue;
    return cut(text);
  }
  return undefined;
}

function promptFromStops(config, stops) {
  for (const stop of stops) {
    const input = (stop.kind === 'step' && INPUT_TYPES.has(stop.type)) ||
      (stop.kind === 'rounds' && Array.isArray(stop.sub) && stop.sub.some((t) => INPUT_TYPES.has(t)));
    if (!input || !stop.detail) continue;
    return ownWords(config, stop) || stop.detail;
  }
  return '';
}

/**
 * The one line under an activity's name on a yard plank: what it is for,
 * without opening it (outside review, 2026-09-06). A recipe-born activity
 * borrows its recipe's tagline ("Perfect for 'most important cause of
 * WWI'..."); anything else gets the first sentence of its description.
 * @param {object} config
 * @param {{tagline?: string}|null} [recipe]  the recipe the config was compiled from, if any
 * @returns {string}
 */
export function activityHook(config, recipe) {
  const tagline = recipe && typeof recipe.tagline === 'string' ? recipe.tagline.trim() : '';
  const line = tagline || firstSentence(config && config.description);
  return line.length > 110 ? line.slice(0, 107).replace(/\s+\S*$/, '') + '...' : line;
}

export function homeGlimpse(config) {
  const empty = { mode: 'answer', prompt: '' };
  if (!config || typeof config !== 'object') return empty;
  let map;
  try {
    map = buildActivityMap(config);
  } catch {
    return { mode: 'answer', prompt: firstSentence(config.description) };
  }
  const stops = (map && Array.isArray(map.stops)) ? map.stops : [];
  if (config.start === 'rolling') {
    return { mode: 'join', prompt: promptFromStops(config, stops) || cut(firstSentence(config.description)) };
  }
  const prompt = promptFromStops(config, stops);
  // The map calls an announce-heavy activity talk-driven. For the frame,
  // talk means the class is mostly not typing: Closer's one-tap checkout
  // after thirteen screens stays talk, Speed Quiz's answer-every-round
  // keeps the answer pile. Weighed by phase count, not stop count.
  let inputPhases = 0;
  let allPhases = 0;
  for (const s of stops) {
    const n = Array.isArray(s.ids) ? s.ids.length : 1;
    allPhases += n;
    if (s.kind === 'step' && INPUT_TYPES.has(s.type)) inputPhases += n;
    if (s.kind === 'rounds' && Array.isArray(s.sub) && s.sub.length > 0) {
      inputPhases += n * s.sub.filter((t) => INPUT_TYPES.has(t)).length / s.sub.length;
    }
  }
  const mostlyTalk = allPhases === 0 || inputPhases / allPhases < 0.25;
  if (map && map.talk && mostlyTalk) {
    const first = stops.find((s) => s.detail || (s.samples && s.samples.length));
    const line = first ? (first.detail || first.samples[0]) : '';
    return { mode: 'talk', prompt: line || cut(firstSentence(config.description)) };
  }
  return { mode: 'answer', prompt: prompt || cut(firstSentence(config.description)) };
}
