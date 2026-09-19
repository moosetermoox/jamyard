/**
 * Ideas log (2026-09-19): what teachers try to make on the Create page.
 *
 * The owner asked for three things: when someone tries to create
 * something, what they made that is unique (a storyboard built from
 * bricks rather than a recipe match), and what they tried to make that
 * could not be made (the matcher's noMatch, the storyboard's cantBuild,
 * an error). PostHog already counts the outcomes (`create_result`), but
 * its allowlist bans free text on purpose, so the idea itself lives here,
 * in our own store, read only on the owner-only /ideas page.
 *
 * What a row holds: the teacher's idea as typed (contact patterns
 * scrubbed, capped), which stage produced it (match, alternate, or
 * storyboard), how it landed, what it pointed at, why not when it could
 * not, the bricks a storyboard used, the minutes the teacher asked for,
 * and, once the teacher saves the result, the saved activity's id and
 * name. Optionally the browser's random analytics id (jamyard.aid), so
 * one teacher's tries line up. Teacher text, never student text.
 *
 * Neon when DATABASE_URL is set, an ndjson file for local dev. Factory
 * with injected deps, the feedback-store shape.
 */
import { readFile, writeFile, appendFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import { scrubPatterns } from '../engine/pii-scrub.js';

export const IDEA_STAGES = ['match', 'alternate', 'storyboard'];
export const IDEA_RESULTS = ['match', 'existing', 'none', 'storyboard', 'cant-build', 'error'];
export const IDEA_MAX_LENGTH = 2000;

const BROWSER_ID = /^[a-f0-9]{16,32}$/;
const SAFE_ID = /^[0-9a-z][0-9a-z_-]{0,63}$/i;

/** True for an id a client may hand back to mark a row saved. */
export function isIdeaId(value) {
  if (Number.isInteger(value) && value > 0) return true;
  return typeof value === 'string' && SAFE_ID.test(value);
}

/** The idea as stored: trimmed, contact patterns removed, capped. */
export function cleanIdea(text) {
  const t = typeof text === 'string' ? text.trim() : '';
  return scrubPatterns(t).slice(0, IDEA_MAX_LENGTH);
}

/**
 * The headline numbers: tries, and how they landed. "Unique" is what a
 * storyboard built (bricks, not a recipe); "could not make" is none +
 * cant-build + error. `saved` counts rows the teacher went on to save.
 * @param {Array<{stage: string, result: string, saved_game_id?: string|null}>} rows
 */
export function summarizeIdeaLog(rows) {
  const out = { tries: 0, matched: 0, existing: 0, storyboard: 0, couldNot: 0, none: 0, cantBuild: 0, errors: 0, saved: 0, alternates: 0 };
  for (const row of rows || []) {
    if (row.stage === 'alternate') { out.alternates++; continue; }
    out.tries++;
    switch (row.result) {
      case 'match': out.matched++; break;
      case 'existing': out.existing++; break;
      case 'storyboard': out.storyboard++; break;
      case 'none': out.none++; out.couldNot++; break;
      case 'cant-build': out.cantBuild++; out.couldNot++; break;
      default: out.errors++; out.couldNot++;
    }
    if (row.saved_game_id) out.saved++;
  }
  return out;
}

/**
 * @param {{
 *   db?: { addIdeaLog: Function, markIdeaLogSaved: Function, listIdeaLog: Function } | null,
 *   filePath?: string
 * }} opts
 */
export function createIdeaLog({ db = null, filePath = 'data/idea-log.ndjson' } = {}) {
  async function readAllFile() {
    let raw;
    try {
      raw = await readFile(filePath, 'utf-8');
    } catch {
      return [];
    }
    const entries = [];
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        entries.push(JSON.parse(trimmed));
      } catch {
        // A corrupt line loses itself, never the whole log.
      }
    }
    return entries;
  }

  return {
    /**
     * One try. Returns the row id the client hands back on save.
     * @param {{ idea: string, stage: string, result: string, target?: string, targetName?: string,
     *           reason?: string, steps?: string[], minutes?: number|null, browser?: string|null }} row
     */
    async open(row) {
      const clean = {
        idea: cleanIdea(row.idea),
        stage: IDEA_STAGES.includes(row.stage) ? row.stage : 'match',
        result: IDEA_RESULTS.includes(row.result) ? row.result : 'error',
        target: String(row.target || '').slice(0, 80),
        targetName: String(row.targetName || '').slice(0, 120),
        reason: String(row.reason || '').slice(0, 600),
        steps: Array.isArray(row.steps) ? row.steps.map(s => String(s).slice(0, 24)).slice(0, 12).join(',') : '',
        minutes: Number.isInteger(row.minutes) && row.minutes > 0 ? row.minutes : null,
        browser: typeof row.browser === 'string' && BROWSER_ID.test(row.browser) ? row.browser : null
      };
      if (db) return await db.addIdeaLog(clean);
      const entry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        created_at: new Date().toISOString(),
        idea: clean.idea,
        stage: clean.stage,
        result: clean.result,
        target: clean.target,
        target_name: clean.targetName,
        reason: clean.reason,
        steps: clean.steps,
        minutes: clean.minutes,
        browser: clean.browser,
        saved_game_id: null,
        saved_name: ''
      };
      await mkdir(dirname(filePath), { recursive: true });
      await appendFile(filePath, JSON.stringify(entry) + '\n');
      return entry.id;
    },

    /**
     * The teacher saved what the try produced.
     * @param {number|string} id
     * @param {{ gameId: string, name: string }} saved
     * @returns {Promise<boolean>} false when the id is unknown
     */
    async markSaved(id, saved) {
      const gameId = String(saved && saved.gameId || '').slice(0, 80);
      const name = String(saved && saved.name || '').slice(0, 120);
      if (!gameId) return false;
      if (db) return await db.markIdeaLogSaved(id, { gameId, name });
      const entries = await readAllFile();
      const entry = entries.find(e => String(e.id) === String(id));
      if (!entry) return false;
      entry.saved_game_id = gameId;
      entry.saved_name = name;
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, entries.map(e => JSON.stringify(e)).join('\n') + '\n');
      return true;
    },

    /** Newest first. */
    async list(limit = 100) {
      const n = Number.isInteger(limit) && limit > 0 ? limit : 100;
      if (db) return await db.listIdeaLog(n);
      const entries = await readAllFile();
      return entries.reverse().slice(0, n);
    }
  };
}
