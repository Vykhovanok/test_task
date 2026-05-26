import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { MessageEvent } from '@nestjs/common';
import Redis from 'ioredis';
import { Observable } from 'rxjs';
import { createRedisClient } from '../common/redis/redis-client.util';
import { AppConfigService } from '../config/app-config.service';
import { ResourceEventsService } from './resource-events.service';

@Injectable()
export class EventsStreamService implements OnModuleDestroy {
  private readonly subscribers = new Map<string, Set<Redis>>();

  constructor(
    private readonly appConfigService: AppConfigService,
    private readonly resourceEventsService: ResourceEventsService,
  ) {}

  createUserStream(userId: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const redisSubscriber = createRedisClient(this.appConfigService, {
        maxRetriesPerRequest: 2,
        enableOfflineQueue: false,
      });

      const channel = this.resourceEventsService.userChannel(userId);
      const connections = this.subscribers.get(userId) ?? new Set<Redis>();
      connections.add(redisSubscriber);
      this.subscribers.set(userId, connections);

      const handleMessage = (_channel: string, message: string) => {
        subscriber.next({
          data: message,
        });
      };

      void redisSubscriber.subscribe(channel).then(() => {
        subscriber.next({
          data: JSON.stringify({ type: 'connected' }),
        });
      });

      redisSubscriber.on('message', handleMessage);

      return () => {
        redisSubscriber.off('message', handleMessage);
        void redisSubscriber.unsubscribe(channel).finally(() => {
          void redisSubscriber.quit();
        });
        connections.delete(redisSubscriber);

        if (connections.size === 0) {
          this.subscribers.delete(userId);
        }
      };
    });
  }

  async onModuleDestroy(): Promise<void> {
    const quitOperations: Promise<unknown>[] = [];

    for (const connections of this.subscribers.values()) {
      for (const connection of connections) {
        quitOperations.push(connection.quit());
      }
    }

    await Promise.allSettled(quitOperations);
    this.subscribers.clear();
  }
}
