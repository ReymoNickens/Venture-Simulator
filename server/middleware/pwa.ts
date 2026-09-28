/**
 * Deployed-app (Nitro) half of the install + share-card head chrome.
 * Auto-registered as global h3 middleware because vite.config.ts sets
 * `serverDir: "./server"` — without that option Nitro v3 never scans this
 * directory. The dev/preview half is scripts/pwa-plugin.mjs.
 *
 * - `/manifest.webmanifest` → the manifest, named from VITE_APP_NAME at
 *   runtime (kept out of public/ so this dynamic response is the only one).
 * - HTML documents → stream-inject install + share-card head tags at
 *   `</head>`. The share card is baked via `virtual:og-identity` at
 *   `vite build` (this function cannot read `src/lib/og/site.json` or
 *   `public/og.jpg`). This must be a middleware transforming `next()`: h3
 *   discards the `response` runtime hook's return value.
 */
import { ogIdentity } from "virtual:og-identity";
import { createHeadInjector, isDocumentPath, MANIFEST_PATH, renderWebManifest } from "../../scripts/pwa-shared.mjs";

interface PwaEvent {
  url: URL;
  req: { method: string; headers: Headers };
}

function requestHost(event: PwaEvent): string {
  return event.req.headers.get("x-forwarded-host") ?? event.req.headers.get("host") ?? event.url.host;
}

function injectHeadStreaming(response: Response, host: string): Response {
  const injector = createHeadInjector({ host, site: ogIdentity.site });
  const transformed = response.body!.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        for (const out of injector.push(chunk)) controller.enqueue(out);
      },
      flush(controller) {
        for (const out of injector.flush()) controller.enqueue(out);
      },
    }),
  );
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(transformed, { status: response.status, statusText: response.statusText, headers });
}

export default async function pwaMiddleware(event: PwaEvent, next: () => unknown | Promise<unknown>): Promise<unknown> {
  if ((event.req.method ?? "GET").toUpperCase() !== "GET") return next();

  const path = event.url.pathname;
  if (path === MANIFEST_PATH) {
    return new Response(renderWebManifest(), {
      headers: {
        "content-type": "application/manifest+json; charset=utf-8",
        "cache-control": "no-cache",
      },
    });
  }

  if (!isDocumentPath(path)) return next();

  const result = await next();
  if (
    result instanceof Response &&
    result.body &&
    String(result.headers.get("content-type") ?? "").includes("text/html") &&
    !result.headers.get("content-encoding")
  ) {
    return injectHeadStreaming(result, requestHost(event));
  }
  return result;
}
