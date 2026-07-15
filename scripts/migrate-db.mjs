import { readFile, readdir } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const sql = neon(connectionString);
await sql.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )
`);
const directory = new URL("../db/migrations/", import.meta.url);
const files = (await readdir(directory))
  .filter((name) => name.endsWith(".sql"))
  .sort();
let count = 0;
for (const file of files) {
  const existing = await sql.query(
    "SELECT 1 FROM schema_migrations WHERE filename = $1",
    [file],
  );
  if (existing.length > 0) continue;
  const source = await readFile(new URL(file, directory), "utf8");
  const statements = source
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
  for (const statement of statements) {
    await sql.query(statement);
    count += 1;
  }
  await sql.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [
    file,
  ]);
}
console.log(`Applied ${count} migration statements.`);
