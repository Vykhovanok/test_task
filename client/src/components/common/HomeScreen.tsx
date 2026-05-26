import Link from "next/link";
import { Component } from "react";

const primaryLinkClassName =
  "inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 active:bg-slate-950";

const secondaryLinkClassName =
  "inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 active:bg-slate-100";

export class HomeScreen extends Component {
  render() {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12">
        <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
            File Storage Service
          </span>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            Multi-user file management
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Sign in to upload images, organise folders, and share files with collaborators.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className={primaryLinkClassName} href="/login">
              Sign in
            </Link>
            <Link className={secondaryLinkClassName} href="/drive">
              Open Drive
            </Link>
          </div>
        </section>
      </main>
    );
  }
}
