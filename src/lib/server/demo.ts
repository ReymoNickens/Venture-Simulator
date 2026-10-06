// The owner's "look around" buttons: sign in as the demo student, course rep
// or lecturer of a ready-made class (src/lib/demo/tour.ts), without setup
// codes, uploads or activation. Gated by OWNER_ACCESS_CODE like the rest of
// the owner page.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireOwner } from "./owner";
import { parseInput } from "./validate";

export interface DemoLogin {
  identifier: string;
  password: string;
}

export const startDemo = createServerFn({ method: "POST" })
  .validator(parseInput(z.object({ ownerCode: z.string().min(1).max(200), role: z.enum(["student", "rep", "lecturer"]) })))
  .handler(async ({ data }): Promise<DemoLogin> => {
    // Loaded here, not at the top: pages import this file, and only the
    // handler runs on the server.
    const { assertSameSiteRequest } = await import("@/lib/auth/isolation.server");
    const { getSql, runInScope } = await import("@/lib/db");
    const { DEMO_IDENTITIES, ensureDemoClass } = await import("@/lib/demo/tour");
    const { auth } = await import("@/lib/auth/server");
    const { randomBytes } = await import("node:crypto");
    assertSameSiteRequest();
    await requireOwner(data.ownerCode);

    // Commit the class before touching accounts: the sign-up hook reads the
    // class list on its own connection.
    await runInScope({ kind: "bypass" }, async () => ensureDemoClass(await getSql()));

    // A fresh password every time, handed straight to the browser to sign in
    // with, so nobody needs to know or keep one.
    const who = DEMO_IDENTITIES[data.role];
    const password = randomBytes(18).toString("base64url");
    const sql = await getSql();
    const existing = await sql<{ id: string }>`select id from "user" where lower(email) = ${who.email} limit 1`;
    if (existing[0]) {
      const ctx = await auth.$context;
      await ctx.internalAdapter.updatePassword(existing[0].id, await ctx.password.hash(password));
    } else {
      await auth.api.signUpEmail({
        body: { email: who.email, password, name: who.fullName, ...(who.indexNumber ? { username: who.indexNumber } : {}) },
      });
    }
    return { identifier: who.email, password };
  });
