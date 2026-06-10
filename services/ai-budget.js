// AI budget — cost guards on every real AI call.
//
// Why: there was no app-level limit on AI endpoints; a stuck client, a
// hammered editor button, or anyone who finds the live URL could burn real
// API money. (The Anthropic Console spend limit was the only backstop.)
//
// Two independent guards, enforced at AIService's single _callClaude choke
// point so every real Anthropic call passes through:
//   - per-minute sliding-window throttle (AI_CALLS_PER_MINUTE, default 20)
//   - daily call cap (AI_DAILY_CAP, default 500; survives restarts via
//     the Neon `ai_usage` table when DATABASE_URL is set)
// Set either to 0 to disable it. Mock mode never reaches the guard.
//
// Failure is loud but friendly: AiBudgetError carries statusCode 429 and
// a teacher-readable message. Editor endpoints surface it as HTTP 429;
// in-game AI phases surface it through the existing phase-error pause
// (teacher sees the message and can Retry after the window clears).

export const DEFAULT_CALLS_PER_MINUTE = 20;
export const DEFAULT_DAILY_CAP = 500;

export class AiBudgetError extends Error {
  constructor(message, retryAfterSeconds = null) {
    super(message);
    this.name = 'AiBudgetError';
    this.code = 'AI_BUDGET_EXCEEDED';
    this.statusCode = 429;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

// Local calendar day — the cap is a "per school day" notion, not UTC.
function dayKey(t) {
  const d = new Date(t);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * @param {Object} [opts]
 * @param {number} [opts.perMinute]  Max calls per sliding 60s window (0 = off)
 * @param {number} [opts.dailyCap]   Max calls per local calendar day (0 = off)
 * @param {() => number} [opts.now]  Clock (injected in tests)
 * @param {{load: (day: string) => Promise<number>, save: (day: string, count: number) => Promise<void>}|null} [opts.store]
 *   Optional persistence for the day counter (Neon-backed in production).
 *   Store failures are logged and ignored — a db hiccup must never block AI.
 */
export function createAiBudget(opts = {}) {
  const perMinute = opts.perMinute !== undefined ? opts.perMinute : envInt('AI_CALLS_PER_MINUTE', DEFAULT_CALLS_PER_MINUTE);
  const dailyCap = opts.dailyCap !== undefined ? opts.dailyCap : envInt('AI_DAILY_CAP', DEFAULT_DAILY_CAP);
  const now = opts.now || Date.now;
  const store = opts.store || null;

  let windowStamps = []; // timestamps of calls in the last 60s
  let day = null;        // current dayKey
  let dayCount = 0;
  let dayLoaded = false; // store consulted for the current day?

  async function ensureDay(t) {
    const key = dayKey(t);
    if (key !== day) {
      day = key;
      dayCount = 0;
      dayLoaded = false;
    }
    if (!dayLoaded) {
      dayLoaded = true; // one attempt per day — a down db shouldn't retry per call
      if (store) {
        try {
          dayCount = (await store.load(day)) || 0;
        } catch (e) {
          console.warn(`[ai-budget] store load failed (continuing without): ${e.message}`);
        }
      }
    }
  }

  return {
    /**
     * Gate + record one AI call. Throws AiBudgetError when over a limit;
     * otherwise counts the call and returns.
     */
    async take() {
      const t = now();
      await ensureDay(t);

      if (perMinute > 0) {
        windowStamps = windowStamps.filter((s) => t - s < 60000);
        if (windowStamps.length >= perMinute) {
          const retryAfter = Math.ceil((windowStamps[0] + 60000 - t) / 1000);
          throw new AiBudgetError(
            `AI requests are coming too fast (limit ${perMinute}/minute — AI_CALLS_PER_MINUTE). ` +
            `Try again in about ${retryAfter}s.`,
            retryAfter
          );
        }
      }

      if (dailyCap > 0 && dayCount >= dailyCap) {
        throw new AiBudgetError(
          `The AI has reached today's usage cap (${dailyCap} calls — AI_DAILY_CAP). ` +
          `Raise the cap or try again tomorrow.`
        );
      }

      windowStamps.push(t);
      dayCount++;
      if (store) {
        try {
          await store.save(day, dayCount);
        } catch (e) {
          console.warn(`[ai-budget] store save failed (continuing): ${e.message}`);
        }
      }
    },

    /**
     * Like snapshot() but loads the persisted day count first (without
     * recording a call) — so a status endpoint is truthful right after a
     * restart, before any AI call has happened.
     */
    async peek() {
      await ensureDay(now());
      return this.snapshot();
    },

    /** Current usage, for logs/status displays. */
    snapshot() {
      const t = now();
      return {
        day,
        dayCount,
        dailyCap,
        windowCount: windowStamps.filter((s) => t - s < 60000).length,
        perMinute
      };
    }
  };
}
