import { Injectable } from '@nestjs/common';
import { RedisService } from '../common/redis/redis.service';
import type { ResourceChangeEvent } from './resource-events.types';

const USER_CHANNEL_PREFIX = 'resource-events:user:';

@Injectable()
export class ResourceEventsService {
  constructor(private readonly redisService: RedisService) {}

  userChannel(userId: string): string {
    return `${USER_CHANNEL_PREFIX}${userId}`;
  }

  async publishToUsers(
    userIds: Iterable<string>,
    event: ResourceChangeEvent,
  ): Promise<void> {
    const payload = JSON.stringify(event);
    const uniqueUserIds = [...new Set(userIds)];

    if (uniqueUserIds.length === 0) {
      return;
    }

    try {
      await this.redisService.ensureConnected();
      const pipeline = this.redisService.client.pipeline();

      for (const userId of uniqueUserIds) {
        pipeline.publish(this.userChannel(userId), payload);
      }

      await pipeline.exec();
    } catch {
      return;
    }
  }
}
