import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";

/** Studio screens warmed into the offline cache on the first connected visit. */
const WARM_ROUTES = [
  "/studio",
  "/studio/group",
  "/studio/opportunity",
  "/studio/select",
  "/studio/venture",
] as const;

/**
 * Registers the offline shell (public/sw.js) and, once it is active, preloads
 * every studio screen's code so each one is in the cache before the network
 * next disappears — not just the pages the student happened to open.
 *
 * Production only: in dev, Vite serves unbundled modules that change on every
 * edit, and a caching worker would fight hot reload.
 */
export function OfflineShell() {
  const router = useRouter();
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    let cancelled = false;
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then(async () => {
        for (const to of WARM_ROUTES) {
          if (cancelled) return;
          try {
            await router.preloadRoute({ to });
          } catch {
            /* a route that fails to preload is simply not warmed */
          }
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [router]);
  return null;
}
