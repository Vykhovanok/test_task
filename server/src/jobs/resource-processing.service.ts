import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ProcessingStatus, ResourceType } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { StoragePathService } from '../storage/storage-path.service';
import {
  cleanupCompressionJob,
  COMPRESSION_ATTEMPTS,
  COMPRESSION_BACKOFF_DELAY_MS,
  type CompressionJobData,
  IMAGE_COMPRESSION_JOB,
  IMAGE_COMPRESSION_QUEUE,
} from './jobs.queue';

const RECOVERY_SWEEP_INTERVAL_MS = 60_000;

@Injectable()
export class ResourceProcessingService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ResourceProcessingService.name);
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly storagePathService: StoragePathService,
    @InjectQueue(IMAGE_COMPRESSION_QUEUE)
    private readonly compressionQueue: Queue<CompressionJobData>,
  ) {}

  async onModuleInit(): Promise<void> {
    this.sweepTimer = setInterval(() => {
      void this.recoverPendingResources().catch((error: unknown) => {
        this.logger.error('Failed to run processing recovery sweep.', error);
      });
    }, RECOVERY_SWEEP_INTERVAL_MS);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  async enqueueCompression(jobData: CompressionJobData): Promise<void> {
    await this.compressionQueue.add(IMAGE_COMPRESSION_JOB, jobData, {
      jobId: jobData.resourceId,
      attempts: COMPRESSION_ATTEMPTS,
      backoff: { type: 'exponential', delay: COMPRESSION_BACKOFF_DELAY_MS },
      removeOnComplete: true,
    });
  }

  async cleanupCompressionJob(resourceId: string): Promise<void> {
    await cleanupCompressionJob(this.compressionQueue, resourceId);
  }

  async recoverPendingResources(): Promise<void> {
    const candidates = await this.prismaService.resource.findMany({
      where: {
        type: ResourceType.FILE,
        processingStatus: {
          in: [ProcessingStatus.PENDING, ProcessingStatus.PROCESSING],
        },
      },
      take: 100,
      orderBy: { updatedAt: 'asc' },
    });

    for (const resource of candidates) {
      if (!resource.storagePath || !resource.mimeType) {
        continue;
      }

      const originalExists = await this.pathExists(
        this.storagePathService.resolveOriginalAbsolutePath(resource.storagePath),
      );
      const compressedExists = resource.compressedPath
        ? await this.pathExists(
            this.storagePathService.resolveCompressedAbsolutePath(
              resource.compressedPath,
            ),
          )
        : false;

      if (!originalExists) {
        await this.prismaService.resource.update({
          where: { id: resource.id },
          data: { processingStatus: ProcessingStatus.FAILED },
        });
        continue;
      }

      if (compressedExists) {
        await this.prismaService.resource.update({
          where: { id: resource.id },
          data: { processingStatus: ProcessingStatus.COMPLETED },
        });
        continue;
      }

      await this.prismaService.resource.update({
        where: { id: resource.id },
        data: { processingStatus: ProcessingStatus.PENDING },
      });

      await this.enqueueCompression({
        resourceId: resource.id,
        storagePath: resource.storagePath,
        stagedPath: resource.storagePath,
        mimeType: resource.mimeType,
      });
    }
  }

  private async pathExists(absolutePath: string): Promise<boolean> {
    try {
      await this.storagePathService.ensureManagedDirectories();
      await this.storagePathService.assertPathExists(absolutePath);
      return true;
    } catch {
      return false;
    }
  }
}
