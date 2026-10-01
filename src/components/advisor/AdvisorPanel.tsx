import { useState } from "react";
import { sendAdvisorMessage } from "@/lib/server/advisor";
import type { AdvisorSession, AdvisorStage, WorkspaceSnapshot } from "@/lib/domain/types";
import { OFFLINE_AI } from "@/lib/domain/copy";
import { Button } from "@/components/ui/button";
import { FormMessages } from "@/components/ui/feedback";
import { Textarea } from "@/components/ui/input";
import { Card } from "@/components/ui/badge";
import { useConnection } from "@/hooks/use-connection";

export function AdvisorPanel({
  data,
  stage,
  onSent,
}: {
  data: WorkspaceSnapshot;
  stage: AdvisorStage;
  onSent: () => void;
}) {
  const session: AdvisorSession | undefined = data.advisorSessions.find((s) => s.stage === stage);
  const { state } = useConnection();
  const offline = state === "offline" || state === "saved_locally" || state === "sync_error";
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setError(null);
    if (offline) {
      setError(OFFLINE_AI);
      return;
    }
    if (!data.aiAvailable) {
      setError("The AI advisor is not available in this environment.");
      return;
    }
    setPending(true);
    try {
      await sendAdvisorMessage({
        data: { stage, content: text, sessionId: session?.id },
      });
      setText("");
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The advisor could not reply.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <p className="flex items-center gap-2 text-xs font-semibold text-indigo">
          <span className="size-2 rounded-full bg-indigo" /> Advisor
        </p>
        <h2 className="font-display text-xl font-bold">Challenge, not cheerleading</h2>
        <p className="mt-1 text-sm text-muted">
          The advisor will not pick an opportunity for you, invent statistics, or write your answers.
        </p>
      </div>
      <div className="space-y-3">
        {(session?.messages ?? []).map((m) => (
          <div
            key={m.id}
            className={
              m.role === "advisor"
                ? "mr-6 rounded-[18px] rounded-tl-[6px] bg-indigo-soft px-3.5 py-2.5 text-sm leading-6 text-ink"
                : "ml-6 rounded-[18px] rounded-tr-[6px] bg-ink px-3.5 py-2.5 text-sm leading-6 text-white"
            }
          >
            <p className={m.role === "advisor" ? "mb-1 text-xs font-semibold text-indigo" : "mb-1 text-xs font-semibold text-white/60"}>
              {m.role === "advisor" ? "Advisor" : "You"}
            </p>
            <p>{m.content}</p>
            {m.role === "advisor" && m.metadata?.suggestedNextAction ? (
              <p className="mt-2 text-xs font-semibold text-indigo">Try next: {m.metadata.suggestedNextAction}</p>
            ) : null}
          </div>
        ))}
        {!session?.messages.length ? (
          <p className="text-sm text-muted">
            Ask about evidence, the alternatives you rejected, or the assumption that would kill this idea.
          </p>
        ) : null}
      </div>
      {offline ? (
        <p className="rounded-[14px] bg-gold-soft px-3 py-2 text-sm text-gold-deep">{OFFLINE_AI}</p>
      ) : (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What are you unsure about?"
            disabled={pending}
          />
          <FormMessages error={error} />
          <Button type="submit" className="w-full" disabled={pending || !text.trim()}>
            {pending ? "Asking…" : "Ask the advisor"}
          </Button>
        </form>
      )}
    </Card>
  );
}
