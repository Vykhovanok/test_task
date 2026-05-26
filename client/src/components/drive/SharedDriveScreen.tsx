import Router from "next/router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DeleteDialog } from "@/components/common/DeleteDialog";
import { RenameDialog } from "@/components/common/RenameDialog";
import { StatusPanel } from "@/components/common/StatusPanel";
import { ResourceList } from "@/components/files/ResourceList";
import type { ResourceRowCapabilities } from "@/components/files/ResourceRow";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthSession } from "@/hooks/useAuthSession";
import { useIsClientMounted } from "@/hooks/useIsClientMounted";
import { useResourceMutations } from "@/hooks/useResourceMutations";
import { useResourceSync } from "@/hooks/useResourceSync";
import { useQuery } from "@tanstack/react-query";
import type { ResourceEntity } from "@/lib/models";
import { queryKeys } from "@/lib/queryKeys";
import { InputValidators } from "@/lib/validators";
import { ResourcesApi } from "@/services/resources.api";
import { useResourceEntitiesStore } from "@/stores/resource-entities.store";

type Dialog =
  | { kind: "rename"; resourceId: string; value: string }
  | { kind: "delete"; resourceId: string; name: string }
  | null;

export function SharedDriveScreen() {
  const [dialog, setDialog] = useState<Dialog>(null);
  const mounted = useIsClientMounted();

  const { initialized, isAuthenticated, isLoading: authLoading } = useAuthSession();
  const resourceMutations = useResourceMutations();
  const mergeEntitiesById = useResourceEntitiesStore(
    (state) => state.mergeEntitiesById,
  );

  const sharedQuery = useQuery({
    queryKey: queryKeys.resources.shared,
    queryFn: () => ResourcesApi.listShared(),
    enabled: isAuthenticated,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  useResourceSync(isAuthenticated);

  useEffect(() => {
    if (sharedQuery.data?.items) {
      mergeEntitiesById(sharedQuery.data.items);
    }
  }, [sharedQuery.dataUpdatedAt, mergeEntitiesById, sharedQuery.data]);

  useEffect(() => {
    if (mounted && initialized && !isAuthenticated) {
      void Router.replace("/login");
    }
  }, [mounted, initialized, isAuthenticated]);

  const isLoading = !mounted || authLoading || sharedQuery.isLoading;
  const sharedResources = sharedQuery.data?.items ?? [];

  const getCapabilities = useCallback((resource: ResourceEntity): ResourceRowCapabilities => {
    const canEdit =
      resource.effectiveRole === "owner" || resource.effectiveRole === "editor";

    return {
      canOpen: false,
      canRename: canEdit,
      canClone: canEdit,
      canReorder: false,
      canMove: false,
      canToggleVisibility: canEdit,
      canShare: false,
      canDelete: resource.effectiveRole === "owner",
    };
  }, []);

  const closeDialog = useCallback(() => setDialog(null), []);

  const handleDialogConfirm = useCallback(() => {
    if (!dialog) return;

    if (dialog.kind === "rename") {
      const name = InputValidators.normalizeName(dialog.value);
      if (InputValidators.hasValue(name)) {
        resourceMutations.renameResource({ resourceId: dialog.resourceId, name });
      }
    } else if (dialog.kind === "delete") {
      resourceMutations.deleteResource(dialog.resourceId);
    }

    setDialog(null);
  }, [dialog, resourceMutations]);

  const noop = useMemo(() => () => undefined, []);

  const renderDialog = () => {
    if (!dialog) return null;

    if (dialog.kind === "rename") {
      return (
        <RenameDialog
          isMutating={resourceMutations.isMutating}
          onCancel={closeDialog}
          onChange={(value) => setDialog({ ...dialog, value })}
          onConfirm={handleDialogConfirm}
          value={dialog.value}
        />
      );
    }

    return (
      <DeleteDialog
        isMutating={resourceMutations.isMutating}
        name={dialog.name}
        onCancel={closeDialog}
        onConfirm={handleDialogConfirm}
      />
    );
  };

  return (
    <>
      {renderDialog()}
      <AppShell
        sidebar={
          <StatusPanel
            message="Resources shared through invitations appear in this list."
            title="Shared"
          />
        }
        title="Shared With Me"
      >
        {isLoading ? (
          <StatusPanel
            message="Loading shared resources."
            title="Loading"
          />
        ) : (
          <ResourceList
            getCapabilities={getCapabilities}
            isMutating={resourceMutations.isMutating}
            onCloneResource={(resource) =>
              resourceMutations.cloneResource(resource.id)
            }
            onDeleteResource={(resource) =>
              setDialog({
                kind: "delete",
                resourceId: resource.id,
                name: resource.name,
              })
            }
            onManageSharing={noop}
            onMoveResource={noop}
            onOpenFolder={noop}
            onRenameResource={(resource) =>
              setDialog({
                kind: "rename",
                resourceId: resource.id,
                value: resource.name,
              })
            }
            onReorderResource={noop}
            onToggleVisibility={(resource) =>
              resourceMutations.updateVisibility({
                resourceId: resource.id,
                visibility:
                  resource.visibility === "PUBLIC" ? "PRIVATE" : "PUBLIC",
              })
            }
            resources={sharedResources}
          />
        )}
      </AppShell>
    </>
  );
}
