import { useEffect, useState } from "react";
import { getEvidencePhoto } from "@/lib/server/photos";
import { getPrototypePhoto } from "@/lib/server/venture-work";
import { cacheGet, cachePut } from "@/lib/offline/idb";
import { cn } from "@/lib/utils";

/**
 * An evidence photo that costs data only once: shown from the outbox copy while
 * unsynced, then from this device's cache, and fetched from the server only
 * the first time it is actually on screen.
 */
export function EvidencePhoto({
  id,
  localData,
  className,
  alt = "",
  kind = "evidence",
}: {
  id: string;
  localData?: string | null;
  className?: string;
  alt?: string;
  kind?: "evidence" | "prototype";
}) {
  const [src, setSrc] = useState<string | null>(localData ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (localData) {
      setSrc(localData);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const key = `${kind}-photo:${id}`;
        const cached = await cacheGet(key);
        if (cached) {
          if (!cancelled) setSrc(cached);
          return;
        }
        const res =
          kind === "prototype"
            ? await getPrototypePhoto({ data: { id } })
            : await getEvidencePhoto({ data: { id } });
        if (cancelled) return;
        setSrc(res.dataUrl);
        await cachePut(key, res.dataUrl);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, localData, kind]);

  if (failed) {
    return (
      <p className="text-xs text-faint">Photo will load when you are back online.</p>
    );
  }
  if (!src) {
    return <div className={cn("h-32 w-44 animate-pulse rounded-[18px] bg-bg-subtle", className)} />;
  }
  return <img src={src} alt={alt} loading="lazy" className={className} />;
}
