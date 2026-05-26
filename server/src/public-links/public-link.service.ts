import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ResourceType } from '@prisma/client';
import type { Response } from 'express';
import type { AuthContext } from '../auth/auth.types';
import {
  generateOpaqueToken,
  hashOpaqueToken,
} from '../common/crypto/token-hash.util';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { ResourceAccessService } from '../resources/resource-access.service';
import { ResourceFileService } from '../resources/resource-file.service';
import type { ResourceAccessDescriptor } from '../resources/resources.types';
import {
  buildPublicLinkResourceUrls,
  mapPublicTreeNodeToDto,
  ResourceTreeBuilder,
} from '../resources/resources.utils';
import type {
  PublicLinkResourceNodeDto,
  PublicLinkResponseDto,
} from './public-links.dto';

@Injectable()
export class PublicLinkService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly resourceAccessService: ResourceAccessService,
    private readonly resourceFileService: ResourceFileService,
    private readonly appConfigService: AppConfigService,
  ) {}

  async createPublicLink(
    resourceId: string,
    authContext: AuthContext,
  ): Promise<PublicLinkResponseDto> {
    const plainToken = generateOpaqueToken();
    const tokenHash = hashOpaqueToken(plainToken);
    const expiresAt = new Date(Date.now() + this.appConfigService.publicLinkTtlMs);

    const created = await this.prismaService.$transaction(
      async (transaction) => {
        await this.resourceAccessService.assertOwnedResource(
          authContext.userId,
          resourceId,
          transaction,
        );

        await transaction.publicLink.updateMany({
          where: {
            resourceId,
            isActive: true,
          },
          data: {
            isActive: false,
          },
        });

        return transaction.publicLink.create({
          data: {
            resourceId,
            tokenHash,
            expiresAt,
            createdByUserId: authContext.userId,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return this.mapPublicLinkResponse(created, plainToken);
  }

  async getActivePublicLink(
    resourceId: string,
    authContext: AuthContext,
  ): Promise<PublicLinkResponseDto | null> {
    await this.resourceAccessService.assertOwnedResource(
      authContext.userId,
      resourceId,
    );

    const active = await this.prismaService.publicLink.findFirst({
      where: {
        resourceId,
        isActive: true,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!active) {
      return null;
    }

    return this.mapPublicLinkResponse(active, null);
  }

  async resolvePublicLink(token: string): Promise<PublicLinkResourceNodeDto> {
    const publicLink = await this.findActivePublicLinkByToken(token);

    const resources = await this.resourceAccessService.getSubtreeResources(
      publicLink.resourceId,
    );
    const accessMap = new Map<string, ResourceAccessDescriptor>();

    for (const resource of resources) {
      accessMap.set(resource.id, {
        resource,
        effectiveRole: 'viewer',
        inheritedAccess: resource.id !== publicLink.resourceId,
        permissionRole: null,
      });
    }

    const tree = ResourceTreeBuilder.build(accessMap, (resourceId) =>
      buildPublicLinkResourceUrls(token, resourceId),
    );
    const root = tree.find((node) => node.id === publicLink.resourceId);

    if (!root) {
      throw new NotFoundException('Resource was not found.');
    }

    return mapPublicTreeNodeToDto(root, token) as PublicLinkResourceNodeDto;
  }

  async streamPublicFile(
    token: string,
    resourceId: string,
    compressed: boolean,
    res: Response,
  ): Promise<void> {
    const resource = await this.resolvePublicFileResource(
      token,
      resourceId,
      compressed,
    );

    await this.resourceFileService.streamResourceFile(resource, compressed, res);
  }

  async revokePublicLink(
    publicLinkId: string,
    authContext: AuthContext,
  ): Promise<PublicLinkResponseDto> {
    const revoked = await this.prismaService.$transaction(
      async (transaction) => {
        const publicLink = await transaction.publicLink.findUnique({
          where: { id: publicLinkId },
        });

        if (!publicLink) {
          throw new NotFoundException('Public link was not found.');
        }

        await this.resourceAccessService.assertOwnedResource(
          authContext.userId,
          publicLink.resourceId,
          transaction,
        );

        return transaction.publicLink.update({
          where: { id: publicLink.id },
          data: { isActive: false },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return this.mapPublicLinkResponse(revoked, null);
  }

  private async resolvePublicFileResource(
    token: string,
    resourceId: string,
    compressed: boolean,
  ) {
    const publicLink = await this.findActivePublicLinkByToken(token);

    const descendantIds = await this.resourceAccessService.getDescendantIds(
      publicLink.resourceId,
    );

    if (
      resourceId !== publicLink.resourceId &&
      !descendantIds.has(resourceId)
    ) {
      throw new ForbiddenException(
        'The requested file is outside the shared public resource scope.',
      );
    }

    const resource = await this.prismaService.resource.findUnique({
      where: { id: resourceId },
    });

    if (!resource || resource.type !== ResourceType.FILE) {
      throw new NotFoundException('File not found.');
    }

    if (compressed && !resource.compressedPath) {
      throw new NotFoundException('Compressed file not found.');
    }

    if (!compressed && !resource.storagePath) {
      throw new NotFoundException('File not found.');
    }

    return resource;
  }

  private async findActivePublicLinkByToken(token: string) {
    const tokenHash = hashOpaqueToken(token);
    const publicLink = await this.prismaService.publicLink.findUnique({
      where: { tokenHash },
    });

    if (!publicLink || !publicLink.isActive || publicLink.expiresAt <= new Date()) {
      throw new NotFoundException('Public link was not found.');
    }

    return publicLink;
  }

  private mapPublicLinkResponse(
    publicLink: {
      id: string;
      resourceId: string;
      isActive: boolean;
      expiresAt: Date;
      createdByUserId: string;
      createdAt: Date;
    },
    plainToken: string | null,
  ): PublicLinkResponseDto {
    return {
      id: publicLink.id,
      resourceId: publicLink.resourceId,
      token: plainToken,
      isActive: publicLink.isActive,
      expiresAt: publicLink.expiresAt,
      createdByUserId: publicLink.createdByUserId,
      createdAt: publicLink.createdAt,
    };
  }
}
