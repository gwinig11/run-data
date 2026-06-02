import { del, get, list, put } from "@vercel/blob";
import { summarizeFit } from "./fit-parser.js";

const ACTIVITIES_PREFIX = "activities/";
const CURRENT_RAW_PATH = `${ACTIVITIES_PREFIX}current.fit`;
const CURRENT_SUMMARY_PATH = `${ACTIVITIES_PREFIX}current.summary.json`;

export function hasBlobToken() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function saveActivity({ buffer, filename, contentType }) {
  const id = new Date().toISOString().replace(/[:.]/g, "-");
  const safeName = filename || "upload.fit";
  const rawPath = hasBlobToken() ? CURRENT_RAW_PATH : `${ACTIVITIES_PREFIX}${id}-${safeName}`;
  const summaryPath = hasBlobToken() ? CURRENT_SUMMARY_PATH : `${ACTIVITIES_PREFIX}${id}-${safeName}.summary.json`;
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
    await put(rawPath, buffer, {
      access: "private",
      contentType: file.contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    const storedSummary = {
      ...summary,
      file: {
        ...summary.file,
        rawUrl: "/api/raw/latest",
      },
    };
    await put(summaryPath, JSON.stringify(storedSummary), {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    await pruneBlobActivitiesExcept([rawPath, summaryPath]);
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
  await pruneLocalUploadsExcept([`${id}-${safeName}`, "latest.json"]);
  return storedSummary;
}

export async function getLatestActivity() {
  if (hasBlobToken()) {
    try {
      return await getBlobSummary(CURRENT_SUMMARY_PATH) || await getNewestTimestampedBlobSummary();
    } catch (error) {
      console.error("Could not load latest activity summary.", error);
      return null;
    }
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
    const blob = await get(latest.file.rawPath, { access: "private", useCache: false });
    if (!blob) return null;
    return {
      stream: blob.stream,
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

async function pruneBlobActivitiesExcept(pathnamesToKeep) {
  const keep = new Set(pathnamesToKeep);
  const response = await list({ prefix: ACTIVITIES_PREFIX });
  const staleUrls = response.blobs
    .filter((blob) => !keep.has(blob.pathname))
    .map((blob) => blob.url);
  if (staleUrls.length) await del(staleUrls);
}

async function getBlobSummary(pathname) {
  try {
    const result = await get(pathname, { access: "private", useCache: false });
    if (!result?.stream) return null;
    return JSON.parse(await streamToText(result.stream));
  } catch {
    return null;
  }
}

async function getNewestTimestampedBlobSummary() {
  const response = await list({ prefix: ACTIVITIES_PREFIX });
  const summaries = response.blobs
    .filter((blob) => blob.pathname.endsWith(".summary.json"))
    .filter((blob) => blob.pathname !== CURRENT_SUMMARY_PATH)
    .sort((left, right) => left.pathname.localeCompare(right.pathname));
  const latest = summaries.at(-1);
  return latest ? getBlobSummary(latest.pathname) : null;
}

async function pruneLocalUploadsExcept(filenamesToKeep) {
  const keep = new Set(filenamesToKeep);
  const { mkdir, readdir, rm, localDir, join } = await localFileHelpers();
  await mkdir(localDir, { recursive: true });
  const files = await readdir(localDir);
  await Promise.all(
    files
      .filter((file) => !keep.has(file))
      .map((file) => rm(join(localDir, file), { force: true, recursive: true })),
  );
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

async function streamToText(stream) {
  const reader = stream.getReader();
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
