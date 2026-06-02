import { del, list, put } from "@vercel/blob";
import { summarizeFit } from "./fit-parser.js";

const ACTIVITIES_PREFIX = "activities/";

export function hasBlobToken() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function saveActivity({ buffer, filename, contentType }) {
  const id = new Date().toISOString().replace(/[:.]/g, "-");
  const safeName = filename || "upload.fit";
  const rawPath = `${ACTIVITIES_PREFIX}${id}-${safeName}`;
  const summaryPath = `${ACTIVITIES_PREFIX}${id}-${safeName}.summary.json`;
  const file = {
    id,
    name: safeName,
    size: buffer.length,
    contentType: contentType || "application/octet-stream",
    uploadedAt: new Date().toISOString(),
    rawPath,
  };
  const summary = summarizeFit(buffer, file);

  if (hasBlobToken()) {
    const rawBlob = await put(rawPath, buffer, {
      access: "public",
      contentType: file.contentType,
      addRandomSuffix: false,
    });
    const storedSummary = {
      ...summary,
      file: {
        ...summary.file,
        rawUrl: rawBlob.url,
      },
    };
    await put(summaryPath, JSON.stringify(storedSummary), {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
    });
    return storedSummary;
  }

  const { mkdir, writeFile, localDir, localIndex, join } = await localFileHelpers();
  await mkdir(localDir, { recursive: true });
  const localRawPath = join(localDir, `${id}-${safeName}`);
  const storedSummary = {
    ...summary,
    file: {
      ...summary.file,
      rawPath: localRawPath,
      rawUrl: "/api/raw/latest",
    },
  };
  await writeFile(localRawPath, buffer);
  await writeFile(localIndex, JSON.stringify({ summary: storedSummary, localRawPath }, null, 2));
  return storedSummary;
}

export async function getLatestActivity() {
  if (hasBlobToken()) {
    const response = await list({ prefix: ACTIVITIES_PREFIX });
    const summaries = response.blobs
      .filter((blob) => blob.pathname.endsWith(".summary.json"))
      .sort((left, right) => left.pathname.localeCompare(right.pathname));
    const latest = summaries.at(-1);
    if (!latest) return null;
    const result = await fetch(latest.url, { cache: "no-store" });
    if (!result.ok) throw new Error("Could not fetch latest activity summary.");
    return result.json();
  }

  try {
    const { readFile, localDir, localIndex, join } = await localFileHelpers();
    const record = JSON.parse(await readFile(localIndex, "utf8"));
    if (record.summary) return record.summary;

    const localRawPath = record.path || join(localDir, record.storedName || "");
    const buffer = await readFile(localRawPath);
    const file = {
      id: record.id,
      name: record.originalName,
      size: record.size || buffer.length,
      contentType: record.contentType || "application/octet-stream",
      uploadedAt: record.uploadedAt,
      rawPath: localRawPath,
      rawUrl: "/api/raw/latest",
    };
    return summarizeFit(buffer, file);
  } catch {
    return null;
  }
}

export async function getLatestRawFile() {
  const latest = await getLatestActivity();
  if (!latest?.file) return null;

  if (hasBlobToken()) {
    return {
      redirectUrl: latest.file.rawUrl,
      filename: latest.file.name,
      contentType: latest.file.contentType,
    };
  }

  const { readFile, localIndex } = await localFileHelpers();
  const index = JSON.parse(await readFile(localIndex, "utf8"));
  const localRawPath = index.localRawPath || index.path;
  return {
    buffer: await readFile(localRawPath),
    filename: latest.file.name,
    contentType: latest.file.contentType,
  };
}

export async function clearActivities() {
  if (hasBlobToken()) {
    const response = await list({ prefix: ACTIVITIES_PREFIX });
    if (response.blobs.length) await del(response.blobs.map((blob) => blob.url));
    return;
  }

  const { mkdir, readdir, rm, localDir, join } = await localFileHelpers();
  await mkdir(localDir, { recursive: true });
  const files = await readdir(localDir);
  await Promise.all(files.map((file) => rm(join(localDir, file), { force: true, recursive: true })));
}

async function localFileHelpers() {
  const [{ mkdir, readFile, readdir, rm, writeFile }, { join }] = await Promise.all([
    import("node:fs/promises"),
    import("node:path"),
  ]);
  const localDir = join(process.cwd(), "uploads");
  return {
    mkdir,
    readFile,
    readdir,
    rm,
    writeFile,
    join,
    localDir,
    localIndex: join(localDir, "latest.json"),
  };
}
