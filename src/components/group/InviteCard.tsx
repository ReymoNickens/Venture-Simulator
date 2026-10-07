import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { inviteLink, whatsappShare } from "@/lib/invite/pending";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

/**
 * The group's invite: a link the leader sends on WhatsApp. Whoever opens it
 * signs in with their phone, fills in their details and lands in this group.
 */
export function InviteCard({
  groupName,
  code,
  members,
  capacity,
}: {
  groupName: string;
  code: string;
  members: number;
  capacity: number;
}) {
  const [copied, setCopied] = useState(false);
  const link = inviteLink(code);
  const full = members >= capacity;
  return (
    <div className="paper space-y-3 rounded-[18px] p-5">
      <div>
        <h2 className="font-display text-xl font-extrabold">
          Invite your <span className="mark">group</span>
        </h2>
        <p className="mt-1 text-[15px] leading-6 text-ink-soft">
          {full
            ? `All ${capacity} places are taken.`
            : `Send this link to your group members. ${members} of ${capacity} places taken.`}
        </p>
      </div>
      {!full ? (
        <>
          <p className="rounded-[10px] border border-line bg-bg-subtle px-3 py-2.5 font-mono text-sm break-all">{link}</p>
          <div className="grid gap-2">
            <a
              href={whatsappShare(groupName, code)}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ size: "lg" })}
            >
              Share on WhatsApp
            </a>
            <button
              type="button"
              className={cn(buttonVariants({ size: "lg", variant: "secondary" }))}
              onClick={() => {
                void navigator.clipboard?.writeText(link).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
            >
              {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
          <p className="text-sm text-muted">
            They can also type the code <span className="font-mono font-semibold text-ink">{code}</span> in the app.
          </p>
        </>
      ) : null}
    </div>
  );
}
