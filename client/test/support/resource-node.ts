import type { ResourceNode } from "@/lib/models";

export function makeResourceNode(
  overrides: Partial<ResourceNode> & { id: string; name: string },
): ResourceNode {
  const { id, name, ...rest } = overrides;

  return {
    id,
    name,
    type: "FOLDER",
    ownerId: "owner-1",
    parentId: null,
    visibility: "PRIVATE",
    mimeType: null,
    originalFilename: null,
    fileUrl: null,
    compressedFileUrl: null,
    size: null,
    sortOrder: 0,
    processingStatus: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    effectiveRole: "owner",
    inheritedAccess: false,
    permissionRole: null,
    childCount: 0,
    children: [],
    ...rest,
  };
}
