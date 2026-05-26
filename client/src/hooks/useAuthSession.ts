import { useQuery } from "@tanstack/react-query";
import { ApiErrorFormatter, TokenStorage } from "@/services/api";
import { AuthApi } from "@/services/auth.api";
import { queryKeys } from "@/lib/queryKeys";

export function useHasAuthToken(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return Boolean(TokenStorage.get());
}

export function useAuthSession() {
  const hasToken = useHasAuthToken();

  const query = useQuery({
    queryKey: queryKeys.auth.me,
    queryFn: () => AuthApi.me(),
    enabled: hasToken,
    retry: false,
  });

  const initialized = !hasToken || query.isFetched;
  const isAuthenticated = Boolean(query.data);
  const isLoading = hasToken && query.isLoading;

  return {
    initialized,
    isAuthenticated,
    isLoading,
    currentUser: query.data ?? null,
    error: query.error ? ApiErrorFormatter.toMessage(query.error) : null,
    refetch: query.refetch,
  };
}
