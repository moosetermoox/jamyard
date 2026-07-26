/**
 * Feedback storage — Neon when DATABASE_URL is set, an append-only
 * data/feedback.ndjson file otherwise (local dev; Render's filesystem is
 * ephemeral, so the deployed site must use the DB or feedback dies on
 * redeploy — same lesson as Save-as-Recipe).
 *
 * Built as a factory with injected deps so tests can pass fake db fns or a
 * temp file path.
 */
import { readFile, writeFile, appendFile, mkdir } from 'fs/promises';
import { dirname } from 'path';

const VALID_STATUSES = ['new', 'done'];

/**
 * @param {{
 *   db?: { addFeedback: Function, listFeedback: Function, setFeedbackStatus: Function } | null,
 *   filePath?: string
 * }} opts
 */
export function createFeedbackStore({ db = null, filePath = 'data/feedback.ndjson' } = {}) {
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
        // A corrupt line loses itself, never the whole inbox.
      }
    }
    return entries;
  }

  return {
    /** @returns {Promise<number|string>} the new entry's id */
    async add({ page, category, message }) {
      if (db) return await db.addFeedback({ page, category, message });
      const entry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        created_at: new Date().toISOString(),
        page: page || '',
        category,
        message,
        status: 'new'
      };
      await mkdir(dirname(filePath), { recursive: true });
      await appendFile(filePath, JSON.stringify(entry) + '\n');
      return entry.id;
    },

    /** Newest first. */
    async list() {
      if (db) return await db.listFeedback();
      const entries = await readAllFile();
      return entries.reverse();
    },

    /** @returns {Promise<boolean>} false when the id doesn't exist */
    async setStatus(id, status) {
      if (!VALID_STATUSES.includes(status)) {
        throw new Error(`Invalid feedback status: ${status}`);
      }
      if (db) return await db.setFeedbackStatus(id, status);
      const entries = await readAllFile();
      const entry = entries.find(e => String(e.id) === String(id));
      if (!entry) return false;
      entry.status = status;
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, entries.map(e => JSON.stringify(e)).join('\n') + '\n');
      return true;
    }
  };
}
