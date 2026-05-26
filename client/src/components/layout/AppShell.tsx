import type { ReactNode } from "react";
import { Component } from "react";

type AppShellProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  sidebar?: ReactNode;
  children: ReactNode;
};

export class AppShell extends Component<AppShellProps> {
  render() {
    const { title, subtitle, actions, sidebar, children } = this.props;

    return (
      <main className="min-h-screen bg-slate-100 text-slate-900">
        <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
          <header className="rounded-2xl border border-slate-200 bg-white px-6 py-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
                {subtitle ? (
                  <p className="mt-0.5 truncate text-sm text-slate-400">{subtitle}</p>
                ) : null}
              </div>
              {actions ? (
                <div className="flex flex-wrap items-center gap-2">{actions}</div>
              ) : null}
            </div>
          </header>
          <div className="mt-4 grid flex-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              {sidebar}
            </aside>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              {children}
            </section>
          </div>
        </div>
      </main>
    );
  }
}
