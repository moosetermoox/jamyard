/**
 * The browser side of the storyboard stream (2026-09-20): a POST fetch
 * read as server-sent events. The parser must survive chunks that split
 * a record anywhere, CRLF line ends, comments, and multi-line data.
 */

import { describe, it, expect } from 'vitest';
import '../../screens/shared/sse-reader.js';

const R = globalThis.SseReader;

describe('SseReader.parse', () => {
  it('returns whole records and keeps the unfinished tail', () => {
    const out = R.parse('event: step\ndata: {"index":0}\n\nevent: step\ndata: {"ind');
    expect(out.events).toEqual([{ event: 'step', data: '{"index":0}' }]);
    expect(out.rest).toBe('event: step\ndata: {"ind');
  });

  it('defaults the event name to message and joins multi-line data', () => {
    const out = R.parse('data: one\ndata: two\n\n');
    expect(out.events).toEqual([{ event: 'message', data: 'one\ntwo' }]);
  });

  it('ignores comment lines and reads CRLF', () => {
    const out = R.parse(': keepalive\r\n\r\nevent: done\r\ndata: {"ok":true}\r\n\r\n');
    expect(out.events).toEqual([{ event: 'done', data: '{"ok":true}' }]);
    expect(out.rest).toBe('');
  });

  it('is pure and handles an empty buffer', () => {
    expect(R.parse('')).toEqual({ events: [], rest: '' });
    expect(R.parse(undefined)).toEqual({ events: [], rest: '' });
  });
});

describe('SseReader.read', () => {
  function streamOf(chunks) {
    const enc = new TextEncoder();
    return new Response(new ReadableStream({
      start(controller) {
        chunks.forEach(c => controller.enqueue(enc.encode(c)));
        controller.close();
      }
    }));
  }

  it('reassembles records split across chunks and JSON-parses data', async () => {
    const got = [];
    const resp = streamOf(['event: thinking\ndata: "plan', 'ning"\n\nevent: st', 'ep\ndata: {"index":0,"step":{"brick":"announce"}}\n\n', 'event: done\ndata: {"storyboard":{"steps":[]}}\n\n']);
    await R.read(resp, (event, data) => got.push([event, data]));
    expect(got).toEqual([
      ['thinking', 'planning'],
      ['step', { index: 0, step: { brick: 'announce' } }],
      ['done', { storyboard: { steps: [] } }]
    ]);
  });

  it('delivers a final record that lacks the trailing blank line', async () => {
    const got = [];
    await R.read(streamOf(['event: done\ndata: {"ok":1}']), (event, data) => got.push([event, data]));
    expect(got).toEqual([['done', { ok: 1 }]]);
  });

  it('rejects when the response has no readable body', async () => {
    await expect(R.read({}, () => {})).rejects.toThrow(/streamed/);
  });
});

// The Create page is the one consumer: it must load the reader before
// its own script, ask the streamed route, and the plain route must stay
// (the concierge and any old tab still post there).
describe('the Create page wiring', () => {
  it('loads sse-reader.js before designer.js and posts to the stream route', async () => {
    const { readFile } = await import('node:fs/promises');
    const root = new URL('../..', import.meta.url);
    const html = await readFile(new URL('screens/designer/index.html', root), 'utf8');
    const reader = html.indexOf('/shared/sse-reader.js');
    const page = html.indexOf('designer.js"');
    expect(reader).toBeGreaterThan(-1);
    expect(reader).toBeLessThan(page);
    const js = await readFile(new URL('screens/designer/designer.js', root), 'utf8');
    expect(js).toContain("fetch('/api/games/storyboard/stream'");
    const server = await readFile(new URL('server.js', root), 'utf8');
    expect(server).toContain("app.post('/api/games/storyboard',");
    expect(server).toContain("app.post('/api/games/storyboard/stream',");
  });
});
