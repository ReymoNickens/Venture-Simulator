import { createContext, useContext, type ReactNode } from "react";
import type { CourseOffering } from "@/lib/domain/types";

export type StaffCtx = {
  staff: { id: string; fullName: string; offeringIds: string[] };
  offerings: CourseOffering[];
  offeringId: string;
  setOfferingId: (id: string) => void;
};

const Ctx = createContext<StaffCtx | null>(null);

export function StaffProvider({ value, children }: { value: StaffCtx; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStaff(): StaffCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStaff must be used inside the lecturer layout");
  return v;
}
