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
  if (!authUrl) throw new Error("Neon Auth가 설정되지 않았습니다.");
  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`${authUrl.replace(/\/$/, "")}/token`, {
        credentials: "include",
        cache: "no-store",
      });
      lastStatus = response.status;
      if (response.ok) {
        const body = (await response.json()) as { token?: string };
        if (body.token) return body.token;
      }
    } catch {
      lastStatus = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }
  throw new Error(
    lastStatus === 401
      ? "로그인이 만료되었습니다. 다시 로그인해주세요."
      : "로그인 토큰을 발급하지 못했습니다. 잠시 후 다시 시도해주세요.",
  );
}
