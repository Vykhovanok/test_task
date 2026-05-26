export type ProcessingStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED";

export type ResourceType = "FILE" | "FOLDER";
export type Visibility = "PRIVATE" | "PUBLIC";
export type EffectiveRole = "owner" | "editor" | "viewer" | null;
export type PermissionRole = "VIEWER" | "EDITOR";

export type FlattenedResourceMap = Record<string, ResourceEntity>;

export type ResourceEntity = {
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
  processingStatus: ProcessingStatus | null;
  createdAt: string;
  updatedAt: string;
  effectiveRole: EffectiveRole;
  inheritedAccess: boolean;
  permissionRole: PermissionRole | null;
  childCount: number;
};

export type ResourceNode = ResourceEntity & {
  children: ResourceNode[];
};

export type ResourcePage = {
  items: ResourceEntity[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type FolderPathItem = {
  id: string;
  name: string;
};

export type ShareInvitation = {
  id: string;
  resourceId: string;
  email: string;
  role: PermissionRole;
  status: "PENDING" | "ACCEPTED" | "REVOKED";
  createdByUserId: string;
  createdAt: string;
};

export type PublicLink = {
  id: string;
  resourceId: string;
  token: string | null;
  isActive: boolean;
  expiresAt: string;
  createdByUserId: string;
  createdAt: string;
};

export type AuthUser = {
  id: string;
  email: string;
  name: string;
};

export type AuthResponse = {
  accessToken: string;
  tokenType: string;
  user: AuthUser;
};

export type ResourceChangeEvent = {
  action: string;
  resourceId: string;
  parentId: string | null;
  affectedParentIds: Array<string | null>;
};
