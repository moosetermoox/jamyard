/**
 * The editor's light review asks the AI once per version of the activity,
 * after the teacher pauses (2026-10-04, owner: fewer AI calls, no quality
 * cost). Autosave fires on every blur; before, each one sent a review.
 * The scheduling code is lifted out of editor.js and run with a fake clock
 * and a fake network.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../../screens/designer/editor.js', import.meta.url), 'utf8');
const start = src.indexOf('var LIGHT_REVIEW_PAUSE_MS');
const end = src.indexOf('async function runDeepReview()');
const block = src.slice(start, end);

function sandbox() {
  const timers = [];
  const sent = [];
  const applied = [];
  const ctx = {
    gameConfig: { name: 'A', phases: { lobby: { type: 'lobby' } } },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].fn = null; },
    fetch: async (url, opts) => { sent.push(JSON.parse(opts.body)); return { ok: true, json: async () => ({ ai: { issues: [] } }) }; },
    applyReviewResults: (r) => applied.push(r),
    console, JSON
  };
  vm.createContext(ctx);
  vm.runInContext(block, ctx);
  // Fire every pending timer (the teacher paused)
  ctx.pause = async () => { const due = timers.splice(0); for (const t of due) if (t.fn) await t.fn(); };
  return { ctx, sent, applied, timers };
}

describe('the light review', () => {
  it('waits for a pause, then reviews once however many saves came first', async () => {
    const { ctx, sent, timers } = sandbox();
    ctx.runLightReview(); ctx.runLightReview(); ctx.runLightReview();
    expect(sent.length).toBe(0);
    expect(timers.filter(t => t.fn).length).toBe(1);
    expect(timers.find(t => t.fn).ms).toBe(6000);
    await ctx.pause();
    expect(sent.length).toBe(1);
    expect(sent[0].depth).toBe('light');
  });

  it('a save that changed nothing sends nothing; a real change is reviewed', async () => {
    const { ctx, sent, applied } = sandbox();
    ctx.runLightReview(); await ctx.pause();
    ctx.runLightReview(); await ctx.pause();
    expect(sent.length).toBe(1);
    ctx.gameConfig.name = 'B';
    ctx.runLightReview(); await ctx.pause();
    expect(sent.length).toBe(2);
    expect(sent[1].config.name).toBe('B');
    expect(applied.length).toBe(2);
  });

  it('a failed review is tried again at the next pause', async () => {
    const { ctx, sent } = sandbox();
    let fail = true;
    ctx.fetch = async (url, opts) => { sent.push(JSON.parse(opts.body)); return fail ? { ok: false } : { ok: true, json: async () => ({ ai: {} }) }; };
    ctx.runLightReview(); await ctx.pause();
    fail = false;
    ctx.runLightReview(); await ctx.pause();
    expect(sent.length).toBe(2);
  });

  it('a deep review counts as the light review of that version', () => {
    const at = src.indexOf('async function runDeepReview()');
    expect(src.slice(at, at + 1400)).toContain('lastLightReviewed = JSON.stringify(gameConfig);');
  });
});
