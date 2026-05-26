import {
  PermissionRole,
  Resource,
  ResourcePermission,
  ResourceType,
  Visibility,
} from '@prisma/client';

export const RESOURCE_WITH_PERMISSIONS_INCLUDE = {
  include: { permissions: true },
} as const;

export type EffectiveRole = 'owner' | 'editor' | 'viewer' | null;

export const DEFAULT_EFFECTIVE_ROLE: Exclude<EffectiveRole, null> = 'viewer';

export type ResourceWithPermissions = Resource & {
  permissions: ResourcePermission[];
};

export type ResourceTreeNode = {
  id: string;
  name: string;
  type: ResourceType;
  ownerId: string;
  parentId: string | null;
  visibility: Visibility;
  mimeType: string | null;
  originalFilename: string | null;
  fileUrl: string | null;
  compressedFileUrl: string | null;
  size: number | null;
  sortOrder: number;
  processingStatus: import('@prisma/client').ProcessingStatus | null;
  createdAt: Date;
  updatedAt: Date;
  effectiveRole: Exclude<EffectiveRole, null>;
  inheritedAccess: boolean;
  permissionRole: PermissionRole | null;
  children: ResourceTreeNode[];
};

export type ResourceAccessDescriptor = {
  resource: ResourceWithPermissions;
  effectiveRole: EffectiveRole;
  inheritedAccess: boolean;
  permissionRole: PermissionRole | null;
};
