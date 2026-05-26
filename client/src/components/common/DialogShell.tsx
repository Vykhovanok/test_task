import { Component, type ReactNode } from "react";

type Props = {
  children: ReactNode;
};

export class DialogShell extends Component<Props> {
  render() {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
          {this.props.children}
        </div>
      </div>
    );
  }
}
