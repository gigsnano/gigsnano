import type { ReactNode } from "react";

export function AdminHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border px-4 py-2 sm:px-6">
      <h1 className="min-w-0 truncate text-sm font-semibold tracking-tight text-foreground">{title}</h1>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
