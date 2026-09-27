/**
 * Where a saved activity's owner-key hash lives (2026-09-27). With the
 * database on it is the `owner_key` column of user_games; without it (local
 * dev, no DATABASE_URL) a small JSON map in data/owner-keys.json beside the
 * other filesystem logs. engine/owner-key.js decides; this only stores.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  DB_ENABLED, getUserGameOwnerKey, setUserGameOwnerKey, claimUserGames
} from '../db.js';

export function createOwnerKeyStore({ dataDir } = {}) {
  const file = join(dataDir || 'data', 'owner-keys.json');

  async function readMap() {
    try { return JSON.parse(await readFile(file, 'utf8')) || {}; } catch { return {}; }
  }
  async function writeMap(map) {
    await mkdir(join(file, '..'), { recursive: true });
    await writeFile(file, JSON.stringify(map, null, 2) + '\n');
  }

  return {
    /** The stored hash for a row, or null (unowned or unknown). */
    async get(id) {
      if (DB_ENABLED) return await getUserGameOwnerKey(id);
      const map = await readMap();
      return typeof map[id] === 'string' ? map[id] : null;
    },
    /** Write the hash on a row this request just saved (a save or a copy). No key = leave it unowned. */
    async stamp(id, hash) {
      if (!hash) return;
      if (DB_ENABLED) { await setUserGameOwnerKey(id, hash); return; }
      const map = await readMap();
      map[id] = hash;
      await writeMap(map);
    },
    /** Rows among `ids` with no key yet take this one (the browser that lists them as its own). */
    async claimMany(ids, hash) {
      if (!hash || !Array.isArray(ids) || ids.length === 0) return 0;
      if (DB_ENABLED) return await claimUserGames(ids, hash);
      const map = await readMap();
      let n = 0;
      for (const id of ids) {
        if (typeof map[id] === 'string') continue;
        map[id] = hash;
        n++;
      }
      if (n) await writeMap(map);
      return n;
    },
    /** A deleted row's key goes with it (the file store only; the column goes with the row). */
    async forget(id) {
      if (DB_ENABLED) return;
      const map = await readMap();
      if (!(id in map)) return;
      delete map[id];
      await writeMap(map);
    }
  };
}
