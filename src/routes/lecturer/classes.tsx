import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Download, Users } from "lucide-react";
import { useLecturer } from "@/hooks/lecturer-context";
import { getMarksSheet } from "@/lib/server/lecturers";
import { classLabel, type LecturerClass } from "@/lib/lecturers/data";
import { Button } from "@/components/ui/button";
import { FormMessages } from "@/components/ui/feedback";

export const Route = createFileRoute("/lecturer/classes")({ component: ClassesPage });

function ClassesPage() {
  const { home } = useLecturer();
  return (
    <div className="flow-enter space-y-5 pt-2">
      <div>
        <p className="text-xs font-semibold text-muted">Classes you teach</p>
        <h1 className="font-display text-[32px] leading-none font-extrabold">Classes</h1>
      </div>
      <ul className="space-y-3">
        {home.classes.map((c) => (
          <li key={c.offeringId}>
            <ClassCard c={c} activeGroups={home.groups.filter((g) => g.offeringId === c.offeringId).length} />
          </li>
        ))}
      </ul>
      <p className="text-xs leading-5 text-muted">
        Class lists are kept by each class’s course rep. If a student is missing, ask the rep to add them. To change
        which classes you see, ask the platform owner.
      </p>
    </div>
  );
}

function ClassCard({ c, activeGroups }: { c: LecturerClass; activeGroups: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = classLabel(c);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const rows = await getMarksSheet({ data: { offeringId: c.offeringId } });
      // Loaded on demand: only lecturers downloading a sheet need the zipper.
      const { marksWorkbook } = await import("@/lib/lecturers/marks-xlsx");
      const bytes = marksWorkbook(rows, `${label} · ${c.semester} ${c.academicYear}`);
      const blob = new Blob([bytes as BlobPart], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${label.replace(/[^\w]+/g, "-")}-marks.xlsx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build the sheet.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-[20px] border border-line bg-bg-elevated p-4">
      <div>
        <p className="font-display text-lg leading-tight font-bold">{label}</p>
        <p className="text-sm text-muted">
          {c.semester} {c.academicYear}
        </p>
      </div>
      <p className="flex items-center gap-2 text-sm">
        <Users className="size-4 text-muted" aria-hidden />
        <strong className="tabular-nums">{c.students}</strong> students ·{" "}
        <strong className="tabular-nums">{activeGroups}</strong> groups
      </p>
      <Button variant="secondary" className="w-full" disabled={busy} onClick={() => void download()}>
        <Download className="size-4" aria-hidden />
        {busy ? "Building sheet…" : "Download marks sheet (.xlsx)"}
      </Button>
      <FormMessages error={error} />
    </div>
  );
}
