import { neon } from "@neondatabase/serverless";

let sql = null;

export function hasDatabaseUrl() {
  return Boolean(databaseUrl());
}

export function getDb() {
  if (!hasDatabaseUrl()) throw missingDatabaseUrlError();

  if (!sql) sql = neon(databaseUrl());
  return sql;
}

function databaseUrl() {
  return process.env.DATABASE_URL || process.env.DATABASE_URL_DATABASE_URL || process.env.POSTGRES_URL;
}

function missingDatabaseUrlError() {
  const error = new Error("DATABASE_URL is required for historical run storage.");
  error.status = 503;
  return error;
}
