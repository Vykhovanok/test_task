import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfigService } from '../../config/app-config.service';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(private readonly appConfigService: AppConfigService) {
    const redisUrl = this.appConfigService.redisUrl;
    this.client = redisUrl
      ? new Redis(redisUrl, {
          maxRetriesPerRequest: 2,
          enableOfflineQueue: false,
          lazyConnect: true,
        })
      : new Redis({
          host: this.appConfigService.redisHost,
          port: this.appConfigService.redisPort,
          maxRetriesPerRequest: 2,
          enableOfflineQueue: false,
          lazyConnect: true,
        });
  }

  async ensureConnected(): Promise<void> {
    if (this.client.status !== 'ready') {
      await this.client.connect();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.status === 'end' || this.client.status === 'wait') {
      return;
    }

    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}
