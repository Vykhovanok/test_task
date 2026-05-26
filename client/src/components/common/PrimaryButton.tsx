import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Component } from "react";

type PrimaryButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  tone?: "primary" | "secondary" | "danger";
  size?: "sm" | "md";
};

export class PrimaryButton extends Component<PrimaryButtonProps> {
  render() {
    const { children, className = "", tone = "primary", size = "md", ...rest } = this.props;

    const toneClasses =
      tone === "danger"
        ? "bg-red-600 text-white hover:bg-red-500 active:bg-red-700"
        : tone === "secondary"
          ? "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300 active:bg-slate-100"
          : "bg-slate-900 text-white hover:bg-slate-700 active:bg-slate-800";

    const sizeClasses =
      size === "sm"
        ? "rounded-lg px-2.5 py-1 text-xs"
        : "rounded-xl px-4 py-2.5 text-sm";

    return (
      <button
        {...rest}
        className={`font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${sizeClasses} ${toneClasses} ${className}`}
      >
        {children}
      </button>
    );
  }
}
