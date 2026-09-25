import { useEffect, useRef, useState } from "react";
import { ArrowUp, Lock, Sparkles, WifiOff } from "lucide-react";
import { sendAdvisorMessage } from "@/lib/server/advisor";
import type { AdvisorMessage, AdvisorStage, WorkspaceSnapshot } from "@/lib/domain/types";
import { OFFLINE_AI } from "@/lib/domain/copy";
import { Button } from "@/components/ui/button";
import { useConnection } from "@/hooks/use-connection";
import { cn } from "@/lib/utils";

const PROMPTS: Record<AdvisorStage, string[]> = {
  idea: [
    "Is my problem specific enough?",
    "What should I go and count or observe?",
    "Am I describing a problem or a solution?",
  ],
  selection: [
    "What should we compare the ideas on?",
    "Which idea has the weakest evidence?",
    "How do we disagree without it getting personal?",
  ],
  evidence: [
    "Which assumption should we test first?",
    "Is this evidence or opinion?",
    "Design a cheap test for our riskiest assumption",
  ],
};

export const STAGE_INTRO: Record<AdvisorStage, { title: string; body: string }> = {
  idea: { title: "Your idea", body: "Private to you. Helps you sharpen your own problem — it won't write it for you." },
  selection: { title: "Choosing", body: "Shared with your group. Helps you compare ideas fairly — it won't pick one." },
  evidence: { title: "Evidence & tests", body: "Shared with your group. Challenges your assumptions and evidence." },
};

export function AdvisorPanel({ data, stage, onSent }: { data: WorkspaceSnapshot; stage: AdvisorStage; onSent: () => void }) {
  const session = data.advisorSessions.find((s) => s.stage === stage);
  const { state } = useConnection();
  const offline = state === "offline" || state === "saved_locally" || state === "sync_error";
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(data.advisorLeftToday);
  const end = useRef<HTMLDivElement>(null);
  const names = new Map(data.members.map((m) => [m.studentId, m.studentId === data.student?.id ? "You" : m.fullName.split(" ")[0]]));
  const messages: AdvisorMessage[] = session?.messages ?? [];

  useEffect(() => setLeft(data.advisorLeftToday), [data.advisorLeftToday]);
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [messages.length, optimistic]);

  async function send(content: string) {
    setError(null);
    if (!content.trim()) return;
    if (offline) return setError(OFFLINE_AI);
    if (!data.aiAvailable) return setError("The advisor isn't switched on for this course yet.");
    setPending(true);
    setOptimistic(content);
    setText("");
    try {
      const r = await sendAdvisorMessage({ data: { stage, content, sessionId: session?.id } });
      setLeft(r.leftToday);
      onSent();
    } catch (err) {
      setText(content);
      setError(err instanceof Error ? err.message : "The advisor could not reply.");
    } finally {
      setPending(false);
      setOptimistic(null);
    }
  }

  const empty = !messages.length && !optimistic;

  return (
    <div className="flex min-h-[60dvh] flex-col">
      <div className="flex-1 space-y-3">
        {empty ? (
          <div className="rounded-[20px] border border-dashed border-line-strong/70 p-5 text-center">
            <span className="mx-auto grid size-11 place-items-center rounded-full bg-sun-soft text-[#8a5a0f]"><Sparkles className="size-5" /></span>
            <p className="mt-2 font-display text-lg">Ask a hard question</p>
            <p className="mx-auto mt-1 max-w-[40ch] text-sm leading-6 text-muted">
              The advisor challenges rather than cheers. It won't invent statistics, pick your idea, or write your answers.
            </p>
          </div>
        ) : null}
        {messages.map((m) => (
          <Bubble key={m.id} mine={m.role === "student" && m.studentId === data.student?.id} who={m.role === "advisor" ? "Advisor" : (names.get(m.studentId ?? "") ?? "Teammate")} advisor={m.role === "advisor"}>
            <p className="whitespace-pre-line">{m.content}</p>
            {m.role === "advisor" && m.metadata?.suggestedNextAction ? (
              <p className="mt-2 rounded-[10px] bg-white/60 px-2.5 py-1.5 text-xs font-semibold text-accent">Try next: {m.metadata.suggestedNextAction}</p>
            ) : null}
          </Bubble>
        ))}
        {optimistic ? (
          <>
            <Bubble mine who="You"><p className="whitespace-pre-line">{optimistic}</p></Bubble>
            <Bubble advisor who="Advisor">
              <span className="inline-flex gap-1" aria-label="Advisor is thinking">
                {[0, 1, 2].map((i) => <span key={i} className="size-1.5 animate-bounce rounded-full bg-accent" style={{ animationDelay: `${i * 0.15}s` }} />)}
              </span>
            </Bubble>
          </>
        ) : null}
        <div ref={end} />
      </div>

      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] mt-4 space-y-2 bg-gradient-to-t from-bg via-bg to-transparent pt-4 lg:bottom-4">
        {offline ? (
          <p className="flex items-center gap-2 rounded-[12px] bg-warn-soft px-3 py-2 text-sm text-warn"><WifiOff className="size-4 shrink-0" /> {OFFLINE_AI}</p>
        ) : (
          <>
            {empty ? (
              <div className="scroll-snap-x -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
                {PROMPTS[stage].map((p) => (
                  <button key={p} type="button" disabled={pending} onClick={() => void send(p)} className="shrink-0 rounded-full border border-line bg-bg-elevated px-3 py-1.5 text-sm hover:border-accent">
                    {p}
                  </button>
                ))}
              </div>
            ) : null}
            <form
              className="flex items-end gap-2 rounded-[20px] border border-line bg-bg-elevated p-1.5 shadow-[var(--shadow-card)] focus-within:border-accent"
              onSubmit={(e) => {
                e.preventDefault();
                void send(text.trim());
              }}
            >
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(min-width: 1024px)").matches) {
                    e.preventDefault();
                    void send(text.trim());
                  }
                }}
                rows={1}
                maxLength={1500}
                placeholder="What are you unsure about?"
                aria-label="Message the advisor"
                className="max-h-36 min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-base leading-6 outline-none placeholder:text-faint"
                disabled={pending}
              />
              <Button type="submit" size="icon" disabled={pending || !text.trim() || left <= 0} aria-label="Send">
                <ArrowUp className="size-5" />
              </Button>
            </form>
            <p className="flex items-center justify-between gap-2 px-1 text-xs text-muted">
              <span className="flex items-center gap-1">{stage === "idea" ? <><Lock className="size-3" /> Only you can see this chat</> : "Your group can see this chat"}</span>
              <span className={cn(left <= 5 && "font-semibold text-warn")}>{left} question{left === 1 ? "" : "s"} left today</span>
            </p>
          </>
        )}
        {error ? <p role="alert" className="rounded-[12px] bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p> : null}
      </div>
    </div>
  );
}

function Bubble({ children, mine, advisor, who }: { children: React.ReactNode; mine?: boolean; advisor?: boolean; who: string }) {
  return (
    <div className={cn("flex animate-rise flex-col", mine ? "items-end" : "items-start")}>
      <span className="mb-1 px-1 text-[11px] font-semibold text-muted">{who}</span>
      <div
        className={cn(
          "max-w-[88%] rounded-[20px] px-4 py-3 text-[15px] leading-6",
          mine ? "rounded-br-[6px] bg-night text-accent-fg" : advisor ? "rounded-bl-[6px] bg-accent-soft text-ink" : "rounded-bl-[6px] border border-line bg-bg-elevated",
        )}
      >
        {children}
      </div>
    </div>
  );
}
