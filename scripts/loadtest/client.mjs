// Concurrency/load stress test driven through the REAL server functions —
// no browser, no mocking. Uses TanStack Start's own client RPC machinery
// (seroval-encoded requests to /_serverFn/<id>) so every call goes through
// the actual authMiddleware -> business logic -> RLS-scoped DB path, exactly
// as a real browser would, just without rendering anything.
process.env.TSS_SERVER_FN_BASE = "http://127.0.0.1:8080/_serverFn/";

import { createClientRpc } from "@tanstack/start-client-core/client-rpc";
import { runWithStartContext } from "@tanstack/start-storage-context";

const BASE = "http://127.0.0.1:8080";
const ORIGIN = BASE;

function functionId(file, exportName) {
  const json = JSON.stringify({
    file: `${file}?tss-serverfn-split`,
    export: `${exportName}_createServerFn_handler`,
  });
  return Buffer.from(json, "utf8").toString("base64url");
}

function rpc(file, exportName) {
  return createClientRpc(functionId(file, exportName));
}

// --- server function bindings (mirrors src/lib/server/*.ts exports) -------
const fns = {
  upsertProfile: rpc("/src/lib/server/mutations.ts", "upsertProfile"),
  createGroup: rpc("/src/lib/server/mutations.ts", "createGroup"),
  joinGroup: rpc("/src/lib/server/mutations.ts", "joinGroup"),
  upsertOpportunity: rpc("/src/lib/server/mutations.ts", "upsertOpportunity"),
  recordPreference: rpc("/src/lib/server/mutations.ts", "recordPreference"),
  createVenture: rpc("/src/lib/server/mutations.ts", "createVenture"),
  createEvidence: rpc("/src/lib/server/mutations.ts", "createEvidence"),
  createAssumption: rpc("/src/lib/server/mutations.ts", "createAssumption"),
  linkEvidence: rpc("/src/lib/server/mutations.ts", "linkEvidence"),
  bootstrapDemoCohort: rpc("/src/lib/server/bootstrap.ts", "bootstrapDemoCohort"),
  getWorkspace: rpc("/src/lib/server/workspace.ts", "getWorkspace"),
  listOfferings: rpc("/src/lib/server/workspace.ts", "listOfferings"),
  sendAdvisorMessage: rpc("/src/lib/server/advisor.ts", "sendAdvisorMessage"),
};

function call(name, cookie, data, method = "POST") {
  return runWithStartContext({ startOptions: {} }, async () => {
    const res = await fns[name]({
      data,
      method,
      headers: {
        Cookie: cookie,
        Origin: ORIGIN,
        Referer: `${BASE}/studio`,
      },
    });
    // A transport/dev-tooling failure (e.g. a cold-module-transform race, or a
    // dropped connection under load) resolves instead of rejecting, in a
    // *different* shape than the normal {result, error} envelope — treat
    // "no result key at all" as a hard failure too, not a silent undefined.
    if (!res || typeof res !== "object" || !("result" in res)) {
      throw new Error(`transport failure calling ${name}: ${JSON.stringify(res)}`);
    }
    if (res.error) throw res.error;
    return res.result;
  });
}

async function signup(email, password, name) {
  const res = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ email, password, name }),
  });
  if (!res.ok) {
    throw new Error(`signup ${res.status}: ${await res.text()}`);
  }
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  if (!cookie) throw new Error("signup succeeded but no session cookie set");
  return cookie;
}

// --- small concurrency-limited batch runner --------------------------------
async function runBatched(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function lane() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = { ok: true, value: await worker(items[i], i) };
      } catch (err) {
        results[i] = { ok: false, error: err };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, lane));
  return results;
}

function summarize(label, results) {
  const ok = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok).length;
  const errors = {};
  for (const r of results) {
    if (!r.ok) {
      const msg = (r.error?.message || String(r.error)).slice(0, 120);
      errors[msg] = (errors[msg] ?? 0) + 1;
    }
  }
  console.log(`\n[${label}] ${ok} ok / ${fail} failed (n=${results.length})`);
  for (const [msg, count] of Object.entries(errors).sort((a, b) => b[1] - a[1])) {
    console.log(`  x${count}: ${msg}`);
  }
  return { ok, fail, errors };
}

export { call, signup, runBatched, summarize, fns };
