/**
 * The projector's copy of a prompt has no recipient, so a per-student token
 * reads as a host-friendly note there (server.js resolveTemplate). The pair
 * tokens joined mine/assigned on 2026-09-20 after a browser proof showed the
 * projector printing "{{pair-write.side}}" and "{{pair-write.partner}}" raw.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('projector notes for per-student tokens', () => {
  const server = readFileSync(new URL('../../server.js', import.meta.url), 'utf8');
  const fn = server.slice(server.indexOf('function resolveTemplate(template, engine)'));
  const body = fn.slice(0, fn.indexOf('\n}\n'));

  it('every per-student suffix has a note, none reaches the projector raw', () => {
    for (const suffix of ['mine', 'assigned', 'partner', 'partnerSide', 'side']) {
      expect(body, suffix).toMatch(new RegExp('\\\\.' + suffix + '\\$/'));
    }
  });

  it('checks partnerSide before side, so the longer suffix wins', () => {
    expect(body.indexOf('partnerSide$')).toBeLessThan(body.indexOf('.side$'));
  });
});
