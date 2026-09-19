/**
 * Terms page (2026-09-19). A principal who asks a teacher "where are the
 * terms?" stops the pilot cold, so /terms exists, is reachable from the
 * home footer, the privacy page, and the guide, and carries the nine
 * promises California Education Code § 49073.1 asks a vendor to make, in
 * plain language. This guards that the page and its links stay, and that
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

describe('the terms page', () => {
  it('exists, is plain language, and links the privacy page and the guide', async () => {
    const html = await read('screens/terms/index.html');
    expect(html).toContain('<h1>Terms of Service</h1>');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/guide"');
    expect(html).toContain('Students never agree to anything');
    expect(html).toContain('mccady at gmail dot com');
  });

  it('makes all nine § 49073.1 promises', async () => {
    const html = await read('screens/terms/index.html');
    for (const phrase of NINE_PROMISES) expect(html, phrase).toContain(phrase);
    expect(html).toContain('49073.1');
    expect(html).toContain('FERPA');
  });

  it('is served, reserved from vanity slugs, and a tracked teacher path', async () => {
    const server = await read('server.js');
    expect(server).toContain("app.use('/terms', express.static(join(__dirname, 'screens/terms')));");
    expect(server).toMatch(/VANITY_RESERVED = new Set\(\[[\s\S]*?'terms'[\s\S]*?\]\)/);
    expect(TRACKED_PATHS).toContain('/terms');
  });

  it('is linked from the home footer, the privacy page, and the guide', async () => {
    for (const page of ['screens/home/index.html', 'screens/privacy/index.html', 'screens/guide/index.html']) {
      expect(await read(page), page).toContain('href="/terms"');
    }
  });
});
