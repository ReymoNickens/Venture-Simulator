/**
 * Draws a weekly recap as a 1080×1920 PNG: the WhatsApp/Instagram status
 * size, since that's where students will post it. Plain Canvas 2D with the
 * page's own fonts, no library, and it works offline.
 */
import type { Persona, WeeklyRecap } from "@/lib/domain/recap";

const W = 1080;
const H = 1920;
const PAD = 96;

const INK = "#111111";
const PAPER = "#fbf9f5";

/** Background and accent per persona, from the app's palette. */
export const PERSONA_COLORS: Record<Persona["key"], { bg: string; accent: string; ink: string }> = {
  street: { bg: "#ffd84d", accent: "#ff5a3c", ink: INK },
  makers: { bg: "#ff5a3c", accent: "#ffd84d", ink: "#ffffff" },
  explorers: { bg: "#19a974", accent: "#ffd84d", ink: "#ffffff" },
  notetakers: { bg: "#6b4dff", accent: "#ff8fc7", ink: "#ffffff" },
  warming: { bg: "#e8ecff", accent: "#2d4bff", ink: INK },
  quiet: { bg: PAPER, accent: "#2d4bff", ink: INK },
};

const DISPLAY = `"Bricolage Grotesque", "Arial Narrow", system-ui, sans-serif`;
const SANS = `"Plus Jakarta Sans", "Segoe UI", system-ui, sans-serif`;

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.join(" ") !== lines.join(" ")) {
    let last = lines[maxLines - 1];
    while (last.length && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last.trimEnd()}…`;
  }
  return lines;
}

function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(r / 12, r / 12);
  ctx.beginPath();
  ctx.moveTo(0, -11);
  ctx.bezierCurveTo(1, -5, 5, -1, 11, 0);
  ctx.bezierCurveTo(5, 1, 1, 5, 0, 11);
  ctx.bezierCurveTo(-1, 5, -5, 1, -11, 0);
  ctx.bezierCurveTo(-5, -1, -1, -5, 0, -11);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

/** A die-cut sticker: a tilted disc with a white ring and a soft drop. */
function sticker(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, label: string, tilt: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.shadowColor = "rgba(0,0,0,0.18)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  ctx.beginPath();
  ctx.arc(0, 0, r + 10, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.fillStyle = fill === "#ffd84d" || fill === "#ff8fc7" ? INK : "#ffffff";
  ctx.font = `800 ${Math.round(r * 0.9)}px ${DISPLAY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 0, 4);
  ctx.restore();
}

export async function drawRecap(recap: WeeklyRecap, appName: string): Promise<HTMLCanvasElement> {
  if (typeof document !== "undefined" && document.fonts) {
    await Promise.all([
      document.fonts.load(`800 120px "Bricolage Grotesque"`),
      document.fonts.load(`600 40px "Plus Jakarta Sans"`),
      document.fonts.load(`400 40px "Plus Jakarta Sans"`),
    ]).catch(() => undefined);
  }
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This phone can’t draw the card.");
  const c = PERSONA_COLORS[recap.persona.key];
  const width = W - PAD * 2;

  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, W, H);
  sparkle(ctx, W - 150, 170, 44, c.accent);
  sparkle(ctx, W - 230, 280, 20, c.ink);

  ctx.fillStyle = c.ink;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  let y = 170;
  ctx.font = `600 38px ${SANS}`;
  ctx.globalAlpha = 0.75;
  ctx.fillText(`${recap.inProgress ? "This week so far" : "Our week"} · ${recap.label}`, PAD, y);
  ctx.globalAlpha = 1;

  y += 80;
  ctx.font = `800 52px ${DISPLAY}`;
  for (const line of wrap(ctx, recap.crewName, width - 160, 2)) {
    ctx.fillText(line, PAD, y);
    y += 62;
  }

  // The title is the hero: as big as fits in two lines.
  let size = 150;
  ctx.font = `800 ${size}px ${DISPLAY}`;
  while (size > 90 && wrap(ctx, recap.persona.title, width, 3).length > 2) {
    size -= 6;
    ctx.font = `800 ${size}px ${DISPLAY}`;
  }
  y += 10;
  for (const line of wrap(ctx, recap.persona.title, width, 2)) {
    y += size * 0.95;
    ctx.fillText(line, PAD, y);
  }
  y += 80;
  ctx.font = `500 44px ${SANS}`;
  for (const line of wrap(ctx, recap.persona.line, width, 2)) {
    ctx.fillText(line, PAD, y);
    y += 62;
  }

  // Stickers: the week's numbers.
  const stats = [
    { n: recap.interviews, label: recap.interviews === 1 ? "interview" : "interviews", fill: "#2d4bff" },
    { n: recap.places.length, label: recap.places.length === 1 ? "place" : "places", fill: "#19a974" },
    { n: recap.tests, label: recap.tests === 1 ? "test" : "tests", fill: "#ff5a3c" },
    { n: recap.notes, label: recap.notes === 1 ? "note" : "notes", fill: "#ff8fc7" },
  ];
  y += 120;
  const slot = width / stats.length;
  stats.forEach((s, i) => {
    const cx = PAD + slot * i + slot / 2;
    const fill = s.fill === c.bg ? "#111111" : s.fill;
    sticker(ctx, cx, y, 78, fill, String(s.n), (i % 2 ? 1 : -1) * 0.1);
    ctx.fillStyle = c.ink;
    ctx.font = `600 34px ${SANS}`;
    ctx.textAlign = "center";
    ctx.fillText(s.label, cx, y + 135);
  });
  ctx.textAlign = "left";
  y += 225;

  if (recap.places.length) {
    ctx.font = `600 34px ${SANS}`;
    ctx.globalAlpha = 0.75;
    ctx.fillText("Where we went", PAD, y);
    ctx.globalAlpha = 1;
    y += 70;
    ctx.font = `700 38px ${SANS}`;
    let x = PAD;
    for (const place of recap.places.slice(0, 4)) {
      const w = Math.min(ctx.measureText(place).width + 56, width);
      if (x + w > W - PAD) {
        if (x === PAD) break;
        x = PAD;
        y += 84;
        if (y > H - 520) break;
      }
      ctx.fillStyle = c.ink === INK ? "#ffffff" : "rgba(255,255,255,0.18)";
      ctx.beginPath();
      ctx.roundRect(x, y - 50, w, 70, 35);
      ctx.fill();
      ctx.fillStyle = c.ink;
      ctx.fillText(wrap(ctx, place, w - 56, 1)[0] ?? place, x + 28, y - 2);
      x += w + 18;
    }
    y += 100;
  }

  if (recap.quote && y < H - 380) {
    ctx.font = `800 160px ${DISPLAY}`;
    ctx.fillStyle = c.accent;
    ctx.fillText("“", PAD - 8, y + 90);
    ctx.fillStyle = c.ink;
    ctx.font = `italic 500 44px ${SANS}`;
    y += 20;
    const room = Math.max(1, Math.min(4, Math.floor((H - 290 - y) / 62)));
    for (const line of wrap(ctx, recap.quote, width - 90, room)) {
      ctx.fillText(line, PAD + 90, y);
      y += 62;
    }
    ctx.font = `500 32px ${SANS}`;
    ctx.globalAlpha = 0.7;
    ctx.fillText("— someone we met in Cape Coast", PAD + 90, y + 6);
    ctx.globalAlpha = 1;
  }

  // Footer.
  ctx.fillStyle = c.ink;
  ctx.fillRect(PAD, H - 200, width, 3);
  ctx.font = `700 36px ${SANS}`;
  ctx.fillText(appName, PAD, H - 128);
  ctx.font = `500 32px ${SANS}`;
  ctx.globalAlpha = 0.7;
  ctx.fillText("ENT 302 · University of Cape Coast", PAD, H - 80);
  ctx.globalAlpha = 1;

  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn’t make the image."))), "image/png"),
  );
}

/**
 * Share with the phone's own share sheet (WhatsApp, Instagram, …) when it
 * accepts files; otherwise save the PNG so it can be posted by hand.
 */
export async function shareRecap(recap: WeeklyRecap, appName: string): Promise<"shared" | "saved" | "cancelled"> {
  const blob = await canvasToBlob(await drawRecap(recap, appName));
  const name = `week-${recap.weekStart.slice(0, 10)}.png`;
  const file = new File([blob], name, { type: "image/png" });
  if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `${recap.crewName} · ${recap.label}` });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "saved";
}
