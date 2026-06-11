import { neon } from '@neondatabase/serverless';

export const DB_ENABLED = !!process.env.DATABASE_URL;

let _sql = null;

function getSql() {
  if (!_sql) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}

export async function initDb() {
  await getSql()`
    CREATE TABLE IF NOT EXISTS user_games (
      id          TEXT        PRIMARY KEY,
      name        TEXT        NOT NULL,
      config      JSONB       NOT NULL,
      created_at  TIMESTAMPTZ DEFAULT now(),
      updated_at  TIMESTAMPTZ DEFAULT now()
    )
  `;
  await getSql()`
    CREATE TABLE IF NOT EXISTS ai_usage (
      day    TEXT    PRIMARY KEY,
      count  INTEGER NOT NULL DEFAULT 0
    )
  `;
  await getSql()`
    CREATE TABLE IF NOT EXISTS room_snapshots (
      code        TEXT        PRIMARY KEY,
      game_id     TEXT        NOT NULL,
      snapshot    JSONB       NOT NULL,
      updated_at  TIMESTAMPTZ DEFAULT now()
    )
  `;
}

// --- Room snapshots (survive restarts mid-game; see engine/room-snapshot.js) ---

export async function saveRoomSnapshot(code, gameId, snapshot) {
  const json = JSON.stringify(snapshot);
  await getSql()`
    INSERT INTO room_snapshots (code, game_id, snapshot, updated_at)
    VALUES (${code}, ${gameId}, ${json}::jsonb, now())
    ON CONFLICT (code) DO UPDATE SET
      game_id    = EXCLUDED.game_id,
      snapshot   = EXCLUDED.snapshot,
      updated_at = now()
  `;
}

export async function getRoomSnapshot(code) {
  const rows = await getSql()`SELECT snapshot FROM room_snapshots WHERE code = ${code}`;
  return rows[0] ? rows[0].snapshot : null;
}

export async function deleteRoomSnapshot(code) {
  await getSql()`DELETE FROM room_snapshots WHERE code = ${code}`;
}

export async function sweepRoomSnapshots(maxAgeHours) {
  await getSql()`
    DELETE FROM room_snapshots
    WHERE updated_at < now() - make_interval(hours => ${maxAgeHours})
  `;
}

// --- AI budget day counter (cost guard; see services/ai-budget.js) ---

export async function getAiUsage(day) {
  const rows = await getSql()`SELECT count FROM ai_usage WHERE day = ${day}`;
  return rows[0] ? rows[0].count : 0;
}

export async function saveAiUsage(day, count) {
  await getSql()`
    INSERT INTO ai_usage (day, count) VALUES (${day}, ${count})
    ON CONFLICT (day) DO UPDATE SET count = EXCLUDED.count
  `;
}

export async function getUserGame(id) {
  const rows = await getSql()`SELECT id, config FROM user_games WHERE id = ${id}`;
  return rows[0] || null;
}

export async function listUserGames() {
  return await getSql()`SELECT id, name, config FROM user_games ORDER BY created_at`;
}

export async function saveUserGame(id, config) {
  const json = JSON.stringify(config);
  await getSql()`
    INSERT INTO user_games (id, name, config, updated_at)
    VALUES (${id}, ${config.name}, ${json}::jsonb, now())
    ON CONFLICT (id) DO UPDATE SET
      name       = EXCLUDED.name,
      config     = EXCLUDED.config,
      updated_at = now()
  `;
}

export async function deleteUserGame(id) {
  const rows = await getSql()`DELETE FROM user_games WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}

export async function userGameExists(id) {
  const rows = await getSql()`SELECT 1 FROM user_games WHERE id = ${id} LIMIT 1`;
  return rows.length > 0;
}
