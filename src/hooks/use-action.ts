import { useCallback, useState } from "react";

/**
 * Pending / error / notice state for a button that calls the server, so each
 * screen doesn't re-implement the same try/catch/finally.
 */
export function useAction() {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = useCallback(
    async <T,>(key: string, fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
      setPending(key);
      setError(null);
      setNotice(null);
      try {
        const result = await fn();
        if (success) setNotice(success);
        return result;
      } catch (err) {
        setError(errorMessage(err));
        return undefined;
      } finally {
        setPending(null);
      }
    },
    [],
  );

  return { pending, error, notice, run, setError, setNotice };
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return "That did not work. Try again.";
}
