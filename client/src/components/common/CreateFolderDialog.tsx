import { Component, type ChangeEvent } from "react";
import { PrimaryButton } from "@/components/common/PrimaryButton";
import { DialogShell } from "./DialogShell";

type Props = {
  value: string;
  isMutating: boolean;
  onChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export class CreateFolderDialog extends Component<Props> {
  handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    this.props.onChange(event.target.value);
  };

  render() {
    const { value, isMutating, onCancel, onConfirm } = this.props;

    return (
      <DialogShell>
        <h2 className="text-base font-semibold text-slate-900">New folder</h2>
        <p className="mt-1 text-sm text-slate-500">Choose a name for the folder.</p>
        <input
          autoFocus
          className="mt-4 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 transition focus:border-slate-400 focus:bg-white"
          onChange={this.handleInput}
          placeholder="Folder name"
          type="text"
          value={value}
        />
        <div className="mt-5 flex justify-end gap-2">
          <PrimaryButton onClick={onCancel} tone="secondary" type="button">
            Cancel
          </PrimaryButton>
          <PrimaryButton
            disabled={!value.trim() || isMutating}
            onClick={onConfirm}
            type="button"
          >
            Create
          </PrimaryButton>
        </div>
      </DialogShell>
    );
  }
}
