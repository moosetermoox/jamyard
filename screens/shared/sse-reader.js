/**
 * SseReader: read a server-sent-event response from a POST fetch.
 *
 * EventSource is GET-only, and the Create page posts the teacher's
 * description, so the storyboard stream (2026-09-20) is read by hand:
 * fetch, then the body reader, then this parser splitting the text into
 * {event, data} records as they arrive.
 *
 * Wire format (what the server writes, one record per event):
 *   event: step\n
 *   data: {"index":0,"step":{...}}\n
 *   \n
 *
 * SseReader.parse(buffer) is pure: it returns every whole record in the
 * buffer plus the unfinished tail to keep for the next chunk.
 * SseReader.read(response, onEvent) drives a fetch Response and calls
 * onEvent(event, data) per record with data JSON-parsed when it parses.
 */
(function () {
  'use strict';

  function parse(buffer) {
    var events = [];
    var text = String(buffer || '').replace(/\r\n/g, '\n');
    var cut;
    while ((cut = text.indexOf('\n\n')) >= 0) {
      var block = text.slice(0, cut);
      text = text.slice(cut + 2);
      var event = 'message';
      var dataLines = [];
      block.split('\n').forEach(function (line) {
        if (line.indexOf('event:') === 0) event = line.slice(6).trim();
        else if (line.indexOf('data:') === 0) dataLines.push(line.slice(5).replace(/^ /, ''));
        // comments (": keepalive") and unknown fields are ignored
      });
      if (dataLines.length || block.indexOf('event:') === 0) {
        events.push({ event: event, data: dataLines.join('\n') });
      }
    }
    return { events: events, rest: text };
  }

  function parseData(raw) {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return raw; }
  }

  function read(response, onEvent) {
    if (!response || !response.body || typeof response.body.getReader !== 'function') {
      return Promise.reject(new Error('This browser cannot read a streamed reply.'));
    }
    var reader = response.body.getReader();
    var decoder = new TextDecoder();
    var buffer = '';
    function pump() {
      return reader.read().then(function (result) {
        if (result.done) {
          var tail = parse(buffer + '\n\n');
          tail.events.forEach(function (ev) { onEvent(ev.event, parseData(ev.data)); });
          return;
        }
        buffer += decoder.decode(result.value, { stream: true });
        var parsed = parse(buffer);
        buffer = parsed.rest;
        parsed.events.forEach(function (ev) { onEvent(ev.event, parseData(ev.data)); });
        return pump();
      });
    }
    return pump();
  }

  var api = { parse: parse, read: read };
  if (typeof window !== 'undefined') window.SseReader = api;
  if (typeof globalThis !== 'undefined') globalThis.SseReader = api;
})();
