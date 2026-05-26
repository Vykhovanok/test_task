import { expect } from 'chai';
import { ProcessingStatus, ResourceType } from '@prisma/client';
import request from 'supertest';
import * as fs from 'fs/promises';
import { AuthSessionService } from '../../src/auth/auth-session.service';
import { PasswordManager, TokenManager } from '../../src/auth/auth.utils';
import { AppConfigService } from '../../src/config/app-config.service';
import { StoragePathService } from '../../src/storage/storage-path.service';
import { createTestApp, type TestAppContext } from '../support/test-app';
import {
  createJpegBuffer,
  createOversizedPngBuffer,
  createPngBuffer,
  createResource,
  createUser,
  issueToken,
  tinyGifBuffer,
} from '../support/fixtures';

describe('Uploads API', () => {
  let context: TestAppContext;
  let storagePathService: StoragePathService;

  beforeEach(async () => {
    context = await createTestApp();
    storagePathService = context.app.get(StoragePathService);
  });

  afterEach(async () => {
    await context.app.close();
  });

  async function createAuthUser(email: string, name: string) {
    const passwordManager = context.app.get(PasswordManager);
    const tokenManager = context.app.get(TokenManager);
    const authSessionService = context.app.get(AuthSessionService);
    const appConfigService = context.app.get(AppConfigService);
    const user = await createUser(context.prisma, passwordManager, {
      email,
      name,
    });

    return {
      user,
      token: await issueToken(
        tokenManager,
        authSessionService,
        appConfigService,
        user,
      ),
    };
  }

  it('uploads a valid image, creates a file resource, enqueues compression, and clears staging', async () => {
    const owner = await createAuthUser('owner@example.com', 'Owner');
    const parent = await createResource(context.prisma, {
      name: 'Uploads',
      ownerId: owner.user.id,
    });

    const response = await request(context.app.getHttpServer())
      .post('/uploads/image')
      .set('Authorization', `Bearer ${owner.token}`)
      .field('parentId', parent.id)
      .attach('file', await createPngBuffer(), {
        filename: 'Beach Shot.PNG',
        contentType: 'image/png',
      })
      .expect(201);

    expect(response.body.type).to.equal(ResourceType.FILE);
    expect(response.body.parentId).to.equal(parent.id);
    expect(response.body.name).to.equal('Beach Shot.png');
    expect(response.body.processingStatus).to.equal(ProcessingStatus.PENDING);

    const storedResource = await context.prisma.resource.findUniqueOrThrow({
      where: { id: response.body.id },
    });

    expect(storedResource.storagePath).to.be.a('string').and.not.empty;
    expect(storedResource.compressedPath).to.equal(null);

    const queuedJob = context.queue.findJobByResourceId(storedResource.id);
    expect(queuedJob).to.not.equal(undefined);
    expect(queuedJob?.data.storagePath).to.equal(storedResource.storagePath);

    const originalAbsolutePath = storagePathService.resolveOriginalAbsolutePath(
      storedResource.storagePath!,
    );
    await fs.stat(originalAbsolutePath);

    expect(await listDirectory(storagePathService.stagingRoot)).to.deep.equal([]);
  });

  it('rejects corrupt image bytes, leaves no resource row behind, and cleans staging', async () => {
    const owner = await createAuthUser('owner@example.com', 'Owner');

    const response = await request(context.app.getHttpServer())
      .post('/uploads/image')
      .set('Authorization', `Bearer ${owner.token}`)
      .attach('file', Buffer.from('not-an-image'), {
        filename: 'corrupt.png',
        contentType: 'image/png',
      })
      .expect(400);

    expect(response.body.message).to.equal(
      'The uploaded file content is not a valid image.',
    );
    expect(await context.prisma.resource.count()).to.equal(0);
    expect(context.queue.addedJobs).to.have.length(0);
    expect(await listDirectory(storagePathService.stagingRoot)).to.deep.equal([]);
  });

  it('rejects MIME/content mismatch and unsupported decoded formats with exact semantics', async () => {
    const owner = await createAuthUser('owner@example.com', 'Owner');

    const mismatch = await request(context.app.getHttpServer())
      .post('/uploads/image')
      .set('Authorization', `Bearer ${owner.token}`)
      .attach('file', await createJpegBuffer(), {
        filename: 'mismatch.jpg',
        contentType: 'image/png',
      })
      .expect(415);

    expect(mismatch.body.message).to.equal(
      'The uploaded file MIME type does not match the decoded image format.',
    );

    const unsupported = await request(context.app.getHttpServer())
      .post('/uploads/image')
      .set('Authorization', `Bearer ${owner.token}`)
      .attach('file', tinyGifBuffer, {
        filename: 'animated.gif',
        contentType: 'image/gif',
      })
      .expect(415);

    expect(unsupported.body.message).to.equal(
      'Only JPEG, PNG, and WebP images are supported.',
    );
    expect(await listDirectory(storagePathService.stagingRoot)).to.deep.equal([]);
  });

  it('rejects oversized image dimensions and forbids uploads into file resources', async () => {
    const owner = await createAuthUser('owner@example.com', 'Owner');
    const fileParent = await createResource(context.prisma, {
      name: 'file.png',
      ownerId: owner.user.id,
      type: ResourceType.FILE,
      mimeType: 'image/png',
      originalFilename: 'file.png',
    });

    const oversized = await request(context.app.getHttpServer())
      .post('/uploads/image')
      .set('Authorization', `Bearer ${owner.token}`)
      .attach('file', await createOversizedPngBuffer(), {
        filename: 'large.png',
        contentType: 'image/png',
      })
      .expect(413);

    expect(oversized.body.message).to.equal(
      'The uploaded image dimensions exceed the supported limits.',
    );

    const forbiddenParent = await request(context.app.getHttpServer())
      .post('/uploads/image')
      .set('Authorization', `Bearer ${owner.token}`)
      .field('parentId', fileParent.id)
      .attach('file', await createPngBuffer(), {
        filename: 'nested.png',
        contentType: 'image/png',
      })
      .expect(403);

    expect(forbiddenParent.body.message).to.equal(
      'Images can only be uploaded into folders.',
    );
  });
});

async function listDirectory(absolutePath: string): Promise<string[]> {
  try {
    return (await fs.readdir(absolutePath)).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}
