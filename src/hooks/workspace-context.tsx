import { createContext, useContext, type ReactNode } from "react";
import type { WorkspaceSnapshot } from "@/lib/domain/types";

type Ctx = {
  data: WorkspaceSnapshot | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<WorkspaceSnapshot | null>;
};

const WorkspaceContext = createContext<Ctx | null>(null);

export function WorkspaceProvider({
  value,
  children,
}: {
  value: Ctx;
  children: ReactNode;
}) {
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useStudioWorkspace(): Ctx {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useStudioWorkspace must be used inside the studio layout");
  }
  return ctx;
}
