import { createRunFromUpload, getLatestRun, getRawRunFile } from "./run-store.js";

export async function saveActivity(upload) {
  return createRunFromUpload(upload);
}

export async function getLatestActivity() {
  return getLatestRun();
}

export async function getLatestRawFile() {
  const latest = await getLatestRun();
  return latest?.file?.id ? getRawRunFile(latest.file.id) : null;
}

export async function clearActivities() {
  return { ok: true, skipped: true };
}
