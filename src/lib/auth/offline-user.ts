import type { AppUser } from "./use-current-user";

/**
 * The last account that signed in on this device, remembered so the studio
 * still opens with no connection. Without it, a student who loses signal
 * mid-lecture is bounced to the sign-in page — which needs the network —
 * and cannot reach the work the app promised to keep for them.
 *
 * Only identity is stored (id, name), never a token: offline, the app shows
 * cached data and queues writes; nothing reaches the server until a real
 * session exists again, and the server authenticates every replayed write.
 */
const KEY = "evp:last-user";

export function rememberUser(user: AppUser): void {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ id: user.id, displayName: user.displayName, primaryEmail: user.primaryEmail }),
    );
  } catch {
    /* storage unavailable (private mode) — offline entry just won't work */
  }
}

export function forgetUser(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function rememberedUser(): AppUser | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { id?: string; displayName?: string | null; primaryEmail?: string | null };
    if (!v.id) return null;
    return {
      id: v.id,
      displayName: v.displayName ?? null,
      primaryEmail: v.primaryEmail ?? null,
      profileImageUrl: null,
      isDevFallback: false,
    };
  } catch {
    return null;
  }
}
