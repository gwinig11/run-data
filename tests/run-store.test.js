import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createRunStore, rowToRun } from "../lib/run-store.js";

test("createRunFromUpload inserts one run and deduplicates by file hash", async () => {
  const repository = createMemoryRepository();
  const rawStorage = createMemoryRawStorage();
  const store = createRunStore({
    repository,
    rawStorage,
    idFactory: sequence(["run-1", "run-duplicate"]),
    now: () => new Date("2026-06-01T12:00:00.000Z"),
  });

  const first = await store.createRunFromUpload({
    buffer: fitBufferWithSport(1, 1),
    filename: "first.fit",
    contentType: "application/octet-stream",
  });
  const duplicate = await store.createRunFromUpload({
    buffer: fitBufferWithSport(1, 1),
    filename: "retry.fit",
    contentType: "application/octet-stream",
  });

  assert.equal(first.file.id, "run-1");
  assert.equal(duplicate.file.id, "run-1");
  assert.equal(repository.rows.length, 1);
  assert.equal(rawStorage.files.size, 1);
});

test("createRunFromUpload rejects non-running activities before saving", async () => {
  const repository = createMemoryRepository();
  const rawStorage = createMemoryRawStorage();
  const store = createRunStore({
    repository,
    rawStorage,
    idFactory: sequence(["run-cycling"]),
    now: () => new Date("2026-06-01T12:00:00.000Z"),
  });

  await assert.rejects(
    () => store.createRunFromUpload({ buffer: fitBufferWithSport(2), filename: "bike.fit" }),
    /Only running FIT files are supported/,
  );
  assert.equal(repository.rows.length, 0);
  assert.equal(rawStorage.files.size, 0);
});

test("createRunFromUpload labels treadmill runs as indoor runs", async () => {
  const repository = createMemoryRepository();
  const store = createRunStore({
    repository,
    rawStorage: createMemoryRawStorage(),
    idFactory: sequence(["run-indoor"]),
    now: () => new Date("2026-06-01T12:00:00.000Z"),
  });

  const run = await store.createRunFromUpload({ buffer: fitBufferWithSport(1, 1, 1), filename: "treadmill.fit" });

  assert.equal(run.details.activity, "Indoor Run");
  assert.equal(repository.rows[0].activity_type, "Indoor Run");
});

test("createRunFromUpload refreshes duplicate runs when parsing changes", async () => {
  const repository = createMemoryRepository();
  const buffer = fitBufferWithSport(1, 1, 1);
  repository.rows.push(storedRunRow({
    id: "run-existing-indoor",
    fileHash: createHash("sha256").update(buffer).digest("hex"),
    summary: {
      file: {
        id: "run-existing-indoor",
        name: "treadmill.fit",
        size: buffer.length,
        contentType: "application/octet-stream",
        uploadedAt: "2026-06-01T12:00:00.000Z",
        rawPath: "activities/run-existing-indoor/treadmill.fit",
        rawUrl: "/api/raw/run-existing-indoor",
      },
      details: { activity: "Running", date: "Jun 1, 2026, 08:00 AM" },
      metrics: {},
    },
  }));
  const store = createRunStore({
    repository,
    rawStorage: createMemoryRawStorage(),
    idFactory: sequence(["unused-id"]),
    now: () => new Date("2026-06-02T12:00:00.000Z"),
  });

  const run = await store.createRunFromUpload({ buffer, filename: "treadmill.fit" });

  assert.equal(run.file.id, "run-existing-indoor");
  assert.equal(run.details.activity, "Indoor Run");
  assert.equal(repository.rows[0].activity_type, "Indoor Run");
  assert.equal(repository.rows[0].summary_json.details.activity, "Indoor Run");
});

test("rowToRun labels legacy route-less running summaries as indoor runs", () => {
  const summary = {
    file: {
      id: "legacy-indoor",
      name: "legacy.fit",
      size: 123,
      contentType: "application/octet-stream",
      uploadedAt: "2026-06-01T12:00:00.000Z",
      rawPath: "activities/legacy-indoor/legacy.fit",
    },
    details: { activity: "Running", date: "Jun 1, 2026, 08:00 AM" },
    metrics: {},
    route: null,
  };

  const run = rowToRun(storedRunRow({
    id: "legacy-indoor",
    fileHash: "hash",
    summary,
  }));

  assert.equal(run.details.activity, "Indoor Run");
});

test("rowToRun keeps outdoor running summaries unchanged when route exists", () => {
  const summary = {
    file: {
      id: "outdoor-run",
      name: "outdoor.fit",
      size: 123,
      contentType: "application/octet-stream",
      uploadedAt: "2026-06-01T12:00:00.000Z",
      rawPath: "activities/outdoor-run/outdoor.fit",
    },
    details: { activity: "Running", date: "Jun 1, 2026, 08:00 AM" },
    metrics: {},
    route: { points: [{ latitude: 1, longitude: 2 }] },
  };

  const run = rowToRun(storedRunRow({
    id: "outdoor-run",
    fileHash: "hash",
    summary,
  }));

  assert.equal(run.details.activity, "Running");
});

test("latest and listRuns return runs in newest-first order", async () => {
  const repository = createMemoryRepository();
  const store = createRunStore({
    repository,
    rawStorage: createMemoryRawStorage(),
    idFactory: sequence(["run-old", "run-new"]),
    now: sequence([
      () => new Date("2026-06-01T12:00:00.000Z"),
      () => new Date("2026-06-02T12:00:00.000Z"),
    ]),
  });

  await store.createRunFromUpload({ buffer: fitBufferWithSport(1, 1), filename: "old.fit" });
  await store.createRunFromUpload({ buffer: fitBufferWithSport(1, 2), filename: "new.fit" });

  const latest = await store.getLatestRun();
  const list = await store.listRuns();

  assert.equal(latest.file.id, "run-new");
  assert.deepEqual(list.map((run) => run.file.id), ["run-new", "run-old"]);
});

test("latest and listRuns sort by activity date before upload date", async () => {
  const repository = createMemoryRepository();
  const store = createRunStore({
    repository,
    rawStorage: createMemoryRawStorage(),
    idFactory: sequence(["run-uploaded-first", "run-uploaded-second", "run-no-activity-date"]),
    now: sequence([
      () => new Date("2026-06-03T12:00:00.000Z"),
      () => new Date("2026-06-04T12:00:00.000Z"),
      () => new Date("2026-06-05T12:00:00.000Z"),
    ]),
  });

  await store.createRunFromUpload({ buffer: fitBufferWithSport(1, 1), filename: "first-upload.fit" });
  await store.createRunFromUpload({ buffer: fitBufferWithSport(1, 2), filename: "second-upload.fit" });
  await store.createRunFromUpload({ buffer: fitBufferWithSport(1, 3), filename: "no-activity-date.fit" });
  repository.rows[0].activity_date = "Jun 2, 2026, 08:00 AM";
  repository.rows[1].activity_date = "May 31, 2026, 08:00 AM";
  repository.rows[2].activity_date = null;

  const latest = await store.getLatestRun();
  const list = await store.listRuns();

  assert.equal(latest.file.id, "run-uploaded-first");
  assert.deepEqual(list.map((run) => run.file.id), [
    "run-uploaded-first",
    "run-uploaded-second",
    "run-no-activity-date",
  ]);
});

test("getRawRunFile returns the stored FIT bytes", async () => {
  const repository = createMemoryRepository();
  const rawStorage = createMemoryRawStorage();
  const store = createRunStore({
    repository,
    rawStorage,
    idFactory: sequence(["run-raw"]),
    now: () => new Date("2026-06-01T12:00:00.000Z"),
  });
  const buffer = fitBufferWithSport(1, 7);

  const run = await store.createRunFromUpload({ buffer, filename: "raw.fit" });
  const raw = await store.getRawRunFile(run.file.id);

  assert.equal(raw.filename, "raw.fit");
  assert.equal(Buffer.compare(raw.buffer, buffer), 0);
});

function createMemoryRepository() {
  const rows = [];

  return {
    rows,
    async findByHash(fileHash) {
      return rows.find((row) => row.file_hash === fileHash) || null;
    },
    async insertRun(record) {
      if (rows.some((row) => row.file_hash === record.fileHash)) return null;
      const row = {
        id: record.id,
        file_hash: record.fileHash,
        source: record.source,
        filename: record.filename,
        content_type: record.contentType,
        file_size: record.fileSize,
        raw_storage: record.rawStorage,
        raw_blob_path: record.rawPath,
        uploaded_at: record.uploadedAt,
        received_at: record.receivedAt,
        activity_type: record.activityType,
        activity_date: record.activityDate,
        distance_miles: record.distanceMiles,
        duration_text: record.durationText,
        avg_pace: record.avgPace,
        avg_heart_rate: record.avgHeartRate,
        summary_json: record.summaryJson,
        created_at: record.receivedAt,
      };
      rows.push(row);
      return row;
    },
    async updateRunSummary(record) {
      const row = rows.find((item) => item.id === record.id);
      if (!row) return null;
      row.activity_type = record.activityType;
      row.activity_date = record.activityDate;
      row.distance_miles = record.distanceMiles;
      row.duration_text = record.durationText;
      row.avg_pace = record.avgPace;
      row.avg_heart_rate = record.avgHeartRate;
      row.summary_json = record.summaryJson;
      row.updated_at = "2026-06-02T12:00:00.000Z";
      return row;
    },
    async findLatest() {
      return [...rows].sort(newestFirst)[0] || null;
    },
    async findById(id) {
      return rows.find((row) => row.id === id) || null;
    },
    async listRuns({ limit = 25, offset = 0 } = {}) {
      return [...rows].sort(newestFirst).slice(offset, offset + limit);
    },
    async listAllRuns() {
      return [...rows].sort(newestFirst);
    },
    async countRuns() {
      return rows.length;
    },
  };
}

function storedRunRow({ id, fileHash, summary }) {
  return {
    id,
    file_hash: fileHash,
    source: "webhook",
    filename: summary.file.name,
    content_type: summary.file.contentType,
    file_size: summary.file.size,
    raw_storage: "memory",
    raw_blob_path: summary.file.rawPath,
    uploaded_at: summary.file.uploadedAt,
    received_at: summary.file.uploadedAt,
    activity_type: summary.details.activity,
    activity_date: summary.details.sortDate || null,
    distance_miles: null,
    duration_text: null,
    avg_pace: null,
    avg_heart_rate: null,
    summary_json: summary,
    created_at: summary.file.uploadedAt,
    updated_at: summary.file.uploadedAt,
  };
}

function createMemoryRawStorage() {
  const files = new Map();
  return {
    provider: "memory",
    files,
    pathFor({ runId, filename }) {
      return `activities/${runId}/${filename}`;
    },
    async save({ rawPath, buffer, contentType }) {
      files.set(rawPath, { buffer, contentType });
    },
    async get(row) {
      const file = files.get(row.raw_blob_path);
      if (!file) return null;
      return {
        buffer: file.buffer,
        filename: row.filename,
        contentType: row.content_type,
      };
    },
  };
}

function newestFirst(left, right) {
  const leftActivityDate = activitySortTime(left.activity_date);
  const rightActivityDate = activitySortTime(right.activity_date);
  if (leftActivityDate !== null && rightActivityDate !== null) {
    return rightActivityDate - leftActivityDate
      || String(right.uploaded_at).localeCompare(String(left.uploaded_at))
      || String(right.created_at).localeCompare(String(left.created_at));
  }
  if (leftActivityDate !== rightActivityDate) return leftActivityDate !== null ? -1 : 1;
  return String(right.uploaded_at).localeCompare(String(left.uploaded_at))
    || String(right.created_at).localeCompare(String(left.created_at));
}

function activitySortTime(value) {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function fitBufferWithSport(sport, marker = 0, subSport = null) {
  const hasSubSport = subSport !== null;
  const data = Buffer.from([
    0x40, 0x00, 0x00, 0x12, 0x00, hasSubSport ? 0x02 : 0x01,
    0x05, 0x01, 0x02,
    ...(hasSubSport ? [0x06, 0x01, 0x02] : []),
    0x00, sport,
    ...(hasSubSport ? [subSport] : []),
  ]);
  const buffer = Buffer.alloc(14 + data.length + 1);
  buffer.writeUInt8(14, 0);
  buffer.writeUInt32LE(data.length, 4);
  buffer.write(".FIT", 8);
  data.copy(buffer, 14);
  buffer[14 + data.length] = marker;
  return buffer;
}

function sequence(values) {
  let index = 0;
  return () => {
    const value = values[Math.min(index, values.length - 1)];
    index += 1;
    return typeof value === "function" ? value() : value;
  };
}
