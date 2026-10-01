import { createContext, useContext, type ReactNode } from "react";
import type { LecturerHome } from "@/lib/server/lecturers";

type Ctx = { home: LecturerHome; refresh: () => Promise<void> };

const LecturerContext = createContext<Ctx | null>(null);

export function LecturerProvider({ value, children }: { value: Ctx; children: ReactNode }) {
  return <LecturerContext.Provider value={value}>{children}</LecturerContext.Provider>;
}

// A hook beside its provider, as in workspace-context; fast refresh just reloads this file.
// eslint-disable-next-line react-refresh/only-export-components
export function useLecturer(): Ctx {
  const ctx = useContext(LecturerContext);
  if (!ctx) throw new Error("useLecturer must be used inside the lecturer layout");
  return ctx;
}
