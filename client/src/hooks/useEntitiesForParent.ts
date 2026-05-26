import { useShallow } from "zustand/react/shallow";
import type { ResourceEntity } from "@/lib/models";
import {
  EMPTY_CHILD_IDS,
  parentStorageKey,
  selectEntitiesForParent,
  useResourceEntitiesStore,
} from "@/stores/resource-entities.store";

export function useChildIdsForParent(parentId: string | null): string[] {
  return useResourceEntitiesStore(
    useShallow(
      (state) =>
        state.childIdsByParentId[parentStorageKey(parentId)] ?? EMPTY_CHILD_IDS,
    ),
  );
}

export function useEntitiesForParent(parentId: string | null): ResourceEntity[] {
  return useResourceEntitiesStore(
    useShallow((state) => selectEntitiesForParent(state, parentId)),
  );
}

export function useFolderEntitiesForParent(parentId: string | null): ResourceEntity[] {
  return useResourceEntitiesStore(
    useShallow((state) =>
      selectEntitiesForParent(state, parentId).filter(
        (entity) => entity.type === "FOLDER",
      ),
    ),
  );
}
