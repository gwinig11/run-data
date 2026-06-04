import { get } from "@vercel/blob";
import { join } from "node:path";
import { hasBlobToken } from "./run-store.js";

const ACTIVITIES_PREFIX = "activities/";
const CURRENT_RAW_PATH = `${ACTIVITIES_PREFIX}current.fit`;

export async function getLegacyLatestUpload() {
  if (hasBlobToken()) return getLegacyBlobUpload();
  return getLegacyLocalUpload();
}

async function getLegacyBlobUpload() {
  const blob = await get(CURRENT_RAW_PATH, { access: "private", useCache: false });
  if (!blob?.stream) return null;

  return {
    buffer: Buffer.from(await streamToArrayBuffer(blob.stream)),
    filename: "legacy-current.fit",
    contentType: blob.contentType || "application/octet-stream",
  };
}

async function getLegacyLocalUpload() {
  const { readFile } = await import("node:fs/promises");
  const localDir = join(process.cwd(), "uploads");

  try {
    const record = JSON.parse(await readFile(join(localDir, "latest.json"), "utf8"));
    const rawPath = record.localRawPath || record.path || join(localDir, record.storedName || "");
    if (!rawPath) return null;

    return {
      buffer: await readFile(rawPath),
      filename: record.summary?.file?.name || record.originalName || "legacy-current.fit",
      contentType: record.summary?.file?.contentType || record.contentType || "application/octet-stream",
    };
  } catch {
    return null;
  }
}

async function streamToArrayBuffer(stream) {
  const reader = stream.getReader();
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
