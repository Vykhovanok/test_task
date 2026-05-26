import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProcessingStatus, ResourceType } from '@prisma/client';
import * as path from 'path';
import {
  CompressionJobData,
} from '../jobs/jobs.queue';
import { ResourceProcessingService } from '../jobs/resource-processing.service';
import { PrismaService } from '../prisma/prisma.service';
import { StoragePathService } from '../storage/storage-path.service';
import { ResourceAccessService } from './resource-access.service';
import { ResourceOrderingService } from './resource-ordering.service';
import { ResourceTreeBuilder } from './resources.utils';
import {
  RESOURCE_WITH_PERMISSIONS_INCLUDE,
  type ResourceWithPermissions,
} from './resources.types';

type ClonedBinaryPaths = {
  storagePath: string | null;
  compressedPath: string | null;
};

@Injectable()
export class ResourceCloneService {
  private readonly logger = new Logger(ResourceCloneService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly resourceAccessService: ResourceAccessService,
    private readonly resourceOrderingService: ResourceOrderingService,
    private readonly resourceProcessingService: ResourceProcessingService,
    private readonly storagePathService: StoragePathService,
  ) {}

  async cloneResource(
    resourceId: string,
    userId: string,
  ): Promise<ResourceWithPermissions> {
    await this.resourceAccessService.assertOwnedResource(userId, resourceId);

    const resources =
      await this.resourceAccessService.getSubtreeResources(resourceId);
    const resourcesById = new Map(
      resources.map((resource) => [resource.id, resource]),
    );
    const sourceResource = resourcesById.get(resourceId);

    if (!sourceResource) {
      throw new NotFoundException('Resource was not found.');
    }

    const childrenByParentId = ResourceTreeBuilder.buildChildrenMap(resources);
    const cloneDrafts = ResourceTreeBuilder.buildCloneDrafts(
      sourceResource,
      resourcesById,
      childrenByParentId,
      userId,
    );
    const plannedBinaryPathsBySourceId = this.planClonedBinaryPaths(resources);

    const { clonedRoot, createdCloneResourcesBySourceId } =
      await this.executeCloneTransaction({
        resourceId,
        cloneDrafts,
        destinationParentId: sourceResource.parentId,
        plannedBinaryPathsBySourceId,
      });

    const copiedAbsolutePaths: string[] = [];

    try {
      await this.replicateBinaries({
        resources,
        plannedBinaryPathsBySourceId,
        createdCloneResourcesBySourceId,
        copiedAbsolutePaths,
      });
    } catch (primaryError) {
      await this.rollback(clonedRoot.id, copiedAbsolutePaths, primaryError);
      throw primaryError;
    }

    return clonedRoot;
  }

  private planClonedBinaryPaths(
    resources: ResourceWithPermissions[],
  ): Map<string, ClonedBinaryPaths> {
    const map = new Map<string, ClonedBinaryPaths>();

    for (const resource of resources) {
      if (resource.type !== ResourceType.FILE) {
        continue;
      }

      map.set(resource.id, {
        storagePath: resource.storagePath
          ? this.storagePathService.buildStoredImagePath(
              this.storagePathService.createManagedFilename(
                path.extname(resource.storagePath),
              ),
            )
          : null,
        compressedPath: resource.compressedPath
          ? this.storagePathService.buildCompressedImagePath(
              this.storagePathService.createManagedFilename(
                path.extname(resource.compressedPath),
              ),
            )
          : null,
      });
    }

    return map;
  }

  private async executeCloneTransaction(params: {
    resourceId: string;
    cloneDrafts: ReturnType<typeof ResourceTreeBuilder.buildCloneDrafts>;
    destinationParentId: string | null;
    plannedBinaryPathsBySourceId: Map<string, ClonedBinaryPaths>;
  }): Promise<{
    clonedRoot: ResourceWithPermissions;
    createdCloneResourcesBySourceId: Map<string, ResourceWithPermissions>;
  }> {
    const {
      resourceId,
      cloneDrafts,
      destinationParentId,
      plannedBinaryPathsBySourceId,
    } = params;

    const createdCloneResourcesBySourceId = new Map<
      string,
      ResourceWithPermissions
    >();

    const clonedRoot = await this.prismaService.$transaction(
      async (transaction) => {
        await this.resourceOrderingService.lockParentScopes(
          [destinationParentId],
          transaction,
        );
        const destinationSiblings =
          await this.resourceAccessService.getChildrenForParent(
            destinationParentId,
            transaction,
          );
        const sourceToCloneIdMap = new Map<string, string>();
        let cloneRootId: string | null = null;
        let sortOrderCursor =
          ResourceTreeBuilder.getNextSortOrder(destinationSiblings);

        for (const draft of cloneDrafts) {
          const resolvedParentId =
            draft.sourceId === resourceId
              ? draft.parentId
              : (sourceToCloneIdMap.get(draft.parentSourceId ?? '') ?? null);
          const plannedBinaryPaths = plannedBinaryPathsBySourceId.get(
            draft.sourceId,
          );

          const createdResource = await transaction.resource.create({
            data: {
              name: draft.name,
              type: draft.type,
              ownerId: draft.ownerId,
              parentId: resolvedParentId,
              visibility: draft.visibility,
              mimeType: draft.mimeType,
              originalFilename: draft.originalFilename,
              storagePath:
                plannedBinaryPaths?.storagePath ?? draft.storagePath,
              compressedPath:
                plannedBinaryPaths?.compressedPath ?? draft.compressedPath,
              size: draft.size,
              processingStatus: this.resolveProcessingStatus(
                draft.type,
                plannedBinaryPaths,
                draft.processingStatus,
              ),
              sortOrder:
                draft.sourceId === resourceId
                  ? sortOrderCursor++
                  : draft.sortOrder,
            },
            ...RESOURCE_WITH_PERMISSIONS_INCLUDE,
          });

          sourceToCloneIdMap.set(draft.sourceId, createdResource.id);
          createdCloneResourcesBySourceId.set(draft.sourceId, createdResource);

          if (draft.sourceId === resourceId) {
            cloneRootId = createdResource.id;
          }
        }

        if (!cloneRootId) {
          throw new InternalServerErrorException('Resource clone failed.');
        }

        return transaction.resource.findUniqueOrThrow({
          where: { id: cloneRootId },
          ...RESOURCE_WITH_PERMISSIONS_INCLUDE,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return { clonedRoot, createdCloneResourcesBySourceId };
  }

  private resolveProcessingStatus(
    type: ResourceType,
    plannedBinaryPaths: ClonedBinaryPaths | undefined,
    draftProcessingStatus: ProcessingStatus | null,
  ): ProcessingStatus | undefined {
    if (type !== ResourceType.FILE) {
      return draftProcessingStatus ?? undefined;
    }

    return plannedBinaryPaths?.compressedPath
      ? ProcessingStatus.COMPLETED
      : ProcessingStatus.PENDING;
  }

  private async replicateBinaries(params: {
    resources: ResourceWithPermissions[];
    plannedBinaryPathsBySourceId: Map<string, ClonedBinaryPaths>;
    createdCloneResourcesBySourceId: Map<string, ResourceWithPermissions>;
    copiedAbsolutePaths: string[];
  }): Promise<void> {
    const {
      resources,
      plannedBinaryPathsBySourceId,
      createdCloneResourcesBySourceId,
      copiedAbsolutePaths,
    } = params;
    const pendingCompressionJobs: CompressionJobData[] = [];

    for (const resource of resources) {
      if (resource.type !== ResourceType.FILE) {
        continue;
      }

      const targetPaths = plannedBinaryPathsBySourceId.get(resource.id);

      if (!targetPaths) {
        continue;
      }

      if (resource.storagePath && targetPaths.storagePath) {
        const targetAbsolutePath =
          this.storagePathService.resolveOriginalAbsolutePath(
            targetPaths.storagePath,
          );

        await this.storagePathService.copyFile(
          this.storagePathService.resolveOriginalAbsolutePath(
            resource.storagePath,
          ),
          targetAbsolutePath,
        );
        copiedAbsolutePaths.push(targetAbsolutePath);
      }

      if (resource.compressedPath && targetPaths.compressedPath) {
        const targetAbsolutePath =
          this.storagePathService.resolveCompressedAbsolutePath(
            targetPaths.compressedPath,
          );

        await this.storagePathService.copyFile(
          this.storagePathService.resolveCompressedAbsolutePath(
            resource.compressedPath,
          ),
          targetAbsolutePath,
        );
        copiedAbsolutePaths.push(targetAbsolutePath);
      }

      if (
        targetPaths.storagePath &&
        !targetPaths.compressedPath &&
        resource.mimeType
      ) {
        const clonedFile = createdCloneResourcesBySourceId.get(resource.id);

        if (!clonedFile) {
          throw new InternalServerErrorException(
            'Cloned file resource was not found.',
          );
        }

        pendingCompressionJobs.push({
          resourceId: clonedFile.id,
          storagePath: targetPaths.storagePath,
          stagedPath: targetPaths.storagePath,
          mimeType: resource.mimeType,
        });
      }
    }

    for (const jobData of pendingCompressionJobs) {
      await this.resourceProcessingService.enqueueCompression(jobData);
    }
  }

  private async rollback(
    clonedRootId: string,
    copiedAbsolutePaths: string[],
    primaryError: unknown,
  ): Promise<void> {
    try {
      await this.prismaService.resource.delete({
        where: { id: clonedRootId },
      });
    } catch (cleanupError) {
      this.logger.error(
        `Failed to roll back cloned resource record ${clonedRootId} after primary failure.`,
        { cleanupError, primaryError },
      );
    }

    await Promise.all(
      copiedAbsolutePaths.map(async (absolutePath) => {
        try {
          await this.storagePathService.deleteFileIfExists(absolutePath);
        } catch (cleanupError) {
          this.logger.error(
            `Failed to delete cloned file ${absolutePath} during rollback.`,
            { cleanupError, primaryError },
          );
        }
      }),
    );
  }
}
