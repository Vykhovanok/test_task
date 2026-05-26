import { memo, useCallback } from "react";
import type { ResourceEntity } from "@/lib/models";
import { useDriveUiStore } from "@/stores/drive-ui.store";
import { useFolderEntitiesForParent } from "@/hooks/useEntitiesForParent";
import { useResourceChildren } from "@/hooks/useResourceChildren";

const DRAG_MIME = "application/x-fss-resource-id";

type FolderTreeProps = {
  activeFolderId: string | null;
  enabled: boolean;
  onSelectFolder: (folderId: string | null) => void;
  onMoveResourceToFolder?: (resourceId: string, folderId: string | null) => void;
};

type FolderBranchProps = {
  parentId: string | null;
  depth: number;
  activeFolderId: string | null;
  enabled: boolean;
  expandedFolderIds: Record<string, true>;
  onSelectFolder: (folderId: string | null) => void;
  onToggleExpanded: (folderId: string) => void;
  onMoveResourceToFolder?: (resourceId: string, folderId: string | null) => void;
};

const FolderBranch = memo(function FolderBranch({
  parentId,
  depth,
  activeFolderId,
  enabled,
  expandedFolderIds,
  onSelectFolder,
  onToggleExpanded,
  onMoveResourceToFolder,
}: FolderBranchProps) {
  useResourceChildren(parentId, enabled);
  const folders = useFolderEntitiesForParent(parentId);

  return (
    <ul className="space-y-0.5">
      {folders.map((folder) => {
        const isActive = activeFolderId === folder.id;
        const isExpanded = Boolean(expandedFolderIds[folder.id]);

        return (
          <li key={folder.id}>
            <button
              className={`flex w-full items-center rounded-lg py-1.5 pr-3 text-left text-sm transition ${
                isActive
                  ? "bg-slate-900 font-medium text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
              onClick={() => onSelectFolder(folder.id)}
              onDragOver={(event) => {
                if (!onMoveResourceToFolder) {
                  return;
                }

                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                if (!onMoveResourceToFolder) {
                  return;
                }

                event.preventDefault();
                const resourceId = event.dataTransfer.getData(DRAG_MIME);

                if (resourceId) {
                  onMoveResourceToFolder(resourceId, folder.id);
                }
              }}
              style={{ paddingLeft: `${depth * 12 + 10}px` }}
              type="button"
            >
              {folder.childCount > 0 ? (
                <span
                  className="mr-1 inline-flex w-4 justify-center opacity-60"
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleExpanded(folder.id);
                  }}
                >
                  {isExpanded ? "▾" : "▸"}
                </span>
              ) : (
                <span className="mr-1 inline-flex w-4 justify-center opacity-40">
                  •
                </span>
              )}
              <span className="truncate">{folder.name}</span>
            </button>
            {isExpanded && folder.childCount > 0 ? (
              <FolderBranch
                activeFolderId={activeFolderId}
                depth={depth + 1}
                enabled={enabled}
                expandedFolderIds={expandedFolderIds}
                onMoveResourceToFolder={onMoveResourceToFolder}
                onSelectFolder={onSelectFolder}
                onToggleExpanded={onToggleExpanded}
                parentId={folder.id}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
});

export function FolderTree({
  activeFolderId,
  enabled,
  onSelectFolder,
  onMoveResourceToFolder,
}: FolderTreeProps) {
  const expandedFolderIds = useDriveUiStore((state) => state.expandedFolderIds);
  const toggleFolderExpanded = useDriveUiStore((state) => state.toggleFolderExpanded);

  const handleRootDrop = useCallback(
    (event: React.DragEvent<HTMLButtonElement>) => {
      if (!onMoveResourceToFolder) {
        return;
      }

      event.preventDefault();
      const resourceId = event.dataTransfer.getData(DRAG_MIME);

      if (resourceId) {
        onMoveResourceToFolder(resourceId, null);
      }
    },
    [onMoveResourceToFolder],
  );

  return (
    <div>
      <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
        Folders
      </p>
      <div className="space-y-0.5">
        <button
          className={`flex w-full items-center rounded-lg px-2.5 py-1.5 text-left text-sm transition ${
            activeFolderId === null
              ? "bg-slate-900 font-medium text-white"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
          onClick={() => onSelectFolder(null)}
          onDragOver={(event) => {
            if (!onMoveResourceToFolder) {
              return;
            }

            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
          onDrop={handleRootDrop}
          type="button"
        >
          <span className="mr-2 text-xs opacity-60">⊞</span>
          All files
        </button>
        <FolderBranch
          activeFolderId={activeFolderId}
          depth={0}
          enabled={enabled}
          expandedFolderIds={expandedFolderIds}
          onMoveResourceToFolder={onMoveResourceToFolder}
          onSelectFolder={onSelectFolder}
          onToggleExpanded={toggleFolderExpanded}
          parentId={null}
        />
      </div>
    </div>
  );
}
