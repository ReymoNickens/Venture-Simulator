// What the sign-in page can offer: Google only once its keys are set, and
// whether texts really go out (otherwise codes wait on the owner page).
import { createServerFn } from "@tanstack/react-start";

export interface SignInOptions {
  google: boolean;
  smsLive: boolean;
}

export const getSignInOptions = createServerFn({ method: "GET" }).handler(async (): Promise<SignInOptions> => {
  const set = (k: string) => Boolean(process.env[k]?.trim());
  return {
    google: set("GOOGLE_CLIENT_ID") && set("GOOGLE_CLIENT_SECRET"),
    smsLive: set("ARKESEL_API_KEY") && set("ARKESEL_SENDER_ID"),
  };
});
