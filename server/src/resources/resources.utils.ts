import { NotFoundException } from '@nestjs/common';
import { ResourceType } from '@prisma/client';
import * as fs from 'fs/promises';
import type { Response } from 'express';
import { ResourceEntityDto, ResourceTreeNodeDto } from './resources.dto';
import {
  DEFAULT_EFFECTIVE_ROLE,
  ResourceAccessDescriptor,
  ResourceTreeNode,
  ResourceWithPermissions,
} from './resources.types';

type CloneDraft = {
  sourceId: string;
  parentSourceId: string | null;
  name: string;
  type: ResourceType;
  ownerId: string;
  parentId: string | null;
  visibility: 'PRIVATE' | 'PUBLIC';
  mimeType: string | null;
  originalFilename: string | null;
  storagePath: string | null;
  compressedPath: string | null;
  size: number | null;
  processingStatus: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | null;
  sortOrder: number;
};

type ResourceUrlSet = {
  fileUrl: string | null;
  compressedFileUrl: string | null;
};

export function buildAuthenticatedResourceUrls(
  resourceId: string,
): ResourceUrlSet {
  return {
    fileUrl: `/resources/${resourceId}/file`,
    compressedFileUrl: `/resources/${resourceId}/file/compressed`,
  };
}

export function buildPublicLinkResourceUrls(
  token: string,
  resourceId: string,
): ResourceUrlSet {
  return {
    fileUrl: `/public-links/${token}/resources/${resourceId}/file`,
    compressedFileUrl: `/public-links/${token}/resources/${resourceId}/file/compressed`,
  };
}

export function mapDescriptorToEntityDto(
  descriptor: ResourceAccessDescriptor,
  visibleParentId: string | null = descriptor.resource.parentId,
  childCount = 0,
): ResourceEntityDto {
  const urls = buildAuthenticatedResourceUrls(descriptor.resource.id);

  return {
    id: descriptor.resource.id,
    name: descriptor.resource.name,
    type: descriptor.resource.type,
    ownerId: descriptor.resource.ownerId,
    parentId: visibleParentId,
    visibility: descriptor.resource.visibility,
    mimeType: descriptor.resource.mimeType,
    originalFilename: descriptor.resource.originalFilename,
    fileUrl:
      descriptor.resource.type === ResourceType.FILE ? urls.fileUrl : null,
    compressedFileUrl:
      descriptor.resource.type === ResourceType.FILE
        ? urls.compressedFileUrl
        : null,
    size: descriptor.resource.size,
    sortOrder: descriptor.resource.sortOrder,
    processingStatus: descriptor.resource.processingStatus,
    createdAt: descriptor.resource.createdAt,
    updatedAt: descriptor.resource.updatedAt,
    effectiveRole: descriptor.effectiveRole ?? 'viewer',
    inheritedAccess: descriptor.inheritedAccess,
    permissionRole: descriptor.permissionRole,
    childCount,
  };
}

export function mapDescriptorToDto(
  descriptor: ResourceAccessDescriptor,
  visibleParentId: string | null = descriptor.resource.parentId,
): ResourceTreeNodeDto {
  const urls = buildAuthenticatedResourceUrls(descriptor.resource.id);

  return {
    id: descriptor.resource.id,
    name: descriptor.resource.name,
    type: descriptor.resource.type,
    ownerId: descriptor.resource.ownerId,
    parentId: visibleParentId,
    visibility: descriptor.resource.visibility,
    mimeType: descriptor.resource.mimeType,
    originalFilename: descriptor.resource.originalFilename,
    fileUrl:
      descriptor.resource.type === ResourceType.FILE ? urls.fileUrl : null,
    compressedFileUrl:
      descriptor.resource.type === ResourceType.FILE
        ? urls.compressedFileUrl
        : null,
    size: descriptor.resource.size,
    sortOrder: descriptor.resource.sortOrder,
    processingStatus: descriptor.resource.processingStatus,
    createdAt: descriptor.resource.createdAt,
    updatedAt: descriptor.resource.updatedAt,
    effectiveRole: descriptor.effectiveRole ?? 'viewer',
    inheritedAccess: descriptor.inheritedAccess,
    permissionRole: descriptor.permissionRole,
    children: [],
  };
}

export function encodePageCursor(sortOrder: number, id: string): string {
  return `${sortOrder}:${id}`;
}

export function decodePageCursor(cursor: string): { sortOrder: number; id: string } | null {
  const separatorIndex = cursor.indexOf(':');

  if (separatorIndex <= 0) {
    return null;
  }

  const sortOrder = Number(cursor.slice(0, separatorIndex));
  const id = cursor.slice(separatorIndex + 1);

  if (!Number.isFinite(sortOrder) || !id) {
    return null;
  }

  return { sortOrder, id };
}

export function resolveVisibleParentId(
  descriptor: ResourceAccessDescriptor,
  accessMap: Map<string, ResourceAccessDescriptor>,
): string | null {
  if (!descriptor.resource.parentId) {
    return null;
  }

  const parentDescriptor = accessMap.get(descriptor.resource.parentId);

  if (!parentDescriptor || parentDescriptor.effectiveRole === null) {
    return null;
  }

  return descriptor.resource.parentId;
}

export function mapPublicTreeNodeToDto(
  node: ResourceTreeNode,
  token: string,
): ResourceTreeNodeDto {
  const urls = buildPublicLinkResourceUrls(token, node.id);

  return {
    id: node.id,
    name: node.name,
    type: node.type,
    ownerId: node.ownerId,
    parentId: node.parentId,
    visibility: node.visibility,
    mimeType: node.mimeType,
    originalFilename: node.originalFilename,
    fileUrl: node.type === ResourceType.FILE ? urls.fileUrl : null,
    compressedFileUrl:
      node.type === ResourceType.FILE ? urls.compressedFileUrl : null,
    size: node.size,
    sortOrder: node.sortOrder,
    processingStatus: node.processingStatus,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    effectiveRole: 'viewer',
    inheritedAccess: node.inheritedAccess,
    permissionRole: null,
    children: node.children.map((child) => mapPublicTreeNodeToDto(child, token)),
  };
}

export async function serveFileAtPath(
  absolutePath: string,
  res: Response,
  notFoundMessage = 'File not found.',
): Promise<void> {
  try {
    await fs.access(absolutePath);
  } catch {
    throw new NotFoundException(notFoundMessage);
  }

  res.sendFile(absolutePath);
}

export class ResourceTreeBuilder {
  static build(
    accessMap: Map<string, ResourceAccessDescriptor>,
    buildUrls: (
      resourceId: string,
    ) => ResourceUrlSet = buildAuthenticatedResourceUrls,
  ): ResourceTreeNode[] {
    const accessibleDescriptors = Array.from(accessMap.values())
      .filter((descriptor) => descriptor.effectiveRole !== null)
      .sort((left, right) => {
        if (left.resource.sortOrder === right.resource.sortOrder) {
          return (
            left.resource.createdAt.getTime() -
            right.resource.createdAt.getTime()
          );
        }

        return left.resource.sortOrder - right.resource.sortOrder;
      });

    const nodesById = new Map<string, ResourceTreeNode>();
    const roots: ResourceTreeNode[] = [];

    for (const descriptor of accessibleDescriptors) {
      nodesById.set(
        descriptor.resource.id,
        this.createNode(descriptor, buildUrls(descriptor.resource.id)),
      );
    }

    for (const descriptor of accessibleDescriptors) {
      const node = nodesById.get(descriptor.resource.id);

      if (!node) {
        continue;
      }

      const parentNode = descriptor.resource.parentId
        ? nodesById.get(descriptor.resource.parentId)
        : null;

      if (parentNode) {
        parentNode.children.push(node);
      } else {
        roots.push({ ...node, parentId: null });
      }
    }

    return roots;
  }

  static buildCloneDrafts(
    source: ResourceWithPermissions,
    resourcesById: Map<string, ResourceWithPermissions>,
    childrenByParentId: Map<string | null, ResourceWithPermissions[]>,
    ownerId: string,
  ): CloneDraft[] {
    const drafts: CloneDraft[] = [];

    const visit = (
      current: ResourceWithPermissions,
      parentSourceId: string | null,
      parentId: string | null,
      cloneRoot: boolean,
      visited: Set<string>,
    ) => {
      if (visited.has(current.id)) {
        return;
      }

      visited.add(current.id);

      drafts.push({
        sourceId: current.id,
        parentSourceId,
        name: cloneRoot ? `${current.name} Copy` : current.name,
        type: current.type,
        ownerId,
        parentId,
        visibility: current.visibility,
        mimeType: current.mimeType,
        originalFilename: current.originalFilename,
        storagePath: current.storagePath,
        compressedPath: current.compressedPath,
        size: current.size,
        processingStatus: current.processingStatus,
        sortOrder: current.sortOrder,
      });

      const children = childrenByParentId.get(current.id) ?? [];

      for (const child of children) {
        const fullChild = resourcesById.get(child.id);

        if (!fullChild) {
          continue;
        }

        visit(fullChild, current.id, null, false, visited);
      }
    };

    visit(source, source.parentId, source.parentId, true, new Set());

    return drafts;
  }

  static buildChildrenMap(
    resources: ResourceWithPermissions[],
  ): Map<string | null, ResourceWithPermissions[]> {
    const map = new Map<string | null, ResourceWithPermissions[]>();

    for (const resource of resources) {
      const siblings = map.get(resource.parentId) ?? [];

      siblings.push(resource);
      map.set(resource.parentId, siblings);
    }

    for (const entry of map.values()) {
      entry.sort((left, right) => left.sortOrder - right.sortOrder);
    }

    return map;
  }

  static getNextSortOrder(
    siblings: ResourceWithPermissions[] | undefined,
  ): number {
    if (!siblings || siblings.length === 0) {
      return 0;
    }

    return Math.max(...siblings.map((resource) => resource.sortOrder)) + 1;
  }

  private static createNode(
    descriptor: ResourceAccessDescriptor,
    urls: ResourceUrlSet,
  ): ResourceTreeNode {
    return {
      id: descriptor.resource.id,
      name: descriptor.resource.name,
      type: descriptor.resource.type,
      ownerId: descriptor.resource.ownerId,
      parentId: descriptor.resource.parentId,
      visibility: descriptor.resource.visibility,
      mimeType: descriptor.resource.mimeType,
      originalFilename: descriptor.resource.originalFilename,
      fileUrl:
        descriptor.resource.type === ResourceType.FILE ? urls.fileUrl : null,
      compressedFileUrl:
        descriptor.resource.type === ResourceType.FILE
          ? urls.compressedFileUrl
          : null,
      size: descriptor.resource.size,
      sortOrder: descriptor.resource.sortOrder,
      processingStatus: descriptor.resource.processingStatus,
      createdAt: descriptor.resource.createdAt,
      updatedAt: descriptor.resource.updatedAt,
      effectiveRole: descriptor.effectiveRole ?? DEFAULT_EFFECTIVE_ROLE,
      inheritedAccess: descriptor.inheritedAccess,
      permissionRole: descriptor.permissionRole,
      children: [],
    };
  }
}
