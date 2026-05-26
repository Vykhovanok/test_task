import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { JobsProcessor } from './jobs.processor';
import { ResourceProcessingService } from './resource-processing.service';
import { IMAGE_COMPRESSION_QUEUE } from './jobs.queue';

const runWorkers = process.env.RUN_WORKERS !== 'false';

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: Number(process.env.REDIS_PORT ?? '6379'),
      },
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
