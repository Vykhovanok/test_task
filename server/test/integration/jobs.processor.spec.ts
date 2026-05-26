import { expect } from 'chai';
import { ProcessingStatus, ResourceType } from '@prisma/client';
import type { Job } from 'bullmq';
import * as fs from 'fs/promises';
import { PasswordManager } from '../../src/auth/auth.utils';
import { JobsProcessor } from '../../src/jobs/jobs.processor';
import { PrismaService } from '../../src/prisma/prisma.service';
import { StoragePathService } from '../../src/storage/storage-path.service';
import {
  createPngBuffer,
  createResource,
  createUser,
} from '../support/fixtures';

describe('JobsProcessor', () => {
  let prisma: PrismaService;
  let storagePathService: StoragePathService;
  let jobsProcessor: JobsProcessor;
  let passwordManager: PasswordManager;

  beforeEach(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    storagePathService = new StoragePathService();
    jobsProcessor = new JobsProcessor(prisma, storagePathService);
    passwordManager = new PasswordManager();
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  async function createFileResource() {
    const owner = await createUser(prisma, passwordManager, {
      email: 'owner@example.com',
      name: 'Owner',
    });
    const resource = await createResource(prisma, {
      name: 'photo.png',
      ownerId: owner.id,
      type: ResourceType.FILE,
      mimeType: 'image/png',
      originalFilename: 'photo.png',
      storagePath: storagePathService.buildStoredImagePath('processor-source.png'),
      size: 42,
      processingStatus: ProcessingStatus.PENDING,
    });

    return resource;
  }

  async function writeOriginalFile(relativePath: string) {
    await storagePathService.ensureManagedDirectories();
    await fs.writeFile(
      storagePathService.resolveOriginalAbsolutePath(relativePath),
      await createPngBuffer(),
    );
  }

  function makeJob(
    resourceId: string,
    storagePath: string,
    attemptsMade: number,
    attempts: number,
  ): Job {
    return {
      id: `job-${resourceId}`,
      data: {
        resourceId,
        storagePath,
        stagedPath: storagePath,
        mimeType: 'image/png',
      },
      attemptsMade,
      opts: { attempts },
    } as Job;
  }

  it('compresses a valid image and marks the resource as completed', async () => {
    const resource = await createFileResource();
    await writeOriginalFile(resource.storagePath!);

    await jobsProcessor.process(makeJob(resource.id, resource.storagePath!, 0, 3));

    const updated = await prisma.resource.findUniqueOrThrow({
      where: { id: resource.id },
    });

    expect(updated.processingStatus).to.equal(ProcessingStatus.COMPLETED);
    expect(updated.compressedPath).to.equal(
      storagePathService.buildCompressedImagePath(`${resource.id}.png`),
    );

    await fs.stat(
      storagePathService.resolveCompressedAbsolutePath(updated.compressedPath!),
    );
  });

  it('restores PENDING on intermediate retry failures', async () => {
    const resource = await createFileResource();
    await storagePathService.ensureManagedDirectories();
    await fs.writeFile(
      storagePathService.resolveOriginalAbsolutePath(resource.storagePath!),
      Buffer.from('corrupt'),
    );

    try {
      await jobsProcessor.process(
        makeJob(resource.id, resource.storagePath!, 0, 3),
      );
      expect.fail('Expected processor failure for corrupt content.');
    } catch (error) {
      expect((error as Error).message).to.be.a('string');
    }

    const updated = await prisma.resource.findUniqueOrThrow({
      where: { id: resource.id },
    });

    expect(updated.processingStatus).to.equal(ProcessingStatus.PENDING);
    expect(updated.compressedPath).to.equal(null);
  });

  it('marks the resource as FAILED on the terminal retry', async () => {
    const resource = await createFileResource();
    await storagePathService.ensureManagedDirectories();
    await fs.writeFile(
      storagePathService.resolveOriginalAbsolutePath(resource.storagePath!),
      Buffer.from('corrupt'),
    );

    try {
      await jobsProcessor.process(
        makeJob(resource.id, resource.storagePath!, 2, 3),
      );
      expect.fail('Expected processor failure for corrupt content.');
    } catch (error) {
      expect((error as Error).message).to.be.a('string');
    }

    const updated = await prisma.resource.findUniqueOrThrow({
      where: { id: resource.id },
    });

    expect(updated.processingStatus).to.equal(ProcessingStatus.FAILED);
    expect(updated.compressedPath).to.equal(null);
  });

  it('removes temporary compressed output when the final move fails', async () => {
    const resource = await createFileResource();
    await writeOriginalFile(resource.storagePath!);
    const moveFile = storagePathService.moveFile.bind(storagePathService);
    const outputPath = storagePathService.resolveCompressedAbsolutePath(
      storagePathService.buildCompressedImagePath(`${resource.id}.png`),
    );

    storagePathService.moveFile = async () => {
      throw new Error('Simulated final move failure');
    };

    try {
      await jobsProcessor.process(
        makeJob(resource.id, resource.storagePath!, 0, 3),
      );
      expect.fail('Expected processor failure for moveFile.');
    } catch (error) {
      expect((error as Error).message).to.equal('Simulated final move failure');
    } finally {
      storagePathService.moveFile = moveFile;
    }

    const updated = await prisma.resource.findUniqueOrThrow({
      where: { id: resource.id },
    });

    expect(updated.processingStatus).to.equal(ProcessingStatus.PENDING);
    expect(updated.compressedPath).to.equal(null);

    await expectMissingFile(`${outputPath}.job-${resource.id}.tmp`);
  });

  it('no-ops when the resource is missing or the storage path is stale', async () => {
    await jobsProcessor.process(
      makeJob(
        '00000000-0000-7000-8000-000000000000',
        'storage/images/missing.png',
        0,
        1,
      ),
    );

    const owner = await createUser(prisma, passwordManager, {
      email: 'owner@example.com',
      name: 'Owner',
    });
    const stale = await createResource(prisma, {
      name: 'stale.png',
      ownerId: owner.id,
      type: ResourceType.FILE,
      storagePath: 'storage/images/current.png',
      mimeType: 'image/png',
      originalFilename: 'stale.png',
      processingStatus: ProcessingStatus.PENDING,
    });

    await jobsProcessor.process(
      makeJob(stale.id, 'storage/images/old.png', 0, 1),
    );

    const unchanged = await prisma.resource.findUniqueOrThrow({
      where: { id: stale.id },
    });

    expect(unchanged.processingStatus).to.equal(ProcessingStatus.PENDING);
    expect(unchanged.compressedPath).to.equal(null);
  });
});

async function expectMissingFile(absolutePath: string): Promise<void> {
  try {
    await fs.stat(absolutePath);
    expect.fail(`Expected ${absolutePath} to be removed.`);
  } catch (error) {
    expect((error as NodeJS.ErrnoException).code).to.equal('ENOENT');
  }
}
