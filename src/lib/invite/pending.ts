// An invite link opened before signing in is remembered on this phone, so
// the person lands back in that group after signing in and giving details.
const KEY = "pending-invite-code";

export function rememberInvite(code: string) {
  try {
    localStorage.setItem(KEY, code.trim().toUpperCase());
  } catch {
    // Private mode: they can open the link again after signing in.
  }
}

export function pendingInvite(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function forgetInvite() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}

/** The link a leader shares. */
export function inviteLink(code: string, origin = typeof window === "undefined" ? "" : window.location.origin) {
  return `${origin}/join/${code}`;
}

/** WhatsApp's share link, with the message already written. */
export function whatsappShare(groupName: string, code: string) {
  const text = `Join our ENT 302 group "${groupName}": ${inviteLink(code)}\nSign in with your phone number, then fill in your details.`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
