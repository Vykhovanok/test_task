import { PermissionRole } from '@prisma/client';
import {
  EffectiveRole,
  ResourceAccessDescriptor,
  ResourceWithPermissions,
} from '../resources/resources.types';

export class ResourcePermissionEvaluator {
  static buildAccessMap(
    resources: ResourceWithPermissions[],
    userId: string,
  ): Map<string, ResourceAccessDescriptor> {
    const resourcesById = new Map(
      resources.map((resource) => [resource.id, resource]),
    );
    const cache = new Map<string, ResourceAccessDescriptor>();
    const visiting = new Set<string>();

    const resolveAccess = (
      resource: ResourceWithPermissions,
    ): ResourceAccessDescriptor => {
      const cached = cache.get(resource.id);

      if (cached) {
        return cached;
      }

      if (visiting.has(resource.id)) {
        const fallbackRole = this.getDirectRole(resource, userId);

        return {
          resource,
          effectiveRole: fallbackRole,
          inheritedAccess: false,
          permissionRole: this.getPermissionRole(resource, userId),
        };
      }

      visiting.add(resource.id);

      const parentDescriptor = resource.parentId
        ? this.resolveParentAccess(
            resource.parentId,
            resourcesById,
            resolveAccess,
          )
        : null;
      const directRole = this.getDirectRole(resource, userId);
      const inheritedRole = parentDescriptor?.effectiveRole ?? null;
      const effectiveRole = this.pickHigherRole(directRole, inheritedRole);

      const descriptor: ResourceAccessDescriptor = {
        resource,
        effectiveRole,
        inheritedAccess:
          effectiveRole !== null &&
          directRole !== effectiveRole &&
          inheritedRole === effectiveRole,
        permissionRole: this.getPermissionRole(resource, userId),
      };

      visiting.delete(resource.id);
      cache.set(resource.id, descriptor);

      return descriptor;
    };

    for (const resource of resources) {
      resolveAccess(resource);
    }

    return cache;
  }

  static canRead(role: EffectiveRole): boolean {
    return role !== null;
  }

  static canEdit(role: EffectiveRole): boolean {
    return role === 'owner' || role === 'editor';
  }

  private static resolveParentAccess(
    parentId: string,
    resourcesById: Map<string, ResourceWithPermissions>,
    resolveAccess: (
      resource: ResourceWithPermissions,
    ) => ResourceAccessDescriptor,
  ): ResourceAccessDescriptor | null {
    const parent = resourcesById.get(parentId);

    return parent ? resolveAccess(parent) : null;
  }

  private static getDirectRole(
    resource: ResourceWithPermissions,
    userId: string,
  ): EffectiveRole {
    if (resource.ownerId === userId) {
      return 'owner';
    }

    const permissionRole = this.getPermissionRole(resource, userId);

    if (permissionRole === PermissionRole.EDITOR) {
      return 'editor';
    }

    if (permissionRole === PermissionRole.VIEWER) {
      return 'viewer';
    }

    return null;
  }

  private static getPermissionRole(
    resource: ResourceWithPermissions,
    userId: string,
  ): PermissionRole | null {
    const permission = resource.permissions.find(
      (permissionEntry) => permissionEntry.userId === userId,
    );

    return permission?.role ?? null;
  }

  private static pickHigherRole(
    left: EffectiveRole,
    right: EffectiveRole,
  ): EffectiveRole {
    if (this.getRoleWeight(left) >= this.getRoleWeight(right)) {
      return left;
    }

    return right;
  }

  private static getRoleWeight(role: EffectiveRole): number {
    switch (role) {
      case 'owner':
        return 3;
      case 'editor':
        return 2;
      case 'viewer':
        return 1;
      default:
        return 0;
    }
  }
}
