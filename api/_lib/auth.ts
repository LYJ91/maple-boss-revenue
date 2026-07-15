import type { VercelRequest } from "@vercel/node";
import {
  createRemoteJWKSet,
  decodeJwt,
  jwtVerify,
  type JWTPayload,
} from "jose";

export interface AuthUser {
  subject: string;
  email?: string;
}

const jwksByIssuer = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function bearer(req: VercelRequest): string {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer "))
    throw Object.assign(new Error("로그인이 필요합니다."), { status: 401 });
  return header.slice(7).trim();
}

export async function requireUser(req: VercelRequest): Promise<AuthUser> {
  const token = bearer(req);
  const decoded = decodeJwt(token);
  if (!decoded.iss || !decoded.sub)
    throw Object.assign(new Error("유효하지 않은 로그인입니다."), {
      status: 401,
    });

  const authBase =
    process.env.NEON_AUTH_BASE_URL ?? process.env.VITE_NEON_AUTH_URL;
  if (!authBase) throw new Error("NEON_AUTH_BASE_URL is not configured");
  const expectedOrigin = new URL(authBase).origin;
  const issuerUrl = new URL(decoded.iss);
  if (issuerUrl.origin !== expectedOrigin) {
    throw Object.assign(new Error("유효하지 않은 로그인 발급자입니다."), {
      status: 401,
    });
  }

  let jwks = jwksByIssuer.get(decoded.iss);
  if (!jwks) {
    const jwksUrl = new URL(
      `${authBase.replace(/\/$/, "")}/.well-known/jwks.json`,
    );
    jwks = createRemoteJWKSet(jwksUrl);
    jwksByIssuer.set(decoded.iss, jwks);
  }
  const { payload } = await jwtVerify(token, jwks, { issuer: decoded.iss });
  return { subject: payload.sub!, email: emailClaim(payload) };
}

function emailClaim(payload: JWTPayload): string | undefined {
  return typeof payload.email === "string" ? payload.email : undefined;
}

export function authError(error: unknown): { status: number; message: string } {
  const status =
    typeof error === "object" &&
    error &&
    "status" in error &&
    typeof error.status === "number"
      ? error.status
      : 500;
  if (status >= 500) console.error("Server request failed", error);
  return {
    status,
    message:
      status === 401
        ? "로그인이 만료되었습니다. 다시 로그인해주세요."
        : "요청을 처리하지 못했습니다.",
  };
}
