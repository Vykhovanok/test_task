import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AppConfigModule } from '../config/app-config.module';
import { RedisModule } from '../common/redis/redis.module';
import { PrismaModule } from '../prisma/prisma.module';
import { EventsController } from './events.controller';
import { EventsStreamService } from './events-stream.service';
import { ResourceEventsService } from './resource-events.service';
import { ResourceNotificationService } from './resource-notification.service';

@Module({
  imports: [RedisModule, PrismaModule, AuthModule, AppConfigModule],
  controllers: [EventsController],
  providers: [
    ResourceEventsService,
    ResourceNotificationService,
    EventsStreamService,
  ],
  exports: [ResourceNotificationService, ResourceEventsService],
})
export class EventsModule {}
