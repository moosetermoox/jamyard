import { describe, it, expect } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { createFeedbackStore } from '../../services/feedback-store.js';

describe('createFeedbackStore — file mode (local dev)', () => {
  async function tempStore() {
    const dir = await mkdtemp(join(tmpdir(), 'lanyard-feedback-'));
    const store = createFeedbackStore({ filePath: join(dir, 'feedback.ndjson') });
    return { store, cleanup: () => rm(dir, { recursive: true, force: true }) };
  }

  it('add + list round-trips, newest first', async () => {
    const { store, cleanup } = await tempStore();
    try {
      await store.add({ page: '/designer', category: 'idea', message: 'first' });
      await store.add({ page: '/', category: 'praise', message: 'second' });
      const entries = await store.list();
      expect(entries.map(e => e.message)).toEqual(['second', 'first']);
      expect(entries[0].status).toBe('new');
      expect(entries[0].category).toBe('praise');
    } finally {
      await cleanup();
    }
  });

  it('list on a missing file returns empty, not an error', async () => {
    const { store, cleanup } = await tempStore();
    try {
      expect(await store.list()).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  it('setStatus flips an entry and returns false for unknown ids', async () => {
    const { store, cleanup } = await tempStore();
    try {
      const id = await store.add({ page: '', category: 'problem', message: 'broken thing' });
      expect(await store.setStatus(id, 'done')).toBe(true);
      expect((await store.list())[0].status).toBe('done');
      expect(await store.setStatus('nope', 'done')).toBe(false);
    } finally {
      await cleanup();
    }
  });

  it('rejects invalid statuses', async () => {
    const { store, cleanup } = await tempStore();
    try {
      await expect(store.setStatus('x', 'archived-forever')).rejects.toThrow(/Invalid feedback status/);
    } finally {
      await cleanup();
    }
  });
});

describe('createFeedbackStore — db mode', () => {
  it('delegates to the injected db functions', async () => {
    const calls = [];
    const store = createFeedbackStore({
      db: {
        addFeedback: async entry => { calls.push(['add', entry]); return 7; },
        listFeedback: async () => { calls.push(['list']); return [{ id: 7 }]; },
        setFeedbackStatus: async (id, status) => { calls.push(['status', id, status]); return true; }
      }
    });
    expect(await store.add({ page: '/', category: 'other', message: 'hi' })).toBe(7);
    expect(await store.list()).toEqual([{ id: 7 }]);
    expect(await store.setStatus(7, 'done')).toBe(true);
    expect(calls.length).toBe(3);
  });
});
