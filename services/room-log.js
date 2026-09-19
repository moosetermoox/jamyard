/**
 * Rooms log (2026-09-18): the owner's per-room record for the pilot.
 *
 * PostHog is aggregate. To debrief a teacher you were not in the room
 * with, you need the room itself: which activity, how many students, how
 * far it got, whether it ended or was left behind. That is this log, one
 * row per real room, read on the owner-only /rooms page.
 *
 * What a row holds, and why it is safe: the activity (a built-in's slug,
 * or the teacher's own name for a custom one, teacher text never student
 * text), a headcount, a step index, a status, minutes, the room code (so
 * the owner can match it to a teacher's report of "room XKCD broke"), and
 * a random key the host's browser minted for itself (so one teacher's
 * rooms line up; it holds nothing about the person). Nothing a student
 * typed is ever near this file. Robot playtests are never logged.
 *
 * Neon when DATABASE_URL is set, an append-plus-rewrite ndjson file for
 * local dev (Render's disk is ephemeral, so the deployed site must use
 * the DB). Factory with injected deps, the feedback-store shape.
 */
import { readFile, writeFile, appendFile, mkdir } from 'fs/promises';
import { dirname } from 'path';

/** The day the count starts: the 50-teachers-by-October-5 pilot. */
export const PILOT_START = '2026-09-18';

/** A class room has at least this many students; fewer is the teacher testing. */
export const CLASS_MIN_PLAYERS = 3;

export const ROOM_STATUSES = ['open', 'ended', 'closed'];
export const ROOM_KINDS = ['class', 'pretend'];

const HOST_KEY = /^[a-f0-9]{16,32}$/;

/**
 * The host key is a random hex string the host page minted in its own
 * localStorage (screens/host/host.js). Anything else is refused, never
 * stored: a modified client cannot smuggle a name in.
 * @param {unknown} value
 */
export function isHostKey(value) {
  return typeof value === 'string' && HOST_KEY.test(value);
}

/**
 * The headline numbers for the pilot, computed the same way whichever
 * store the rows came from.
 *
 *  - hosts: distinct host keys with at least one class-kind room of
 *    minPlayers or more students since `since`. THE number.
 *  - unattributedClassRooms: class-sized real rooms with no host key
 *    (a browser that blocked storage), so the owner knows the floor.
 *  - classRooms / rooms / ended / pretendRooms: the funnel around it.
 * @param {Array<{created_at: string, kind: string, host_key: string|null, players: number, status: string}>} rows
 * @param {{ since?: string, minPlayers?: number }} [opts]
 */
export function summarizeRoomLog(rows, opts = {}) {
  const since = typeof opts.since === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(opts.since) ? opts.since : PILOT_START;
  const minPlayers = Number.isInteger(opts.minPlayers) ? opts.minPlayers : CLASS_MIN_PLAYERS;
  const sinceMs = Date.parse(since + 'T00:00:00Z');
  const hosts = new Set();
  let rooms = 0, classRooms = 0, ended = 0, pretendRooms = 0, unattributedClassRooms = 0;
  for (const row of rows || []) {
    const t = Date.parse(row.created_at);
    if (!Number.isFinite(t) || t < sinceMs) continue;
    rooms++;
    if (row.status === 'ended') ended++;
    if (row.kind === 'pretend') { pretendRooms++; continue; }
    if ((row.players || 0) < minPlayers) continue;
    classRooms++;
    if (isHostKey(row.host_key)) hosts.add(row.host_key);
    else unattributedClassRooms++;
  }
  return { since, minPlayers, hosts: hosts.size, unattributedClassRooms, classRooms, rooms, ended, pretendRooms };
}

/**
 * @param {{
 *   db?: { addRoomLog: Function, updateRoomLog: Function, listRoomLog: Function } | null,
 *   filePath?: string
 * }} opts
 */
export function createRoomLog({ db = null, filePath = 'data/room-log.ndjson' } = {}) {
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

  async function writeAllFile(entries) {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, entries.map(e => JSON.stringify(e)).join('\n') + '\n');
  }

  return {
    /**
     * A room opened. Returns the row id the room keeps for its updates.
     * @param {{ code: string, gameId: string, gameLabel: string, source: string, kind: string, hostKey: string|null, steps: number }} row
     * @returns {Promise<number|string>}
     */
    async open(row) {
      const clean = {
        code: String(row.code || ''),
        gameId: String(row.gameId || ''),
        gameLabel: String(row.gameLabel || '').slice(0, 80),
        source: row.source === 'custom' ? 'custom' : 'built-in',
        kind: ROOM_KINDS.includes(row.kind) ? row.kind : 'class',
        hostKey: isHostKey(row.hostKey) ? row.hostKey : null,
        steps: Number.isInteger(row.steps) && row.steps >= 0 ? row.steps : 0
      };
      if (db) return await db.addRoomLog(clean);
      const now = new Date().toISOString();
      const entry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        created_at: now,
        updated_at: now,
        code: clean.code,
        game_id: clean.gameId,
        game_label: clean.gameLabel,
        source: clean.source,
        kind: clean.kind,
        host_key: clean.hostKey,
        steps: clean.steps,
        step: 0,
        step_id: '',
        players: 0,
        status: 'open',
        minutes: 0
      };
      await mkdir(dirname(filePath), { recursive: true });
      await appendFile(filePath, JSON.stringify(entry) + '\n');
      return entry.id;
    },

    /**
     * The room moved: a join, a step, an ending. Headcount only ever
     * grows (a student who dropped still sat in the room).
     * @param {number|string} id
     * @param {{ players: number, step: number, stepId: string, status: string, minutes: number }} fields
     * @returns {Promise<boolean>} false when the id is unknown
     */
    async update(id, fields) {
      const f = {
        players: Math.max(0, Number(fields.players) || 0),
        step: Math.max(0, Number(fields.step) || 0),
        stepId: String(fields.stepId || '').slice(0, 80),
        status: ROOM_STATUSES.includes(fields.status) ? fields.status : 'open',
        minutes: Math.max(0, Number(fields.minutes) || 0)
      };
      if (db) return await db.updateRoomLog(id, f);
      const entries = await readAllFile();
      const entry = entries.find(e => String(e.id) === String(id));
      if (!entry) return false;
      entry.players = Math.max(entry.players || 0, f.players);
      entry.step = f.step;
      entry.step_id = f.stepId;
      entry.status = f.status;
      entry.minutes = f.minutes;
      entry.updated_at = new Date().toISOString();
      await writeAllFile(entries);
      return true;
    },

    /** Newest first. */
    async list(limit = 50) {
      const n = Number.isInteger(limit) && limit > 0 ? limit : 50;
      if (db) return await db.listRoomLog(n);
      const entries = await readAllFile();
      return entries.reverse().slice(0, n);
    }
  };
}
