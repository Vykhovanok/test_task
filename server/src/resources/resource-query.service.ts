import { Injectable } from '@nestjs/common';
import { Prisma, ResourceType } from '@prisma/client';
import type { AuthContext } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { ResourcePermissionEvaluator } from '../permissions/permissions.utils';
import { ResourceAccessService } from './resource-access.service';
import {
  FolderPathItemDto,
  ListChildrenQueryDto,
  ListFoldersQueryDto,
  ResourceEntityDto,
  ResourcePageDto,
  SearchResourcesDto,
} from './resources.dto';
import { ResourceScopeCacheService } from './resource-scope-cache.service';
import {
  decodePageCursor,
  encodePageCursor,
  mapDescriptorToEntityDto,
  resolveVisibleParentId,
} from './resources.utils';
import type { ResourceAccessDescriptor } from './resources.types';

const DEFAULT_CHILDREN_LIMIT = 100;
const DEFAULT_SEARCH_LIMIT = 50;
const DEFAULT_FOLDER_LIMIT = 200;

@Injectable()
export class ResourceQueryService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly resourceAccessService: ResourceAccessService,
    private readonly resourceScopeCacheService: ResourceScopeCacheService,
  ) {}

  async listChildren(
    authContext: AuthContext,
    query: ListChildrenQueryDto,
  ): Promise<ResourcePageDto> {
    const parentId = query.parentId ?? null;
    const limit = query.limit ?? DEFAULT_CHILDREN_LIMIT;

    if (parentId) {
      await this.resourceAccessService.assertReadableResource(
        authContext.userId,
        parentId,
      );
    }

    const scopedIds = await this.getCachedScopedResourceIds(authContext.userId);
    const scopedSet = new Set(scopedIds);
    const siblings = await this.resourceAccessService.getChildrenForParent(
      parentId,
    );
    const accessibleSiblings = siblings.filter((resource) =>
      scopedSet.has(resource.id),
    );

    const sorted = accessibleSiblings.sort((left, right) => {
      if (left.sortOrder === right.sortOrder) {
        return left.createdAt.getTime() - right.createdAt.getTime();
      }

      return left.sortOrder - right.sortOrder;
    });

    const cursorState = query.cursor ? decodePageCursor(query.cursor) : null;
    const startIndex = cursorState
      ? sorted.findIndex(
          (resource) =>
            resource.sortOrder > cursorState.sortOrder ||
            (resource.sortOrder === cursorState.sortOrder &&
              resource.id > cursorState.id),
        )
      : 0;
    const sliceStart = startIndex === -1 ? sorted.length : startIndex;
    const pageSlice = sorted.slice(sliceStart, sliceStart + limit + 1);
    const hasMore = pageSlice.length > limit;
    const pageResources = hasMore ? pageSlice.slice(0, limit) : pageSlice;

    const { accessMap } = await this.buildDescriptorsForResources(
      authContext.userId,
      pageResources,
    );
    const childCounts = await this.countScopedChildrenForParents(
      scopedIds,
      pageResources.map((resource) => resource.id),
    );

    const items = pageResources
      .map((resource) => accessMap.get(resource.id))
      .filter((descriptor): descriptor is ResourceAccessDescriptor =>
        Boolean(descriptor),
      )
      .map((descriptor) =>
        mapDescriptorToEntityDto(
          descriptor,
          resolveVisibleParentId(descriptor, accessMap),
          childCounts.get(descriptor.resource.id) ?? 0,
        ),
      );

    const lastItem = pageResources.at(-1);

    return {
      items,
      hasMore,
      nextCursor:
        hasMore && lastItem
          ? encodePageCursor(lastItem.sortOrder, lastItem.id)
          : null,
    };
  }

  async searchResources(
    authContext: AuthContext,
    query: SearchResourcesDto,
  ): Promise<ResourcePageDto> {
    const normalizedQuery = query.query.trim();
    const limit = query.limit ?? DEFAULT_SEARCH_LIMIT;
    const scopedIds = await this.getCachedScopedResourceIds(authContext.userId);

    if (scopedIds.length === 0 || normalizedQuery.length === 0) {
      return { items: [], hasMore: false, nextCursor: null };
    }

    const cursor = query.cursor ? { id: query.cursor } : undefined;
    const rows = await this.prismaService.resource.findMany({
      where: {
        id: { in: scopedIds },
        name: {
          contains: normalizedQuery,
          mode: 'insensitive',
        },
      },
      include: { permissions: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      ...(cursor
        ? {
            cursor,
            skip: 1,
          }
        : {}),
    });

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const descriptors = await this.buildDescriptorsForResources(
      authContext.userId,
      pageRows,
    );

    const items = pageRows.map((resource) => {
      const descriptor = descriptors.accessMap.get(resource.id);

      if (!descriptor) {
        return mapDescriptorToEntityDto(
          {
            resource,
            effectiveRole: 'viewer',
            inheritedAccess: false,
            permissionRole: null,
          },
          null,
          0,
        );
      }

      return mapDescriptorToEntityDto(
        descriptor,
        resolveVisibleParentId(descriptor, descriptors.accessMap),
        0,
      );
    });

    const lastItem = pageRows.at(-1);

    return {
      items,
      hasMore,
      nextCursor: hasMore && lastItem ? lastItem.id : null,
    };
  }

  async listSharedResources(
    authContext: AuthContext,
    query: ListChildrenQueryDto,
  ): Promise<ResourcePageDto> {
    const limit = query.limit ?? DEFAULT_CHILDREN_LIMIT;
    const scopedIds = await this.getCachedScopedResourceIds(authContext.userId);
    const scopedSet = new Set(scopedIds);

    if (scopedSet.size === 0) {
      return { items: [], hasMore: false, nextCursor: null };
    }

    const resources = await this.resourceAccessService.getResourcesByIds(
      scopedIds,
    );
    const accessMap = ResourcePermissionEvaluator.buildAccessMap(
      resources,
      authContext.userId,
    );

    const shared = resources
      .filter((resource) => {
        const descriptor = accessMap.get(resource.id);
        return (
          descriptor?.effectiveRole &&
          descriptor.effectiveRole !== 'owner'
        );
      })
      .sort((left, right) => left.name.localeCompare(right.name));

    const cursorId = query.cursor ?? null;
    const startIndex = cursorId
      ? shared.findIndex((resource) => resource.id > cursorId)
      : 0;
    const sliceStart = startIndex === -1 ? shared.length : startIndex;
    const pageSlice = shared.slice(sliceStart, sliceStart + limit + 1);
    const hasMore = pageSlice.length > limit;
    const pageRows = hasMore ? pageSlice.slice(0, limit) : pageSlice;

    const items = pageRows
      .map((resource) => accessMap.get(resource.id))
      .filter((descriptor): descriptor is ResourceAccessDescriptor => Boolean(descriptor))
      .map((descriptor) => mapDescriptorToEntityDto(descriptor, descriptor.resource.parentId, 0));

    const lastItem = pageRows.at(-1);

    return {
      items,
      hasMore,
      nextCursor: hasMore && lastItem ? lastItem.id : null,
    };
  }

  async listFolderPicker(
    authContext: AuthContext,
    query: ListFoldersQueryDto,
  ): Promise<ResourcePageDto> {
    const limit = query.limit ?? DEFAULT_FOLDER_LIMIT;
    const scopedIds = await this.getCachedScopedResourceIds(authContext.userId);
    const scopedSet = new Set(scopedIds);
    const excludedIds = query.excludeSubtreeOf
      ? await this.resourceAccessService.getDescendantIds(query.excludeSubtreeOf)
      : new Set<string>();

    const resources = await this.resourceAccessService.getResourcesByIds(
      scopedIds,
    );
    const folders = resources
      .filter(
        (resource) =>
          resource.type === ResourceType.FOLDER &&
          scopedSet.has(resource.id) &&
          !excludedIds.has(resource.id),
      )
      .sort((left, right) => left.name.localeCompare(right.name));

    const cursorId = query.cursor ?? null;
    const startIndex = cursorId
      ? folders.findIndex((resource) => resource.id > cursorId)
      : 0;
    const sliceStart = startIndex === -1 ? folders.length : startIndex;
    const pageSlice = folders.slice(sliceStart, sliceStart + limit + 1);
    const hasMore = pageSlice.length > limit;
    const pageRows = hasMore ? pageSlice.slice(0, limit) : pageSlice;
    const accessMap = ResourcePermissionEvaluator.buildAccessMap(
      resources,
      authContext.userId,
    );

    const items = pageRows
      .map((resource) => accessMap.get(resource.id))
      .filter((descriptor): descriptor is ResourceAccessDescriptor => Boolean(descriptor))
      .map((descriptor) =>
        mapDescriptorToEntityDto(descriptor, descriptor.resource.parentId, 0),
      );

    const lastItem = pageRows.at(-1);

    return {
      items,
      hasMore,
      nextCursor: hasMore && lastItem ? lastItem.id : null,
    };
  }

  async getFolderPath(
    authContext: AuthContext,
    folderId: string,
  ): Promise<FolderPathItemDto[]> {
    await this.resourceAccessService.assertReadableResource(
      authContext.userId,
      folderId,
    );

    const lineageIds = await this.resourceAccessService.getLineageIds(folderId);
    const resources = await this.resourceAccessService.getResourcesByIds(
      lineageIds,
    );
    const resourcesById = new Map(resources.map((resource) => [resource.id, resource]));

    return lineageIds
      .map((id) => resourcesById.get(id))
      .filter((resource): resource is NonNullable<typeof resource> => Boolean(resource))
      .map((resource) => ({
        id: resource.id,
        name: resource.name,
      }));
  }

  private async getCachedScopedResourceIds(userId: string): Promise<string[]> {
    const cached = await this.resourceScopeCacheService.get(userId);

    if (cached) {
      return cached;
    }

    const scopedIds =
      await this.resourceAccessService.getScopedResourceIdsForUser(userId);
    await this.resourceScopeCacheService.set(userId, scopedIds);

    return scopedIds;
  }

  private async buildDescriptorsForResources(
    userId: string,
    resources: Array<{ id: string }>,
  ): Promise<{ accessMap: Map<string, ResourceAccessDescriptor> }> {
    if (resources.length === 0) {
      return { accessMap: new Map() };
    }

    const lineageIds = await this.resourceAccessService.getUnionLineageIds(
      resources.map((resource) => resource.id),
    );
    const evaluationResources =
      await this.resourceAccessService.getResourcesByIds(lineageIds);
    const accessMap = ResourcePermissionEvaluator.buildAccessMap(
      evaluationResources,
      userId,
    );

    return { accessMap };
  }

  private async countScopedChildrenForParents(
    scopedIds: string[],
    parentIds: string[],
  ): Promise<Map<string, number>> {
    if (parentIds.length === 0 || scopedIds.length === 0) {
      return new Map();
    }

    const grouped = await this.prismaService.resource.groupBy({
      by: ['parentId'],
      where: {
        parentId: { in: parentIds },
        id: { in: scopedIds },
      },
      _count: {
        _all: true,
      },
    });

    const counts = new Map<string, number>();

    for (const entry of grouped) {
      if (entry.parentId) {
        counts.set(entry.parentId, entry._count._all);
      }
    }

    return counts;
  }
}
