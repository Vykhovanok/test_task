import { Component } from "react";
import type { PublicLink, ResourceEntity, ShareInvitation } from "@/lib/models";
import { buildPublicLinkUrl } from "@/lib/urls";
import { PrimaryButton } from "@/components/common/PrimaryButton";

type SharingPanelProps = {
  resource: ResourceEntity | null;
  invitations: ShareInvitation[];
  publicLink: PublicLink | null;
  onRefresh: (resourceId: string) => void;
  onInvite: (resourceId: string) => void;
  onRevokeInvitation: (invitationId: string) => void;
  onCreateLink: (resourceId: string) => void;
  onRevokeLink: (publicLinkId: string) => void;
};

export class SharingPanel extends Component<SharingPanelProps> {
  render() {
    const { resource, invitations, publicLink } = this.props;

    if (!resource) {
      return (
        <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center">
          <p className="text-xs text-slate-400">
            Click &ldquo;Share&rdquo; on any resource to manage access.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-5 rounded-xl border border-slate-200 p-4">
        <div>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                Sharing
              </p>
              <p className="mt-1 truncate text-sm font-medium text-slate-900">
                {resource.name}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <PrimaryButton
                onClick={() => this.props.onRefresh(resource.id)}
                size="sm"
                tone="secondary"
                type="button"
              >
                Refresh
              </PrimaryButton>
              <PrimaryButton
                onClick={() => this.props.onInvite(resource.id)}
                size="sm"
                type="button"
              >
                + Invite
              </PrimaryButton>
            </div>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold text-slate-700">Invitations</p>
          {invitations.length === 0 ? (
            <p className="text-xs text-slate-400">No invitations yet.</p>
          ) : (
            <div className="space-y-1.5">
              {invitations.map((invitation) => (
                <div
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
                  key={invitation.id}
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-slate-800">
                      {invitation.email}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      {invitation.role} · {invitation.status}
                    </p>
                  </div>
                  <PrimaryButton
                    onClick={() => this.props.onRevokeInvitation(invitation.id)}
                    size="sm"
                    tone="danger"
                    type="button"
                  >
                    Revoke
                  </PrimaryButton>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold text-slate-700">Public link</p>
          {publicLink && publicLink.isActive ? (
            <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50 p-3">
              {publicLink.token ? (
                <p className="break-all text-[11px] leading-relaxed text-slate-600">
                  {buildPublicLinkUrl(publicLink.token)}
                </p>
              ) : (
                <p className="text-[11px] leading-relaxed text-slate-500">
                  An active link exists. Create a new link to rotate the URL.
                </p>
              )}
              <PrimaryButton
                onClick={() => this.props.onRevokeLink(publicLink.id)}
                size="sm"
                tone="danger"
                type="button"
              >
                Revoke link
              </PrimaryButton>
            </div>
          ) : (
            <PrimaryButton
              onClick={() => this.props.onCreateLink(resource.id)}
              size="sm"
              tone="secondary"
              type="button"
            >
              Create public link
            </PrimaryButton>
          )}
        </div>
      </div>
    );
  }
}
