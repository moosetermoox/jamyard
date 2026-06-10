/**
 * Teacher-console access check (engine/teacher-auth.js).
 */

import { describe, it, expect } from 'vitest';
import { checkTeacherAccess, generateTeacherPin } from '../../engine/teacher-auth.js';

function basicHeader(password) {
  return 'Basic ' + Buffer.from('teacher:' + password).toString('base64');
}

describe('checkTeacherAccess', () => {
  const expected = { teacherPin: '4271', sitePassword: 'sekrit' };

  it('accepts the correct PIN', () => {
    expect(checkTeacherAccess({ pin: '4271' }, expected)).toBe(true);
    expect(checkTeacherAccess({ pin: ' 4271 ' }, expected)).toBe(true); // trimmed
  });

  it('rejects a wrong or missing PIN', () => {
    expect(checkTeacherAccess({ pin: '0000' }, expected)).toBe(false);
    expect(checkTeacherAccess({ pin: '' }, expected)).toBe(false);
    expect(checkTeacherAccess({}, expected)).toBe(false);
  });

  it('accepts a valid basic-auth header when a site password is set', () => {
    expect(checkTeacherAccess({ authHeader: basicHeader('sekrit') }, expected)).toBe(true);
  });

  it('rejects a wrong-password header', () => {
    expect(checkTeacherAccess({ authHeader: basicHeader('nope') }, expected)).toBe(false);
  });

  it('ignores auth headers entirely when no site password is configured', () => {
    // Without SITE_PASSWORD there is nothing to compare against — a crafted
    // header must never grant access.
    expect(checkTeacherAccess(
      { authHeader: basicHeader('anything') },
      { teacherPin: '4271', sitePassword: undefined }
    )).toBe(false);
  });

  it('rejects malformed headers without throwing', () => {
    expect(checkTeacherAccess({ authHeader: 'Basic %%%not-base64%%%' }, expected)).toBe(false);
    expect(checkTeacherAccess({ authHeader: 'Bearer abc' }, expected)).toBe(false);
  });

  it('an empty PIN never matches an empty room PIN', () => {
    expect(checkTeacherAccess({ pin: '' }, { teacherPin: '', sitePassword: undefined })).toBe(false);
  });
});

describe('generateTeacherPin', () => {
  it('always produces a 4-digit string', () => {
    for (let i = 0; i < 200; i++) {
      const pin = generateTeacherPin();
      expect(pin).toMatch(/^\d{4}$/);
      expect(Number(pin)).toBeGreaterThanOrEqual(1000);
    }
  });
});
