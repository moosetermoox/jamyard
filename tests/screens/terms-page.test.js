/**
 * Terms (2026-09-19). A principal who asks a teacher "where are the terms?"
 * stops the pilot cold, so the terms exist: the second half of the privacy
 * page (owner: one page), reached from the home footer and the guide, with
 * /terms kept as a real address that lands on that half. They carry the
 * nine promises California Education Code § 49073.1 asks a vendor to make,
 * in plain language. This guards that the half and its links stay, and that
 * none of the nine quietly disappears in a rewrite.
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'fs/promises';
import { TRACKED_PATHS } from '../../services/analytics.js';

const ROOT = new URL('../..', import.meta.url);
const read = (p) => readFile(new URL(p, ROOT), 'utf8');

// One phrase per § 49073.1(b) provision, in the order the statute lists them.
const NINE_PROMISES = [
  'remains the property of the student and their school',   // (1) records stay the LEA's
  'print or save the activity report',                       // (2) pupils keep their own content
  'exactly one thing: running the activity',                 // (3) no other use
  'review or correct information',                           // (4) parent review and correction
  'Connections are encrypted (TLS)',                         // (5) security measures + responsible person
  'within 72 hours of confirming it',                        // (6) breach notification
  'no student data to return or destroy',                    // (7) not retained after the contract
  'school official with a legitimate educational interest',  // (8) FERPA compliance, jointly
  'never used to target advertising'                         // (9) no targeted advertising
];

describe('the terms, on the privacy page', () => {
  it('are the second half of one page, plain language, students never agree', async () => {
    const html = await read('screens/privacy/index.html');
    expect(html).toContain('<title>Privacy and terms - Jamyard</title>');
    expect(html).toContain('<h1 id="privacy">Privacy and terms</h1>');
    expect(html).toContain('id="terms"');
    expect(html).toContain('<h1>Terms</h1>');
    expect(html).toContain('Students never agree to anything');
    expect(html).toContain('mccady at gmail dot com');
    // One page: nothing points at a separate terms page any more
    expect(html).not.toContain('href="/terms"');
  });

  it('make all nine § 49073.1 promises', async () => {
    const html = await read('screens/privacy/index.html');
    for (const phrase of NINE_PROMISES) expect(html, phrase).toContain(phrase);
    expect(html).toContain('49073.1');
    expect(html).toContain('FERPA');
  });

  it('never ask a teacher to agree to anything (owner, 2026-09-19: friction and uncertainty)', async () => {
    // No consent line under a Host button, no checkbox, no dialog: the page
    // is a page. Guarded on the surfaces that carry Host buttons.
    for (const page of ['screens/make/index.html', 'screens/home/index.html', 'screens/host/index.html', 'screens/prototype/index.html']) {
      const html = await read(page);
      expect(html.toLowerCase(), page).not.toMatch(/agree to (the|these|our) terms/);
    }
  });

  it('/terms is a real address that lands on the terms half, reserved from vanity slugs, not a tracked page of its own', async () => {
    const server = await read('server.js');
    expect(server).toContain("app.get('/terms', (req, res) => res.redirect('/privacy#terms'));");
    expect(server).not.toContain("express.static(join(__dirname, 'screens/terms'))");
    expect(server).toMatch(/VANITY_RESERVED = new Set\(\[[\s\S]*?'terms'[\s\S]*?\]\)/);
    expect(TRACKED_PATHS).toContain('/privacy');
    expect(TRACKED_PATHS).not.toContain('/terms');
  });

  it('are linked from the home footer and the guide as one page', async () => {
    const home = await read('screens/home/index.html');
    expect(home).toContain('privacy &amp; terms');
    expect(home).not.toContain('href="/terms"');
    const guide = await read('screens/guide/index.html');
    expect(guide).toContain('privacy and terms page');
    expect(guide).not.toContain('href="/terms"');
  });
});
