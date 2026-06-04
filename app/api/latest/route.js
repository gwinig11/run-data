import { createLatestGetHandler } from "lib/api-handlers.js";
import { hasMutationAccess, unauthorizedJson } from "lib/auth.js";
import { getLatestRun } from "lib/run-store.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = createLatestGetHandler({
  hasMutationAccessImpl: hasMutationAccess,
  unauthorizedJsonImpl: unauthorizedJson,
  getLatestRunImpl: getLatestRun,
});
