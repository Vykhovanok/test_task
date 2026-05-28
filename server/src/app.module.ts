import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { AuthModule } from './auth/auth.module';
import { ObservabilityModule } from './common/observability/observability.module';
import { RedisModule } from './common/redis/redis.module';
import { AppConfigModule } from './config/app-config.module';
import { EventsModule } from './events/events.module';
import { JobsModule } from './jobs/jobs.module';
import { PrismaModule } from './prisma/prisma.module';
import { PublicLinksModule } from './public-links/public-links.module';
import { ResourcesModule } from './resources/resources.module';
import { SharesModule } from './shares/shares.module';
import { StorageModule } from './storage/storage.module';
import { UploadsModule } from './uploads/uploads.module';

@Module({
  controllers: [HealthController],
  imports: [
    AppConfigModule,
    RedisModule,
    ObservabilityModule,
    PrismaModule,
    StorageModule,
    JobsModule,
    AuthModule,
    EventsModule,
    ResourcesModule,
    UploadsModule,
    SharesModule,
    PublicLinksModule,
  ],
})
export class AppModule {}
