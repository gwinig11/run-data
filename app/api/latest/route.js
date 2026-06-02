import { getLatestActivity } from "lib/blob-store.js";
import { hasMutationAccess, unauthorizedJson } from "lib/auth.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  if (!(await hasMutationAccess(request))) return unauthorizedJson();
  const summary = await getLatestActivity();
  return Response.json(summary ? { file: summary.file, summary } : { file: null });
}
