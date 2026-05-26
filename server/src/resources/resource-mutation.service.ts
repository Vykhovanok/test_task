import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ResourceType, Visibility } from '@prisma/client';
import type { AuthContext } from '../auth/auth.types';
import { ResourceProcessingService } from '../jobs/resource-processing.service';
import { PrismaService } from '../prisma/prisma.service';
import { StoragePathService } from '../storage/storage-path.service';
import { ResourceNotificationService } from '../events/resource-notification.service';
import type { ResourceChangeEvent } from '../events/resource-events.types';
import { ResourceAccessService } from './resource-access.service';
import { ResourceCloneService } from './resource-clone.service';
import { ResourceOrderingService } from './resource-ordering.service';
import { ResourceScopeCacheService } from './resource-scope-cache.service';
import {
  CreateFolderDto,
  MoveResourceDto,
  ReorderResourceDto,
  ResourceTreeNodeDto,
  UpdateResourceDto,
} from './resources.dto';
import {
  mapDescriptorToDto,
} from './resources.utils';
import {
  RESOURCE_WITH_PERMISSIONS_INCLUDE,
  type ResourceWithPermissions,
} from './resources.types';

@Injectable()
export class ResourceMutationService {
  private readonly logger = new Logger(ResourceMutationService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly resourceAccessService: ResourceAccessService,
    private readonly resourceCloneService: ResourceCloneService,
    private readonly resourceOrderingService: ResourceOrderingService,
    private readonly resourceProcessingService: ResourceProcessingService,
    private readonly storagePathService: StoragePathService,
    private readonly resourceNotificationService: ResourceNotificationService,
    private readonly resourceScopeCacheService: ResourceScopeCacheService,
  ) {}

  async createFolder(
    payload: CreateFolderDto,
    authContext: AuthContext,
  ): Promise<ResourceTreeNodeDto> {
    return this.resourceAccessService.handleSerializationFailure(() =>
      this.prismaService.$transaction(
        async (transaction) => {
          let parent: ResourceWithPermissions | null = null;

          if (payload.parentId) {
            const parentDescriptor =
              await this.resourceAccessService.assertEditableResource(
                authContext.userId,
                payload.parentId,
                transaction,
              );
            parent = parentDescriptor.resource;

            if (parent.type !== ResourceType.FOLDER) {
              throw new ForbiddenException(
                'Folders can only be created inside another folder.',
              );
            }
          }

          await this.resourceOrderingService.lockParentScopes(
            [parent?.id ?? null],
            transaction,
          );
          const sortOrder =
            await this.resourceOrderingService.allocateNextSortOrder(
              parent?.id ?? null,
              transaction,
            );

          const createdFolder = await transaction.resource.create({
            data: {
              name: payload.name.trim(),
              type: ResourceType.FOLDER,
              ownerId: authContext.userId,
              parentId: parent?.id ?? null,
              visibility: Visibility.PRIVATE,
              sortOrder,
            },
            ...RESOURCE_WITH_PERMISSIONS_INCLUDE,
          });

          const dto = mapDescriptorToDto({
            resource: createdFolder,
            effectiveRole: 'owner',
            inheritedAccess: false,
            permissionRole: null,
          });

          await this.publishChange(authContext.userId, {
            action: 'created',
            resourceId: createdFolder.id,
            parentId: createdFolder.parentId,
            affectedParentIds: [createdFolder.parentId],
          });

          return dto;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async updateResource(
    resourceId: string,
    payload: UpdateResourceDto,
    authContext: AuthContext,
  ): Promise<ResourceTreeNodeDto> {
    if (!payload.name && !payload.visibility) {
      throw new BadRequestException(
        'At least one editable field must be provided for this resource.',
      );
    }

    if (payload.visibility) {
      await this.resourceAccessService.assertOwnedResource(
        authContext.userId,
        resourceId,
      );
    }

    return this.resourceAccessService.handleSerializationFailure(() =>
      this.prismaService.$transaction(
        async (transaction) => {
          const descriptor =
            await this.resourceAccessService.assertEditableResource(
              authContext.userId,
              resourceId,
              transaction,
            );

          if (payload.visibility) {
            await this.resourceAccessService.assertOwnedResource(
              authContext.userId,
              resourceId,
              transaction,
            );
          }

          const updatedResource = await transaction.resource.update({
            where: { id: resourceId },
            data: {
              ...(payload.name ? { name: payload.name.trim() } : {}),
              ...(payload.visibility ? { visibility: payload.visibility } : {}),
            },
            ...RESOURCE_WITH_PERMISSIONS_INCLUDE,
          });

          const dto = mapDescriptorToDto({
            resource: updatedResource,
            effectiveRole: descriptor.effectiveRole,
            inheritedAccess: descriptor.inheritedAccess,
            permissionRole: descriptor.permissionRole,
          });

          await this.publishChange(authContext.userId, {
            action: 'updated',
            resourceId: updatedResource.id,
            parentId: updatedResource.parentId,
            affectedParentIds: [updatedResource.parentId],
          });

          return dto;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async reorderResource(
    resourceId: string,
    payload: ReorderResourceDto,
    authContext: AuthContext,
  ): Promise<ResourceTreeNodeDto> {
    return this.resourceAccessService.handleSerializationFailure(() =>
      this.prismaService.$transaction(
        async (transaction) => {
          const descriptor =
            await this.resourceAccessService.assertEditableResource(
              authContext.userId,
              resourceId,
              transaction,
            );
          await this.resourceOrderingService.lockParentScopes(
            [descriptor.resource.parentId],
            transaction,
          );
          const siblings = await this.resourceAccessService.getChildrenForParent(
            descriptor.resource.parentId,
            transaction,
          );

          await this.resourceAccessService.assertSiblingsEditable(
            authContext.userId,
            siblings,
            descriptor.resource.parentId,
            transaction,
          );

          const currentIndex = siblings.findIndex(
            (resource) => resource.id === resourceId,
          );

          if (currentIndex === -1) {
            throw new NotFoundException('Resource was not found.');
          }

          if (payload.targetIndex >= siblings.length) {
            throw new ForbiddenException(
              'Target index is out of bounds for this folder.',
            );
          }

          const reordered = [...siblings];
          const [moved] = reordered.splice(currentIndex, 1);

          if (!moved) {
            throw new NotFoundException('Resource was not found.');
          }

          reordered.splice(payload.targetIndex, 0, moved);

          await Promise.all(
            reordered.map((resource, index) =>
              transaction.resource.update({
                where: { id: resource.id },
                data: { sortOrder: index },
              }),
            ),
          );

          const updatedResource = await transaction.resource.findUniqueOrThrow({
            where: { id: resourceId },
            ...RESOURCE_WITH_PERMISSIONS_INCLUDE,
          });

          const dto = mapDescriptorToDto({
            resource: updatedResource,
            effectiveRole: descriptor.effectiveRole,
            inheritedAccess: descriptor.inheritedAccess,
            permissionRole: descriptor.permissionRole,
          });

          await this.publishChange(authContext.userId, {
            action: 'reordered',
            resourceId: updatedResource.id,
            parentId: updatedResource.parentId,
            affectedParentIds: [updatedResource.parentId],
          });

          return dto;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async moveResource(
    resourceId: string,
    payload: MoveResourceDto,
    authContext: AuthContext,
  ): Promise<ResourceTreeNodeDto> {
    return this.resourceAccessService.handleSerializationFailure(() =>
      this.prismaService.$transaction(
        async (transaction) => {
          const sourceDescriptor =
            await this.resourceAccessService.assertEditableResource(
              authContext.userId,
              resourceId,
              transaction,
            );
          const sourceParentId = sourceDescriptor.resource.parentId;

          await this.resourceOrderingService.lockParentScopes(
            [sourceParentId, payload.parentId ?? null],
            transaction,
          );
          await this.resourceAccessService.assertMoveSafety(
            resourceId,
            payload.parentId ?? null,
            transaction,
          );

          let destinationParent: ResourceWithPermissions | null = null;

          if (payload.parentId) {
            const parentDescriptor =
              await this.resourceAccessService.assertEditableResource(
                authContext.userId,
                payload.parentId,
                transaction,
              );
            destinationParent = parentDescriptor.resource;

            if (destinationParent.type !== ResourceType.FOLDER) {
              throw new ForbiddenException(
                'Resources can only be moved into folders.',
              );
            }
          }

          const nextSortOrder =
            await this.resourceOrderingService.allocateNextSortOrder(
              destinationParent?.id ?? null,
              transaction,
            );

          const movedResource = await transaction.resource.update({
            where: { id: resourceId },
            data: {
              parentId: destinationParent?.id ?? null,
              sortOrder: nextSortOrder,
            },
            ...RESOURCE_WITH_PERMISSIONS_INCLUDE,
          });

          await this.resourceOrderingService.normalizeSiblingOrder(
            sourceParentId,
            transaction,
          );

          const movedDescriptor =
            await this.resourceAccessService.getDescriptorForResource(
              authContext.userId,
              resourceId,
              transaction,
            );

          if (!movedDescriptor) {
            throw new NotFoundException('Resource was not found.');
          }

          const dto = mapDescriptorToDto({
            resource: movedResource,
            effectiveRole: movedDescriptor.effectiveRole,
            inheritedAccess: movedDescriptor.inheritedAccess,
            permissionRole: movedDescriptor.permissionRole,
          });

          await this.publishChange(authContext.userId, {
            action: 'moved',
            resourceId: movedResource.id,
            parentId: movedResource.parentId,
            affectedParentIds: [sourceParentId, movedResource.parentId],
          });

          return dto;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async cloneResource(
    resourceId: string,
    authContext: AuthContext,
  ): Promise<ResourceTreeNodeDto> {
    const clonedRoot = await this.resourceCloneService.cloneResource(
      resourceId,
      authContext.userId,
    );

    const dto = mapDescriptorToDto({
      resource: clonedRoot,
      effectiveRole: 'owner',
      inheritedAccess: false,
      permissionRole: null,
    });

    await this.publishChange(authContext.userId, {
      action: 'created',
      resourceId: clonedRoot.id,
      parentId: clonedRoot.parentId,
      affectedParentIds: [clonedRoot.parentId],
    });

    return dto;
  }

  async deleteResource(
    resourceId: string,
    authContext: AuthContext,
  ): Promise<{ success: true }> {
    const ownedDescriptor =
      await this.resourceAccessService.assertOwnedResource(
        authContext.userId,
        resourceId,
      );
    const deletedParentId = ownedDescriptor.resource.parentId;

    await this.resourceAccessService.handleSerializationFailure(async () => {
      await this.prismaService.$transaction(
        async (transaction) => {
          await this.resourceAccessService.assertOwnedResource(
            authContext.userId,
            resourceId,
            transaction,
          );
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    });

    const resources =
      await this.resourceAccessService.getSubtreeResources(resourceId);
    const originalPaths = new Set(
      resources
        .filter((resource) => resource.type === ResourceType.FILE)
        .map((resource) => resource.storagePath)
        .filter((value): value is string => Boolean(value)),
    );
    const compressedPaths = new Set(
      resources
        .filter((resource) => resource.type === ResourceType.FILE)
        .map((resource) => resource.compressedPath)
        .filter((value): value is string => Boolean(value)),
    );

    await Promise.all(
      resources.map((resource) =>
        this.resourceProcessingService.cleanupCompressionJob(resource.id).catch(
          (cleanupError) => {
            this.logger.warn(
              `Failed to clean up compression job for resource ${resource.id} during delete; continuing.`,
              cleanupError,
            );
          },
        ),
      ),
    );

    await this.prismaService.resource.delete({
      where: { id: resourceId },
    });

    await Promise.all([
      ...Array.from(originalPaths).map((storagePath) =>
        this.storagePathService
          .deleteFileIfExists(
            this.storagePathService.resolveOriginalAbsolutePath(storagePath),
          )
          .catch((cleanupError) => {
            this.logger.warn(
              `Failed to delete original file ${storagePath} during resource delete; continuing.`,
              cleanupError,
            );
          }),
      ),
      ...Array.from(compressedPaths).map((compressedPath) =>
        this.storagePathService
          .deleteFileIfExists(
            this.storagePathService.resolveCompressedAbsolutePath(
              compressedPath,
            ),
          )
          .catch((cleanupError) => {
            this.logger.warn(
              `Failed to delete compressed file ${compressedPath} during resource delete; continuing.`,
              cleanupError,
            );
          }),
      ),
    ]);

    await this.publishChange(authContext.userId, {
      action: 'deleted',
      resourceId,
      parentId: deletedParentId,
      affectedParentIds: [deletedParentId],
    });

    return { success: true };
  }

  private async publishChange(
    actorUserId: string,
    event: ResourceChangeEvent,
  ): Promise<void> {
    await this.resourceScopeCacheService.invalidate(actorUserId);
    await this.resourceNotificationService.notifyChange(actorUserId, event);
  }
}
