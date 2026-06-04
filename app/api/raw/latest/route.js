import { createRawLatestGetHandler } from "lib/api-handlers.js";
import { hasMutationAccess, unauthorizedJson } from "lib/auth.js";
import { getLatestRun, getRawRunFile } from "lib/run-store.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = createRawLatestGetHandler({
  hasMutationAccessImpl: hasMutationAccess,
  unauthorizedJsonImpl: unauthorizedJson,
  getLatestRunImpl: getLatestRun,
  getRawRunFileImpl: getRawRunFile,
});
