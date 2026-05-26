import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfigService } from '../../config/app-config.service';
import { createRedisClient } from '../redis/redis-client.util';

@Injectable()
export class RedisRateLimitService implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor(private readonly appConfigService: AppConfigService) {
    this.redis = createRedisClient(this.appConfigService, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
  }

  async consume(
    key: string,
    windowMs: number,
    maxRequests: number,
  ): Promise<boolean> {
    try {
      if (this.redis.status !== 'ready') {
        await this.redis.connect();
      }

      const count = await this.redis.incr(key);

      if (count === 1) {
        await this.redis.pexpire(key, windowMs);
      }

      return count <= maxRequests;
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis.status === 'end' || this.redis.status === 'wait') {
      return;
    }

    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }
}
