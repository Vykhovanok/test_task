import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_METADATA_KEY = 'rate-limit-policy';

export type RateLimitPolicy = {
  key: 'auth' | 'uploads' | 'search' | 'children' | 'events' | 'publicLinks';
};

export const RateLimit = (policy: RateLimitPolicy) =>
  SetMetadata(RATE_LIMIT_METADATA_KEY, policy);
