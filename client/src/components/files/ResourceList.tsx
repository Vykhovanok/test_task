import { useVirtualizer } from "@tanstack/react-virtual";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import type { ResourceEntity } from "@/lib/models";
import {
  ResourceRow,
  buildDefaultCapabilities,
  type ResourceRowCapabilities,
} from "./ResourceRow";

const DRAG_MIME = "application/x-fss-resource-id";
const ROW_HEIGHT = 56;

type ResourceListProps = {
  resources: ResourceEntity[];
  isMutating: boolean;
  readOnly?: boolean;
  onOpenFolder: (folderId: string) => void;
  onRenameResource: (resource: ResourceEntity) => void;
  onDeleteResource: (resource: ResourceEntity) => void;
  onCloneResource: (resource: ResourceEntity) => void;
  onMoveResource: (resource: ResourceEntity) => void;
  onReorderResource: (resourceId: string, targetIndex: number) => void;
  onToggleVisibility: (resource: ResourceEntity) => void;
  onManageSharing: (resource: ResourceEntity) => void;
  getCapabilities?: (resource: ResourceEntity) => ResourceRowCapabilities;
};

export function ResourceList({
  resources,
  isMutating,
  readOnly,
  onOpenFolder,
  onRenameResource,
  onDeleteResource,
  onCloneResource,
  onMoveResource,
  onReorderResource,
  onToggleVisibility,
  onManageSharing,
  getCapabilities,
}: ResourceListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingDropIndexRef = useRef<number | null>(null);

  const virtualizer = useVirtualizer({
    count: resources.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  const scheduleDropIndex = useCallback((index: number) => {
    pendingDropIndexRef.current = index;

    if (rafRef.current !== null) {
      return;
    }

    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;

      if (pendingDropIndexRef.current !== null) {
        setDropIndex((current) =>
          current === pendingDropIndexRef.current
            ? current
            : pendingDropIndexRef.current,
        );
      }
    });
  }, []);

  const handleDragStart = useCallback(
    (event: DragEvent<HTMLDivElement>, index: number, resource: ResourceEntity) => {
      event.dataTransfer.setData(DRAG_MIME, resource.id);
      event.dataTransfer.effectAllowed = "move";
      setDragIndex(index);
      setDropIndex(index);
    },
    [],
  );

  const handleDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>, index: number) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      scheduleDropIndex(index);
    },
    [scheduleDropIndex],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>, targetIndex: number) => {
      event.preventDefault();

      const resourceId = event.dataTransfer.getData(DRAG_MIME);
      const sourceIndex = dragIndex;

      setDragIndex(null);
      setDropIndex(null);

      if (!resourceId || sourceIndex === null || sourceIndex === targetIndex) {
        return;
      }

      onReorderResource(resourceId, targetIndex);
    },
    [dragIndex, onReorderResource],
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDropIndex(null);
  }, []);

  const capabilityMap = useMemo(() => {
    const map = new Map<string, ResourceRowCapabilities>();

    for (const resource of resources) {
      map.set(
        resource.id,
        getCapabilities ? getCapabilities(resource) : buildDefaultCapabilities(resource),
      );
    }

    return map;
  }, [getCapabilities, resources]);

  if (resources.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 px-6 py-14 text-center">
        <p className="text-sm font-medium text-slate-400">No items here</p>
        <p className="mt-1 text-xs text-slate-300">
          Create a folder or upload a file to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200">
      <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
          Name
        </span>
      </div>

      <div className="max-h-[min(70vh,720px)] overflow-auto" ref={parentRef}>
        <div
          className="relative w-full"
          style={{ height: `${virtualizer.getTotalSize()}px` }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const resource = resources[virtualRow.index];

            if (!resource) {
              return null;
            }

            return (
              <div
                className="absolute left-0 top-0 w-full"
                key={resource.id}
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                <ResourceRow
                  capabilities={
                    capabilityMap.get(resource.id) ??
                    buildDefaultCapabilities(resource)
                  }
                  isDragging={dragIndex === virtualRow.index}
                  isDropTarget={dropIndex === virtualRow.index}
                  isMutating={isMutating}
                  onCloneResource={onCloneResource}
                  onDeleteResource={onDeleteResource}
                  onDragEnd={handleDragEnd}
                  onDragOver={(event) => handleDragOver(event, virtualRow.index)}
                  onDragStart={(event) =>
                    handleDragStart(event, virtualRow.index, resource)
                  }
                  onDrop={(event) => handleDrop(event, virtualRow.index)}
                  onManageSharing={onManageSharing}
                  onMoveResource={onMoveResource}
                  onOpenFolder={onOpenFolder}
                  onRenameResource={onRenameResource}
                  onToggleVisibility={onToggleVisibility}
                  readOnly={readOnly}
                  resource={resource}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
