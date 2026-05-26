import { Component, type ChangeEvent } from "react";
import { PrimaryButton } from "@/components/common/PrimaryButton";
import { DialogShell } from "./DialogShell";

export type InviteRole = "VIEWER" | "EDITOR";

type Props = {
  email: string;
  role: InviteRole;
  onChangeEmail: (value: string) => void;
  onChangeRole: (role: InviteRole) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export class InviteDialog extends Component<Props> {
  handleEmailChange = (event: ChangeEvent<HTMLInputElement>) => {
    this.props.onChangeEmail(event.target.value);
  };

  render() {
    const { email, role, onChangeRole, onCancel, onConfirm } = this.props;

    return (
      <DialogShell>
        <h2 className="text-base font-semibold text-slate-900">Share with email</h2>
        <p className="mt-1 text-sm text-slate-500">
          The recipient will receive access at the selected permission level.
        </p>
        <div className="mt-4 space-y-3">
          <input
            autoFocus
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 transition focus:border-slate-400 focus:bg-white"
            onChange={this.handleEmailChange}
            placeholder="user@example.com"
            type="email"
            value={email}
          />
          <div className="flex gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                checked={role === "VIEWER"}
                className="accent-slate-900"
                onChange={() => onChangeRole("VIEWER")}
                type="radio"
                value="VIEWER"
              />
              Viewer
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                checked={role === "EDITOR"}
                className="accent-slate-900"
                onChange={() => onChangeRole("EDITOR")}
                type="radio"
                value="EDITOR"
              />
              Editor
            </label>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <PrimaryButton onClick={onCancel} tone="secondary" type="button">
            Cancel
          </PrimaryButton>
          <PrimaryButton
            disabled={!email.trim()}
            onClick={onConfirm}
            type="button"
          >
            Send invite
          </PrimaryButton>
        </div>
      </DialogShell>
    );
  }
}
