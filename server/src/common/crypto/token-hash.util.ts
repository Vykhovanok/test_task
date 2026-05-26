import { createHash, randomBytes, timingSafeEqual } from 'crypto';

export function generateOpaqueToken(): string {
  return randomBytes(24).toString('hex');
}

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function tokensMatch(providedToken: string, storedHash: string): boolean {
  const providedHash = hashOpaqueToken(providedToken);
  const left = Buffer.from(providedHash, 'hex');
  const right = Buffer.from(storedHash, 'hex');

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}
