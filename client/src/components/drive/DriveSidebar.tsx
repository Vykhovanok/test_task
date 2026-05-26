import { memo } from "react";
import type { ResourceEntity } from "@/lib/models";
import type { PublicLink, ShareInvitation } from "@/lib/models";
import { FolderTree } from "@/components/folders/FolderTree";
import { SharingPanel } from "@/components/sharing/SharingPanel";

type DriveSidebarProps = {
  enabled: boolean;
  activeFolderId: string | null;
  managedResource: ResourceEntity | null;
  invitations: ShareInvitation[];
  publicLink: PublicLink | null;
  onSelectFolder: (folderId: string | null) => void;
  onMoveResourceToFolder: (resourceId: string, parentId: string | null) => void;
  onInvite: (resourceId: string) => void;
  onCreateLink: () => void;
  onRevokeInvitation: (invitationId: string) => void;
  onRevokeLink: (publicLinkId: string) => void;
};

function DriveSidebarComponent({
  enabled,
  activeFolderId,
  managedResource,
  invitations,
  publicLink,
  onSelectFolder,
  onMoveResourceToFolder,
  onInvite,
  onCreateLink,
  onRevokeInvitation,
  onRevokeLink,
}: DriveSidebarProps) {
  return (
    <div className="flex h-full flex-col gap-4">
      <FolderTree
        activeFolderId={activeFolderId}
        enabled={enabled}
        onMoveResourceToFolder={onMoveResourceToFolder}
        onSelectFolder={onSelectFolder}
      />
      <hr className="border-slate-100" />
      <SharingPanel
        invitations={invitations}
        onCreateLink={onCreateLink}
        onInvite={onInvite}
        onRefresh={() => undefined}
        onRevokeInvitation={onRevokeInvitation}
        onRevokeLink={onRevokeLink}
        publicLink={publicLink}
        resource={managedResource}
      />
    </div>
  );
}

export const DriveSidebar = memo(DriveSidebarComponent);
