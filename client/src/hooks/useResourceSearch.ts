import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useEffect } from "react";
import { queryKeys } from "@/lib/queryKeys";
import { ResourcesApi } from "@/services/resources.api";
import { useDriveUiStore } from "@/stores/drive-ui.store";
import { useResourceEntitiesStore } from "@/stores/resource-entities.store";

export function useResourceSearch(enabled: boolean) {
  const searchQuery = useDriveUiStore((state) => state.searchQuery);
  const deferredQuery = useDeferredValue(searchQuery.trim());
  const mergeEntitiesById = useResourceEntitiesStore(
    (state) => state.mergeEntitiesById,
  );

  const query = useQuery({
    queryKey: queryKeys.resources.search(deferredQuery),
    queryFn: () => ResourcesApi.searchResources(deferredQuery),
    enabled: enabled && deferredQuery.length >= 2,
    staleTime: 30_000,
    gcTime: 2 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
  });

  useEffect(() => {
    if (!query.data?.items) {
      return;
    }

    mergeEntitiesById(query.data.items);
  }, [query.data, mergeEntitiesById]);

  return {
    searchQuery,
    deferredQuery,
    searchResults: query.data?.items ?? [],
    isSearching: query.isFetching && deferredQuery.length >= 2,
    error: query.error ? query.error.message : null,
  };
}
