export const APP_NAME =
  (typeof import.meta !== "undefined" &&
    import.meta.env?.VITE_APP_NAME &&
    String(import.meta.env.VITE_APP_NAME).trim()) ||
  "Experiential Venture Platform";

/** Home-screen label (launchers cut past ~12 characters); matches pwaShortName in scripts/grok-pwa-shared.mjs. */
export const APP_SHORT_NAME =
  (typeof import.meta !== "undefined" &&
    import.meta.env?.VITE_APP_SHORT_NAME &&
    String(import.meta.env.VITE_APP_SHORT_NAME).trim()) ||
  (APP_NAME === "Experiential Venture Platform" ? "Venture" : APP_NAME.length <= 12 ? APP_NAME : APP_NAME.split(" ")[0]);

export const APP_TAGLINE = "The platform gives you uncertainty, not a business.";
