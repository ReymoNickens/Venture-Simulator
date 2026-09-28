import { useEffect, useRef, useState } from "react";
import { WifiOff } from "lucide-react";
import { sendAdvisorMessage } from "@/lib/server/advisor";
import type { AdvisorSession, AdvisorStage, WorkspaceSnapshot } from "@/lib/domain/types";
import { OFFLINE_AI } from "@/lib/domain/copy";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Stamp } from "@/components/ui/stamp";
import { FormMessages } from "@/components/ui/feedback";
import { useConnection } from "@/hooks/use-connection";
import { errorMessage } from "@/hooks/use-action";
import { cn } from "@/lib/utils";

const PROMPTS: Record<AdvisorStage, string[]> = {
  selection: [
    "What is weakest about the opportunity I prefer?",
    "What should we learn from the ideas we are rejecting?",
    "Who exactly has this problem?",
  ],
  evidence: [
    "Which of our assumptions could kill this venture?",
    "Is our evidence strong enough, or is it opinion?",
    "What should I ask in my next interview?",
    "Challenge our price.",
  ],
};

export function AdvisorPanel({
  data,
  stage,
  onSent,
  className,
}: {
  data: WorkspaceSnapshot;
  stage: AdvisorStage;
  onSent: () => void;
  className?: string;
}) {
  const session: AdvisorSession | undefined = data.advisorSessions.find((s) => s.stage === stage);
  const { state } = useConnection();
  const offline = state === "offline" || state === "saved_locally" || state === "sync_error";
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const messages = session?.messages ?? [];

  const today = new Date().toDateString();
  const usedToday = data.advisorSessions
    .flatMap((s) => s.messages)
    .filter(
      (m) => m.role === "student" && m.studentId === data.student?.id && new Date(m.createdAt).toDateString() === today,
    ).length;
  const limit = data.offering?.aiDailyStudentLimit ?? 25;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  async function send(content: string) {
    setError(null);
    if (offline) return setError(OFFLINE_AI);
    if (!data.aiAvailable) return setError("The AI advisor is not switched on for this course yet.");
    setPending(true);
    try {
      await sendAdvisorMessage({ data: { stage, content, sessionId: session?.id } });
      setText("");
      onSent();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={cn("overflow-hidden rounded-[22px] ring-1 ring-line bg-bg-elevated", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-line bg-ink px-4 py-3 text-bg-elevated">
        <div>
          <p className="font-display text-base font-bold">The Advisor</p>
          <p className="text-[11px] text-bg-elevated/70">Asks hard questions. Never writes your answers.</p>
        </div>
        <span className="font-mono text-[11px] tabular text-bg-elevated/80">
          {Math.max(0, limit - usedToday)}/{limit} left today
        </span>
      </div>

      <div className="max-h-[55dvh] space-y-3 overflow-y-auto px-3 py-4 sm:px-4">
        {messages.length === 0 ? (
          <p className="text-sm text-muted">
            The advisor has read your group’s record. It will not tell you which idea to pick, invent
            market figures, or praise you. Ask it to push on your reasoning.
          </p>
        ) : null}
        {messages.map((m) =>
          m.role === "advisor" ? (
            <div key={m.id} className="mr-6 rounded-[18px] rounded-tl-[2px] ring-1 ring-line bg-gold-soft px-3 py-2.5 text-sm leading-6">
              {m.metadata?.challengeType ? (
                <Stamp tone="clay" size="xs" tilt={-2} className="mb-1.5">
                  {m.metadata.challengeType}
                </Stamp>
              ) : null}
              <p className="whitespace-pre-line">{m.content}</p>
              {m.metadata?.suggestedNextAction ? (
                <p className="mt-2 border-t border-ink/15 pt-2 text-xs font-semibold text-accent">
                  Try this: {m.metadata.suggestedNextAction}
                </p>
              ) : null}
            </div>
          ) : (
            <div key={m.id} className="ml-8 rounded-[18px] rounded-tr-[2px] bg-bg-subtle px-3 py-2.5 text-sm leading-6">
              {m.studentId && m.studentId !== data.student?.id ? (
                <p className="mb-0.5 text-[11px] font-semibold text-muted">
                  {data.members.find((x) => x.studentId === m.studentId)?.fullName ?? "Teammate"}
                </p>
              ) : null}
              <p className="whitespace-pre-line">{m.content}</p>
            </div>
          ),
        )}
        {pending ? <p className="text-xs text-muted">The advisor is reading your record…</p> : null}
        <div ref={endRef} />
      </div>

      <div className="border-t border-line px-3 pb-3 sm:px-4">
        {offline ? (
          <p className="mt-3 flex items-start gap-2 rounded-[14px] bg-warn-soft px-3 py-2 text-sm text-warn">
            <WifiOff className="mt-0.5 size-4 shrink-0" aria-hidden /> {OFFLINE_AI}
          </p>
        ) : (
          <form
            className="space-y-2 pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) void send(text.trim());
            }}
          >
            <div className="flex flex-wrap gap-1.5">
              {PROMPTS[stage].map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={pending}
                  onClick={() => setText(p)}
                  className="rounded-full border border-line-strong px-2.5 py-1 text-xs text-ink-soft hover:border-ink"
                >
                  {p}
                </button>
              ))}
            </div>
            <Textarea
              aria-label="Your question for the advisor"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What are you unsure about?"
              disabled={pending}
              className="min-h-20"
            />
            <FormMessages error={error} />
            <Button type="submit" disabled={pending || !text.trim()}>
              {pending ? "Asking…" : "Ask the advisor"}
            </Button>
          </form>
        )}
      </div>
    </section>
  );
}
