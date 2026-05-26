import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiErrorFormatter } from "@/services/api";
import { ResourcesApi } from "@/services/resources.api";
import type {
  CreateFolderPayload,
  MoveResourcePayload,
  RenameResourcePayload,
  ReorderResourcePayload,
  UpdateVisibilityPayload,
  UploadImagePayload,
} from "@/services/resources.api";
import type { ResourceEntity } from "@/lib/models";
import { queryKeys, resourceMutationKey } from "@/lib/queryKeys";
import { useResourceEntitiesStore } from "@/stores/resource-entities.store";

function normalizeEntity(entity: ResourceEntity): ResourceEntity {
  return {
    ...entity,
    childCount: entity.childCount ?? 0,
  };
}

function invalidateParents(
  queryClient: ReturnType<typeof useQueryClient>,
  parentIds: Array<string | null>,
): void {
  const uniqueParentIds = new Set(parentIds);

  for (const parentId of uniqueParentIds) {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.resources.children(parentId),
    });
  }

  void queryClient.invalidateQueries({
    queryKey: queryKeys.resources.shared,
  });
  void queryClient.invalidateQueries({
    queryKey: ["resources", "search"],
  });
  void queryClient.invalidateQueries({
    queryKey: ["resources", "folders"],
  });
}

export function useResourceMutations() {
  const queryClient = useQueryClient();
  const upsertEntities = useResourceEntitiesStore((state) => state.upsertEntities);
  const patchEntity = useResourceEntitiesStore((state) => state.patchEntity);
  const removeEntity = useResourceEntitiesStore((state) => state.removeEntity);

  const onMutationSuccess = (
    entity: ResourceEntity,
    previousParentId: string | null = entity.parentId,
  ) => {
    const normalized = normalizeEntity(entity);
    upsertEntities(normalized.parentId, [normalized]);
    invalidateParents(queryClient, [previousParentId, normalized.parentId]);
  };

  const mutationOptions = {
    mutationKey: resourceMutationKey,
  };

  const createFolder = useMutation({
    ...mutationOptions,
    mutationFn: (payload: CreateFolderPayload) =>
      ResourcesApi.createFolder(payload),
    onSuccess: (entity) => onMutationSuccess(entity),
  });

  const renameResource = useMutation({
    ...mutationOptions,
    mutationFn: (payload: RenameResourcePayload) =>
      ResourcesApi.renameResource(payload),
    onSuccess: (entity) => {
      const normalized = normalizeEntity(entity);
      patchEntity(normalized.id, { name: normalized.name });
      invalidateParents(queryClient, [normalized.parentId]);
    },
  });

  const deleteResource = useMutation({
    ...mutationOptions,
    mutationFn: (resourceId: string) => ResourcesApi.deleteResource(resourceId),
    onSuccess: (_result, resourceId) => {
      removeEntity(resourceId);
      invalidateParents(queryClient, [null]);
    },
  });

  const uploadFile = useMutation({
    ...mutationOptions,
    mutationFn: (payload: UploadImagePayload) => {
      const isVideo = payload.file.type.startsWith("video/");

      return isVideo
        ? ResourcesApi.uploadVideo(payload)
        : ResourcesApi.uploadImage(payload);
    },
    onSuccess: (entity) => onMutationSuccess(entity),
  });

  const cloneResource = useMutation({
    ...mutationOptions,
    mutationFn: (resourceId: string) => ResourcesApi.cloneResource(resourceId),
    onSuccess: (entity) => onMutationSuccess(entity),
  });

  const reorderResource = useMutation({
    ...mutationOptions,
    mutationFn: (payload: ReorderResourcePayload) =>
      ResourcesApi.reorderResource(payload),
    onSuccess: (entity) => onMutationSuccess(entity),
  });

  const moveResource = useMutation({
    ...mutationOptions,
    mutationFn: (payload: MoveResourcePayload) =>
      ResourcesApi.moveResource(payload),
    onSuccess: (entity, variables) => {
      onMutationSuccess(entity, variables.parentId);
    },
  });

  const updateVisibility = useMutation({
    ...mutationOptions,
    mutationFn: (payload: UpdateVisibilityPayload) =>
      ResourcesApi.updateVisibility(payload),
    onSuccess: (entity) => {
      const normalized = normalizeEntity(entity);
      patchEntity(normalized.id, { visibility: normalized.visibility });
      invalidateParents(queryClient, [normalized.parentId]);
    },
  });

  const isMutating =
    createFolder.isPending ||
    renameResource.isPending ||
    deleteResource.isPending ||
    uploadFile.isPending ||
    cloneResource.isPending ||
    reorderResource.isPending ||
    moveResource.isPending ||
    updateVisibility.isPending;

  const mutationError =
    createFolder.error ??
    renameResource.error ??
    deleteResource.error ??
    uploadFile.error ??
    cloneResource.error ??
    reorderResource.error ??
    moveResource.error ??
    updateVisibility.error;

  return {
    createFolder: createFolder.mutate,
    renameResource: renameResource.mutate,
    deleteResource: deleteResource.mutate,
    uploadFile: uploadFile.mutate,
    cloneResource: cloneResource.mutate,
    reorderResource: reorderResource.mutate,
    moveResource: moveResource.mutate,
    updateVisibility: updateVisibility.mutate,
    isMutating,
    error: mutationError ? ApiErrorFormatter.toMessage(mutationError) : null,
  };
}
