import { Link } from "@tanstack/react-router";
import { EmptyNote } from "@/components/ui/badge";

export function NeedsVenture() {
  return (
    <EmptyNote>
      This stop opens once your group has ratified a venture.{" "}
      <Link to="/studio/select" className="font-semibold text-accent underline">
        Go to Choose together
      </Link>
    </EmptyNote>
  );
}
