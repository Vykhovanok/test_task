import { expect } from 'chai';
import { PermissionRole, ProcessingStatus, ResourceType, Visibility } from '@prisma/client';
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
  createUser,
  grantPermission,
  issueToken,
} from '../support/fixtures';

describe('Resources API', () => {
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

  it('searches case-insensitively, trims the query, and detaches hidden parents from results', async () => {
    const owner = await createAuthUser('owner@example.com', 'Owner');
    const viewer = await createAuthUser('viewer@example.com', 'Viewer');
    const hiddenParent = await createResource(context.prisma, {
      name: 'Secret Folder',
      ownerId: owner.user.id,
    });
    const visibleChild = await createResource(context.prisma, {
      name: 'Quarterly Report',
      ownerId: owner.user.id,
      type: ResourceType.FILE,
      parentId: hiddenParent.id,
      visibility: Visibility.PRIVATE,
      mimeType: 'image/png',
      originalFilename: 'report.png',
    });
    const unrelated = await createResource(context.prisma, {
      name: 'Elsewhere',
      ownerId: owner.user.id,
    });

    await grantPermission(
      context.prisma,
      visibleChild.id,
      viewer.user.id,
      PermissionRole.VIEWER,
    );
    await grantPermission(
      context.prisma,
      unrelated.id,
      viewer.user.id,
      PermissionRole.VIEWER,
    );

    const response = await request(context.app.getHttpServer())
      .get('/resources/search')
      .query({ query: '  quarTERly  ' })
      .set('Authorization', `Bearer ${viewer.token}`)
      .expect(200);

    expect(response.body.items).to.have.length(1);
    expect(response.body.items[0].id).to.equal(visibleChild.id);
    expect(response.body.items[0].parentId).to.equal(null);
    expect(response.body.items[0].effectiveRole).to.equal('viewer');
  });

  it('rejects out-of-bounds reordering and preserves sibling sort-order invariants', async () => {
    const owner = await createAuthUser('owner@example.com', 'Owner');
    const parent = await createResource(context.prisma, {
      name: 'Folder',
      ownerId: owner.user.id,
    });
    const first = await createResource(context.prisma, {
      name: 'First',
      ownerId: owner.user.id,
      parentId: parent.id,
      sortOrder: 0,
    });
    const second = await createResource(context.prisma, {
      name: 'Second',
      ownerId: owner.user.id,
      parentId: parent.id,
      sortOrder: 1,
    });

    const response = await request(context.app.getHttpServer())
      .patch(`/resources/${first.id}/reorder`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ targetIndex: 99 })
      .expect(403);

    expect(response.body.message).to.equal(
      'Target index is out of bounds for this folder.',
    );

    const siblings = await context.prisma.resource.findMany({
      where: { parentId: parent.id },
      orderBy: { sortOrder: 'asc' },
    });

    expect(
      siblings.map((resource) => ({
        id: resource.id,
        sortOrder: resource.sortOrder,
      })),
    ).to.deep.equal([
      { id: first.id, sortOrder: 0 },
      { id: second.id, sortOrder: 1 },
    ]);
  });

  it('rejects invalid move targets including self, descendants, and files', async () => {
    const owner = await createAuthUser('owner@example.com', 'Owner');
    const root = await createResource(context.prisma, {
      name: 'Root',
      ownerId: owner.user.id,
    });
    const child = await createResource(context.prisma, {
      name: 'Child',
      ownerId: owner.user.id,
      parentId: root.id,
    });
    const fileTarget = await createResource(context.prisma, {
      name: 'file.png',
      ownerId: owner.user.id,
      type: ResourceType.FILE,
      mimeType: 'image/png',
      originalFilename: 'file.png',
    });

    const selfMove = await request(context.app.getHttpServer())
      .patch(`/resources/${root.id}/move`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ parentId: root.id })
      .expect(403);
    expect(selfMove.body.message).to.equal(
      'A resource cannot be moved into itself.',
    );

    const descendantMove = await request(context.app.getHttpServer())
      .patch(`/resources/${root.id}/move`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ parentId: child.id })
      .expect(403);
    expect(descendantMove.body.message).to.equal(
      'A resource cannot be moved into one of its descendants.',
    );

    const fileMove = await request(context.app.getHttpServer())
      .patch(`/resources/${root.id}/move`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ parentId: fileTarget.id })
      .expect(403);
    expect(fileMove.body.message).to.equal(
      'Resources can only be moved into folders.',
    );
  });

  it('clones deep recursive subtrees while preserving hierarchy and duplicating binary assets', async () => {
    const owner = await createAuthUser('owner@example.com', 'Owner');
    const root = await createResource(context.prisma, {
      name: 'Photos',
      ownerId: owner.user.id,
      sortOrder: 0,
    });
    const nestedFolder = await createResource(context.prisma, {
      name: 'Nested',
      ownerId: owner.user.id,
      parentId: root.id,
      sortOrder: 0,
    });
    const originalFile = await createResource(context.prisma, {
      name: 'photo.png',
      ownerId: owner.user.id,
      type: ResourceType.FILE,
      parentId: nestedFolder.id,
      mimeType: 'image/png',
      originalFilename: 'photo.png',
      storagePath: storagePathService.buildStoredImagePath('source-photo.png'),
      compressedPath:
        storagePathService.buildCompressedImagePath('source-photo.png'),
      size: 99,
      processingStatus: ProcessingStatus.COMPLETED,
      sortOrder: 0,
    });
    const binary = await createPngBuffer();
    await writeManagedFile(originalFile.storagePath!, binary);
    await writeCompressedFile(originalFile.compressedPath!, binary);

    const response = await request(context.app.getHttpServer())
      .post(`/resources/${root.id}/clone`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(201);

    expect(response.body.name).to.equal('Photos Copy');

    const clonedResources = await context.prisma.resource.findMany({
      where: {
        ownerId: owner.user.id,
        name: {
          in: ['Photos Copy', 'Nested', 'photo.png'],
        },
      },
      orderBy: [{ createdAt: 'asc' }],
    });

    expect(clonedResources).to.have.length(5);

    const clonedRoot = clonedResources.find((item) => item.name === 'Photos Copy');
    const clonedNested = clonedResources.find(
      (item) => item.name === 'Nested' && item.parentId === clonedRoot?.id,
    );
    const clonedFile = clonedResources.find(
      (item) => item.name === 'photo.png' && item.parentId === clonedNested?.id,
    );

    expect(clonedRoot?.id).to.not.equal(root.id);
    expect(clonedNested?.id).to.not.equal(nestedFolder.id);
    expect(clonedFile?.storagePath).to.not.equal(originalFile.storagePath);
    expect(clonedFile?.compressedPath).to.not.equal(originalFile.compressedPath);

    const clonedOriginalStat = await fs.stat(
      storagePathService.resolveOriginalAbsolutePath(clonedFile!.storagePath!),
    );
    const clonedCompressedStat = await fs.stat(
      storagePathService.resolveCompressedAbsolutePath(
        clonedFile!.compressedPath!,
      ),
    );

    expect(clonedOriginalStat.size).to.be.greaterThan(0);
    expect(clonedCompressedStat.size).to.be.greaterThan(0);
  });

  it('deletes subtrees, removes binary assets, and cleans queued compression jobs', async () => {
    const owner = await createAuthUser('owner@example.com', 'Owner');
    const root = await createResource(context.prisma, {
      name: 'Root',
      ownerId: owner.user.id,
    });
    const childFile = await createResource(context.prisma, {
      name: 'photo.png',
      ownerId: owner.user.id,
      type: ResourceType.FILE,
      parentId: root.id,
      mimeType: 'image/png',
      originalFilename: 'photo.png',
      storagePath: storagePathService.buildStoredImagePath('delete-photo.png'),
      compressedPath:
        storagePathService.buildCompressedImagePath('delete-photo.png'),
      size: 42,
      processingStatus: ProcessingStatus.PENDING,
    });
    const binary = await createPngBuffer();
    await writeManagedFile(childFile.storagePath!, binary);
    await writeCompressedFile(childFile.compressedPath!, binary);
    await context.queue.add('compress', {
      resourceId: childFile.id,
      storagePath: childFile.storagePath!,
      stagedPath: childFile.storagePath!,
      mimeType: 'image/png',
    });

    await request(context.app.getHttpServer())
      .delete(`/resources/${root.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);

    expect(
      await context.prisma.resource.findUnique({
        where: { id: root.id },
      }),
    ).to.equal(null);
    expect(context.queue.removedJobIds).to.include.members([root.id, childFile.id]);

    await expectMissingFile(
      storagePathService.resolveOriginalAbsolutePath(childFile.storagePath!),
    );
    await expectMissingFile(
      storagePathService.resolveCompressedAbsolutePath(
        childFile.compressedPath!,
      ),
    );
  });

  it('serializes concurrent folder creation so sibling sortOrder stays unique', async () => {
    const owner = await createAuthUser('owner@example.com', 'Owner');
    const parent = await createResource(context.prisma, {
      name: 'Parent',
      ownerId: owner.user.id,
    });

    await Promise.all([
      request(context.app.getHttpServer())
        .post('/resources/folders')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ name: 'A', parentId: parent.id })
        .expect(201),
      request(context.app.getHttpServer())
        .post('/resources/folders')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ name: 'B', parentId: parent.id })
        .expect(201),
    ]);

    const children = await context.prisma.resource.findMany({
      where: { parentId: parent.id },
      orderBy: { sortOrder: 'asc' },
    });

    expect(children).to.have.length(2);
    expect(new Set(children.map((item) => item.sortOrder)).size).to.equal(2);
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
