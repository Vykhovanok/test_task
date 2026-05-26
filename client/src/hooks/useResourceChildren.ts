import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { queryKeys } from "@/lib/queryKeys";
import { ResourcesApi } from "@/services/resources.api";
import { useResourceEntitiesStore } from "@/stores/resource-entities.store";

export function useResourceChildren(
  parentId: string | null,
  enabled: boolean,
) {
  const upsertEntities = useResourceEntitiesStore((state) => state.upsertEntities);

  const query = useQuery({
    queryKey: queryKeys.resources.children(parentId),
    queryFn: () => ResourcesApi.listChildren(parentId),
    enabled,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!query.data?.items) {
      return;
    }

    upsertEntities(parentId, query.data.items);
  }, [parentId, query.dataUpdatedAt, upsertEntities, query.data]);

  return {
    items: query.data?.items ?? [],
    isLoading: query.isLoading,
    error: query.error ? query.error.message : null,
    refetch: query.refetch,
  };
}
