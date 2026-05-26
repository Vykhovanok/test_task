import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AppConfigModule } from '../config/app-config.module';
import { AppConfigService } from '../config/app-config.service';
import { getBullMqConnection } from '../common/redis/redis-client.util';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { JobsProcessor } from './jobs.processor';
import { ResourceProcessingService } from './resource-processing.service';
import { IMAGE_COMPRESSION_QUEUE } from './jobs.queue';

const runWorkers = process.env.RUN_WORKERS !== 'false';

@Module({
  imports: [
    AppConfigModule,
    BullModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (appConfigService: AppConfigService) => ({
        connection: getBullMqConnection(appConfigService),
      }),
    }),
    BullModule.registerQueue({
      name: IMAGE_COMPRESSION_QUEUE,
    }),
    PrismaModule,
    StorageModule,
  ],
  providers: [
    ResourceProcessingService,
    ...(runWorkers ? [JobsProcessor] : []),
  ],
  exports: [BullModule, ResourceProcessingService],
})
export class JobsModule {}
