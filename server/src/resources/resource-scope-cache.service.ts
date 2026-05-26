import { Injectable } from '@nestjs/common';
import { RedisService } from '../common/redis/redis.service';

const SCOPE_CACHE_PREFIX = 'resources:scope:';
const SCOPE_CACHE_TTL_SECONDS = 30;

@Injectable()
export class ResourceScopeCacheService {
  constructor(private readonly redisService: RedisService) {}

  async get(userId: string): Promise<string[] | null> {
    try {
      await this.redisService.ensureConnected();
      const cached = await this.redisService.client.get(
        `${SCOPE_CACHE_PREFIX}${userId}`,
      );

      if (!cached) {
        return null;
      }

      const parsed = JSON.parse(cached) as string[];
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  async set(userId: string, resourceIds: string[]): Promise<void> {
    try {
      await this.redisService.ensureConnected();
      await this.redisService.client.setex(
        `${SCOPE_CACHE_PREFIX}${userId}`,
        SCOPE_CACHE_TTL_SECONDS,
        JSON.stringify(resourceIds),
      );
    } catch {
      return;
    }
  }

  async invalidate(userId: string): Promise<void> {
    try {
      await this.redisService.ensureConnected();
      await this.redisService.client.del(`${SCOPE_CACHE_PREFIX}${userId}`);
    } catch {
      return;
    }
  }

  async invalidateMany(userIds: Iterable<string>): Promise<void> {
    const uniqueUserIds = [...new Set(userIds)];

    if (uniqueUserIds.length === 0) {
      return;
    }

    try {
      await this.redisService.ensureConnected();
      const pipeline = this.redisService.client.pipeline();

      for (const userId of uniqueUserIds) {
        pipeline.del(`${SCOPE_CACHE_PREFIX}${userId}`);
      }

      await pipeline.exec();
    } catch {
      return;
    }
  }
}
