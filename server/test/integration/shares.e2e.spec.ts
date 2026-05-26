import { expect } from 'chai';
import { PermissionRole } from '@prisma/client';
import request from 'supertest';
import { AuthSessionService } from '../../src/auth/auth-session.service';
import { PasswordManager, TokenManager } from '../../src/auth/auth.utils';
import { AppConfigService } from '../../src/config/app-config.service';
import { createTestApp, type TestAppContext } from '../support/test-app';
import {
  createResource,
  createUser,
  grantPermission,
  issueToken,
} from '../support/fixtures';

describe('Share Invitations API', () => {
  let context: TestAppContext;

  beforeEach(async () => {
    context = await createTestApp();
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

  it('creates invitations with normalized email and blocks duplicates', async () => {
    const owner = await createAuthUser('owner@example.com', 'Owner');
    const folder = await createResource(context.prisma, {
      name: 'Shared Folder',
      ownerId: owner.user.id,
    });

    const created = await request(context.app.getHttpServer())
      .post('/shares/invitations')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        resourceId: folder.id,
        email: 'Viewer@Example.com',
        role: PermissionRole.VIEWER,
      })
      .expect(201);

    expect(created.body.email).to.equal('viewer@example.com');
    expect(created.body.status).to.equal('PENDING');

    const duplicate = await request(context.app.getHttpServer())
      .post('/shares/invitations')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        resourceId: folder.id,
        email: 'viewer@example.com',
        role: PermissionRole.EDITOR,
      })
      .expect(409);

    expect(duplicate.body.message).to.equal(
      'An active invitation already exists for this email.',
    );
  });

  it('blocks self-sharing and users without edit access', async () => {
    const owner = await createAuthUser('owner@example.com', 'Owner');
    const stranger = await createAuthUser('stranger@example.com', 'Stranger');
    const folder = await createResource(context.prisma, {
      name: 'Private Folder',
      ownerId: owner.user.id,
    });

    const selfShare = await request(context.app.getHttpServer())
      .post('/shares/invitations')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        resourceId: folder.id,
        email: 'OWNER@example.com',
        role: PermissionRole.VIEWER,
      })
      .expect(400);

    expect(selfShare.body.message).to.equal(
      'You cannot share a resource with yourself.',
    );

    const forbidden = await request(context.app.getHttpServer())
      .post('/shares/invitations')
      .set('Authorization', `Bearer ${stranger.token}`)
      .send({
        resourceId: folder.id,
        email: 'viewer@example.com',
        role: PermissionRole.VIEWER,
      })
      .expect(403);

    expect(forbidden.body.message).to.equal(
      'You do not have permission to access this resource.',
    );
  });

  it('re-activates a revoked invitation and updates its role', async () => {
    const owner = await createAuthUser('owner@example.com', 'Owner');
    const folder = await createResource(context.prisma, {
      name: 'Folder',
      ownerId: owner.user.id,
    });

    const invitation = await context.prisma.shareInvitation.create({
      data: {
        resourceId: folder.id,
        email: 'invitee@example.com',
        role: PermissionRole.VIEWER,
        status: 'REVOKED',
        createdByUserId: owner.user.id,
      },
    });

    const response = await request(context.app.getHttpServer())
      .post('/shares/invitations')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        resourceId: folder.id,
        email: 'invitee@example.com',
        role: PermissionRole.EDITOR,
      })
      .expect(201);

    expect(response.body.id).to.equal(invitation.id);
    expect(response.body.status).to.equal('PENDING');
    expect(response.body.role).to.equal(PermissionRole.EDITOR);
  });

  it('accepts an invitation, upserts the permission role, and syncs status', async () => {
    const owner = await createAuthUser('owner@example.com', 'Owner');
    const invitee = await createAuthUser('invitee@example.com', 'Invitee');
    const folder = await createResource(context.prisma, {
      name: 'Shared Folder',
      ownerId: owner.user.id,
    });
    const existingPermission = await grantPermission(
      context.prisma,
      folder.id,
      invitee.user.id,
      PermissionRole.VIEWER,
    );

    const invitation = await context.prisma.shareInvitation.create({
      data: {
        resourceId: folder.id,
        email: invitee.user.email,
        role: PermissionRole.EDITOR,
        createdByUserId: owner.user.id,
      },
    });

    const response = await request(context.app.getHttpServer())
      .post(`/shares/invitations/${invitation.id}/accept`)
      .set('Authorization', `Bearer ${invitee.token}`)
      .expect(201);

    expect(response.body.status).to.equal('ACCEPTED');

    const updatedPermission =
      await context.prisma.resourcePermission.findUniqueOrThrow({
        where: {
          resourceId_userId: {
            resourceId: folder.id,
            userId: invitee.user.id,
          },
        },
      });

    expect(updatedPermission.id).to.equal(existingPermission.id);
    expect(updatedPermission.role).to.equal(PermissionRole.EDITOR);
  });

  it('rejects accepting invitations for a different email or already accepted invitations', async () => {
    const owner = await createAuthUser('owner@example.com', 'Owner');
    const invitee = await createAuthUser('invitee@example.com', 'Invitee');
    const stranger = await createAuthUser('stranger@example.com', 'Stranger');
    const folder = await createResource(context.prisma, {
      name: 'Shared Folder',
      ownerId: owner.user.id,
    });
    const invitation = await context.prisma.shareInvitation.create({
      data: {
        resourceId: folder.id,
        email: invitee.user.email,
        role: PermissionRole.VIEWER,
        createdByUserId: owner.user.id,
      },
    });

    const mismatched = await request(context.app.getHttpServer())
      .post(`/shares/invitations/${invitation.id}/accept`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .expect(403);

    expect(mismatched.body.message).to.equal(
      'You cannot accept an invitation for another email.',
    );

    await context.prisma.shareInvitation.update({
      where: { id: invitation.id },
      data: { status: 'ACCEPTED' },
    });

    const accepted = await request(context.app.getHttpServer())
      .post(`/shares/invitations/${invitation.id}/accept`)
      .set('Authorization', `Bearer ${invitee.token}`)
      .expect(409);

    expect(accepted.body.message).to.equal(
      'Invitation has already been accepted.',
    );
  });

  it('lists invitations newest-first and supports revoke flow', async () => {
    const owner = await createAuthUser('owner@example.com', 'Owner');
    const folder = await createResource(context.prisma, {
      name: 'Folder',
      ownerId: owner.user.id,
    });
    const older = await context.prisma.shareInvitation.create({
      data: {
        resourceId: folder.id,
        email: 'older@example.com',
        role: PermissionRole.VIEWER,
        createdByUserId: owner.user.id,
      },
    });
    const newer = await context.prisma.shareInvitation.create({
      data: {
        resourceId: folder.id,
        email: 'newer@example.com',
        role: PermissionRole.EDITOR,
        createdByUserId: owner.user.id,
      },
    });

    const listResponse = await request(context.app.getHttpServer())
      .get(`/shares/resource/${folder.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);

    expect(listResponse.body.map((item: { id: string }) => item.id)).to.deep.equal([
      newer.id,
      older.id,
    ]);

    const revokeResponse = await request(context.app.getHttpServer())
      .delete(`/shares/invitations/${newer.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);

    expect(revokeResponse.body.status).to.equal('REVOKED');
  });

  it('serializes accept/revoke so a revoked invitation cannot later become accepted', async () => {
    const owner = await createAuthUser('owner@example.com', 'Owner');
    const invitee = await createAuthUser('invitee@example.com', 'Invitee');
    const folder = await createResource(context.prisma, {
      name: 'Shared Folder',
      ownerId: owner.user.id,
    });
    const invitation = await context.prisma.shareInvitation.create({
      data: {
        resourceId: folder.id,
        email: invitee.user.email,
        role: PermissionRole.EDITOR,
        createdByUserId: owner.user.id,
      },
    });

    const [acceptResponse, revokeResponse] = await Promise.all([
      request(context.app.getHttpServer())
        .post(`/shares/invitations/${invitation.id}/accept`)
        .set('Authorization', `Bearer ${invitee.token}`),
      request(context.app.getHttpServer())
        .delete(`/shares/invitations/${invitation.id}`)
        .set('Authorization', `Bearer ${owner.token}`),
    ]);

    expect([200, 201, 409, 404, 500]).to.include(acceptResponse.status);
    expect([200, 404]).to.include(revokeResponse.status);

    const storedInvitation =
      await context.prisma.shareInvitation.findUniqueOrThrow({
        where: { id: invitation.id },
      });
    const permission = await context.prisma.resourcePermission.findUnique({
      where: {
        resourceId_userId: {
          resourceId: folder.id,
          userId: invitee.user.id,
        },
      },
    });

    if (storedInvitation.status === 'REVOKED') {
      expect(permission).to.equal(null);
    }
  });
});
