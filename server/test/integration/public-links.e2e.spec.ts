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
  createPngBuffer,
  createResource,
  createTestPublicLink,
  createUser,
  issueToken,
} from '../support/fixtures';

describe('Public Links API', () => {
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

  async function writeManagedFile(relativePath: string, buffer: Buffer) {
    await storagePathService.ensureManagedDirectories();
    await fs.writeFile(
      storagePathService.resolveOriginalAbsolutePath(relativePath),
      buffer,
    );
  }

  async function writeCompressedFile(relativePath: string, buffer: Buffer) {
    await storagePathService.ensureManagedDirectories();
    await fs.writeFile(
      storagePathService.resolveCompressedAbsolutePath(relativePath),
      buffer,
    );
  }

  it('creates public links and resolves recursive public subtrees with file URLs', async () => {
    const owner = await createAuthUser('owner@example.com', 'Owner');
    const root = await createResource(context.prisma, {
      name: 'Photos',
      ownerId: owner.user.id,
    });
    const childFile = await createResource(context.prisma, {
      name: 'beach.png',
      ownerId: owner.user.id,
      type: ResourceType.FILE,
      parentId: root.id,
      mimeType: 'image/png',
      originalFilename: 'beach.png',
      storagePath: storagePathService.buildStoredImagePath('beach.png'),
      compressedPath: storagePathService.buildCompressedImagePath('beach.png'),
      size: 123,
      processingStatus: ProcessingStatus.COMPLETED,
    });
    const grandchildFolder = await createResource(context.prisma, {
      name: 'Archive',
      ownerId: owner.user.id,
      parentId: root.id,
      sortOrder: 1,
    });
    await createResource(context.prisma, {
      name: 'nested.png',
      ownerId: owner.user.id,
      type: ResourceType.FILE,
      parentId: grandchildFolder.id,
      mimeType: 'image/png',
      originalFilename: 'nested.png',
      storagePath: storagePathService.buildStoredImagePath('nested.png'),
      size: 64,
      processingStatus: ProcessingStatus.PENDING,
    });

    const createResponse = await request(context.app.getHttpServer())
      .post('/public-links')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ resourceId: root.id })
      .expect(201);

    const resolved = await request(context.app.getHttpServer())
      .get(`/public-links/${createResponse.body.token}`)
      .expect(200);

    expect(resolved.body.id).to.equal(root.id);
    expect(resolved.body.effectiveRole).to.equal('viewer');
    expect(resolved.body.children.map((item: { id: string }) => item.id)).to.deep.equal([
      childFile.id,
      grandchildFolder.id,
    ]);
    expect(resolved.body.children[0].fileUrl).to.equal(
      `/public-links/${createResponse.body.token}/resources/${childFile.id}/file`,
    );
    expect(resolved.body.children[1].children).to.have.length(1);
  });

  it('rejects invalid, inactive, and revoked tokens', async () => {
    const owner = await createAuthUser('owner@example.com', 'Owner');
    const folder = await createResource(context.prisma, {
      name: 'Folder',
      ownerId: owner.user.id,
    });
    const link = await createTestPublicLink(context.prisma, {
      resourceId: folder.id,
      plainToken: 'inactive-token',
      createdByUserId: owner.user.id,
      isActive: false,
    });

    const invalid = await request(context.app.getHttpServer())
      .get('/public-links/does-not-exist')
      .expect(404);
    expect(invalid.body.message).to.equal('Public link was not found.');

    const inactive = await request(context.app.getHttpServer())
      .get('/public-links/inactive-token')
      .expect(404);
    expect(inactive.body.message).to.equal('Public link was not found.');

    const active = await createTestPublicLink(context.prisma, {
      resourceId: folder.id,
      plainToken: 'active-token',
      createdByUserId: owner.user.id,
    });

    await request(context.app.getHttpServer())
      .delete(`/public-links/${active.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);

    const revoked = await request(context.app.getHttpServer())
      .get('/public-links/active-token')
      .expect(404);
    expect(revoked.body.message).to.equal('Public link was not found.');
  });

  it('streams original and compressed files inside the shared subtree', async () => {
    const owner = await createAuthUser('owner@example.com', 'Owner');
    const file = await createResource(context.prisma, {
      name: 'photo.png',
      ownerId: owner.user.id,
      type: ResourceType.FILE,
      mimeType: 'image/png',
      originalFilename: 'photo.png',
      storagePath: storagePathService.buildStoredImagePath('photo.png'),
      compressedPath: storagePathService.buildCompressedImagePath('photo.png'),
      size: 42,
      processingStatus: ProcessingStatus.COMPLETED,
    });
    const fileBuffer = await createPngBuffer();
    await writeManagedFile(file.storagePath!, fileBuffer);
    await writeCompressedFile(file.compressedPath!, fileBuffer);

    await createTestPublicLink(context.prisma, {
      resourceId: file.id,
      plainToken: 'stream-token',
      createdByUserId: owner.user.id,
    });

    await request(context.app.getHttpServer())
      .get('/public-links/stream-token/resources/' + file.id + '/file')
      .expect(200);

    await request(context.app.getHttpServer())
      .get('/public-links/stream-token/resources/' + file.id + '/file/compressed')
      .expect(200);
  });

  it('blocks access to files outside the shared subtree', async () => {
    const owner = await createAuthUser('owner@example.com', 'Owner');
    const root = await createResource(context.prisma, {
      name: 'Shared Root',
      ownerId: owner.user.id,
    });
    const outsideFile = await createResource(context.prisma, {
      name: 'outside.png',
      ownerId: owner.user.id,
      type: ResourceType.FILE,
      mimeType: 'image/png',
      originalFilename: 'outside.png',
      storagePath: storagePathService.buildStoredImagePath('outside.png'),
      size: 12,
    });
    await createTestPublicLink(context.prisma, {
      resourceId: root.id,
      plainToken: 'scope-token',
      createdByUserId: owner.user.id,
    });

    const response = await request(context.app.getHttpServer())
      .get(`/public-links/scope-token/resources/${outsideFile.id}/file`)
      .expect(403);

    expect(response.body.message).to.equal(
      'The requested file is outside the shared public resource scope.',
    );
  });

  it('returns 404 when a compressed asset is missing', async () => {
    const owner = await createAuthUser('owner@example.com', 'Owner');
    const file = await createResource(context.prisma, {
      name: 'photo.png',
      ownerId: owner.user.id,
      type: ResourceType.FILE,
      mimeType: 'image/png',
      originalFilename: 'photo.png',
      storagePath: storagePathService.buildStoredImagePath('photo.png'),
      size: 42,
      processingStatus: ProcessingStatus.PENDING,
    });
    await writeManagedFile(file.storagePath!, await createPngBuffer());

    await createTestPublicLink(context.prisma, {
      resourceId: file.id,
      plainToken: 'compressed-missing-token',
      createdByUserId: owner.user.id,
    });

    const response = await request(context.app.getHttpServer())
      .get(
        `/public-links/compressed-missing-token/resources/${file.id}/file/compressed`,
      )
      .expect(404);

    expect(response.body.message).to.equal('Compressed file not found.');
  });

  it('rotates the active public link token when a new link is created', async () => {
    const owner = await createAuthUser('owner@example.com', 'Owner');
    const folder = await createResource(context.prisma, {
      name: 'Folder',
      ownerId: owner.user.id,
    });

    const first = await request(context.app.getHttpServer())
      .post('/public-links')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ resourceId: folder.id })
      .expect(201);

    const second = await request(context.app.getHttpServer())
      .post('/public-links')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ resourceId: folder.id })
      .expect(201);

    expect(second.body.id).to.not.equal(first.body.id);
    expect(second.body.token).to.be.a('string').and.not.empty;

    await request(context.app.getHttpServer())
      .get(`/public-links/${first.body.token}`)
      .expect(404);

    await request(context.app.getHttpServer())
      .get(`/public-links/${second.body.token}`)
      .expect(200);

    const active = await request(context.app.getHttpServer())
      .get(`/public-links/resource/${folder.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);

    expect(active.body.id).to.equal(second.body.id);
    expect(active.body.token).to.equal(null);
  });
});
