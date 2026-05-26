import { create } from "zustand";
import type { ResourceEntity } from "@/lib/models";

const rootParentKey = "__root__";

export const EMPTY_CHILD_IDS: string[] = [];

export const parentStorageKey = (parentId: string | null): string =>
  parentId ?? rootParentKey;

type ResourceEntitiesState = {
  byId: Record<string, ResourceEntity>;
  childIdsByParentId: Record<string, string[]>;
  upsertEntities: (parentId: string | null, entities: ResourceEntity[]) => void;
  mergeEntitiesById: (entities: ResourceEntity[]) => void;
  patchEntity: (id: string, patch: Partial<ResourceEntity>) => void;
  removeEntity: (id: string) => void;
  clear: () => void;
};

export const useResourceEntitiesStore = create<ResourceEntitiesState>((set) => ({
  byId: {},
  childIdsByParentId: {},
  upsertEntities: (parentId, entities) =>
    set((state) => {
      const parentKey = parentStorageKey(parentId);
      const nextIds = entities.map((entity) => entity.id);
      const currentIds = state.childIdsByParentId[parentKey];

      const sameIds =
        currentIds &&
        currentIds.length === nextIds.length &&
        currentIds.every((id, index) => id === nextIds[index]);

      const sameEntities =
        sameIds &&
        entities.every((entity) => {
          const current = state.byId[entity.id];
          return (
            current &&
            current.updatedAt === entity.updatedAt &&
            current.name === entity.name &&
            current.sortOrder === entity.sortOrder
          );
        });

      if (sameEntities) {
        return state;
      }

      const nextById = { ...state.byId };

      for (const entity of entities) {
        nextById[entity.id] = entity;
      }

      return {
        byId: nextById,
        childIdsByParentId: {
          ...state.childIdsByParentId,
          [parentKey]: nextIds,
        },
      };
    }),
  mergeEntitiesById: (entities) =>
    set((state) => {
      if (entities.length === 0) {
        return state;
      }

      const nextById = { ...state.byId };
      let changed = false;

      for (const entity of entities) {
        if (state.byId[entity.id] !== entity) {
          changed = true;
          nextById[entity.id] = entity;
        }
      }

      return changed ? { ...state, byId: nextById } : state;
    }),
  patchEntity: (id, patch) =>
    set((state) => {
      const current = state.byId[id];

      if (!current) {
        return state;
      }

      return {
        byId: {
          ...state.byId,
          [id]: {
            ...current,
            ...patch,
          },
        },
      };
    }),
  removeEntity: (id) =>
    set((state) => {
      const nextById = { ...state.byId };
      delete nextById[id];

      const nextChildIdsByParentId = Object.fromEntries(
        Object.entries(state.childIdsByParentId).map(([parentKey, childIds]) => [
          parentKey,
          childIds.filter((childId) => childId !== id),
        ]),
      );

      return {
        byId: nextById,
        childIdsByParentId: nextChildIdsByParentId,
      };
    }),
  clear: () => ({
    byId: {},
    childIdsByParentId: {},
  }),
}));

export function selectEntitiesForParent(
  state: ResourceEntitiesState,
  parentId: string | null,
): ResourceEntity[] {
  const childIds = state.childIdsByParentId[parentStorageKey(parentId)] ?? [];

  return childIds
    .map((id) => state.byId[id])
    .filter((entity): entity is ResourceEntity => Boolean(entity));
}
