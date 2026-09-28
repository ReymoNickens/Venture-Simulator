import { Quote } from "lucide-react";
import type { WeeklyRecap } from "@/lib/domain/recap";
import { PERSONA_COLORS } from "@/lib/recap-image";
import { Sparkle } from "@/components/ui/sticker";

const STATS = [
  { key: "interviews", one: "interview", many: "interviews", fill: "#2d4bff", fg: "#fff" },
  { key: "places", one: "place", many: "places", fill: "#19a974", fg: "#fff" },
  { key: "tests", one: "test", many: "tests", fill: "#ff5a3c", fg: "#fff" },
  { key: "notes", one: "note", many: "notes", fill: "#ff8fc7", fg: "#111" },
] as const;

/**
 * The recap as it shows on screen. It mirrors the shared PNG (see
 * recap-image.ts) so what students see is what they post.
 */
export function RecapCard({ recap }: { recap: WeeklyRecap }) {
  const c = PERSONA_COLORS[recap.persona.key];
  const light = c.ink !== "#111111";
  const value = (k: (typeof STATS)[number]["key"]) => (k === "places" ? recap.places.length : recap[k]);
  return (
    <article
      className="rise relative overflow-hidden rounded-[28px] p-6 ring-1 ring-black/5 sm:p-8"
      style={{ background: c.bg, color: c.ink }}
      aria-label={`${recap.crewName}, ${recap.label}: ${recap.persona.title}`}
    >
      <Sparkle className="absolute top-6 right-7 size-7" />
      <p className="text-sm font-semibold opacity-75">
        {recap.inProgress ? "This week so far" : "Our week"} · {recap.label}
      </p>
      <p className="mt-1 pr-10 font-display text-lg leading-tight font-extrabold">{recap.crewName}</p>

      <h2 className="mt-6 font-display text-[44px] leading-[0.95] font-extrabold sm:text-6xl">{recap.persona.title}</h2>
      <p className="mt-2 text-[15px] leading-6 opacity-90">{recap.persona.line}</p>

      <ul className="mt-7 grid grid-cols-4 gap-2">
        {STATS.map((s, i) => {
          const n = value(s.key);
          return (
            <li key={s.key} className="flex flex-col items-center gap-2 text-center">
              <span
                className="sticker flex size-14 items-center justify-center rounded-full font-display text-2xl font-extrabold tabular sm:size-16"
                style={{
                  background: s.fill === c.bg ? "#111" : s.fill,
                  color: s.fill === c.bg ? "#fff" : s.fg,
                  transform: `rotate(${(i % 2 ? 1 : -1) * 6}deg)`,
                }}
              >
                {n}
              </span>
              <span className="text-xs font-semibold">{n === 1 ? s.one : s.many}</span>
            </li>
          );
        })}
      </ul>

      {recap.places.length ? (
        <div className="mt-7">
          <p className="text-xs font-semibold opacity-75">Where we went</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {recap.places.slice(0, 4).map((p) => (
              <li
                key={p}
                className="max-w-full truncate rounded-full px-3.5 py-1.5 text-sm font-bold"
                style={{ background: light ? "rgba(255,255,255,0.18)" : "#fff" }}
              >
                {p}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {recap.quote ? (
        <figure className="mt-7 flex gap-3">
          <Quote className="size-6 shrink-0" style={{ color: c.accent }} aria-hidden />
          <div>
            <blockquote className="text-[15px] leading-6 italic">{recap.quote}</blockquote>
            <figcaption className="mt-1 text-xs opacity-70">— someone we met in Cape Coast</figcaption>
          </div>
        </figure>
      ) : null}

      {recap.moments.length ? (
        <ul className="mt-6 flex flex-wrap gap-2">
          {recap.moments.map((m) => (
            <li key={m} className="rounded-full border px-3 py-1 text-xs font-semibold" style={{ borderColor: "currentColor" }}>
              ★ {m}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
