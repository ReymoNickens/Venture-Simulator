import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  createHeadInjector,
  injectPwaHead,
  isDocumentPath,
  ogHeadTags,
  publicAppHost,
  renderWebManifest,
  resolvePublicHost,
  snapshotOgIdentity,
} from "./pwa-shared.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function withEnv(vars, fn) {
  const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const CLEAN_ENV = { VITE_APP_NAME: undefined, VITE_APP_SHORT_NAME: undefined, BETTER_AUTH_URL: undefined };
const card = { title: "Venture", image: "/og.jpg" };

test("the manifest is named after the product by default", () => {
  const m = withEnv(CLEAN_ENV, () => JSON.parse(renderWebManifest()));
  assert.equal(m.name, "Experiential Venture Platform");
  assert.equal(m.short_name, "Venture");
});

test("VITE_APP_NAME and VITE_APP_SHORT_NAME name the installed app", () => {
  const named = withEnv({ ...CLEAN_ENV, VITE_APP_NAME: "Oguaa Ventures" }, () => JSON.parse(renderWebManifest()));
  assert.equal(named.name, "Oguaa Ventures");
  assert.equal(named.short_name, "Oguaa");
  const short = withEnv({ ...CLEAN_ENV, VITE_APP_NAME: "Oguaa Ventures", VITE_APP_SHORT_NAME: "Oguaa V" }, () =>
    JSON.parse(renderWebManifest()),
  );
  assert.equal(short.short_name, "Oguaa V");
});

test("the manifest meets Chrome's install criteria with on-brand colours", () => {
  const m = withEnv(CLEAN_ENV, () => JSON.parse(renderWebManifest()));
  assert.equal(m.display, "standalone");
  assert.equal(m.start_url, "/studio");
  assert.equal(m.theme_color, "#fbf9f5");
  assert.equal(m.background_color, "#fbf9f5");
  const sizes = m.icons.filter((i) => i.purpose !== "maskable").map((i) => i.sizes);
  assert.ok(sizes.includes("192x192") && sizes.includes("512x512"));
  assert.ok(m.icons.some((i) => i.purpose === "maskable"));
  for (const icon of m.icons) {
    const png = readFileSync(join(ROOT, "public", icon.src));
    // PNG IHDR: width and height are big-endian at bytes 16 and 20.
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes, icon.src);
  }
});

test("adds the install tags a page is missing, before </head>", () => {
  const out = withEnv(CLEAN_ENV, () => injectPwaHead("<html><head><title>x</title></head><body></body></html>", { site: {} }));
  assert.match(out, /<link rel="manifest" href="\/manifest\.webmanifest">/);
  assert.match(out, /rel="apple-touch-icon" href="\/icons\/apple-touch-icon\.png"/);
  assert.match(out, /apple-mobile-web-app-title" content="Venture"/);
  assert.ok(out.indexOf("manifest") < out.indexOf("</head>"));
});

test("does not duplicate install tags the page already has", () => {
  const page =
    '<html><head><link rel="manifest" href="/manifest.webmanifest"><meta name="theme-color" content="#fbf9f5"></head></html>';
  const out = injectPwaHead(page, { site: {} });
  assert.equal(out.split('rel="manifest"').length - 1, 1);
  assert.equal(out.split('name="theme-color"').length - 1, 1);
});

test("is idempotent", () => {
  const once = injectPwaHead("<html><head></head></html>", { host: "venture.ucc.edu.gh", site: card });
  assert.equal(injectPwaHead(once, { host: "venture.ucc.edu.gh", site: card }), once);
});

test("points og:image at the app's own card on its public host", () => {
  const out = withEnv(CLEAN_ENV, () => injectPwaHead("<html><head></head></html>", { host: "venture.ucc.edu.gh", site: card }));
  assert.match(out, /property="og:image" content="https:\/\/venture\.ucc\.edu\.gh\/og\.jpg"/);
});

test("prefers BETTER_AUTH_URL's host (the public URL) over the request host", () => {
  withEnv({ ...CLEAN_ENV, BETTER_AUTH_URL: "https://venture.ucc.edu.gh" }, () => {
    assert.equal(resolvePublicHost("internal-123.vercel.app"), "venture.ucc.edu.gh");
    const tags = ogHeadTags({ host: "internal-123.vercel.app", site: card }).join("");
    assert.match(tags, /https:\/\/venture\.ucc\.edu\.gh\/og\.jpg/);
  });
});

test("never emits an og:image without a card or a usable host", () => {
  withEnv(CLEAN_ENV, () => {
    assert.doesNotMatch(ogHeadTags({ host: "venture.ucc.edu.gh", site: {} }).join(""), /og:image/);
    assert.doesNotMatch(ogHeadTags({ host: "localhost:8080", site: card }).join(""), /og:image/);
  });
  assert.equal(publicAppHost("127.0.0.1:8081"), "");
  assert.equal(publicAppHost('"><img src=x>.example.com'), "");
});

test("replaces share tags the page set, and escapes the title", () => {
  const page = '<html><head><meta property="og:title" content="old"><title>A &amp; B</title></head></html>';
  const out = injectPwaHead(page, { site: {} });
  assert.doesNotMatch(out, /content="old"/);
  assert.match(out, /property="og:title" content="A &amp; B"/);
});

test("uses nothing from Grok: no grok.com script, placeholder service or paths", () => {
  const out = injectPwaHead("<html><head></head></html>", { host: "venture.ucc.edu.gh", site: {} });
  assert.doesNotMatch(out, /grok/i);
  assert.doesNotMatch(renderWebManifest(), /grok/i);
});

test("streaming injector handles </head> split across chunks", () => {
  const injector = createHeadInjector({ site: {} });
  const out = Buffer.concat([
    ...injector.push("<html><head><title>x</title></he"),
    ...injector.push("ad><body>hello</body></html>"),
  ]).toString("utf8");
  assert.match(out, /rel="manifest"/);
  assert.ok(out.indexOf("manifest") < out.indexOf("</head>"));
  assert.match(out, /<body>hello<\/body>/);
  assert.deepEqual(injector.flush(), []);
});

test("streaming injector passes post-head chunks through untouched", () => {
  const injector = createHeadInjector({ site: {} });
  injector.push("<html><head></head>");
  const [tail] = injector.push("<body>tail</body>");
  assert.equal(tail.toString("utf8"), "<body>tail</body>");
});

test("streaming injector falls back when no </head> is seen", () => {
  const injector = createHeadInjector({ site: {} });
  assert.deepEqual(injector.push("<html><head>"), []);
  assert.match(Buffer.concat(injector.flush()).toString("utf8"), /rel="manifest"/);
});

test("only documents get head tags", () => {
  assert.equal(isDocumentPath("/studio/recap"), true);
  assert.equal(isDocumentPath("/api/auth/session"), false);
  assert.equal(isDocumentPath("/icons/icon-192.png"), false);
  assert.equal(isDocumentPath("/@vite/client"), false);
});

test("the share-card snapshot bakes the on-disk card, or none", () => {
  assert.equal(snapshotOgIdentity(ROOT).site.image, "/og.jpg");
  const empty = mkdtempSync(join(tmpdir(), "og-none-"));
  assert.equal(snapshotOgIdentity(empty).site.image, undefined);
});

// Tripwires: the deployed path only works if Nitro scans server/.
test("vite config keeps the plugin and the nitro serverDir wiring", () => {
  const viteConfig = readFileSync(join(ROOT, "vite.config.ts"), "utf8");
  assert.match(viteConfig, /serverDir:\s*"\.\/server"/);
  assert.match(viteConfig, /pwaPlugin\(\)/);
  const middleware = readFileSync(join(ROOT, "server/middleware/pwa.ts"), "utf8");
  assert.match(middleware, /virtual:og-identity/);
});
