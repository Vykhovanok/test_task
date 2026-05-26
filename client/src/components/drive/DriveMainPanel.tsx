import { memo, useCallback, useMemo } from "react";
import type { ResourceEntity } from "@/lib/models";
import { ResourceList } from "@/components/files/ResourceList";
import { SearchBar } from "@/components/search/SearchBar";
import { StatusPanel } from "@/components/common/StatusPanel";
import { useChildIdsForParent } from "@/hooks/useEntitiesForParent";
import { useResourceEntitiesStore } from "@/stores/resource-entities.store";

type DriveMainPanelProps = {
  activeFolderId: string | null;
  searchQuery: string;
  deferredQuery: string;
  searchResults: ResourceEntity[];
  isSearching: boolean;
  isMutating: boolean;
  isLoading: boolean;
  error: string | null;
  onSearchChange: (value: string) => void;
  onOpenFolder: (folderId: string) => void;
  onRenameResource: (resource: ResourceEntity) => void;
  onDeleteResource: (resource: ResourceEntity) => void;
  onCloneResource: (resource: ResourceEntity) => void;
  onMoveResource: (resource: ResourceEntity) => void;
  onReorderResource: (resourceId: string, targetIndex: number) => void;
  onToggleVisibility: (resource: ResourceEntity) => void;
  onManageSharing: (resource: ResourceEntity) => void;
};

function DriveMainPanelComponent({
  activeFolderId,
  searchQuery,
  deferredQuery,
  searchResults,
  isSearching,
  isMutating,
  isLoading,
  error,
  onSearchChange,
  onOpenFolder,
  onRenameResource,
  onDeleteResource,
  onCloneResource,
  onMoveResource,
  onReorderResource,
  onToggleVisibility,
  onManageSharing,
}: DriveMainPanelProps) {
  const folderEntityIds = useChildIdsForParent(activeFolderId);
  const byId = useResourceEntitiesStore((state) => state.byId);

  const visibleResources = useMemo(() => {
    if (deferredQuery.length >= 2) {
      return searchResults;
    }

    return folderEntityIds
      .map((id) => byId[id])
      .filter((entity): entity is ResourceEntity => Boolean(entity));
  }, [byId, deferredQuery.length, folderEntityIds, searchResults]);

  const currentFolderName = useMemo(() => {
    if (activeFolderId === null) {
      return "Root";
    }

    return byId[activeFolderId]?.name ?? "Root";
  }, [activeFolderId, byId]);

  const handleReorder = useCallback(
    (resourceId: string, targetIndex: number) => {
      onReorderResource(resourceId, targetIndex);
    },
    [onReorderResource],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            {currentFolderName}
          </h2>
          {isSearching || deferredQuery.length >= 2 ? (
            <p className="mt-0.5 text-xs text-slate-400">
              {searchResults.length} result
              {searchResults.length !== 1 ? "s" : ""} for &ldquo;{searchQuery}
              &rdquo;
            </p>
          ) : null}
        </div>
        <SearchBar onChange={onSearchChange} value={searchQuery} />
      </div>

      {error ? (
        <StatusPanel message={error} title="Request error" tone="error" />
      ) : null}

      {isLoading ? (
        <StatusPanel
          message="Loading folder contents."
          title="Loading"
        />
      ) : (
        <ResourceList
          isMutating={isMutating}
          onCloneResource={onCloneResource}
          onDeleteResource={onDeleteResource}
          onManageSharing={onManageSharing}
          onMoveResource={onMoveResource}
          onOpenFolder={onOpenFolder}
          onRenameResource={onRenameResource}
          onReorderResource={handleReorder}
          onToggleVisibility={onToggleVisibility}
          resources={visibleResources}
        />
      )}
    </div>
  );
}

export const DriveMainPanel = memo(DriveMainPanelComponent);
