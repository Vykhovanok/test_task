import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

const SESSION_CACHE_PREFIX = 'auth:session:active:';
const SESSION_CACHE_TTL_SECONDS = 60;

@Injectable()
export class SessionCacheService {
  constructor(private readonly redisService: RedisService) {}

  async markActive(sessionId: string): Promise<void> {
    await this.redisService.ensureConnected();
    await this.redisService.client.setex(
      `${SESSION_CACHE_PREFIX}${sessionId}`,
      SESSION_CACHE_TTL_SECONDS,
      '1',
    );
  }

  async isActive(sessionId: string): Promise<boolean | null> {
    try {
      await this.redisService.ensureConnected();
      const value = await this.redisService.client.get(
        `${SESSION_CACHE_PREFIX}${sessionId}`,
      );

      if (value === '1') {
        return true;
      }

      if (value === null) {
        return null;
      }

      return false;
    } catch {
      return null;
    }
  }

  async revoke(sessionId: string): Promise<void> {
    try {
      await this.redisService.ensureConnected();
      await this.redisService.client.del(`${SESSION_CACHE_PREFIX}${sessionId}`);
    } catch {
      return;
    }
  }
}
