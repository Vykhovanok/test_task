import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { API_BASE_URL } from "@/lib/constants";
import { queryKeys } from "@/lib/queryKeys";
import type { ResourceChangeEvent } from "@/lib/models";
import { TokenStorage } from "@/services/api";

function invalidateParentQueries(
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

export function useResourceSync(enabled: boolean): void {
  const queryClient = useQueryClient();
  const retryCountRef = useRef(0);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let disposed = false;

    const connect = () => {
      if (disposed) {
        return;
      }

      const token = TokenStorage.get();
      const streamUrl = new URL(`${API_BASE_URL}/events/stream`);

      if (token) {
        streamUrl.searchParams.set("access_token", token);
      }

      const eventSource = new EventSource(streamUrl.toString(), {
        withCredentials: true,
      });
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (message) => {
        try {
          const payload = JSON.parse(message.data) as
            | ResourceChangeEvent
            | { type: "connected" };

          if (!("action" in payload)) {
            retryCountRef.current = 0;
            return;
          }

          invalidateParentQueries(
            queryClient,
            payload.affectedParentIds ?? [payload.parentId],
          );
        } catch {
          return;
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        eventSourceRef.current = null;

        if (disposed) {
          return;
        }

        const retryDelay = Math.min(30_000, 1_000 * 2 ** retryCountRef.current);
        retryCountRef.current += 1;
        window.setTimeout(connect, retryDelay);
      };
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible" && !eventSourceRef.current) {
        connect();
      }
    };

    connect();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [enabled, queryClient]);
}
