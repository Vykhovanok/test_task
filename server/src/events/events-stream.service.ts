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
      let disposed = false;
      const redisSubscriber = createRedisClient(this.appConfigService, {
        maxRetriesPerRequest: null,
        enableOfflineQueue: false,
        lazyConnect: true,
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

      const setup = async (): Promise<void> => {
        try {
          if (redisSubscriber.status !== 'ready') {
            await redisSubscriber.connect();
          }

          if (disposed) {
            return;
          }

          await redisSubscriber.subscribe(channel);

          if (disposed) {
            return;
          }

          redisSubscriber.on('message', handleMessage);
          subscriber.next({
            data: JSON.stringify({ type: 'connected' }),
          });
        } catch (error) {
          if (!disposed) {
            subscriber.error(error);
          }
        }
      };

      void setup();

      return () => {
        disposed = true;
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
