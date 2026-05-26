import { Component } from "react";

type StatusPanelProps = {
  title: string;
  message: string;
  tone?: "neutral" | "error";
};

export class StatusPanel extends Component<StatusPanelProps> {
  render() {
    const { title, message, tone = "neutral" } = this.props;
    const classes =
      tone === "error"
        ? "border-red-200 bg-red-50 text-red-700"
        : "border-slate-200 bg-slate-50 text-slate-500";

    return (
      <div className={`rounded-xl border px-4 py-3.5 ${classes}`}>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-70">{title}</p>
        <p className="mt-1.5 text-sm">{message}</p>
      </div>
    );
  }
}
