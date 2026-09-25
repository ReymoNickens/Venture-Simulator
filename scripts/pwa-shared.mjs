/**
 * Installable-app and share-card head chrome, shared by the Vite plugin
 * (`pwa-plugin.mjs`, dev + preview) and the Nitro middleware
 * (`server/middleware/pwa.ts`, deployed). Plain ESM so `node --test` and the
 * Nitro bundler can both consume it.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Mirrors APP_NAME in src/lib/brand.ts: the name when VITE_APP_NAME isn't set. */
export const PRODUCT_NAME = "Experiential Venture Platform";
/** Home-screen label for PRODUCT_NAME; launchers cut anything past ~12 characters. */
const PRODUCT_SHORT_NAME = "Venture";

/** The paper background, so the splash screen and status bar match the app. */
export const PWA_BACKGROUND = "#fbf9f5";
export const PWA_THEME = "#fbf9f5";

export const MANIFEST_PATH = "/manifest.webmanifest";
export const APPLE_ICON_PATH = "/icons/apple-touch-icon.png";
export const OG_SITE_REL_PATH = "src/lib/og/site.json";

const SHARE_META_KEYS = new Set([
  "og:title",
  "og:description",
  "og:image",
  "og:image:width",
  "og:image:height",
  "og:url",
  "og:site_name",
  "twitter:card",
  "twitter:title",
  "twitter:image",
  "twitter:description",
]);

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Inverse of escapeHtml. Decode &amp; last so a single pass undoes one encode. */
function unescapeHtml(value) {
  return String(value)
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");
}

function envValue(key) {
  return String((typeof process !== "undefined" ? process.env?.[key] : "") ?? "").trim();
}

/** The installed app's name: VITE_APP_NAME when set, else the product name. */
export function pwaAppName() {
  return envValue("VITE_APP_NAME") || PRODUCT_NAME;
}

export function pwaShortName(name) {
  const fromEnv = envValue("VITE_APP_SHORT_NAME");
  if (fromEnv) return fromEnv;
  if (name === PRODUCT_NAME) return PRODUCT_SHORT_NAME;
  return name.length <= 12 ? name : name.split(" ")[0];
}

/** A hostname safe to put in an absolute og:image URL, or "". */
export function publicAppHost(hostHeader) {
  const host = String(hostHeader ?? "")
    .split(",")[0]
    .trim()
    .split(":")[0]
    .toLowerCase();
  if (!host || !/^[a-z0-9.-]+$/.test(host) || !host.includes(".")) return "";
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return "";
  return host;
}

/**
 * The public host for share-card URLs: BETTER_AUTH_URL's host when deployed
 * (it is this app's public URL), else the request host.
 */
export function resolvePublicHost(hostHeader) {
  const configured = envValue("BETTER_AUTH_URL");
  if (configured) {
    try {
      const fromUrl = publicAppHost(new URL(configured).host);
      if (fromUrl) return fromUrl;
    } catch {
      /* not a URL — fall back to the request host */
    }
  }
  return publicAppHost(hostHeader);
}

/** Paths that can carry an app document (vs assets / API / internals). */
export function isDocumentPath(pathname) {
  const path = String(pathname ?? "");
  return (
    !path.startsWith("/api/") &&
    !path.startsWith("/@") &&
    !path.startsWith("/node_modules") &&
    !/\.[a-z0-9]+$/i.test(path)
  );
}

export function renderWebManifest() {
  const name = pwaAppName();
  return JSON.stringify(
    {
      name,
      short_name: pwaShortName(name),
      description: "Investigate real problems. Defend every claim with evidence.",
      id: "/",
      // The studio: it sends signed-out students to sign-in and staff to the
      // lecturer console, and it is the page the offline shell keeps cached.
      start_url: "/studio",
      scope: "/",
      display: "standalone",
      background_color: PWA_BACKGROUND,
      theme_color: PWA_THEME,
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        { src: APPLE_ICON_PATH, sizes: "180x180", type: "image/png" },
      ],
    },
    null,
    2,
  );
}

/** Head tags every document needs to install well, keyed so present ones are skipped. */
export function pwaHeadTags(shortName = pwaShortName(pwaAppName())) {
  return [
    ["manifest", `<link rel="manifest" href="${MANIFEST_PATH}">`],
    ["apple-touch-icon", `<link rel="apple-touch-icon" href="${APPLE_ICON_PATH}">`],
    [
      "apple-mobile-web-app-title",
      `<meta name="apple-mobile-web-app-title" content="${escapeHtml(shortName)}">`,
    ],
    [
      "apple-mobile-web-app-status-bar-style",
      '<meta name="apple-mobile-web-app-status-bar-style" content="default">',
    ],
    ["theme-color", `<meta name="theme-color" content="${PWA_THEME}">`],
  ];
}

export function readOgSite(cwd = process.cwd()) {
  try {
    const raw = readFileSync(join(cwd, OG_SITE_REL_PATH), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Public path of an on-disk share card, or "" if neither file exists. */
export function ogCardPublicPath(cwd = process.cwd()) {
  if (existsSync(join(cwd, "public/og.jpg"))) return "/og.jpg";
  if (existsSync(join(cwd, "public/og.png"))) return "/og.png";
  return "";
}

/**
 * Snapshot for Vite/Nitro to bake into the server bundle: the deployed
 * function has no public/ folder to look at.
 */
export function snapshotOgIdentity(cwd = process.cwd()) {
  const site = { ...readOgSite(cwd) };
  const image = ogCardPublicPath(cwd);
  if (image) site.image = image;
  else delete site.image;
  return { site };
}

export function titleFromDocument(html) {
  const match = String(html ?? "").match(/<title\b[^>]*>([^<]*)<\/title>/i);
  return match ? unescapeHtml(match[1]).trim() : "";
}

export function resolveOgTitle(site = {}, appName = pwaAppName(), documentTitle = "") {
  return (
    String(site.title ?? "").trim() ||
    String(documentTitle ?? "").trim() ||
    String(appName ?? "").trim() ||
    PRODUCT_NAME
  );
}

/** Share-card tags. og:image only when there is a card and a public host to point at. */
export function ogHeadTags({ host = "", appName = pwaAppName(), site = {}, documentTitle = "" } = {}) {
  const title = resolveOgTitle(site, appName, documentTitle);
  const tags = [
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
  ];
  const description = String(site.description ?? "").trim();
  if (description) {
    tags.push(`<meta property="og:description" content="${escapeHtml(description)}">`);
  }
  const publicHost = resolvePublicHost(host);
  const image = String(site.image ?? "").trim();
  if (publicHost && image) {
    const url = `https://${publicHost}${image.startsWith("/") ? image : `/${image}`}`;
    tags.push(`<meta property="og:image" content="${escapeHtml(url)}">`);
    tags.push(`<meta property="og:image:width" content="1200">`);
    tags.push(`<meta property="og:image:height" content="630">`);
  }
  return tags;
}

export function stripShareMetaTags(html) {
  return String(html).replace(/<meta\b[^>]*>/gi, (tag) => {
    const attrs = [...tag.matchAll(/\b(?:property|name)\s*=\s*["']([^"']+)["']/gi)];
    for (const match of attrs) {
      if (SHARE_META_KEYS.has(String(match[1]).toLowerCase())) return "";
    }
    return tag;
  });
}

function insertAfterHeadOpen(html, snippet) {
  if (/<head\b[^>]*>/i.test(html)) {
    return html.replace(/<head\b[^>]*>/i, (open) => `${open}${snippet}`);
  }
  if (/<html\b[^>]*>/i.test(html)) {
    return html.replace(/<html\b[^>]*>/i, (open) => `${open}<head>${snippet}</head>`);
  }
  return `<!doctype html><html><head>${snippet}</head>${html}`;
}

function insertBeforeHeadClose(html, snippet) {
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${snippet}</head>`);
  return insertAfterHeadOpen(html, snippet);
}

/**
 * Add share-card tags (replacing any the page set) and whichever install tags
 * the page is missing.
 */
export function injectPwaHead(html, ctx = {}) {
  if (typeof html !== "string") return html;
  const site = ctx.site ?? snapshotOgIdentity(ctx.cwd).site;
  let next = stripShareMetaTags(html);
  const missing = pwaHeadTags()
    .filter(([key]) => {
      if (key === "manifest") return !next.includes('rel="manifest"');
      if (key === "apple-touch-icon") return !next.includes('rel="apple-touch-icon"');
      return !next.includes(`name="${key}"`);
    })
    .map(([, tag]) => tag);
  next = insertAfterHeadOpen(
    next,
    ogHeadTags({ host: ctx.host ?? "", site, documentTitle: titleFromDocument(html) }).join(""),
  );
  return missing.length ? insertBeforeHeadClose(next, missing.join("")) : next;
}

/**
 * Streaming head injector: buffers only until `</head>` (ASCII marker; never
 * appears inside a UTF-8 continuation byte), rewrites the head, then passes
 * later chunks through so streaming SSR keeps streaming.
 */
export function createHeadInjector(ctx = {}) {
  const site = ctx.site ?? snapshotOgIdentity(ctx.cwd).site;
  const apply = (html) => injectPwaHead(html, { host: ctx.host, site });
  /** @type {Buffer[]} */
  let pending = [];
  let done = false;
  return {
    /** @param {Uint8Array | string} chunk @returns {Buffer[]} chunks ready to emit */
    push(chunk) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (done) return [buf];
      pending.push(buf);
      const joined = Buffer.concat(pending);
      const at = joined.toString("latin1").search(/<\/head>/i);
      if (at === -1) return [];
      done = true;
      pending = [];
      const closeLen = "</head>".length;
      const head = apply(joined.subarray(0, at + closeLen).toString("utf8"));
      return [Buffer.concat([Buffer.from(head, "utf8"), joined.subarray(at + closeLen)])];
    },
    /** @returns {Buffer[]} whatever is still buffered (no `</head>` seen) */
    flush() {
      if (done || pending.length === 0) return [];
      const rest = Buffer.concat(pending);
      pending = [];
      done = true;
      return [Buffer.from(apply(rest.toString("utf8")), "utf8")];
    },
  };
}
