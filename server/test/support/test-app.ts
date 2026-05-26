import { ValidationPipe } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { MulterModule } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Queue } from 'bullmq';
import cookieParser from 'cookie-parser';
import { AppConfigModule } from '../../src/config/app-config.module';
import { AuthController } from '../../src/auth/auth.controller';
import { AuthSessionService } from '../../src/auth/auth-session.service';
import { SessionCacheService } from '../../src/common/session/session-cache.service';
import { ResourceNotificationService } from '../../src/events/resource-notification.service';
import { PasswordManager, TokenManager } from '../../src/auth/auth.utils';
import { AuthGuard } from '../../src/common/guards/auth.guard';
import { PublicLinkService } from '../../src/public-links/public-link.service';
import { ResourceAccessService } from '../../src/resources/resource-access.service';
import { ResourceCloneService } from '../../src/resources/resource-clone.service';
import { ResourceFileService } from '../../src/resources/resource-file.service';
import { ResourceMutationService } from '../../src/resources/resource-mutation.service';
import { ResourceOrderingService } from '../../src/resources/resource-ordering.service';
import { ResourceQueryService } from '../../src/resources/resource-query.service';
import { ResourceScopeCacheService } from '../../src/resources/resource-scope-cache.service';
import { ResourcesController } from '../../src/resources/resources.controller';
import { ShareInvitationService } from '../../src/shares/share-invitation.service';
import { SharesController } from '../../src/shares/shares.controller';
import { StoragePathService } from '../../src/storage/storage-path.service';
import { createImageUploadMulterOptions } from '../../src/uploads/multer.config';
import { UploadsController } from '../../src/uploads/uploads.controller';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PublicLinksController } from '../../src/public-links/public-links.controller';
import { ResourceProcessingService } from '../../src/jobs/resource-processing.service';
import {
  IMAGE_COMPRESSION_JOB,
  IMAGE_COMPRESSION_QUEUE,
  type CompressionJobData,
} from '../../src/jobs/jobs.queue';

type AddedJob = {
  name: string;
  data: CompressionJobData;
  options: Record<string, unknown> | undefined;
};

export class FakeCompressionQueue {
  readonly addedJobs: AddedJob[] = [];
  readonly removedJobIds: string[] = [];
  private readonly jobs = new Map<
    string,
    {
      remove: () => Promise<void>;
    }
  >();

  async add(
    name: string,
    data: CompressionJobData,
    options?: Record<string, unknown>,
  ) {
    const jobId = String(options?.jobId ?? data.resourceId);

    this.addedJobs.push({ name, data, options });
    this.jobs.set(jobId, {
      remove: async () => {
        this.jobs.delete(jobId);
        this.removedJobIds.push(jobId);
      },
    });

    return { id: jobId, name, data };
  }

  async remove(jobId: string): Promise<void> {
    this.jobs.delete(jobId);
    this.removedJobIds.push(jobId);
  }

  async getJob(jobId: string) {
    return this.jobs.get(jobId) ?? null;
  }

  findJobByResourceId(resourceId: string): AddedJob | undefined {
    return this.addedJobs.find(
      (job) =>
        job.name === IMAGE_COMPRESSION_JOB && job.data.resourceId === resourceId,
    );
  }

  reset(): void {
    this.addedJobs.length = 0;
    this.removedJobIds.length = 0;
    this.jobs.clear();
  }
}

export type TestAppContext = {
  app: INestApplication;
  prisma: PrismaService;
  queue: FakeCompressionQueue;
};

export async function createTestApp(): Promise<TestAppContext> {
  process.env.JWT_SECRET ??= 'unit-test-secret';
  const queue = new FakeCompressionQueue();
  const storagePathService = new StoragePathService();
  const moduleRef = await Test.createTestingModule({
    imports: [
      AppConfigModule,
      PrismaModule,
      MulterModule.register(createImageUploadMulterOptions(storagePathService)),
    ],
    controllers: [
      AuthController,
      ResourcesController,
      SharesController,
      PublicLinksController,
      UploadsController,
    ],
    providers: [
      AuthGuard,
      AuthSessionService,
      {
        provide: SessionCacheService,
        useValue: {
          markActive: async () => undefined,
          isActive: async () => null,
          revoke: async () => undefined,
        },
      },
      PasswordManager,
      TokenManager,
      ResourceAccessService,
      {
        provide: ResourceScopeCacheService,
        useValue: {
          get: async () => null,
          set: async () => undefined,
          invalidate: async () => undefined,
          invalidateMany: async () => undefined,
        },
      },
      {
        provide: ResourceNotificationService,
        useValue: {
          notifyChange: async () => undefined,
        },
      },
      ResourceCloneService,
      ResourceOrderingService,
      ResourceQueryService,
      ResourceMutationService,
      ResourceFileService,
      ResourceProcessingService,
      PublicLinkService,
      ShareInvitationService,
      { provide: StoragePathService, useValue: storagePathService },
      {
        provide: getQueueToken(IMAGE_COMPRESSION_QUEUE),
        useValue: queue as unknown as Queue<CompressionJobData>,
      },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.init();

  return {
    app,
    prisma: app.get(PrismaService),
    queue,
  };
}
