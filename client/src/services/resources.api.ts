import type { FolderPathItem, ResourceEntity, ResourcePage } from "@/lib/models";
import { apiClient } from "./api";

export type CreateFolderPayload = {
  name: string;
  parentId: string | null;
};

export type RenameResourcePayload = {
  resourceId: string;
  name: string;
};

export type UploadImagePayload = {
  file: File;
  parentId: string | null;
};

export type ReorderResourcePayload = {
  resourceId: string;
  targetIndex: number;
};

export type MoveResourcePayload = {
  resourceId: string;
  parentId: string | null;
};

export type UpdateVisibilityPayload = {
  resourceId: string;
  visibility: "PRIVATE" | "PUBLIC";
};

export class ResourcesApi {
  static async listChildren(
    parentId: string | null,
    cursor?: string | null,
    limit = 100,
  ): Promise<ResourcePage> {
    const response = await apiClient.get<ResourcePage>("/resources/children", {
      params: {
        parentId: parentId ?? undefined,
        cursor: cursor ?? undefined,
        limit,
      },
    });

    return response.data;
  }

  static async listShared(cursor?: string | null, limit = 100): Promise<ResourcePage> {
    const response = await apiClient.get<ResourcePage>("/resources/shared", {
      params: {
        cursor: cursor ?? undefined,
        limit,
      },
    });

    return response.data;
  }

  static async listFolders(
    excludeSubtreeOf?: string,
    cursor?: string | null,
    limit = 200,
  ): Promise<ResourcePage> {
    const response = await apiClient.get<ResourcePage>("/resources/folders", {
      params: {
        excludeSubtreeOf,
        cursor: cursor ?? undefined,
        limit,
      },
    });

    return response.data;
  }

  static async getFolderPath(folderId: string): Promise<FolderPathItem[]> {
    const response = await apiClient.get<FolderPathItem[]>(
      `/resources/path/${folderId}`,
    );

    return response.data;
  }

  static async searchResources(
    query: string,
    cursor?: string | null,
    limit = 50,
  ): Promise<ResourcePage> {
    const response = await apiClient.get<ResourcePage>("/resources/search", {
      params: {
        query,
        cursor: cursor ?? undefined,
        limit,
      },
    });

    return response.data;
  }

  static async createFolder(payload: CreateFolderPayload): Promise<ResourceEntity> {
    const response = await apiClient.post<ResourceEntity>("/resources/folders", {
      name: payload.name,
      parentId: payload.parentId,
    });

    return response.data;
  }

  static async renameResource(
    payload: RenameResourcePayload,
  ): Promise<ResourceEntity> {
    const response = await apiClient.patch<ResourceEntity>(
      `/resources/${payload.resourceId}`,
      {
        name: payload.name,
      },
    );

    return response.data;
  }

  static async updateVisibility(
    payload: UpdateVisibilityPayload,
  ): Promise<ResourceEntity> {
    const response = await apiClient.patch<ResourceEntity>(
      `/resources/${payload.resourceId}`,
      {
        visibility: payload.visibility,
      },
    );

    return response.data;
  }

  static async deleteResource(resourceId: string): Promise<void> {
    await apiClient.delete(`/resources/${resourceId}`);
  }

  static async cloneResource(resourceId: string): Promise<ResourceEntity> {
    const response = await apiClient.post<ResourceEntity>(
      `/resources/${resourceId}/clone`,
    );

    return response.data;
  }

  static async reorderResource(
    payload: ReorderResourcePayload,
  ): Promise<ResourceEntity> {
    const response = await apiClient.patch<ResourceEntity>(
      `/resources/${payload.resourceId}/reorder`,
      {
        targetIndex: payload.targetIndex,
      },
    );

    return response.data;
  }

  static async moveResource(payload: MoveResourcePayload): Promise<ResourceEntity> {
    const response = await apiClient.patch<ResourceEntity>(
      `/resources/${payload.resourceId}/move`,
      {
        parentId: payload.parentId,
      },
    );

    return response.data;
  }

  static async uploadImage(payload: UploadImagePayload): Promise<ResourceEntity> {
    const formData = new FormData();

    if (payload.parentId) {
      formData.append("parentId", payload.parentId);
    }

    formData.append("file", payload.file);

    const response = await apiClient.post<ResourceEntity>("/uploads/image", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });

    return response.data;
  }

  static async uploadVideo(payload: UploadImagePayload): Promise<ResourceEntity> {
    const formData = new FormData();

    if (payload.parentId) {
      formData.append("parentId", payload.parentId);
    }

    formData.append("file", payload.file);

    const response = await apiClient.post<ResourceEntity>("/uploads/video", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });

    return response.data;
  }
}
