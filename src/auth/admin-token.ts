import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Random 256-bit secret, shown to the user exactly once. */
export function generateAdminToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Only this hash is stored, so a DB leak does not leak usable tokens. */
export function hashAdminToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Constant-time comparison of a presented token against a stored hash. */
export function verifyAdminToken(token: string, storedHash: string): boolean {
  const presented = Buffer.from(hashAdminToken(token), 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  return presented.length === stored.length && timingSafeEqual(presented, stored);
}
