import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { UserButton } from "@/lib/auth/gates";
import { APP_NAME } from "@/lib/brand";
import { ConnectionBar } from "./ConnectionBar";
import { JourneyRail } from "./JourneyRail";
import type { WorkspaceSnapshot } from "@/lib/domain/types";

export function AppShell({
  children,
  data,
}: {
  children: ReactNode;
  data: WorkspaceSnapshot | null;
}) {
  return (
    <div className="min-h-dvh bg-bg pl-3 text-ink sm:pl-4">
      <ConnectionBar />
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <Link to="/studio" className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Studio</p>
          <p className="truncate font-display text-lg leading-tight">{APP_NAME}</p>
        </Link>
        <div className="shrink-0">
          <UserButton />
        </div>
      </header>
      {data ? (
        <div className="px-4 pb-3">
          <JourneyRail data={data} />
        </div>
      ) : null}
      <main className="mx-auto w-full max-w-3xl px-4 pb-16">{children}</main>
    </div>
  );
}
