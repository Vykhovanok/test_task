import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import Router from "next/router";
import { ApiErrorFormatter } from "@/services/api";
import { AuthApi } from "@/services/auth.api";
import { TokenStorage } from "@/services/api";
import { queryKeys } from "@/lib/queryKeys";
import type { LoginFormValues, RegisterFormValues } from "@/lib/auth.types";
import { useResourceEntitiesStore } from "@/stores/resource-entities.store";

export function useAuthMutations() {
  const queryClient = useQueryClient();

  const loginMutation = useMutation({
    mutationFn: (payload: LoginFormValues) => AuthApi.login(payload),
    onSuccess: async (response) => {
      TokenStorage.set(response.accessToken);
      queryClient.setQueryData(queryKeys.auth.me, response.user);
      await Router.push("/drive");
    },
  });

  const registerMutation = useMutation({
    mutationFn: (payload: RegisterFormValues) => AuthApi.register(payload),
    onSuccess: async (response) => {
      TokenStorage.set(response.accessToken);
      queryClient.setQueryData(queryKeys.auth.me, response.user);
      await Router.push("/drive");
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => AuthApi.logout(),
    onSettled: async () => {
      TokenStorage.clear();
      useResourceEntitiesStore.getState().clear();
      queryClient.clear();
      await Router.push("/login");
    },
  });

  const bootstrap = useCallback(async (): Promise<void> => {
    const token = TokenStorage.get();

    if (!token) {
      queryClient.setQueryData(queryKeys.auth.me, null);
      return;
    }

    try {
      await queryClient.fetchQuery({
        queryKey: queryKeys.auth.me,
        queryFn: () => AuthApi.me(),
      });
    } catch {
      TokenStorage.clear();
      queryClient.setQueryData(queryKeys.auth.me, null);
    }
  }, [queryClient]);

  const authError =
    loginMutation.error || registerMutation.error
      ? ApiErrorFormatter.toMessage(
          loginMutation.error ?? registerMutation.error,
        )
      : null;

  return {
    login: loginMutation.mutate,
    register: registerMutation.mutate,
    logout: () => logoutMutation.mutate(),
    bootstrap,
    isSubmitting: loginMutation.isPending || registerMutation.isPending,
    error: authError,
  };
}
