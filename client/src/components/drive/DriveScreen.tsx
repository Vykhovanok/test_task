import Router from "next/router";
import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { CreateFolderDialog } from "@/components/common/CreateFolderDialog";
import { DeleteDialog } from "@/components/common/DeleteDialog";
import { InviteDialog, type InviteRole } from "@/components/common/InviteDialog";
import { PrimaryButton } from "@/components/common/PrimaryButton";
import { MoveResourceDialog } from "@/components/common/MoveResourceDialog";
import { RenameDialog } from "@/components/common/RenameDialog";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthMutations } from "@/hooks/useAuthMutations";
import { useAuthSession } from "@/hooks/useAuthSession";
import { useIsClientMounted } from "@/hooks/useIsClientMounted";
import { useResourceChildren } from "@/hooks/useResourceChildren";
import { useResourceMutations } from "@/hooks/useResourceMutations";
import { useResourceSearch } from "@/hooks/useResourceSearch";
import { useResourceSync } from "@/hooks/useResourceSync";
import { useShareMutations, useSharesForResource } from "@/hooks/useShares";
import type { ResourceEntity } from "@/lib/models";
import { InputValidators } from "@/lib/validators";
import { useDriveUiStore } from "@/stores/drive-ui.store";
import { useResourceEntitiesStore } from "@/stores/resource-entities.store";
import { DriveMainPanel } from "./DriveMainPanel";
import { DriveSidebar } from "./DriveSidebar";

type Dialog =
  | { kind: "createFolder"; value: string }
  | { kind: "rename"; resourceId: string; originalName: string; value: string }
  | { kind: "delete"; resourceId: string; name: string }
  | { kind: "move"; resourceId: string; name: string }
  | { kind: "invite"; resourceId: string; email: string; role: InviteRole }
  | null;

export function DriveScreen() {
  const [dialog, setDialog] = useState<Dialog>(null);
  const mounted = useIsClientMounted();

  const { initialized, isAuthenticated, isLoading: authLoading, currentUser, error: authError } =
    useAuthSession();
  const { logout } = useAuthMutations();

  const activeFolderId = useDriveUiStore((state) => state.activeFolderId);
  const searchQuery = useDriveUiStore((state) => state.searchQuery);
  const managedResourceId = useDriveUiStore((state) => state.managedResourceId);
  const selectFolder = useDriveUiStore((state) => state.selectFolder);
  const setSearchQuery = useDriveUiStore((state) => state.setSearchQuery);
  const setManagedResourceId = useDriveUiStore((state) => state.setManagedResourceId);

  const { isLoading: folderLoading, error: folderError } = useResourceChildren(
    activeFolderId,
    isAuthenticated,
  );
  const {
    deferredQuery,
    searchResults,
    isSearching,
    error: searchError,
  } = useResourceSearch(isAuthenticated);
  const resourceMutations = useResourceMutations();
  const shares = useSharesForResource(managedResourceId, isAuthenticated);
  const shareMutations = useShareMutations(managedResourceId);

  useResourceSync(isAuthenticated);

  useEffect(() => {
    if (mounted && initialized && !isAuthenticated) {
      void Router.replace("/login");
    }
  }, [mounted, initialized, isAuthenticated]);

  const managedResource = useResourceEntitiesStore(
    (state) => (managedResourceId ? state.byId[managedResourceId] ?? null : null),
  );

  const isLoading = !mounted || authLoading || folderLoading;
  const error =
    authError ||
    folderError ||
    searchError ||
    resourceMutations.error ||
    shares.invitationError ||
    shares.publicLinkError ||
    shareMutations.error;

  const closeDialog = useCallback(() => setDialog(null), []);

  const handleDialogConfirm = useCallback(() => {
    if (!dialog) return;

    if (dialog.kind === "createFolder") {
      const name = InputValidators.normalizeName(dialog.value);
      if (InputValidators.hasValue(name)) {
        resourceMutations.createFolder({ name, parentId: activeFolderId });
      }
    } else if (dialog.kind === "rename") {
      const name = InputValidators.normalizeName(dialog.value);
      if (InputValidators.hasValue(name)) {
        resourceMutations.renameResource({ resourceId: dialog.resourceId, name });
      }
    } else if (dialog.kind === "delete") {
      resourceMutations.deleteResource(dialog.resourceId);
    } else if (dialog.kind === "invite") {
      const email = dialog.email.trim();
      if (email) {
        shareMutations.createInvitation({ email, role: dialog.role });
      }
    }

    setDialog(null);
  }, [
    activeFolderId,
    dialog,
    resourceMutations,
    shareMutations,
  ]);

  const handleUploadImage = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];

      if (!file) {
        return;
      }

      resourceMutations.uploadFile({ file, parentId: activeFolderId });
      event.target.value = "";
    },
    [activeFolderId, resourceMutations],
  );

  const headerActions = useMemo(
    () => (
      <>
        <label className="cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50">
          Upload File
          <input
            accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
            className="hidden"
            onChange={handleUploadImage}
            type="file"
          />
        </label>
        <PrimaryButton
          disabled={resourceMutations.isMutating}
          onClick={() => setDialog({ kind: "createFolder", value: "" })}
          type="button"
        >
          New Folder
        </PrimaryButton>
        <span className="hidden h-6 w-px bg-slate-200 sm:block" />
        <PrimaryButton onClick={() => logout()} tone="secondary" type="button">
          Sign out
        </PrimaryButton>
      </>
    ),
    [handleUploadImage, logout, resourceMutations.isMutating],
  );

  const openRename = useCallback((resource: ResourceEntity) => {
    setDialog({
      kind: "rename",
      resourceId: resource.id,
      originalName: resource.name,
      value: resource.name,
    });
  }, []);

  const openDelete = useCallback((resource: ResourceEntity) => {
    setDialog({
      kind: "delete",
      resourceId: resource.id,
      name: resource.name,
    });
  }, []);

  const openMove = useCallback((resource: ResourceEntity) => {
    setDialog({
      kind: "move",
      resourceId: resource.id,
      name: resource.name,
    });
  }, []);

  const openInvite = useCallback((resourceId: string) => {
    setDialog({ kind: "invite", resourceId, email: "", role: "VIEWER" });
  }, []);

  const renderDialog = () => {
    if (!dialog) return null;

    if (dialog.kind === "createFolder") {
      return (
        <CreateFolderDialog
          isMutating={resourceMutations.isMutating}
          onCancel={closeDialog}
          onChange={(value) => setDialog({ ...dialog, value })}
          onConfirm={handleDialogConfirm}
          value={dialog.value}
        />
      );
    }

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

    if (dialog.kind === "delete") {
      return (
        <DeleteDialog
          isMutating={resourceMutations.isMutating}
          name={dialog.name}
          onCancel={closeDialog}
          onConfirm={handleDialogConfirm}
        />
      );
    }

    if (dialog.kind === "move") {
      return (
        <MoveResourceDialog
          isMutating={resourceMutations.isMutating}
          onCancel={closeDialog}
          onConfirm={(parentId) => {
            resourceMutations.moveResource({
              resourceId: dialog.resourceId,
              parentId,
            });
            closeDialog();
          }}
          resourceId={dialog.resourceId}
          resourceName={dialog.name}
        />
      );
    }

    return (
      <InviteDialog
        email={dialog.email}
        onCancel={closeDialog}
        onChangeEmail={(value) => setDialog({ ...dialog, email: value })}
        onChangeRole={(role) => setDialog({ ...dialog, role })}
        onConfirm={handleDialogConfirm}
        role={dialog.role}
      />
    );
  };

  return (
    <>
      {renderDialog()}
      <AppShell
        actions={headerActions}
        sidebar={
          <DriveSidebar
            activeFolderId={activeFolderId}
            enabled={isAuthenticated}
            invitations={shares.invitations}
            managedResource={managedResource}
            onCreateLink={() => shareMutations.createPublicLink()}
            onInvite={openInvite}
            onMoveResourceToFolder={(resourceId, parentId) =>
              resourceMutations.moveResource({ resourceId, parentId })
            }
            onRevokeInvitation={(invitationId) =>
              shareMutations.revokeInvitation(invitationId)
            }
            onRevokeLink={(publicLinkId) =>
              shareMutations.revokePublicLink(publicLinkId)
            }
            onSelectFolder={selectFolder}
            publicLink={shares.publicLink}
          />
        }
        subtitle={currentUser?.email}
        title="Drive"
      >
        <DriveMainPanel
          activeFolderId={activeFolderId}
          deferredQuery={deferredQuery}
          error={error}
          isLoading={isLoading}
          isMutating={resourceMutations.isMutating}
          isSearching={isSearching}
          onCloneResource={(resource) =>
            resourceMutations.cloneResource(resource.id)
          }
          onDeleteResource={openDelete}
          onManageSharing={(resource) => setManagedResourceId(resource.id)}
          onMoveResource={openMove}
          onOpenFolder={selectFolder}
          onRenameResource={openRename}
          onReorderResource={(resourceId, targetIndex) =>
            resourceMutations.reorderResource({ resourceId, targetIndex })
          }
          onSearchChange={setSearchQuery}
          onToggleVisibility={(resource) =>
            resourceMutations.updateVisibility({
              resourceId: resource.id,
              visibility:
                resource.visibility === "PUBLIC" ? "PRIVATE" : "PUBLIC",
            })
          }
          searchQuery={searchQuery}
          searchResults={searchResults}
        />
      </AppShell>
    </>
  );
}
