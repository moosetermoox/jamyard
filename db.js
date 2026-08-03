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
  await getSql()`
    CREATE TABLE IF NOT EXISTS user_recipes (
      id          TEXT        PRIMARY KEY,
      recipe      JSONB       NOT NULL,
      created_at  TIMESTAMPTZ DEFAULT now(),
      updated_at  TIMESTAMPTZ DEFAULT now()
    )
  `;
  await getSql()`
    CREATE TABLE IF NOT EXISTS activity_runs (
      id           SERIAL      PRIMARY KEY,
      game_id      TEXT        NOT NULL,
      player_count INTEGER     NOT NULL DEFAULT 0,
      started_at   TIMESTAMPTZ DEFAULT now()
    )
  `;
  await getSql()`
    CREATE TABLE IF NOT EXISTS featured_overrides (
      game_id     TEXT        PRIMARY KEY,
      featured    BOOLEAN     NOT NULL,
      updated_at  TIMESTAMPTZ DEFAULT now()
    )
  `;
  await getSql()`
    CREATE TABLE IF NOT EXISTS feedback (
      id          SERIAL      PRIMARY KEY,
      created_at  TIMESTAMPTZ DEFAULT now(),
      page        TEXT        NOT NULL DEFAULT '',
      category    TEXT        NOT NULL,
      message     TEXT        NOT NULL,
      status      TEXT        NOT NULL DEFAULT 'new'
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

// --- User recipes ("Save as Recipe" must survive Render redeploys — the
// --- filesystem resets on every deploy, so recipes/user/ alone is lossy) ---

export async function listUserRecipes() {
  const rows = await getSql()`SELECT id, recipe FROM user_recipes ORDER BY created_at`;
  return rows;
}

export async function saveUserRecipe(id, recipe) {
  const json = JSON.stringify(recipe);
  await getSql()`
    INSERT INTO user_recipes (id, recipe, updated_at)
    VALUES (${id}, ${json}::jsonb, now())
    ON CONFLICT (id) DO UPDATE SET
      recipe     = EXCLUDED.recipe,
      updated_at = now()
  `;
}

// Migration helper: never clobbers a DB copy that already exists.
export async function insertUserRecipeIfAbsent(id, recipe) {
  const json = JSON.stringify(recipe);
  const rows = await getSql()`
    INSERT INTO user_recipes (id, recipe)
    VALUES (${id}, ${json}::jsonb)
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `;
  return rows.length > 0;
}

export async function deleteUserRecipe(id) {
  const rows = await getSql()`DELETE FROM user_recipes WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}

// --- Activity runs (the library-first success metric: activities RUN, not
// --- built). Privacy-clean by design: a game id, a headcount, a timestamp —
// --- no names, no content, no room codes. ---

export async function recordActivityRun(gameId, playerCount) {
  await getSql()`
    INSERT INTO activity_runs (game_id, player_count)
    VALUES (${gameId}, ${playerCount || 0})
  `;
}

export async function activityRunSummary() {
  const totals = await getSql()`
    SELECT game_id, COUNT(*)::int AS runs, MAX(started_at) AS last_run
    FROM activity_runs GROUP BY game_id ORDER BY runs DESC
  `;
  const week = await getSql()`
    SELECT COUNT(*)::int AS runs FROM activity_runs
    WHERE started_at > now() - interval '7 days'
  `;
  return { totals, lastSevenDays: week[0] ? week[0].runs : 0 };
}

// --- Featured overrides (owner curation of BUILT-IN activities must survive
// --- redeploys — the ★ toggle used to write config.json on Render's
// --- ephemeral disk and silently revert on every push. Repo flags stay the
// --- defaults; a row here wins.) ---

export async function getFeaturedOverrides() {
  const rows = await getSql()`SELECT game_id, featured FROM featured_overrides`;
  const map = {};
  for (const r of rows) map[r.game_id] = !!r.featured;
  return map;
}

export async function setFeaturedOverride(gameId, featured) {
  await getSql()`
    INSERT INTO featured_overrides (game_id, featured, updated_at)
    VALUES (${gameId}, ${!!featured}, now())
    ON CONFLICT (game_id) DO UPDATE SET
      featured   = EXCLUDED.featured,
      updated_at = now()
  `;
}

export async function clearFeaturedOverride(gameId) {
  const rows = await getSql()`
    DELETE FROM featured_overrides WHERE game_id = ${gameId} RETURNING game_id
  `;
  return rows.length > 0;
}

// --- Site feedback (anonymous by design — no name/email columns on purpose;
// --- see engine/feedback-validate.js) ---

export async function addFeedback({ page, category, message }) {
  const rows = await getSql()`
    INSERT INTO feedback (page, category, message)
    VALUES (${page || ''}, ${category}, ${message})
    RETURNING id
  `;
  return rows[0].id;
}

export async function listFeedback() {
  return await getSql()`
    SELECT id, created_at, page, category, message, status
    FROM feedback ORDER BY created_at DESC
  `;
}

export async function setFeedbackStatus(id, status) {
  const rows = await getSql()`
    UPDATE feedback SET status = ${status} WHERE id = ${id} RETURNING id
  `;
  return rows.length > 0;
}
