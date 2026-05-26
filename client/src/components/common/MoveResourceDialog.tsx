import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { DialogShell } from "./DialogShell";
import { PrimaryButton } from "./PrimaryButton";
import { queryKeys } from "@/lib/queryKeys";
import { ResourcesApi } from "@/services/resources.api";

type MoveResourceDialogProps = {
  resourceName: string;
  resourceId: string;
  isMutating: boolean;
  onCancel: () => void;
  onConfirm: (parentId: string | null) => void;
};

export function MoveResourceDialog({
  resourceName,
  resourceId,
  isMutating,
  onCancel,
  onConfirm,
}: MoveResourceDialogProps) {
  const [parentId, setParentId] = useState<string | null>(null);
  const foldersQuery = useQuery({
    queryKey: queryKeys.resources.folders(resourceId),
    queryFn: () => ResourcesApi.listFolders(resourceId),
    staleTime: 60_000,
  });

  const folders = foldersQuery.data?.items ?? [];

  return (
    <DialogShell>
      <h2 className="text-lg font-semibold text-slate-900">Move item</h2>
      <p className="mt-1 text-sm text-slate-500">
        Choose a destination folder for <strong>{resourceName}</strong>.
      </p>

      <div className="mt-4 max-h-56 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
        <button
          className={`flex w-full rounded-lg px-3 py-2 text-left text-sm transition ${
            parentId === null
              ? "bg-slate-900 font-medium text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
          onClick={() => setParentId(null)}
          type="button"
        >
          Root
        </button>
        {folders.map((folder) => (
          <button
            className={`flex w-full rounded-lg px-3 py-2 text-left text-sm transition ${
              parentId === folder.id
                ? "bg-slate-900 font-medium text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
            key={folder.id}
            onClick={() => setParentId(folder.id)}
            type="button"
          >
            {folder.name}
          </button>
        ))}
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <PrimaryButton onClick={onCancel} tone="secondary" type="button">
          Cancel
        </PrimaryButton>
        <PrimaryButton
          disabled={isMutating}
          onClick={() => onConfirm(parentId)}
          type="button"
        >
          Move
        </PrimaryButton>
      </div>
    </DialogShell>
  );
}
