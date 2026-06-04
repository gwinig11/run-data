import { neon } from "@neondatabase/serverless";

let sql = null;

export function hasDatabaseUrl() {
  return Boolean(process.env.DATABASE_URL);
}

export function getDb() {
  if (!hasDatabaseUrl()) throw missingDatabaseUrlError();

  if (!sql) sql = neon(process.env.DATABASE_URL);
  return sql;
}

function missingDatabaseUrlError() {
  const error = new Error("DATABASE_URL is required for historical run storage.");
  error.status = 503;
  return error;
}
