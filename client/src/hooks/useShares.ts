import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiErrorFormatter } from "@/services/api";
import { PublicLinksApi } from "@/services/publicLinks.api";
import { SharesApi } from "@/services/shares.api";
import { queryKeys } from "@/lib/queryKeys";

export function useSharesForResource(resourceId: string | null, enabled: boolean) {
  const invitationsQuery = useQuery({
    queryKey: queryKeys.shares.invitations(resourceId ?? ""),
    queryFn: () => SharesApi.listResourceInvitations(resourceId!),
    enabled: enabled && Boolean(resourceId),
  });

  const publicLinkQuery = useQuery({
    queryKey: queryKeys.shares.publicLink(resourceId ?? ""),
    queryFn: () => PublicLinksApi.getActive(resourceId!),
    enabled: enabled && Boolean(resourceId),
  });

  return {
    invitations: invitationsQuery.data ?? [],
    publicLink: publicLinkQuery.data ?? null,
    isFetching: invitationsQuery.isFetching || publicLinkQuery.isFetching,
    invitationError: invitationsQuery.error
      ? ApiErrorFormatter.toMessage(invitationsQuery.error)
      : null,
    publicLinkError: publicLinkQuery.error
      ? ApiErrorFormatter.toMessage(publicLinkQuery.error)
      : null,
    refetch: () => {
      void invitationsQuery.refetch();
      void publicLinkQuery.refetch();
    },
  };
}

export function useShareMutations(resourceId: string | null) {
  const queryClient = useQueryClient();

  const invalidateShares = () => {
    if (!resourceId) {
      return Promise.resolve();
    }

    return Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.shares.invitations(resourceId),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.shares.publicLink(resourceId),
      }),
    ]);
  };

  const createInvitation = useMutation({
    mutationFn: (payload: {
      email: string;
      role: "VIEWER" | "EDITOR";
    }) =>
      SharesApi.createInvitation({
        resourceId: resourceId!,
        email: payload.email,
        role: payload.role,
      }),
    onSuccess: invalidateShares,
  });

  const revokeInvitation = useMutation({
    mutationFn: (invitationId: string) =>
      SharesApi.revokeInvitation(invitationId),
    onSuccess: invalidateShares,
  });

  const createPublicLink = useMutation({
    mutationFn: () => PublicLinksApi.create(resourceId!),
    onSuccess: invalidateShares,
  });

  const revokePublicLink = useMutation({
    mutationFn: (publicLinkId: string) => PublicLinksApi.revoke(publicLinkId),
    onSuccess: async () => {
      if (resourceId) {
        queryClient.setQueryData(
          queryKeys.shares.publicLink(resourceId),
          null,
        );
      }
      await invalidateShares();
    },
  });

  const error =
    createInvitation.error ??
    revokeInvitation.error ??
    createPublicLink.error ??
    revokePublicLink.error;

  return {
    createInvitation: createInvitation.mutate,
    revokeInvitation: revokeInvitation.mutate,
    createPublicLink: () => createPublicLink.mutate(),
    revokePublicLink: revokePublicLink.mutate,
    isMutating:
      createInvitation.isPending ||
      revokeInvitation.isPending ||
      createPublicLink.isPending ||
      revokePublicLink.isPending,
    error: error ? ApiErrorFormatter.toMessage(error) : null,
  };
}

export function usePublicLinkResolve(token: string) {
  const query = useQuery({
    queryKey: queryKeys.publicLinks.resolve(token),
    queryFn: () => PublicLinksApi.resolve(token),
    enabled: Boolean(token),
  });

  return {
    resource: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error ? ApiErrorFormatter.toMessage(query.error) : null,
  };
}
