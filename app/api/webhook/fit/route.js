import { createWebhookFitPostHandler } from "lib/api-handlers.js";
import { hasMutationAccess, unauthorizedJson } from "lib/auth.js";
import { createRunFromUpload } from "lib/run-store.js";
import { extractUploadedFit } from "lib/uploads.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = createWebhookFitPostHandler({
  hasMutationAccessImpl: hasMutationAccess,
  unauthorizedJsonImpl: unauthorizedJson,
  extractUploadedFitImpl: extractUploadedFit,
  createRunFromUploadImpl: createRunFromUpload,
});
