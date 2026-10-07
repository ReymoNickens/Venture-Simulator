import { useState } from "react";
import { signOut } from "@/lib/auth/client";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { isDemoEmail } from "@/lib/demo/names";

/**
 * Shown only on the look-around demo accounts: who you are, and a way back
 * to the owner page to try another role.
 */
export function DemoBar({ role }: { role: string }) {
  const user = useCurrentUser();
  const [leaving, setLeaving] = useState(false);
  if (!isDemoEmail(user?.primaryEmail)) return null;
  return (
    <div className="no-print border-b border-gold/40 bg-gold-soft text-ink">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-1.5 text-sm">
        <span className="min-w-0 truncate">
          Practice account: you are the <strong>{role}</strong>
        </span>
        <button
          type="button"
          disabled={leaving}
          className="min-h-9 shrink-0 rounded-[8px] border border-ink/20 bg-bg-elevated px-3 font-semibold"
          onClick={() => {
            setLeaving(true);
            signOut("/owner").catch(() => setLeaving(false));
          }}
        >
          {leaving ? "Switching…" : "Switch role"}
        </button>
      </div>
    </div>
  );
}
