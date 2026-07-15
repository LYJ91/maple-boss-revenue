import { createAuthClient } from "@neondatabase/neon-js/auth";
import { BetterAuthReactAdapter } from "@neondatabase/neon-js/auth/react";

export const authUrl = import.meta.env.VITE_NEON_AUTH_URL as string | undefined;
export const authClient = createAuthClient(
  authUrl ?? "https://auth.invalid.local",
  {
    adapter: BetterAuthReactAdapter(),
  },
);

export async function authToken(): Promise<string> {
  const result = await authClient.token();
  const token = result.data?.token;
  if (!token) throw new Error("로그인이 만료되었습니다. 다시 로그인해주세요.");
  return token;
}
