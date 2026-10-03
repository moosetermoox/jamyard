/**
 * Every place student text enters the room passes the roster (cause 4 of
 * docs/ARCHITECTURE-REVIEW-2026-10.md: the CLAUDE.md rule from review
 * twenty, "a classmate's name next to an insult is a rule, not a
 * judgment", as a sweep). `filterAboutClassmate` needs the room's names;
 * `checkSubmission({rosterNames})` runs it per part. The AI check cannot
 * do this (the scrub turns the name into "someone"), so a text path that
 * forgets the roster lets "Maya is a loser" through.
 *
 * The text-bearing socket events are read off EVENT_SCHEMAS (a field named
 * text, response, or draft), and each handler block in server.js must pass
 * the roster; so must closeMerge, which reads the drafts at the close.
 * A new text field name goes in TEXT_FIELDS; a text event the rule should
 * not apply to goes in EXEMPT with the reason.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVENT_SCHEMAS } from '../../engine/event-schemas.js';
import { EVENTS } from '../../engine/events.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const server = readFileSync(join(root, 'server.js'), 'utf8');

const TEXT_FIELDS = new Set(['text', 'response', 'draft']);
/** event → why student text there needs no roster check */
const EXEMPT = {};
const ROSTER = /rosterNames|filterAboutClassmate\(/;

const constantFor = (event) => Object.keys(EVENTS).find(k => EVENTS[k] === event);

function handlerBlock(event) {
  const key = constantFor(event);
  const start = server.indexOf(`socket.on(EVENTS.${key},`);
  if (start < 0) return null;
  const next = server.indexOf('\n  socket.on(', start + 1);
  return server.slice(start, next > 0 ? next : undefined);
}

function functionBody(name) {
  const start = server.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
  expect(start, name).toBeGreaterThan(0);
  const next = server.slice(start + 1).search(/^(?:async )?function \w+\(/m);
  return server.slice(start, next > 0 ? start + 1 + next : undefined);
}

describe('student text goes past the roster', () => {
  const textEvents = Object.entries(EVENT_SCHEMAS)
    .filter(([, fields]) => Object.keys(fields).some(f => TEXT_FIELDS.has(f)))
    .map(([event]) => event);

  it('finds the text-bearing events', () => {
    expect(textEvents.sort()).toEqual(['merge-draft', 'relay-submit', 'submit-response']);
  });

  it('every text event\'s handler passes the roster', () => {
    const missing = [];
    for (const event of textEvents) {
      if (EXEMPT[event]) continue;
      const block = handlerBlock(event);
      if (!block) { missing.push(`${event}: no socket.on handler found`); continue; }
      if (!ROSTER.test(block)) missing.push(`${event}: its handler never passes the roster (rosterNames or filterAboutClassmate)`);
    }
    expect(missing).toEqual([]);
  });

  it('the merge close reads the drafts with the roster too', () => {
    expect(functionBody('closeMerge')).toMatch(/checkSubmission\([\s\S]{0,200}rosterNames/);
  });

  it('keeps EXEMPT honest', () => {
    for (const event of Object.keys(EXEMPT)) expect(textEvents.includes(event), `${event} is not a text event; drop it from EXEMPT`).toBe(true);
  });
});
