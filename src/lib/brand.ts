export const APP_NAME =
  (typeof import.meta !== "undefined" &&
    import.meta.env?.VITE_APP_NAME &&
    String(import.meta.env.VITE_APP_NAME).trim()) ||
  "Experiential Venture Platform";

export const APP_TAGLINE = "The platform gives you uncertainty, not a business.";
