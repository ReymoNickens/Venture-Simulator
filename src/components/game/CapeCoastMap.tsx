import { PLACES, type PlaceId } from "@/lib/game/fundraise";
import { cn } from "@/lib/utils";

/**
 * A little Cape Coast: campus at the top, Kotokuraba and town in the middle,
 * the sea along the bottom. Drawn in SVG so it is light on data and sharp on
 * any phone. Buildings are simple isometric blocks; placeholder art until an
 * illustrator draws the real thing.
 */

const ROADS: [PlaceId, PlaceId][] = [
  ["hostel", "library"],
  ["library", "enterprise"],
  ["hostel", "friend"],
  ["friend", "market"],
  ["friend", "bank"],
  ["enterprise", "bank"],
  ["market", "bank"],
  ["bank", "microfinance"],
  ["market", "family"],
];

const LOOK: Record<PlaceId, { wall: string; side: string; roof: string; w: number; h: number; kind?: "bank" | "market" | "house" | "dome" }> = {
  hostel: { wall: "#f6a6c1", side: "#d97f9f", roof: "#1a1714", w: 34, h: 40 },
  library: { wall: "#fff0c2", side: "#e8cf86", roof: "#0e7a4a", w: 44, h: 30, kind: "dome" },
  enterprise: { wall: "#e2e8f7", side: "#aab8de", roof: "#2f4ba0", w: 34, h: 28 },
  friend: { wall: "#dcf1e5", side: "#a5d4b8", roof: "#e0412b", w: 30, h: 34 },
  market: { wall: "#f6b800", side: "#c99400", roof: "#e0412b", w: 50, h: 18, kind: "market" },
  bank: { wall: "#ffffff", side: "#d3c5ad", roof: "#2f4ba0", w: 42, h: 36, kind: "bank" },
  microfinance: { wall: "#fde3dd", side: "#e9b1a5", roof: "#6b6257", w: 30, h: 26 },
  family: { wall: "#fff8ec", side: "#e2d3b8", roof: "#7a5600", w: 34, h: 24, kind: "house" },
};

function Building({ id }: { id: PlaceId }) {
  const p = PLACES[id];
  const l = LOOK[id];
  const d = 12; // isometric depth
  const x = p.x - l.w / 2;
  const y = p.y - l.h;
  return (
    <g>
      <ellipse cx={p.x + d / 2} cy={p.y + 4} rx={l.w / 2 + 10} ry={7} fill="#1a1714" opacity={0.12} />
      {/* side */}
      <polygon points={`${x + l.w},${y} ${x + l.w + d},${y - d / 2} ${x + l.w + d},${p.y - d / 2} ${x + l.w},${p.y}`} fill={l.side} stroke="#1a1714" strokeWidth={1.5} />
      {/* front */}
      <rect x={x} y={y} width={l.w} height={l.h} fill={l.wall} stroke="#1a1714" strokeWidth={1.5} />
      {/* roof */}
      {l.kind === "house" ? (
        <polygon points={`${x - 3},${y} ${x + l.w / 2},${y - 18} ${x + l.w + 3},${y}`} fill={l.roof} stroke="#1a1714" strokeWidth={1.5} />
      ) : l.kind === "dome" ? (
        <path d={`M ${x + 8} ${y} A ${l.w / 2 - 8} ${l.w / 2 - 8} 0 0 1 ${x + l.w - 8} ${y} Z`} fill={l.roof} stroke="#1a1714" strokeWidth={1.5} />
      ) : (
        <polygon points={`${x},${y} ${x + d},${y - d / 2} ${x + l.w + d},${y - d / 2} ${x + l.w},${y}`} fill={l.roof} stroke="#1a1714" strokeWidth={1.5} />
      )}
      {/* details */}
      {l.kind === "bank"
        ? [0, 1, 2, 3].map((i) => <rect key={i} x={x + 5 + i * 10} y={y + 8} width={4} height={l.h - 8} fill="#d3c5ad" stroke="#1a1714" strokeWidth={0.8} />)
        : l.kind === "market"
          ? [0, 1, 2, 3, 4].map((i) => <rect key={i} x={x + i * 10} y={y} width={5} height={7} fill="#ffffff" opacity={0.9} />)
          : (
              <>
                <rect x={x + 6} y={y + 8} width={7} height={7} fill="#1a1714" opacity={0.75} />
                <rect x={x + l.w - 13} y={y + 8} width={7} height={7} fill="#1a1714" opacity={0.75} />
                <rect x={x + l.w / 2 - 4} y={p.y - 12} width={8} height={12} fill="#1a1714" opacity={0.85} />
              </>
            )}
    </g>
  );
}

function Palm({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <path d={`M ${x} ${y} q 3 -14 0 -26`} stroke="#7a5600" strokeWidth={3} fill="none" />
      {[-60, -20, 20, 60, 160].map((a) => (
        <ellipse key={a} cx={x} cy={y - 26} rx={11} ry={3.5} fill="#0e7a4a" transform={`rotate(${a} ${x} ${y - 26}) translate(8 0)`} />
      ))}
    </g>
  );
}

export function CapeCoastMap({
  at,
  selected,
  onSelect,
}: {
  at: PlaceId;
  selected: PlaceId | null;
  onSelect: (id: PlaceId) => void;
}) {
  const me = PLACES[at];
  return (
    <svg viewBox="0 0 360 460" className="block w-full select-none" role="img" aria-label="Map of Cape Coast">
      {/* land and sea */}
      <rect width={360} height={460} fill="#f3e6c8" />
      <path d="M 0 430 Q 60 418 120 432 T 240 428 T 360 420 L 360 460 L 0 460 Z" fill="#7cc4d8" />
      <path d="M 0 436 Q 60 424 120 438 T 240 434 T 360 426" stroke="#ffffff" strokeWidth={2} fill="none" opacity={0.7} />
      <text x={300} y={452} fontSize={10} fontWeight={700} fill="#ffffff">Gulf of Guinea</text>
      {/* campus lawn */}
      <rect x={150} y={14} width={196} height={170} rx={24} fill="#cfe8b8" />
      <text x={330} y={32} textAnchor="end" fontSize={10} fontWeight={800} fill="#3a6b2c">UCC CAMPUS</text>
      {/* roads */}
      {ROADS.map(([a, b]) => (
        <g key={`${a}-${b}`}>
          <line x1={PLACES[a].x} y1={PLACES[a].y} x2={PLACES[b].x} y2={PLACES[b].y} stroke="#d9c9a3" strokeWidth={14} strokeLinecap="round" />
          <line x1={PLACES[a].x} y1={PLACES[a].y} x2={PLACES[b].x} y2={PLACES[b].y} stroke="#fff8ec" strokeWidth={1.5} strokeDasharray="5 6" />
        </g>
      ))}
      <Palm x={30} y={250} />
      <Palm x={190} y={410} />
      <Palm x={340} y={250} />
      <Palm x={150} y={120} />
      {(Object.keys(PLACES) as PlaceId[]).map((id) => {
        const p = PLACES[id];
        const isSel = selected === id;
        return (
          <g
            key={id}
            role="button"
            tabIndex={0}
            aria-label={p.name}
            onClick={() => onSelect(id)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(id)}
            className="cursor-pointer outline-none"
          >
            <circle cx={p.x} cy={p.y - 14} r={34} fill="transparent" />
            <Building id={id} />
            <g transform={`translate(${p.x}, ${p.y + 16})`}>
              <rect
                x={-p.name.length * 3.1 - 7}
                y={-9}
                width={p.name.length * 6.2 + 14}
                height={17}
                rx={8.5}
                fill={isSel ? "#f6b800" : "#ffffff"}
                stroke="#1a1714"
                strokeWidth={1.5}
              />
              <text textAnchor="middle" y={3.5} fontSize={10} fontWeight={800} fill="#1a1714">
                {p.name}
              </text>
            </g>
          </g>
        );
      })}
      {/* you */}
      <g className={cn("transition-transform duration-700 ease-in-out")} style={{ transform: `translate(${me.x - 22}px, ${me.y - 30}px)` }} aria-label="You" pointerEvents="none">
        <ellipse cx={0} cy={22} rx={8} ry={3} fill="#1a1714" opacity={0.25} />
        <rect x={-6} y={4} width={12} height={16} rx={5} fill="#0e7a4a" stroke="#1a1714" strokeWidth={1.5} />
        <circle cx={0} cy={0} r={7} fill="#7a4a2a" stroke="#1a1714" strokeWidth={1.5} />
        <rect x={-14} y={-26} width={28} height={14} rx={7} fill="#1a1714" />
        <text x={0} y={-16} textAnchor="middle" fontSize={9} fontWeight={800} fill="#ffffff">
          You
        </text>
      </g>
    </svg>
  );
}
