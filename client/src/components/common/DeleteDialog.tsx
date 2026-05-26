import { Component } from "react";
import { PrimaryButton } from "@/components/common/PrimaryButton";
import { DialogShell } from "./DialogShell";

type Props = {
  name: string;
  isMutating: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export class DeleteDialog extends Component<Props> {
  render() {
    const { name, isMutating, onCancel, onConfirm } = this.props;

    return (
      <DialogShell>
        <h2 className="text-base font-semibold text-slate-900">Delete resource</h2>
        <p className="mt-2 text-sm text-slate-600">
          Are you sure you want to delete{" "}
          <span className="font-medium text-slate-900">&ldquo;{name}&rdquo;</span>? This
          cannot be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <PrimaryButton onClick={onCancel} tone="secondary" type="button">
            Cancel
          </PrimaryButton>
          <PrimaryButton
            disabled={isMutating}
            onClick={onConfirm}
            tone="danger"
            type="button"
          >
            Delete
          </PrimaryButton>
        </div>
      </DialogShell>
    );
  }
}
