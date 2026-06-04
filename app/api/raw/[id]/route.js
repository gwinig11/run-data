import { createRawRunGetHandler } from "lib/api-handlers.js";
import { hasMutationAccess, unauthorizedJson } from "lib/auth.js";
import { getRawRunFile } from "lib/run-store.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = createRawRunGetHandler({
  hasMutationAccessImpl: hasMutationAccess,
  unauthorizedJsonImpl: unauthorizedJson,
  getRawRunFileImpl: getRawRunFile,
});
