import { memo } from "react";
import type { ResourceEntity } from "@/lib/models";
import { PermissionPolicy } from "@/lib/permissions";
import { PrimaryButton } from "@/components/common/PrimaryButton";

export type ResourceRowCapabilities = {
  canOpen: boolean;
  canRename: boolean;
  canClone: boolean;
  canReorder: boolean;
  canMove: boolean;
  canToggleVisibility: boolean;
  canShare: boolean;
  canDelete: boolean;
};

type ResourceRowProps = {
  resource: ResourceEntity;
  isMutating: boolean;
  readOnly?: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  capabilities: ResourceRowCapabilities;
  onOpenFolder: (folderId: string) => void;
  onRenameResource: (resource: ResourceEntity) => void;
  onDeleteResource: (resource: ResourceEntity) => void;
  onCloneResource: (resource: ResourceEntity) => void;
  onMoveResource: (resource: ResourceEntity) => void;
  onToggleVisibility: (resource: ResourceEntity) => void;
  onManageSharing: (resource: ResourceEntity) => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
};

function resolveTypeLabel(resource: ResourceEntity): string {
  if (resource.type === "FOLDER") {
    return "Folder";
  }

  if (resource.mimeType?.startsWith("video/")) {
    return "Video";
  }

  return "Image";
}

function ResourceRowComponent({
  resource,
  isMutating,
  readOnly,
  isDragging,
  isDropTarget,
  capabilities,
  onOpenFolder,
  onRenameResource,
  onDeleteResource,
  onCloneResource,
  onMoveResource,
  onToggleVisibility,
  onManageSharing,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: ResourceRowProps) {
  const isFolder = resource.type === "FOLDER";
  const isPublic = resource.visibility === "PUBLIC";

  return (
    <div
      className={`flex items-center gap-4 border-b border-slate-100 px-4 py-3 last:border-b-0 ${
        isDragging ? "opacity-50" : ""
      } ${isDropTarget ? "bg-indigo-50" : ""}`}
      draggable={!readOnly && capabilities.canReorder}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragStart={onDragStart}
      onDrop={onDrop}
    >
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium text-slate-900">
            {resource.name}
          </span>
          <span
            className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              isFolder
                ? "bg-slate-100 text-slate-500"
                : resource.mimeType?.startsWith("video/")
                  ? "bg-violet-50 text-violet-600"
                  : "bg-indigo-50 text-indigo-500"
            }`}
          >
            {resolveTypeLabel(resource)}
          </span>
          {isPublic ? (
            <span className="shrink-0 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
              Public
            </span>
          ) : null}
        </div>
      </div>

      {!readOnly ? (
        <div className="flex shrink-0 items-center gap-2">
          {capabilities.canOpen ? (
            <PrimaryButton
              onClick={() => onOpenFolder(resource.id)}
              size="sm"
              tone="secondary"
              type="button"
            >
              Open
            </PrimaryButton>
          ) : null}

          {capabilities.canRename || capabilities.canClone ? (
            <div className="flex items-center gap-1">
              {capabilities.canRename ? (
                <PrimaryButton
                  disabled={isMutating}
                  onClick={() => onRenameResource(resource)}
                  size="sm"
                  tone="secondary"
                  type="button"
                >
                  Rename
                </PrimaryButton>
              ) : null}
              {capabilities.canClone ? (
                <PrimaryButton
                  disabled={isMutating}
                  onClick={() => onCloneResource(resource)}
                  size="sm"
                  tone="secondary"
                  type="button"
                >
                  Clone
                </PrimaryButton>
              ) : null}
            </div>
          ) : null}

          {capabilities.canMove ? (
            <PrimaryButton
              disabled={isMutating}
              onClick={() => onMoveResource(resource)}
              size="sm"
              tone="secondary"
              type="button"
            >
              Move
            </PrimaryButton>
          ) : null}

          {capabilities.canToggleVisibility ? (
            <PrimaryButton
              disabled={isMutating}
              onClick={() => onToggleVisibility(resource)}
              size="sm"
              tone="secondary"
              type="button"
            >
              {isPublic ? "Make Private" : "Make Public"}
            </PrimaryButton>
          ) : null}

          {capabilities.canShare || capabilities.canDelete ? (
            <div className="flex items-center gap-1">
              {capabilities.canShare ? (
                <PrimaryButton
                  disabled={isMutating}
                  onClick={() => onManageSharing(resource)}
                  size="sm"
                  tone="secondary"
                  type="button"
                >
                  Share
                </PrimaryButton>
              ) : null}
              {capabilities.canDelete ? (
                <PrimaryButton
                  disabled={isMutating}
                  onClick={() => onDeleteResource(resource)}
                  size="sm"
                  tone="danger"
                  type="button"
                >
                  Delete
                </PrimaryButton>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function buildDefaultCapabilities(
  resource: ResourceEntity,
): ResourceRowCapabilities {
  const canEdit = PermissionPolicy.canEdit(resource.effectiveRole);
  const isOwner = resource.effectiveRole === "owner";

  return {
    canOpen: resource.type === "FOLDER",
    canRename: canEdit,
    canClone: canEdit,
    canReorder: canEdit,
    canMove: canEdit,
    canToggleVisibility: canEdit,
    canShare: isOwner,
    canDelete: isOwner,
  };
}

export const ResourceRow = memo(ResourceRowComponent);
