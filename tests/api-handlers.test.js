import assert from "node:assert/strict";
import test from "node:test";
import {
  createLatestGetHandler,
  createRawRunGetHandler,
  createWebhookFitPostHandler,
} from "../lib/api-handlers.js";
import { extractUploadedFit } from "../lib/uploads.js";

test("webhook rejects unauthorized requests", async () => {
  const handler = createWebhookFitPostHandler({
    hasMutationAccessImpl: async () => false,
    unauthorizedJsonImpl: unauthorizedResponse,
    extractUploadedFitImpl: async () => {
      throw new Error("extractUploadedFit should not be called");
    },
    createRunFromUploadImpl: async () => {
      throw new Error("createRunFromUpload should not be called");
    },
  });

  const response = await handler(new Request("https://example.com/api/webhook/fit", { method: "POST" }));
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.ok, false);
});

test("webhook stores a valid upload and returns run metadata", async () => {
  const summary = sampleSummary("run-1", "sample.fit");
  const handler = createWebhookFitPostHandler({
    hasMutationAccessImpl: async () => true,
    unauthorizedJsonImpl: unauthorizedResponse,
    extractUploadedFitImpl: async () => ({ buffer: Buffer.from("fit"), filename: "sample.fit" }),
    createRunFromUploadImpl: async () => summary,
  });

  const response = await handler(new Request("https://example.com/api/webhook/fit", { method: "POST" }));
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.file.id, "run-1");
  assert.equal(body.run.id, "run-1");
});

test("webhook surfaces oversized upload errors", async () => {
  const handler = createWebhookFitPostHandler({
    hasMutationAccessImpl: async () => true,
    unauthorizedJsonImpl: unauthorizedResponse,
    extractUploadedFitImpl: extractUploadedFit,
    createRunFromUploadImpl: async () => {
      throw new Error("createRunFromUpload should not be called");
    },
  });
  const response = await handler(new Request("https://example.com/api/webhook/fit", {
    method: "POST",
    headers: { "content-length": String(4 * 1024 * 1024 + 1) },
    body: "x",
  }));
  const body = await response.json();

  assert.equal(response.status, 413);
  assert.match(body.error, /Upload is too large/);
});

test("webhook duplicate deliveries can return the existing run", async () => {
  const summary = sampleSummary("run-existing", "existing.fit");
  const handler = createWebhookFitPostHandler({
    hasMutationAccessImpl: async () => true,
    unauthorizedJsonImpl: unauthorizedResponse,
    extractUploadedFitImpl: async () => ({ buffer: Buffer.from("same-fit"), filename: "existing.fit" }),
    createRunFromUploadImpl: async () => summary,
  });

  const first = await handler(new Request("https://example.com/api/webhook/fit", { method: "POST" }));
  const second = await handler(new Request("https://example.com/api/webhook/fit", { method: "POST" }));

  assert.equal((await first.json()).file.id, "run-existing");
  assert.equal((await second.json()).file.id, "run-existing");
});

test("/api/latest returns the newest run summary", async () => {
  const handler = createLatestGetHandler({
    hasMutationAccessImpl: async () => true,
    unauthorizedJsonImpl: unauthorizedResponse,
    getLatestRunImpl: async () => sampleSummary("run-latest", "latest.fit"),
  });

  const response = await handler(new Request("https://example.com/api/latest"));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.file.id, "run-latest");
  assert.equal(body.summary.file.id, "run-latest");
});

test("/api/raw/[id] returns authenticated FIT bytes", async () => {
  const handler = createRawRunGetHandler({
    hasMutationAccessImpl: async () => true,
    unauthorizedJsonImpl: unauthorizedResponse,
    getRawRunFileImpl: async (id) => ({
      buffer: Buffer.from(`raw:${id}`),
      filename: "download.fit",
      contentType: "application/octet-stream",
    }),
  });

  const response = await handler(new Request("https://example.com/api/raw/run-1"), {
    params: Promise.resolve({ id: "run-1" }),
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/octet-stream");
  assert.match(response.headers.get("content-disposition"), /download\.fit/);
  assert.equal(await response.text(), "raw:run-1");
});

function sampleSummary(id, name) {
  return {
    run: { id },
    file: {
      id,
      name,
      size: 3,
      contentType: "application/octet-stream",
      uploadedAt: "2026-06-01T12:00:00.000Z",
      rawPath: `activities/${id}/${name}`,
      rawUrl: `/api/raw/${id}`,
    },
    details: { activity: "Activity", date: "Jun 1, 2026, 08:00 AM" },
    metrics: {},
  };
}

function unauthorizedResponse() {
  return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}
