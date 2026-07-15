import { neon } from "@neondatabase/serverless";

let client: ReturnType<typeof neon> | null = null;

export function db(): ReturnType<typeof neon> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  client ??= neon(url);
  return client;
}

/** neon tagged-template의 batch 가능 union 반환형을 단일 쿼리 행 배열로 좁힌다. */
export function resultRows<T>(result: unknown): T[] {
  return result as T[];
}

export async function ensureUser(
  subject: string,
  email?: string,
): Promise<void> {
  const sql = db();
  await sql`
    INSERT INTO app_users (auth_subject, email)
    VALUES (${subject}, ${email ?? null})
    ON CONFLICT (auth_subject) DO UPDATE
      SET email = COALESCE(EXCLUDED.email, app_users.email), updated_at = now()
  `;
}
