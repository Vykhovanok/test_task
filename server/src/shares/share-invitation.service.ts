import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type ShareInvitation } from '@prisma/client';
import type { AuthContext } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { ResourceAccessService } from '../resources/resource-access.service';
import { CreateShareInvitationDto } from './shares.dto';

@Injectable()
export class ShareInvitationService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly resourceAccessService: ResourceAccessService,
  ) {}

  async createInvitation(
    payload: CreateShareInvitationDto,
    authContext: AuthContext,
  ): Promise<ShareInvitation> {
    const normalizedEmail = payload.email.toLowerCase();

    if (normalizedEmail === authContext.email.toLowerCase()) {
      throw new BadRequestException('You cannot share a resource with yourself.');
    }

    return this.prismaService.$transaction(
      async (transaction) => {
        await this.resourceAccessService.assertOwnedResource(
          authContext.userId,
          payload.resourceId,
          transaction,
        );

        const existingRows = await transaction.$queryRaw<ShareInvitation[]>(
          Prisma.sql`
            SELECT *
            FROM "ShareInvitation"
            WHERE "resourceId" = CAST(${payload.resourceId} AS UUID)
              AND email = ${normalizedEmail}
            FOR UPDATE
          `,
        );
        const existing = existingRows[0] ?? null;

        if (existing && existing.status !== 'REVOKED') {
          throw new ConflictException(
            'An active invitation already exists for this email.',
          );
        }

        return transaction.shareInvitation.upsert({
          where: {
            resourceId_email: {
              resourceId: payload.resourceId,
              email: normalizedEmail,
            },
          },
          update: {
            role: payload.role,
            status: 'PENDING',
            createdByUserId: authContext.userId,
          },
          create: {
            resourceId: payload.resourceId,
            email: normalizedEmail,
            role: payload.role,
            createdByUserId: authContext.userId,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async listInvitations(
    resourceId: string,
    authContext: AuthContext,
  ): Promise<ShareInvitation[]> {
    await this.resourceAccessService.assertOwnedResource(
      authContext.userId,
      resourceId,
    );

    return this.prismaService.shareInvitation.findMany({
      where: { resourceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async acceptInvitation(
    invitationId: string,
    authContext: AuthContext,
  ): Promise<ShareInvitation> {
    return this.prismaService.$transaction(
      async (transaction) => {
        const invitation = await this.lockInvitationById(invitationId, transaction);

        if (!invitation || invitation.status === 'REVOKED') {
          throw new NotFoundException('Invitation was not found.');
        }

        if (invitation.status === 'ACCEPTED') {
          throw new ConflictException('Invitation has already been accepted.');
        }

        if (invitation.email !== authContext.email.toLowerCase()) {
          throw new ForbiddenException(
            'You cannot accept an invitation for another email.',
          );
        }

        await transaction.resourcePermission.upsert({
          where: {
            resourceId_userId: {
              resourceId: invitation.resourceId,
              userId: authContext.userId,
            },
          },
          update: {
            role: invitation.role,
            shareInvitationId: invitation.id,
          },
          create: {
            resourceId: invitation.resourceId,
            userId: authContext.userId,
            role: invitation.role,
            shareInvitationId: invitation.id,
          },
        });

        return transaction.shareInvitation.update({
          where: { id: invitation.id },
          data: { status: 'ACCEPTED' },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async revokeInvitation(
    invitationId: string,
    authContext: AuthContext,
  ): Promise<ShareInvitation> {
    return this.prismaService.$transaction(
      async (transaction) => {
        const invitation = await this.lockInvitationById(invitationId, transaction);

        if (!invitation) {
          throw new NotFoundException('Invitation was not found.');
        }

        await this.resourceAccessService.assertOwnedResource(
          authContext.userId,
          invitation.resourceId,
          transaction,
        );

        if (invitation.status === 'REVOKED') {
          return invitation;
        }

        const matchingUser = await transaction.user.findUnique({
          where: { email: invitation.email },
        });

        if (matchingUser) {
          await transaction.resourcePermission.deleteMany({
            where: {
              resourceId: invitation.resourceId,
              userId: matchingUser.id,
              shareInvitationId: invitation.id,
            },
          });
        }

        return transaction.shareInvitation.update({
          where: { id: invitation.id },
          data: { status: 'REVOKED' },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async lockInvitationById(
    invitationId: string,
    transaction: Prisma.TransactionClient,
  ): Promise<ShareInvitation | null> {
    const rows = await transaction.$queryRaw<ShareInvitation[]>(Prisma.sql`
      SELECT *
      FROM "ShareInvitation"
      WHERE id = CAST(${invitationId} AS UUID)
      FOR UPDATE
    `);

    return rows[0] ?? null;
  }
}
