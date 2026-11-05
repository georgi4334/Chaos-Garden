import { generateAdminToken, hashAdminToken, verifyAdminToken } from './admin-token.js';

describe('admin token', () => {
  it('generates unique url-safe tokens', () => {
    const a = generateAdminToken();
    const b = generateAdminToken();
    expect(a).not.toEqual(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('stores only a hash, never the token', () => {
    const token = generateAdminToken();
    const hash = hashAdminToken(token);
    expect(hash).not.toContain(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('verifies the right token and rejects others', () => {
    const token = generateAdminToken();
    const hash = hashAdminToken(token);
    expect(verifyAdminToken(token, hash)).toBe(true);
    expect(verifyAdminToken(generateAdminToken(), hash)).toBe(false);
    expect(verifyAdminToken('', hash)).toBe(false);
  });
});
