import { get, put } from "@vercel/blob";
import { createHash, randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { getDb } from "./db.js";
import { summarizeFit } from "./fit-parser.js";
import { sanitizeFilename } from "./uploads.js";

const ACTIVITIES_PREFIX = "activities/";
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

let defaultStore = null;

export function hasBlobToken() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function createRunsSchema(sql = getDb()) {
  await sql`
    CREATE TABLE IF NOT EXISTS runs (
      id text PRIMARY KEY,
      file_hash text NOT NULL UNIQUE,
      source text NOT NULL DEFAULT 'webhook',
      filename text NOT NULL,
      content_type text NOT NULL,
      file_size integer NOT NULL,
      raw_storage text NOT NULL DEFAULT 'vercel-blob',
      raw_blob_path text NOT NULL,
      uploaded_at timestamptz NOT NULL,
      received_at timestamptz NOT NULL DEFAULT now(),
      activity_type text,
      activity_date text,
      distance_miles numeric,
      duration_text text,
      avg_pace text,
      avg_heart_rate integer,
      summary_json jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS runs_uploaded_at_idx ON runs (uploaded_at DESC, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS runs_activity_date_idx ON runs (activity_date DESC)`;
}

export function createNeonRunRepository(sql = getDb()) {
  let schemaReady = null;

  async function ensureSchema() {
    schemaReady ||= createRunsSchema(sql);
    await schemaReady;
  }

  return {
    ensureSchema,
    async findByHash(fileHash) {
      await ensureSchema();
      const rows = await sql`SELECT * FROM runs WHERE file_hash = ${fileHash} LIMIT 1`;
      return rows[0] || null;
    },
    async insertRun(record) {
      await ensureSchema();
      const rows = await sql`
        INSERT INTO runs (
          id,
          file_hash,
          source,
          filename,
          content_type,
          file_size,
          raw_storage,
          raw_blob_path,
          uploaded_at,
          received_at,
          activity_type,
          activity_date,
          distance_miles,
          duration_text,
          avg_pace,
          avg_heart_rate,
          summary_json
        )
        VALUES (
          ${record.id},
          ${record.fileHash},
          ${record.source},
          ${record.filename},
          ${record.contentType},
          ${record.fileSize},
          ${record.rawStorage},
          ${record.rawPath},
          ${record.uploadedAt},
          ${record.receivedAt},
          ${record.activityType},
          ${record.activityDate},
          ${record.distanceMiles},
          ${record.durationText},
          ${record.avgPace},
          ${record.avgHeartRate},
          ${JSON.stringify(record.summaryJson)}::jsonb
        )
        ON CONFLICT (file_hash) DO NOTHING
        RETURNING *
      `;
      return rows[0] || null;
    },
    async findLatest() {
      await ensureSchema();
      const rows = await sql`
        SELECT *
        FROM runs
        ORDER BY ${activityDateOrder(sql)}
        LIMIT 1
      `;
      return rows[0] || null;
    },
    async findById(id) {
      await ensureSchema();
      const rows = await sql`SELECT * FROM runs WHERE id = ${id} LIMIT 1`;
      return rows[0] || null;
    },
    async listRuns({ limit = DEFAULT_LIMIT, offset = 0 } = {}) {
      await ensureSchema();
      const safeLimit = clampLimit(limit);
      const safeOffset = Math.max(0, Number(offset) || 0);
      return sql`
        SELECT *
        FROM runs
        ORDER BY ${activityDateOrder(sql)}
        LIMIT ${safeLimit}
        OFFSET ${safeOffset}
      `;
    },
    async countRuns() {
      await ensureSchema();
      const rows = await sql`SELECT count(*)::integer AS count FROM runs`;
      return rows[0]?.count || 0;
    },
  };
}

function activityDateOrder(sql) {
  return sql`
    CASE
      WHEN activity_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' THEN activity_date::timestamptz
      WHEN activity_date ~ '^[A-Z][a-z]{2} [0-9]{1,2}, [0-9]{4}, [0-9]{2}:[0-9]{2} [AP]M$'
        THEN to_timestamp(activity_date, 'Mon DD, YYYY, HH12:MI AM')
      ELSE NULL
    END DESC NULLS LAST,
    uploaded_at DESC,
    created_at DESC
  `;
}

export function createRunStore({
  repository = createNeonRunRepository(),
  rawStorage = createRawFileStorage(),
  idFactory = randomUUID,
  now = () => new Date(),
} = {}) {
  return {
    async createRunFromUpload({ buffer, filename, contentType }, { source = "webhook" } = {}) {
      const fileHash = hashBuffer(buffer);
      const existing = await repository.findByHash(fileHash);
      if (existing) return rowToRun(existing);

      const id = idFactory();
      const safeName = sanitizeFilename(filename || "upload.fit");
      const uploadedAt = now().toISOString();
      const receivedAt = uploadedAt;
      const rawPath = rawStorage.pathFor({ runId: id, filename: safeName });
      const file = {
        id,
        name: safeName,
        size: buffer.length,
        contentType: contentType || "application/octet-stream",
        uploadedAt,
        rawPath,
        rawUrl: rawUrlFor(id),
      };
      const summary = summarizeFit(buffer, file);
      const activityFields = activityFieldsFromSummary(summary);

      await rawStorage.save({
        runId: id,
        filename: safeName,
        buffer,
        contentType: file.contentType,
        rawPath,
      });

      const inserted = await repository.insertRun({
        id,
        fileHash,
        source,
        filename: safeName,
        contentType: file.contentType,
        fileSize: buffer.length,
        rawStorage: rawStorage.provider,
        rawPath,
        uploadedAt,
        receivedAt,
        summaryJson: summary,
        ...activityFields,
      });

      return rowToRun(inserted || (await repository.findByHash(fileHash)));
    },
    async getLatestRun() {
      return rowToRun(await repository.findLatest());
    },
    async listRuns(options) {
      const rows = await repository.listRuns(options);
      return rows.map(rowToRun).filter(Boolean);
    },
    async countRuns() {
      return repository.countRuns();
    },
    async getRunById(id) {
      return rowToRun(await repository.findById(id));
    },
    async getRawRunFile(id) {
      const row = await repository.findById(id);
      if (!row) return null;
      return rawStorage.get(row);
    },
  };
}

export async function createRunFromUpload(upload, options) {
  return getDefaultStore().createRunFromUpload(upload, options);
}

export async function getLatestRun() {
  return getDefaultStore().getLatestRun();
}

export async function listRuns(options) {
  return getDefaultStore().listRuns(options);
}

export async function countRuns() {
  return getDefaultStore().countRuns();
}

export async function getRunById(id) {
  return getDefaultStore().getRunById(id);
}

export async function getRawRunFile(id) {
  return getDefaultStore().getRawRunFile(id);
}

export function rowToRun(row) {
  if (!row) return null;

  const summary = parseSummary(row.summary_json);
  const id = row.id;
  return {
    ...summary,
    run: {
      id,
      fileHash: row.file_hash,
      source: row.source,
      uploadedAt: toIso(row.uploaded_at),
      receivedAt: toIso(row.received_at),
      createdAt: toIso(row.created_at),
    },
    file: {
      ...(summary.file || {}),
      id,
      name: row.filename,
      size: row.file_size,
      contentType: row.content_type,
      uploadedAt: toIso(row.uploaded_at),
      rawPath: row.raw_blob_path,
      rawUrl: rawUrlFor(id),
    },
  };
}

function getDefaultStore() {
  defaultStore ||= createRunStore();
  return defaultStore;
}

function createRawFileStorage() {
  return hasBlobToken() ? createBlobRawStorage() : createLocalRawStorage();
}

function createBlobRawStorage() {
  return {
    provider: "vercel-blob",
    pathFor({ runId, filename }) {
      return `${ACTIVITIES_PREFIX}${runId}/${filename}`;
    },
    async save({ buffer, contentType, rawPath }) {
      await put(rawPath, buffer, {
        access: "private",
        contentType,
        addRandomSuffix: false,
        allowOverwrite: false,
      });
    },
    get: getStoredRawFile,
  };
}

function createLocalRawStorage() {
  return {
    provider: "local",
    pathFor({ runId, filename }) {
      return `${ACTIVITIES_PREFIX}${runId}/${filename}`;
    },
    async save({ buffer, rawPath }) {
      const { mkdir, writeFile } = await import("node:fs/promises");
      const fullPath = localUploadPath(rawPath);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, buffer);
    },
    get: getStoredRawFile,
  };
}

async function getStoredRawFile(row) {
  if (row.raw_storage === "vercel-blob") return getBlobRawFile(row);
  return getLocalRawFile(row);
}

async function getBlobRawFile(row) {
  const blob = await get(row.raw_blob_path, { access: "private", useCache: false });
  if (!blob?.stream) return null;
  return {
    stream: blob.stream,
    filename: row.filename,
    contentType: row.content_type,
  };
}

async function getLocalRawFile(row) {
  const { readFile } = await import("node:fs/promises");
  return {
    buffer: await readFile(localUploadPath(row.raw_blob_path)),
    filename: row.filename,
    contentType: row.content_type,
  };
}

function localUploadPath(rawPath) {
  return join(process.cwd(), "uploads", rawPath);
}

function hashBuffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function activityFieldsFromSummary(summary) {
  return {
    activityType: summary.details?.activity || null,
    activityDate: summary.details?.sortDate || null,
    distanceMiles: parseFiniteNumber(summary.metrics?.distance?.value),
    durationText: dashToNull(summary.metrics?.duration?.value),
    avgPace: dashToNull(summary.metrics?.avgPace?.value),
    avgHeartRate: parseFiniteInteger(summary.metrics?.avgHeartRate?.value),
  };
}

function parseSummary(value) {
  if (!value) return {};
  if (typeof value === "string") return JSON.parse(value);
  return value;
}

function rawUrlFor(id) {
  return `/api/raw/${encodeURIComponent(id)}`;
}

function clampLimit(value) {
  const number = Number(value) || DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(number)));
}

function parseFiniteNumber(value) {
  const number = Number.parseFloat(String(value ?? "").replaceAll(",", ""));
  return Number.isFinite(number) ? number : null;
}

function parseFiniteInteger(value) {
  const number = parseFiniteNumber(value);
  return number === null ? null : Math.round(number);
}

function dashToNull(value) {
  return value && value !== "-" ? String(value) : null;
}

function toIso(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? String(value) : date.toISOString();
}
