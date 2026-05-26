import { StatusPanel } from "@/components/common/StatusPanel";
import { ResourceList } from "@/components/files/ResourceList";
import { usePublicLinkResolve } from "@/hooks/useShares";

type PublicLinkScreenProps = {
  token: string;
};

export function PublicLinkScreen({ token }: PublicLinkScreenProps) {
  const { resource, isLoading, error } = usePublicLinkResolve(token);
  const resources = resource ? [resource] : [];

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-12">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-4 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
            Public link
          </p>
          <h1 className="mt-1 text-lg font-semibold text-slate-900">
            Shared resource
          </h1>
        </div>

        {error ? (
          <StatusPanel message={error} title="Error" tone="error" />
        ) : null}

        {isLoading ? (
          <StatusPanel
            message="Resolving the shared resource…"
            title="Loading"
          />
        ) : resource ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <ResourceList
              isMutating={false}
              onCloneResource={() => undefined}
              onDeleteResource={() => undefined}
              onManageSharing={() => undefined}
              onMoveResource={() => undefined}
              onOpenFolder={() => undefined}
              onRenameResource={() => undefined}
              onReorderResource={() => undefined}
              onToggleVisibility={() => undefined}
              readOnly
              resources={resources}
            />
          </div>
        ) : (
          <StatusPanel
            message="No resource could be found for this link."
            title="Not found"
          />
        )}
      </div>
    </main>
  );
}
