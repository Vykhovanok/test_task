import { Module } from '@nestjs/common';
import { AppConfigModule } from '../config/app-config.module';
import { ObservabilityModule } from '../common/observability/observability.module';
import { RedisModule } from '../common/redis/redis.module';
import { JobsModule } from '../jobs/jobs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    AppConfigModule,
    RedisModule,
    ObservabilityModule,
    PrismaModule,
    StorageModule,
    JobsModule,
  ],
})
export class WorkerAppModule {}
