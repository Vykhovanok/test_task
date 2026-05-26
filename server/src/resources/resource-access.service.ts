import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ResourcePermissionEvaluator } from '../permissions/permissions.utils';
import { PrismaService } from '../prisma/prisma.service';
import {
  RESOURCE_WITH_PERMISSIONS_INCLUDE,
  type ResourceAccessDescriptor,
  type ResourceWithPermissions,
} from './resources.types';

type PrismaDbClient = PrismaService | Prisma.TransactionClient;

type ResourceIdRow = {
  id: string;
};

@Injectable()
export class ResourceAccessService {
  constructor(private readonly prismaService: PrismaService) {}

  async getTreeAccessMap(
    userId: string,
    db: PrismaDbClient = this.prismaService,
  ): Promise<Map<string, ResourceAccessDescriptor>> {
    const resourceIds = await this.getScopedResourceIdsForUser(userId, db);
    const resources = await this.getResourcesByIds(resourceIds, db);

    return ResourcePermissionEvaluator.buildAccessMap(resources, userId);
  }

  async getScopedResourcesForUser(
    userId: string,
    db: PrismaDbClient = this.prismaService,
  ): Promise<ResourceWithPermissions[]> {
    const resourceIds = await this.getScopedResourceIdsForUser(userId, db);

    return this.getResourcesByIds(resourceIds, db);
  }

  async getDescriptorForResource(
    userId: string,
    resourceId: string,
    db: PrismaDbClient = this.prismaService,
  ): Promise<ResourceAccessDescriptor | null> {
    const lineageIds = await this.getLineageIds(resourceId, db);

    if (lineageIds.length === 0) {
      return null;
    }

    const resources = await this.getResourcesByIds(lineageIds, db);
    const accessMap = ResourcePermissionEvaluator.buildAccessMap(
      resources,
      userId,
    );

    return accessMap.get(resourceId) ?? null;
  }

  async assertReadableResource(
    userId: string,
    resourceId: string,
    db: PrismaDbClient = this.prismaService,
  ): Promise<ResourceAccessDescriptor> {
    return this.assertResourceRole(userId, resourceId, 'read', db);
  }

  async assertEditableResource(
    userId: string,
    resourceId: string,
    db: PrismaDbClient = this.prismaService,
  ): Promise<ResourceAccessDescriptor> {
    return this.assertResourceRole(userId, resourceId, 'edit', db);
  }

  async assertOwnedResource(
    userId: string,
    resourceId: string,
    db: PrismaDbClient = this.prismaService,
  ): Promise<ResourceAccessDescriptor> {
    const descriptor = await this.assertResourceRole(
      userId,
      resourceId,
      'read',
      db,
    );

    if (descriptor.effectiveRole !== 'owner') {
      throw new ForbiddenException(
        'Only the resource owner can perform this operation.',
      );
    }

    return descriptor;
  }

  async getChildrenForParent(
    parentId: string | null,
    db: PrismaDbClient = this.prismaService,
  ): Promise<ResourceWithPermissions[]> {
    return db.resource.findMany({
      where: { parentId },
      ...RESOURCE_WITH_PERMISSIONS_INCLUDE,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async getDescendantIds(
    resourceId: string,
    db: PrismaDbClient = this.prismaService,
  ): Promise<Set<string>> {
    const rows = await db.$queryRaw<ResourceIdRow[]>(Prisma.sql`
      WITH RECURSIVE subtree AS (
        SELECT id
        FROM "Resource"
        WHERE id = CAST(${resourceId} AS UUID)

        UNION

        SELECT child.id
        FROM "Resource" child
        INNER JOIN subtree ON child."parentId" = subtree.id
      )
      SELECT id
      FROM subtree
    `);

    return new Set(rows.map((row) => row.id));
  }

  async assertMoveSafety(
    resourceId: string,
    destinationParentId: string | null,
    db: PrismaDbClient,
  ): Promise<void> {
    if (!destinationParentId) {
      return;
    }

    if (resourceId === destinationParentId) {
      throw new ForbiddenException('A resource cannot be moved into itself.');
    }

    const subtreeIds = await this.getDescendantIds(resourceId, db);

    if (subtreeIds.has(destinationParentId)) {
      throw new ForbiddenException(
        'A resource cannot be moved into one of its descendants.',
      );
    }
  }

  async lockResources(
    resourceIds: string[],
    db: PrismaDbClient,
  ): Promise<void> {
    if (resourceIds.length === 0) {
      return;
    }

    const values = Prisma.join(
      resourceIds.map(
        (resourceId) => Prisma.sql`CAST(${resourceId} AS UUID)`,
      ),
    );

    await db.$queryRaw(Prisma.sql`
      SELECT id
      FROM "Resource"
      WHERE id IN (${values})
      FOR UPDATE
    `);
  }

  async assertSiblingsEditable(
    userId: string,
    siblings: ResourceWithPermissions[],
    parentId: string | null,
    db: PrismaDbClient = this.prismaService,
  ): Promise<void> {
    const parentLineageIds = parentId
      ? await this.getLineageIds(parentId, db)
      : [];
    const resources = await this.getResourcesByIds(
      Array.from(
        new Set([
          ...parentLineageIds,
          ...siblings.map((resource) => resource.id),
        ]),
      ),
      db,
    );
    const accessMap = ResourcePermissionEvaluator.buildAccessMap(
      resources,
      userId,
    );

    if (parentId) {
      const parentDescriptor = accessMap.get(parentId) ?? null;

      if (
        !parentDescriptor ||
        !ResourcePermissionEvaluator.canEdit(parentDescriptor.effectiveRole)
      ) {
        throw new ForbiddenException(
          'You do not have permission to modify this folder ordering.',
        );
      }
    }

    const hiddenSibling = siblings.find((resource) => {
      const descriptor = accessMap.get(resource.id) ?? null;

      return (
        !descriptor ||
        !ResourcePermissionEvaluator.canEdit(descriptor.effectiveRole)
      );
    });

    if (hiddenSibling) {
      throw new ForbiddenException(
        'You do not have permission to reorder all resources in this container.',
      );
    }
  }

  async getResourcesByIds(
    resourceIds: string[],
    db: PrismaDbClient = this.prismaService,
  ): Promise<ResourceWithPermissions[]> {
    if (resourceIds.length === 0) {
      return [];
    }

    return db.resource.findMany({
      where: {
        id: {
          in: resourceIds,
        },
      },
      ...RESOURCE_WITH_PERMISSIONS_INCLUDE,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async getUnionLineageIds(
    resourceIds: string[],
    db: PrismaDbClient = this.prismaService,
  ): Promise<string[]> {
    if (resourceIds.length === 0) {
      return [];
    }

    const values = Prisma.join(
      resourceIds.map((resourceId) => Prisma.sql`CAST(${resourceId} AS UUID)`),
    );
    const rows = await db.$queryRaw<ResourceIdRow[]>(Prisma.sql`
      WITH RECURSIVE seeds AS (
        SELECT id, "parentId"
        FROM "Resource"
        WHERE id IN (${values})
      ),
      lineage AS (
        SELECT id, "parentId"
        FROM seeds

        UNION

        SELECT parent.id, parent."parentId"
        FROM "Resource" parent
        INNER JOIN lineage ON lineage."parentId" = parent.id
      )
      SELECT DISTINCT id
      FROM lineage
    `);

    return rows.map((row) => row.id);
  }

  async getLineageIds(
    resourceId: string,
    db: PrismaDbClient = this.prismaService,
  ): Promise<string[]> {
    const rows = await db.$queryRaw<ResourceIdRow[]>(Prisma.sql`
      WITH RECURSIVE lineage AS (
        SELECT id, "parentId"
        FROM "Resource"
        WHERE id = CAST(${resourceId} AS UUID)

        UNION

        SELECT parent.id, parent."parentId"
        FROM "Resource" parent
        INNER JOIN lineage ON lineage."parentId" = parent.id
      )
      SELECT id
      FROM lineage
    `);

    return rows.map((row) => row.id);
  }

  async getSubtreeResources(
    resourceId: string,
    db: PrismaDbClient = this.prismaService,
  ): Promise<ResourceWithPermissions[]> {
    const descendantIds = await this.getDescendantIds(resourceId, db);

    return this.getResourcesByIds(Array.from(descendantIds), db);
  }

  async handleSerializationFailure<T>(
    operation: () => Promise<T>,
    maxAttempts = 3,
  ): Promise<T> {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        const isSerializationFailure =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034';

        if (isSerializationFailure && attempt < maxAttempts - 1) {
          continue;
        }

        if (isSerializationFailure) {
          throw new ConflictException(
            'The resource tree changed concurrently. Retry the request.',
          );
        }

        throw error;
      }
    }

    throw new ConflictException(
      'The resource tree changed concurrently. Retry the request.',
    );
  }

  private async assertResourceRole(
    userId: string,
    resourceId: string,
    requiredRole: 'read' | 'edit',
    db: PrismaDbClient,
  ): Promise<ResourceAccessDescriptor> {
    const descriptor = await this.getDescriptorForResource(
      userId,
      resourceId,
      db,
    );

    if (!descriptor) {
      throw new NotFoundException('Resource was not found.');
    }

    const allowed =
      requiredRole === 'read'
        ? ResourcePermissionEvaluator.canRead(descriptor.effectiveRole)
        : ResourcePermissionEvaluator.canEdit(descriptor.effectiveRole);

    if (!allowed) {
      throw new ForbiddenException(
        requiredRole === 'read'
          ? 'You do not have permission to access this resource.'
          : 'You do not have permission to modify this resource.',
      );
    }

    return descriptor;
  }

  async getScopedResourceIdsForUser(
    userId: string,
    db: PrismaDbClient = this.prismaService,
  ): Promise<string[]> {
    const rows = await db.$queryRaw<ResourceIdRow[]>(Prisma.sql`
      WITH RECURSIVE direct_access AS (
        SELECT r.id, r."parentId"
        FROM "Resource" r
        WHERE r."ownerId" = CAST(${userId} AS UUID)
          OR EXISTS (
            SELECT 1
            FROM "ResourcePermission" rp
            WHERE rp."resourceId" = r.id
              AND rp."userId" = CAST(${userId} AS UUID)
          )
      ),
      ancestor_scope AS (
        SELECT id, "parentId"
        FROM direct_access

        UNION

        SELECT parent.id, parent."parentId"
        FROM "Resource" parent
        INNER JOIN ancestor_scope scope ON scope."parentId" = parent.id
      ),
      descendant_scope AS (
        SELECT id
        FROM direct_access

        UNION

        SELECT child.id
        FROM "Resource" child
        INNER JOIN descendant_scope scope ON child."parentId" = scope.id
      )
      SELECT DISTINCT id
      FROM (
        SELECT id FROM ancestor_scope
        UNION
        SELECT id FROM descendant_scope
      ) scoped
    `);

    return rows.map((row) => row.id);
  }
}
